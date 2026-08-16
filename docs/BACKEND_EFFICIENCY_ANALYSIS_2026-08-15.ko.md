# 백엔드 비효율 분석 — 2026-08-15

## 결론

현재 `42bea58` 기준으로 즉시 제거할 가치가 가장 높은 비효율은 **maintenance의 파일별 DB 조회**다. 객체 검색과 즐겨찾기 hydration도 데이터가 커질수록 비용이 선형 증가하지만, 검색 엔진이나 캐시를 먼저 도입할 근거는 아직 없다.

우선순위는 다음과 같다.

1. maintenance/recovery의 N+1 조회를 batch 조회로 줄인다.
2. 즐겨찾기 `prefix` 필터를 DB로 내리고 pagination 또는 명시적 상한을 계약에 추가한다.
3. 실제 bucket cardinality별 객체 검색 p95와 query plan을 수집한다.
4. 측정 결과가 기준을 넘을 때만 검색 저장 방식을 바꾼다.

## 2026-08-15 실행 현황

- maintenance artifact 조회: 파일별 조회를 500-ID batch 조회로 변경했다. 502개 log ID fixture가 2개 DB query로 처리되는 회귀 테스트를 추가했다.
- restart recovery: status별 ID 조회 후 job별 재조회하던 흐름을 status별 job batch 조회로 변경했다.
- favorites: `prefix` filtering을 DB로 내리고, 최신순+key tie-breaker를 유지하는 최대 200개 keyset pagination을 추가했다. frontend API는 page를 순차 병합해 기존 전체 favorite UX를 유지한다.
- search baseline: 재현 가능한 Go benchmark를 추가하고 SQLite/PostgreSQL 16에서 1천/10만/100만 row를 측정했다.
- search query count: index 존재 probe를 검색 전에 항상 실행하지 않고, 검색 결과가 비었을 때만 실행하도록 변경했다. 일치 결과 경로는 DB query 2개에서 1개로 줄었고 회귀 테스트로 고정했다.

## 2026-08-16 추가 실행 현황

- profile 삭제의 active-job 처리를 `queued`/`running`별 2회 조회와 queued job별 `UPDATE`에서, active job 1회 조회와 queued job 최대 500개당 batch `UPDATE` 1회로 변경했다. running job만 남은 polling 구간은 주기당 DB statement가 2개에서 1개로 줄었다.
- `ListJobs`가 손상된 payload JSON을 조용히 건너뛰던 동작을 제거했다. 손상 row가 pagination 결과와 cursor를 일부만 반환하는 대신 job ID가 포함된 오류로 즉시 드러난다.
- 기존 `TestListJobsSkipsCorruptedPayload`는 결함을 정상 계약으로 고정하던 테스트 역설이었다. 공용 store fixture를 재사용하는 fail-fast 회귀 테스트로 교체해 중복 setup 100줄을 제거했다.
- batch 회귀 테스트는 queued job을 복수로 구성하고, 대상 상태 변경·running/다른 profile 보존·`SELECT 1회 + UPDATE 1회`를 함께 검증한다. 단일 fixture라서 N+1 구현도 통과하는 거짓 양성을 피한다.
- job retention은 삭제 대상을 먼저 조회한 뒤 별도 삭제하던 2-statement 경로를 `DELETE ... WHERE id IN (subquery) RETURNING id` 1회로 합쳤다. 최대 1,000개 batch와 삭제 ID 반환을 유지하면서 selection과 delete가 한 SQL에서 원자적으로 실행된다.
- `ListJobs`는 `limit+1`번째 cursor sentinel의 payload를 decode하거나 별도 ID slice로 복사하지 않는다. page에 노출되는 `limit`개만 decode하고 기존 cursor 계약을 유지한다.
- retention 회귀 테스트는 GORM callback 수가 아니라 실제 driver trace를 세어 1 SQL을 검증한다. subquery 조립 callback까지 statement로 오인하는 거짓 양성을 피했다.
- 추가 index, cache, background worker는 도입하지 않았다. 현재 경로는 기존 `profile_id` index와 queue 상한을 사용하며, 복합 index의 이득을 증명할 운영 cardinality나 query-plan 근거가 없다.

## 범위와 증거 수준

- 범위: `backend/internal/api`, `backend/internal/jobs`, `backend/internal/store`, DB schema/index, Prometheus 계측
- 방법: HTTP → store/job → DB/provider 호출 경로를 읽고 요청 또는 주기당 I/O 횟수를 계산
- 제외: frontend의 현재 미커밋 변경, 실제 provider 성능, 배포 환경의 PostgreSQL/스토리지 latency
- 한계: 이 문서는 현재 소스에서 확정할 수 있는 비용 구조 분석이다. 운영 p95/p99, CPU, DB wait, provider latency 개선을 증명한 benchmark 보고서는 아니다.

## 개선 전 Findings

### P1 — maintenance가 artifact 수만큼 DB를 직렬 조회한다

`RunMaintenance`는 시작 시 한 번, 이후 30분마다 orphan cleanup과 log retention을 순서대로 실행한다 (`backend/internal/jobs/manager_maintenance.go:30-52`).

- expired log cleanup은 고유 job ID마다 `GetJobByID`를 한 번 호출한다 (`:293-330`).
- 곧이어 orphan log cleanup은 `.log`와 `.cmd` 파일 각각에 `JobExists`를 호출한다 (`:334-376`). 동일 job에 두 파일이 있으면 같은 존재 여부를 두 번 조회한다.
- artifact cleanup은 `.zip`/`.zip.tmp` 파일마다 `JobExists`를 호출한다 (`:379-407`).
- staging cleanup은 디렉터리마다 `UploadSessionExists`를 호출한다 (`:410-430`).

따라서 log job `J`, artifact file `A`, staging directory `S`가 있으면 정상적인 `.log + .cmd` 구성만으로 한 주기에 대략 `3J + A + S`개의 직렬 DB read가 발생한다. 각 조회는 PK를 사용하므로 개별 query는 싸지만, 왕복 횟수는 파일 수에 선형 비례한다. 원격 PostgreSQL에서는 network RTT가 그대로 누적되고 SQLite에서는 maintenance가 불필요하게 connection/CPU를 점유한다.

**최소 개선안**

- directory scan에서 job/upload ID를 먼저 deduplicate한다.
- `WHERE id IN (...)` batch 조회로 존재하는 ID와 필요한 `status`, `finished_at`만 한 번에 가져온다.
- 새 worker, cache, goroutine pool은 추가하지 않는다. 로컬 파일 삭제는 현재처럼 직렬로 두어 I/O 폭주를 피한다.

**검증 기준**

- 동일 fixture에서 삭제 결과가 기존과 같아야 한다.
- query callback 또는 test logger로 cleanup DB read가 artifact 수가 아니라 chunk 수에 비례함을 확인한다.
- DB 오류 시 파일을 보존하는 현재 fail-safe 동작을 유지한다.

### P1 — 객체 검색은 결과 제한과 무관하게 bucket 범위를 훑을 수 있다

`SearchObjectIndex`는 먼저 index 존재 여부를 별도 query로 확인한 뒤 (`backend/internal/store/object_index.go:186-196`), 각 검색 token을 `object_key LIKE '%token%'`으로 연결한다 (`:198-211`). 최종 `LIMIT 201`은 반환 row 수만 제한하며 일치 row를 찾기 위해 검사하는 row 수를 제한하지 않는다 (`:244-249`).

현재 PK/index의 `(profile_id, bucket, object_key)` 앞부분은 profile/bucket 축소와 prefix 검색에는 유효하지만, 선행 wildcard가 붙은 contains 검색 자체를 B-tree로 해결하지 못한다. 비용은 대략 해당 bucket의 index row 수 `N`에 비례하고 token이 늘수록 문자열 비교도 증가한다.

**지금 하지 않을 것**

- SQLite FTS와 PostgreSQL trigram을 바로 추가하지 않는다. 두 backend의 migration·검색 의미·portable backup 계약이 늘어난다.
- 일반 결과 cache도 추가하지 않는다. index 갱신 시 invalidation 비용과 stale 결과 계약이 먼저 필요하다.

**먼저 필요한 증거**

- SQLite와 PostgreSQL 각각 1천/10만/100만 object fixture에서 prefix-only와 contains 1/3-token query plan, p50/p95를 측정한다.
- 목표 기준은 우선 p95 200ms로 두되 실제 UI SLO가 있으면 그 값을 우선한다.
- 기준을 넘으면 SQLite FTS5/PostgreSQL `pg_trgm`처럼 backend-native index를 검토하고, portable import 재구축 비용까지 비교한다.

**Synthetic warmed baseline (`3x`, AMD Ryzen 9 3900X)**

| Backend | Rows | Contains 1-token miss | Contains 3-token miss | Prefix + contains hit |
| --- | ---: | ---: | ---: | ---: |
| SQLite | 1,000 | 0.46ms | 0.49ms | 0.45ms |
| SQLite | 100,000 | 36.59ms | 37.90ms | 32.28ms |
| SQLite | 1,000,000 | 364.98ms | 367.10ms | 317.21ms |
| PostgreSQL 16 | 1,000 | 0.61ms | 0.50ms | 0.46ms |
| PostgreSQL 16 | 100,000 | 23.18ms | 24.44ms | 20.17ms |
| PostgreSQL 16 | 1,000,000 | 358.27ms | 96.10ms | 208.55ms |

`LIMIT 51`이어도 100만 row에서 200ms를 넘는 경로가 확인되어 선행 wildcard scan 위험은 실측됐다. PostgreSQL 3-token 값이 1-token보다 낮은 결과는 3회 표본과 cache/parallel plan 영향이 섞인 값이므로 상대 비교 근거로 쓰지 않는다. 이 표는 synthetic 단일 host 평균이며 운영 p95가 아니다. 실제 bucket cardinality와 query 분포가 없으므로 FTS/`pg_trgm` migration은 아직 보류한다.

일치 결과의 선행 probe 제거 후 SQLite 100만-row prefix+contains는 324.63ms로, 이전 317.21ms와 표본 변동 범위 안이었다. query 왕복은 하나 줄었지만 scan 비용이 지배적이라는 뜻이다. 따라서 이 변경을 contains 검색 latency 해결로 과장하지 않으며, 실제 대규모 bucket이 확인되면 native text index가 여전히 다음 단계다.

**현재 workspace runtime data (`backend/data/s3desk.db`, read-only)**

- 측정 시각: 2026-08-15
- 실행 중인 S3Desk process/container: 없음
- object index: 26 scopes, 총 39 rows, 최대 scope 3 rows
- 최대 scope의 guaranteed-miss 검색 20회: p50 0.153ms, p95 0.167ms

현재 데이터에서는 native text index가 이득보다 migration·portable backup·dual-backend 복잡도를 더 크게 만든다. 따라서 이번 작업에서는 도입하지 않는다. `S3DESK_RUNTIME_SQLITE_PATH=<path> go test ./internal/store -run '^TestObjectIndexRuntimeEvidence$' -v -count=1`로 실제 후보 DB를 read-only 재측정할 수 있으며, 최대 scope가 커지고 p95가 SLO를 넘을 때 결정을 다시 연다. 실행 중인 배포가 없었으므로 이 값은 production 증거가 아니다.

### P1 — 즐겨찾기는 전체 row를 읽고 application에서 prefix를 거른다

`ListObjectFavorites`는 bucket의 모든 favorite row를 limit 없이 읽는다 (`backend/internal/store/object_favorites.go:14-33`). HTTP 계층은 그 뒤에야 `strings.HasPrefix`로 필터링한다 (`backend/internal/api/handlers_favorites_http.go:101-113`). 기본 `hydrate=true`이면 남은 모든 key를 temp file에 쓰고 rclone `lsjson --files-from-raw`로 metadata를 가져오며 (`:120-152`), 결과도 전부 메모리에 만든다 (`:163-179`). OpenAPI에는 cursor/limit 계약이 없다.

DB, process memory, temp-file write, provider metadata 결과가 모두 favorite 수에 선형 비례한다. frontend virtualization은 렌더링 비용만 줄일 뿐 이 backend 비용을 줄이지 않는다.

**최소 개선안**

- `prefix`를 store query에 전달해 `object_key LIKE 'prefix%'`로 filtering한다.
- API에 cursor/limit을 추가하거나 제품상 충분한 명시적 상한을 둔다. hydration도 동일 page에만 수행한다.
- provider별 metadata cache는 pagination 후에도 실제 latency가 남을 때만 검토한다.

### P2 — 재시작 복구가 job 목록 조회 뒤 job별 재조회한다

복구는 running ID 목록을 가져온 뒤 ID마다 `GetJobByID`를 호출하고 (`backend/internal/jobs/manager_state_transitions.go:19-35`), queued job도 같은 패턴으로 type을 확인한다 (`:65-80`). running job은 finalization과 progress payload 구성 과정에서 추가 조회도 발생한다.

정상 운영 중 계속 발생하는 비용은 아니지만, 대기 job이 많을 때 재시작 시간이 job 수와 DB RTT에 비례한다. queue 기본 상한은 256이므로 무한 증가는 아니지만, running/queued row를 처음부터 필요한 column과 함께 조회하면 동작을 바꾸지 않고 왕복을 줄일 수 있다.

### P2 — progress durability가 active job마다 기본 2초에 한 번 DB write를 만든다

rclone stats 기본 간격은 2초이고 최소 500ms까지 설정할 수 있다 (`backend/internal/jobs/manager.go:35-39`, `manager_wiring.go:52-58`). 각 update는 조건부 job UPDATE 후 WebSocket publish를 수행한다 (`manager_runtime.go:280-298`). 기본 동시 job 수 2에서는 약 1 write/s지만, concurrency를 높이거나 500ms로 낮추면 write rate가 비례 증가한다.

이는 재시작 후 progress 보존이라는 가치가 있으므로 제거 대상은 아니다. DB write latency/lock wait가 문제로 확인될 때만 “WebSocket은 최신값, DB는 2~5초 coalesce + 종료 시 flush” 방식으로 낮춘다.

### P2 — 현재 metrics만으로 DB 병목의 원인을 분리할 수 없다

Prometheus는 HTTP, job, storage operation duration을 기록하지만 (`backend/internal/metrics/metrics.go:43-99`) DB query latency/count, pool wait, maintenance duration/처리량은 노출하지 않는다. 따라서 느린 HTTP가 DB scan, provider, queue, filesystem 중 어디서 소비됐는지 현재 지표만으로 확정하기 어렵다.

전 query label 계측은 cardinality와 코드 복잡도를 늘리므로 피한다. 먼저 다음 세 지점만 낮은 cardinality로 계측한다.

- maintenance cycle duration, scanned/deleted artifact 수, DB batch 수
- object index search duration과 bucket cardinality 구간
- favorites row/hydration key 수와 provider duration

## 이미 적절한 부분

- job list와 object search 응답은 cursor와 최대 200개 제한을 사용한다.
- object index write는 500-row batch upsert를 사용한다.
- queue는 256개 기본 상한과 backing slice compaction을 갖는다.
- SQLite는 WAL과 `synchronous=NORMAL`을 사용한다.

이 부분은 측정 없이 다시 추상화하거나 dependency를 추가할 이유가 없다.

## 실행 순서

1. **maintenance batch 조회**: 가장 작은 변경으로 query amplification을 확실히 제거한다.
2. **favorites filtering/pagination**: OpenAPI와 frontend 소비 계약을 함께 맞춘다.
3. **search benchmark**: 두 DB backend, 세 cardinality에서 baseline을 남긴다.
4. **조건부 검색 개선**: baseline이 SLO를 넘을 때만 native text index를 도입한다.
5. **runtime 재측정**: 같은 cardinality에서 p95, query count, DB wait, contract parity를 비교한다.

완료 판정은 source 변경이나 단위 테스트 green이 아니라 동일 workload의 before/after 수치와 응답 계약 일치로 한다.

## 검증 결과

- `go test ./...`: 35 packages, 1,500 tests 통과
- `go vet ./...`: 통과
- `npm run check:openapi`: 통과
- favorites API aggregation 관련 Vitest: 2 files, 6 tests 통과
- `npm run typecheck`: 통과
- `git diff --check`: 통과

위 결과는 source/fixture/synthetic benchmark 증거다. 실제 배포의 bucket cardinality, 운영 query 분포, provider latency, PostgreSQL wait 및 p95/p99 증거는 아니다.
