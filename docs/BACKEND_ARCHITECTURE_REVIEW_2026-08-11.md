# Backend Architecture Evaluation — 2026-08-11

## 1. 평가 결론

현재 백엔드는 **단일 인스턴스·단일 운영자형 self-hosted control plane**으로는 구조가 좋다. 시작점(`cmd/server`), 조립 루트(`app.Run`), HTTP/API(`internal/api`), 영속화(`internal/store`), 작업 실행(`internal/jobs`), provider별 보조 패키지가 구분되어 있고, OpenAPI·DB 상태 전이·비밀값 보호·기본 운영 계측도 갖춰져 있다.

다만 현재 구조의 한계도 분명하다.

1. 작업 큐, 취소 상태, WebSocket 이벤트, realtime ticket이 프로세스 메모리에 있다.
2. provider 실행이 SDK/직접 HTTP/rclone subprocess로 나뉘어 있어 네트워크·timeout·오류·관측 정책이 완전히 하나로 묶이지 않는다.
3. HTTP graceful shutdown과 job worker shutdown 사이에 명시적인 종료 대기 장벽이 없다.
4. 인증 단위가 공유 API token과 `X-Profile-Id`에 머물러 있어 multi-user/tenant 권한 모델은 아니다.
5. 로컬 검증은 강하지만 실제 provider·클러스터·다중 replica 운영 증거는 별도 영역으로 남아 있다.
6. multipart upload lifecycle, streaming timeout, object search index 재시도 계약은 기준 평가 시점에 완결되지 않았으며, 이번 작업에서 owner-local 보강을 적용했지만 provider/live와 HA 증거는 별도다.

따라서 현재의 적정 운영 계약은 **`replicaCount: 1`, 하나의 `DATA_DIR` 소유자, 외부에 노출할 경우 강한 API token과 encryption key 사용**이다. HA, multi-user, multi-tenant가 제품 목표라면 현재 구조에 기능을 덧붙이는 수준이 아니라 작업 ownership·realtime·인증 경계를 먼저 재설계해야 한다.

## 2. 평가 범위와 근거

- 기준 커밋: `a4d7faa` (`main`)
- 확인 범위: 서버 시작/종료, HTTP route와 middleware, store/DB/migration, job queue와 recovery, provider 호출 경계, realtime, Helm 배포 기본값, OpenAPI와 테스트 구조
- 로컬 검증:
  - `go test ./...`: 32개 패키지, 1,397개 테스트 통과
  - `go vet ./...`: 통과
  - `scripts/validate_openapi.sh`: 통과
  - `scripts/check_helm_chart.sh`: 6개 chart lint 통과
  - `govulncheck`: 애플리케이션 코드가 호출하는 취약 심볼 0개로 보고
  - 초기 `go test -race ./internal/jobs ./internal/api`에서 `TestTerminateJobProcessWithTimeoutsGraceful`이 250ms test deadline을 넘겨 SIGKILL fallback으로 오판되었으나, test-only grace를 1s로 조정한 뒤 `go test -race ./internal/api ./internal/jobs`: 1,138개 통과.
- 제한: 기준 평가 시점에는 `staticcheck` 실행 파일이 없었다. race 결과는 targeted package smoke이며 전체 fleet 또는 실제 provider/live/deployment 동작을 증명하지 않는다. provider live test는 환경변수가 있을 때만 실행되는 opt-in 테스트이므로, 위 결과만으로 실제 AWS/GCS/Azure/OCI/MinIO/Ceph 연결이나 배포 클러스터 동작을 증명할 수 없다.

## 3. 현재 구조

```text
cmd/server
  -> app.Run
     -> DATA_DIR + process lock
     -> SQLite/Postgres -> store.Store
     -> jobs.Manager (in-memory queue + worker goroutines)
     -> ws.Hub + metrics
     -> api.New -> chi HTTP routes
          -> guarded SDK/HTTP clients
          -> rclone and other CLI subprocesses
```

서버 조립은 [`app.Run`](../backend/internal/app/app.go#L44-L217)에 모여 있다. 여기서 DB, store, job manager, WebSocket hub, metrics, API server를 생성하고 HTTP shutdown을 수행한다. API route 등록은 [`api.New`](../backend/internal/api/api.go#L31-L229)에 집중되어 있으며, 현재 기능 범위를 한 곳에서 확인하기 쉽다.

영속화는 SQLite와 Postgres를 모두 지원하지만, 작업 큐와 realtime은 DB가 아니라 프로세스 메모리에 있다. `DATA_DIR`는 SQLite뿐 아니라 staging, job log, 임시 rclone 설정, 기타 artifact의 소유 경계이므로 Postgres를 사용해도 실행 노드의 로컬 상태가 사라지는 것은 아니다.

## 4. 잘 된 점

### 4.1 조립 루트와 책임 분리가 명확하다

`app.Run`이 의존성을 조립하고, API는 store/jobs/hub/metrics를 주입받는다. store는 DB 접근과 암호화된 profile secret을 담당하고, jobs는 장시간 작업을 담당한다. 기본 boundary 문서도 handler의 decode/validate/response, store의 durable state, jobs의 장시간 storage work를 구분하고 있다([`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md#L6-L30)).

### 4.2 계약 검증이 실제 route와 연결되어 있다

OpenAPI contract test가 문서 route와 `chi.Walk`의 runtime route를 양방향으로 비교한다([`openapi_contract_test.go`](../backend/internal/api/openapi_contract_test.go#L19-L56)). frontend에도 generated OpenAPI type drift 검사가 있다. 문서만 갱신되거나 route만 추가되는 형태의 drift를 잡을 수 있는 좋은 구조다.

### 4.3 DB 상태 전이와 upload metadata에 방어 코드가 있다

job 시작은 expected current status를 조건으로 하는 compare-and-set update를 거친다([`store_jobs.go`](../backend/internal/store/store_jobs.go#L242-L287)). upload byte reservation과 object metadata 갱신도 transaction/row lock을 사용한다. 이는 단순한 `Get → Update`보다 재시작·중복 요청에 강한 기반이다.

### 4.4 비밀값과 provider HTTP의 기본 보안 수준이 괜찮다

AES-256-GCM 기반 profile secret 암호화가 있고([`crypto.go`](../backend/internal/store/crypto.go#L14-L96)), encryption key가 없을 때의 운영 경고도 명시되어 있다([`warnings.go`](../backend/internal/config/warnings.go#L8-L25)). SDK/직접 HTTP provider 경로는 endpoint 검증과 guarded dial을 거쳐 실제 dial 대상도 검사한다([`http_client.go`](../backend/internal/profileendpoint/http_client.go#L19-L125)).

API token은 query string으로 받지 않고 header만 사용하며([`middleware_api_token.go`](../backend/internal/api/middleware_api_token.go#L43-L161)), access log에는 request id와 민감값 redaction 경로가 있다.

### 4.5 provider별 기능을 일부 registry/capability로 정리했다

bucket governance는 큰 provider adapter interface를 section별 capability로 나누고 registry를 통해 선택한다([`registry.go`](../backend/internal/bucketgov/registry.go#L11-L101), [`service.go`](../backend/internal/bucketgov/service.go#L12-L98)). 모든 provider 코드를 한 handler에 직접 넣지 않으려는 방향은 맞다.

### 4.6 로컬 운영 계측과 테스트 바닥이 있다

HTTP/job/transfer/storage/event용 Prometheus metrics와 구조화 로그가 있고, health/ready/metrics endpoint도 제공한다. 1,397개 로컬 테스트와 OpenAPI/chart 검증이 통과하므로, 이 보고서의 문제들은 “기본 코드가 무너져 있다”기보다 **운영 규모와 경계의 문제**에 가깝다.

## 5. 아쉬운 점과 우선순위

### P1 — 런타임 ownership이 프로세스에 묶여 있어 HA 계약이 없다

**근거**

- job queue와 cancel map은 `jobs.Manager` 내부 메모리 상태다([`manager_queue.go`](../backend/internal/jobs/manager_queue.go#L7-L117), [`manager.go`](../backend/internal/jobs/manager.go#L42-L184)).
- WebSocket client/replay buffer와 realtime ticket도 메모리 상태다([`hub.go`](../backend/internal/ws/hub.go#L28-L148), [`realtime_tickets.go`](../backend/internal/api/realtime_tickets.go#L12-L77)).
- 재시작 시 기존 `running` job을 일괄 실패 처리하고 `queued` job만 local queue에 다시 넣는다([`manager_state_transitions.go`](../backend/internal/jobs/manager_state_transitions.go#L13-L74)).
- chart의 기본 replica는 1이고 data volume은 RWO 전제다([`values.yaml`](../charts/s3desk/values.yaml#L1-L1), [`values.yaml`](../charts/s3desk/values.yaml#L90-L99), [`deployment.yaml`](../charts/s3desk/templates/deployment.yaml#L9-L14)).

**영향**

현재 단일 replica에서는 단순하고 이해하기 쉽다. 그러나 replica를 늘리거나 한 pod가 재시작되는 동안 다른 worker가 살아 있으면 DB의 job row와 각 프로세스의 queue/hub/ticket 상태가 분리된다. recovery가 다른 worker의 `running` row를 실패 처리할 수 있고, WebSocket replay와 one-shot ticket은 인스턴스 경계를 넘지 못한다. CAS가 중복 시작을 일부 줄여 주지만, 이것은 durable distributed lease/heartbeat가 아니다.

**권고**

단기적으로는 single-replica를 명시적인 supported topology로 고정하고 chart·runbook·readiness에서 그 전제를 드러내는 것이 가장 작고 안전하다. HA가 실제 요구가 될 때만 다음을 함께 도입해야 한다.

- DB claim lease + heartbeat + owner id를 이용한 job ownership
- durable queue 또는 DB polling을 통한 worker recovery
- 외부 broker/공유 저장소 기반 realtime fan-out
- 분산 rate limit/ticket 저장소

메시지 브로커를 지금 선제적으로 추가할 필요는 없다. HA 요구가 확정되기 전에는 운영 계약을 명확히 하는 편이 낫다.

### P1 — provider 실행 경계가 세 갈래이고 rclone capability 계약이 분리되어 있다

**근거**

- SDK/직접 HTTP 경로는 [`profileendpoint.NewHTTPClient`](../backend/internal/profileendpoint/http_client.go#L19-L125)의 guarded dial을 사용한다.
- rclone job은 endpoint를 실행 전에 검증한 뒤 외부 process를 시작하고, API/jobs 경로 모두 실제 rclone process에 short-lived guarded loopback proxy 환경을 강제한다([`rclone_exec.go`](../backend/internal/jobs/rclone_exec.go#L31-L115), [`rclone_helpers.go`](../backend/internal/api/rclone_helpers.go#L144-L335), [`proxy.go`](../backend/internal/rcloneegress/proxy.go#L1-L393)).
- bucket/policy 같은 API handler는 provider 종류를 직접 switch한다([`handlers_bucket_policy_http.go`](../backend/internal/api/handlers_bucket_policy_http.go#L66-L201)).
- governance에만 registry/capability boundary가 있고, object/bucket/transfer 전체가 같은 executor 계약을 사용하지는 않는다.

**영향**

인증, timeout, retry, 오류 분류, metrics, endpoint 보안 정책이 provider 경로별로 달라질 가능성이 있다. rclone은 이제 subprocess마다 guarded loopback proxy를 거치며 실제 CONNECT/HTTP dial 시점에 DNS/IP를 재검증한다. 따라서 기존 DNS rebinding 경계는 owner-local하게 보강했지만, provider별 capability·인증·retry 정책이 하나의 executor 계약으로 통합된 것은 아니다.

**권고**

전체 provider를 한 번에 다시 쓰지 말고, 적용한 guarded proxy를 유지하면서 rclone API/jobs launcher의 설정·timeout·오류·metrics 계약을 더 수렴시킨다. 그 다음 기능별 provider capability를 `list/read/write/delete/policy` 수준으로 확장하면 API handler의 provider switch를 줄일 수 있다. Kubernetes NetworkPolicy와 provider live smoke는 여전히 별도 운영 증거다.

### P1 — HTTP shutdown과 job shutdown 사이에 명시적인 wait barrier가 없다

`app.Run`은 HTTP server를 shutdown한 뒤 반환하고, job manager는 `go jobManager.Run(ctx)`와 maintenance goroutine으로 시작된다([`app.go`](../backend/internal/app/app.go#L159-L217)). `Run`은 job마다 goroutine을 시작하지만 manager의 close/wait lifecycle은 보이지 않는다([`manager.go`](../backend/internal/jobs/manager.go#L158-L184)). DB는 `app.Run`의 defer 경로에서 닫힌다.

**영향**

종료 중인 job이 subprocess 정리, 최종 상태 저장, progress flush를 끝내기 전에 DB close나 process termination을 맞을 수 있다. 다음 시작에서 해당 row가 `running`으로 남으면 recovery가 실패 처리한다. 데이터 손상으로 곧바로 이어진다고 단정할 근거는 없지만, graceful shutdown의 성공 조건이 정의되어 있지 않다.

**권고**

최소 변경은 `jobs.Manager`에 `Close(ctx)` 또는 동등한 lifecycle을 추가하는 것이다. 순서는 “신규 enqueue 중지 → active job cancel 신호 → worker goroutine wait → maintenance 종료 → DB close”여야 한다. 이 변경은 HA를 만들지 않고도 재시작 신뢰성을 높인다.

### P1 — multipart upload 정리가 provider의 미완료 upload를 남긴다

**근거**

- presigned/direct S3 경로는 provider에서 `CreateMultipartUpload`를 호출하고 `S3UploadID`를 DB에 저장한다([`handlers_uploads_presign_http.go`](../backend/internal/api/handlers_uploads_presign_http.go#L232-L274), [`handlers_uploads_direct.go`](../backend/internal/api/handlers_uploads_direct.go#L37-L82)).
- 자동 만료 정리는 direct mode의 임시 object prefix를 지우기 전에 provider multipart metadata를 읽어 `AbortMultipartUpload`를 시도하고, 실패하면 metadata와 session을 보존한다([`manager_maintenance.go`](../backend/internal/jobs/manager_maintenance.go#L38-L148)).
- 반면 사용자가 명시적으로 session을 삭제하는 경로에는 저장된 multipart upload를 abort하는 코드가 있다([`handlers_uploads_session_http.go`](../backend/internal/api/handlers_uploads_session_http.go#L156-L179)). 즉 수동 삭제와 TTL cleanup의 외부 상태 정리 정책이 다르다.
- profile 삭제는 이제 queued/running job을 상태 기반으로 취소하고 drain한 뒤 upload cleanup을 수행하며, DB delete 자체도 active job이 있으면 거부한다([`handlers_profiles_delete.go`](../backend/internal/api/handlers_profiles_delete.go#L72-L145), [`handlers_profiles_delete.go`](../backend/internal/api/handlers_profiles_delete.go#L219-L253), [`store_profiles.go`](../backend/internal/store/store_profiles.go#L807-L831)).

**영향**

provider live lifecycle 정책과 실제 배포 환경의 abort 동작은 별도 증거지만, 현재 owner-local cleanup은 provider abort 성공 뒤에만 metadata를 삭제하고 재시도 가능한 실패 상태를 보존한다.

**권고**

provider live credential/deployment smoke는 별도 opt-in lane으로 남긴다. direct non-S3 temp object cleanup은 현재 경로처럼 multipart abort와 별도로 유지한다.

### P1 — 같은 파일의 direct multipart chunk 병렬 요청이 multipart upload ID를 분리할 수 있다

**근거**

- frontend는 기본 `chunkConcurrency`를 8로 설정하고 같은 파일의 chunk를 병렬로 시작한다([`uploads.ts`](../frontend/src/api/domains/uploads.ts#L115-L149), [`uploads.ts`](../frontend/src/api/domains/uploads.ts#L412-L447)).
- backend는 `(upload_id, path)` metadata를 읽은 뒤, 없으면 provider multipart upload를 생성하고, 그 후에 DB upsert를 수행한다([`handlers_uploads_direct.go`](../backend/internal/api/handlers_uploads_direct.go#L28-L83)). 이 세 단계 사이에 DB lock이나 create-once claim이 없다.
- 각 요청은 자신이 얻은 `S3UploadID`로 part를 전송한다([`handlers_uploads_chunk_flows.go`](../backend/internal/api/handlers_uploads_chunk_flows.go#L48-L71)).

**영향**

동일 파일의 첫 두 chunk가 동시에 metadata를 보지 못하면 provider에 multipart upload가 두 개 생성된다. DB에는 마지막 upsert의 ID만 남을 수 있어 parts가 서로 다른 upload에 분산되고 commit이 `upload_incomplete`로 실패한다. DB에 남지 않은 첫 upload는 자동 abort 대상에서도 빠져 provider orphan으로 남을 수 있다.

**권고**

`(upload_id, path)`별 create claim을 DB transaction/row lock으로 직렬화하고, 승리한 하나의 `S3UploadID`만 모든 chunk가 사용하게 해야 한다. 경쟁에서 진 provider upload가 이미 생성됐다면 즉시 abort해야 한다. 이 경로에 동일 파일 병렬 chunk와 retry를 포함한 HTTP integration test가 없다면 추가해야 한다.

### P1 — 전역 30초 `ReadTimeout`이 streaming upload를 끊을 수 있다

**근거**

- HTTP server가 모든 route에 `ReadTimeout: 30 * time.Second`를 적용한다([`app.go`](../backend/internal/app/app.go#L191-L199)).
- direct chunk는 request body를 provider SDK에 그대로 전달하고([`handlers_uploads_direct.go`](../backend/internal/api/handlers_uploads_direct.go#L85-L101)), form upload도 `multipart.Reader`를 통해 request body를 계속 읽는다([`handlers_uploads_direct.go`](../backend/internal/api/handlers_uploads_direct.go#L104-L148)).
- frontend의 기본 chunk size는 128 MiB이고, 네트워크가 느리면 한 chunk의 body 수신 자체가 30초를 넘을 수 있다([`uploads.ts`](../frontend/src/api/domains/uploads.ts#L115-L120)).

**영향**

대용량 또는 느린 업로드가 provider 오류가 아니라 HTTP read deadline으로 끊길 수 있다. 재시도는 같은 chunk의 remote multipart part를 다시 쓰거나, 앞서 지적한 multipart 상태 경쟁을 재촉할 수 있다. 반대로 timeout을 무작정 늘리면 느린 연결이 server resource를 오래 점유하므로 route별 정책이 필요하다.

**권고**

streaming upload route에는 전체 body 수신 30초 제한 대신 명시적인 idle timeout과 content/byte limit을 적용하고, 일반 JSON/control-plane route에는 짧은 read timeout을 유지한다. ingress/proxy의 request timeout도 같은 정책으로 맞춰야 한다.

### P2 — crash 후 API용 임시 rclone credential file이 남을 수 있다

API의 rclone helper는 profile credential을 `DATA_DIR/tmp/rclone/*.rclone.conf`에 쓰고 정상 종료 경로에서 삭제한다([`rclone_helpers.go`](../backend/internal/api/rclone_helpers.go#L144-L188), [`config.go`](../backend/internal/rcloneconfig/config.go#L235-L274)). startup recovery는 `DATA_DIR` lock을 획득한 뒤 pre-existing API config를 즉시 제거하고, maintenance는 현재 프로세스 중 남은 API config 중 24시간 초과 파일을 별도로 정리한다([`manager_state_transitions.go`](../backend/internal/jobs/manager_state_transitions.go#L12-L18), [`manager_maintenance.go`](../backend/internal/jobs/manager_maintenance.go#L202-L253)).

프로세스 crash, SIGKILL, node 장애가 나면 0600 파일이라도 persistent `DATA_DIR`에 provider secret이 남을 수 있다. 백업에서 해당 suffix를 제외하는 것은 확인되지만, 디스크 보존 기간과 운영자 접근 범위는 통제되지 않는다.

**권고**

API temp config는 startup recovery에서 이전 프로세스의 파일을 즉시 제거하고, maintenance에서는 현재 프로세스의 장기 잔류 파일만 age-based로 정리한다. 이 순서는 `DATA_DIR` single-writer lock이 살아 있는 process ownership 경계이므로 별도 PID marker 없이도 실행 중 파일을 오삭제하지 않는다. 다른 프로세스가 같은 `DATA_DIR`를 공유하는 topology를 지원할 때만 OS temp 분리나 별도 ownership marker를 추가한다.

### P2 — upload 성공과 object search index 성공이 조용히 분리된다

**근거**

- immediate upload commit은 먼저 job을 `succeeded`로 저장한 뒤 `UpsertObjectIndexBatch`를 호출한다. 현재 worktree는 실패를 버리지 않고 구조화 로그를 남긴 뒤 `fullReindex`인 `s3_index_objects` repair job을 생성·enqueue하며, queue-full이면 생성한 row를 bounded rollback한다([`handlers_uploads_commit_finalize_service.go`](../backend/internal/api/handlers_uploads_commit_finalize_service.go#L35-L119)).
- object search는 live provider listing이 아니라 object index만 조회하고, index가 없으면 `s3_index_objects` job을 먼저 만들라고 응답한다([`handlers_object_search_http.go`](../backend/internal/api/handlers_object_search_http.go#L114-L135)).

**영향**

provider upload과 job은 성공으로 보이는데 SQLite/Postgres 오류나 일시적 저장 실패로 index row가 빠질 수 있다. 현재는 repair job과 구조화 로그로 eventual repair를 시도하지만, commit 응답에는 degraded 상태나 재시도 신호가 없고 repair job 생성·enqueue·rollback 자체가 실패하면 durable outbox/dirty marker가 없다. 그 전까지는 성공 상태와 검색 결과가 불일치할 수 있다.

**권고**

index 갱신을 remote upload 성공과 동일 transaction으로 묶으려 하지 말고, release-grade repair 보장이 필요할 때만 durable dirty/outbox 상태를 추가해 maintenance 또는 명시적 reindex가 재시도하게 한다. 현재 owner-local 보강으로 error log와 repair job은 있지만, 응답의 stale/degraded 신호와 outbox 보장은 아직 제품 요구로 확정되지 않았다.

### P2 — 인증은 single-operator trust boundary이며 사용자 권한 모델이 없다

현재 원격 API 인증은 설정된 하나의 API token 또는 realtime one-shot ticket이고([`middleware_api_token.go`](../backend/internal/api/middleware_api_token.go#L43-L161)), 어떤 profile을 대상으로 할지는 `X-Profile-Id` header로 선택한다([`middleware.go`](../backend/internal/api/middleware.go#L449-L482)). 검토한 model/store/API 흐름에는 사용자·tenant·role을 영속화하고 권한을 계산하는 별도 경계가 없다.

**영향**

토큰을 가진 사용자는 profile 단위 격리 없이 API가 허용하는 범위의 control plane을 공유한다. actor별 audit, least privilege, profile별 권한 위임, tenant isolation을 제공할 수 없다. 이는 현재 self-hosted single-operator 제품에는 단순한 선택이지만, 팀용 SaaS나 다중 운영자 제품의 기반으로는 부족하다.

**권고**

제품 목표가 single operator라면 이를 보안 모델로 문서화하고 remote 노출 시 token/key/host 정책을 강제하면 된다. multi-user가 필요할 때는 profile handler마다 임시 검사를 추가하지 말고, gateway 또는 API 공통 계층에 identity·role·resource ACL을 먼저 세워야 한다.

### P2 — readiness 의미가 API+DB에 한정되어 transfer readiness를 설명하지 못한다

현재 `/readyz`는 store/jobs 포인터, DB ping, 그리고 `DATA_DIR`에 대한 실제 임시 파일 생성·삭제를 확인한다([`handlers_health.go`](../backend/internal/api/handlers_health.go#L14-L67)). rclone 실행 가능 여부, staging/data 디스크 여유, job worker의 진행 상태, 필요한 외부 provider 접근성은 readiness에 포함하지 않는다. worker loop 상태와 queue depth/capacity는 별도 local-only `/workerz`에서 확인한다.

이 설계 자체가 틀린 것은 아니다. provider를 readiness에 묶으면 외부 장애로 API 전체가 준비되지 않는 부작용이 있다. 다만 현재 endpoint 이름만으로는 “HTTP/DB는 준비됨”과 “파일 전송을 처리할 수 있음”을 구분하기 어렵다.

**권고**

- `/readyz`: process + DB + 필수 local storage만 확인
- `/workerz`: in-process worker loop heartbeat와 queue depth/capacity를 확인
- 별도 diagnostics 확장 후보: rclone binary, staging capacity, 최근 실패율
- operation별 context deadline과 streaming route의 `WriteTimeout: 0` 의도를 문서화

### P2 — API composition root가 커지고 provider dispatch가 HTTP layer로 새어 나온다

`api.New`가 사실상 모든 route를 등록하고, `server`가 config/store/jobs/hub/metrics/limiter/governance/restore lock을 한꺼번에 보유한다([`api.go`](../backend/internal/api/api.go#L31-L229), [`server.go`](../backend/internal/api/server.go#L14-L29)). bucket 생성/삭제와 object delete는 HTTP request 안에서 rclone 작업을 직접 수행하는 경로도 있다([`handlers_buckets_http.go`](../backend/internal/api/handlers_buckets_http.go#L141-L240), [`handlers_object_delete_http.go`](../backend/internal/api/handlers_object_delete_http.go#L111-L154]).

**영향**

기능이 더 늘면 route registration, auth, provider 선택, 실행, response mapping이 같은 패키지에 누적된다. 새 provider를 추가할 때 API handler·job·provider helper를 동시에 이해해야 하고, request timeout과 background job의 정책 차이도 커진다.

**권고**

대규모 재작성 대신 feature별 route registrar와 application service를 점진적으로 분리한다. 기준은 “HTTP는 입력·권한·응답, application service는 use case, provider executor는 외부 호출, jobs는 오래 걸리는 실행”으로 고정한다. 짧은 control-plane 호출을 동기 처리할 수는 있지만, 그 예외 기준을 [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md#L20-L30)에 명시해야 한다.

### P2 — SQLite/Postgres와 portable backup의 운영 의미가 비대칭이다

DB open/migration은 SQLite와 Postgres를 모두 지원하고 startup 시 migration을 적용한다([`db.go`](../backend/internal/db/db.go#L70-L160)). 반면 chart 문서는 실행 artifact와 full/cache backup이 `DATA_DIR` 및 SQLite portable backup 의미와 연결된다는 점을 설명한다([`charts/s3desk/README.md`](../charts/s3desk/README.md#L190-L202)).

**영향**

운영자가 “Postgres로 바꾸면 모든 상태가 외부 DB에 있다”고 오해할 수 있다. 또한 여러 replica가 동시에 startup migration을 수행할 때의 coordination 정책이 코드에 드러나지 않는다. 이는 현재 replica 1 운영에서는 노출 빈도가 낮지만, deployment 모델을 확장할 때 장애 원인이 된다.

**권고**

Postgres 사용 시에도 `DATA_DIR`가 필수인 artifact 경계임을 runbook과 chart validation에서 분명히 한다. migration은 single startup owner 또는 DB advisory lock 같은 명시적 정책을 갖게 하고, backup 문서에서 “DB state”와 “local artifact state”를 별도 항목으로 나눈다.

### P3 — 실제 provider/deployment proof가 local test proof와 분리되어 있다

provider live validation은 필요한 환경변수가 없으면 skip하도록 작성되어 있다([`provider_live_validation_test.go`](../backend/internal/api/provider_live_validation_test.go#L16-L30)). 따라서 현재 로컬 green 결과는 다음을 증명한다.

- Go 코드의 단위/통합/HTTP fake 경로
- OpenAPI route 계약
- chart template/lint
- DB 및 local job/upload 상태 전이

하지만 다음은 증명하지 않는다.

- 실제 provider credential, region, endpoint, TLS, permission 동작
- rclone과 SDK의 실제 egress/timeout 차이
- Postgres 운영 instance와 migration/connection pool behavior
- Kubernetes restart, RWO volume, multiple pod, ingress/proxy, external DNS

**권고**

이를 실패로 취급해 모든 CI를 외부 provider에 묶기보다, local gate와 별도의 opt-in provider/deployment smoke lane을 분리한다. release readiness report에서 두 증거 수준을 섞지 않는 것이 중요하다.

## 6. 권장 실행 순서

### 즉시: 운영 계약과 종료 신뢰성 고정

1. single replica와 하나의 `DATA_DIR` owner를 지원 topology로 문서화하고 chart에서 의도를 드러낸다.
2. `Manager` 종료 lifecycle과 active job wait barrier를 추가한다.
3. readiness를 API/DB/local storage 의미로 명확히 하고 worker diagnostics를 별도 제공한다.

### 다음: 외부 호출 경계 정리

1. API/jobs rclone launcher에 공통 process-group 및 guarded proxy 경계를 유지하고, 중복 설정 경로를 줄인다.
2. Kubernetes egress NetworkPolicy와 provider destination review를 deployment별로 완료한다.
3. provider capability를 API handler 밖의 application/provider service로 옮긴다.

### 제품 요구가 확정될 때만

1. HA: durable lease/queue, shared realtime, distributed limiter
2. multi-user: identity, role, resource ACL, actor audit
3. 고급 운영: migration coordinator, provider/deployment live matrix, tracing

## 7. 최종 판단

이 백엔드는 현재 규모에서 “기능이 무질서하게 섞인 서버”는 아니다. 오히려 local correctness와 self-hosted 운영 편의에 상당히 투자된 단일 노드형 구조다. 가장 큰 개선 효과는 새 서비스나 새 dependency를 추가하는 데서 나오지 않는다.

우선순위는 다음 세 가지다.

1. single-node 전제를 명시하거나, 정말 필요할 때만 distributed ownership으로 승격한다.
2. rclone/SDK/직접 HTTP 외부 호출의 보안·timeout·오류 경계를 하나로 만든다.
3. 종료 시 job이 저장·정리될 때까지 기다리는 lifecycle을 만든다.

이 세 가지를 해결하면 현재 구조를 유지하면서도 운영 사고 가능성을 크게 낮출 수 있다. 반대로 HA나 multi-user 요구가 아직 없다면, 지금 당장 서비스 분리나 broker 도입을 추진하는 것은 비용 대비 이득이 낮다.

## 8. 이번 작업에서 적용한 remediation

현재 worktree에는 다음의 업로드 lifecycle 보강을 적용했다.

- 만료된 `direct`/`presigned` session의 S3 multipart upload를 provider에서 abort한 뒤 metadata row를 삭제한다. abort 실패 시 session과 남은 metadata를 보존해 다음 maintenance cycle에서 재시도한다([`manager_maintenance.go`](../backend/internal/jobs/manager_maintenance.go#L38-L148)).
- 수동 upload session 삭제와 profile 삭제도 동일한 provider abort 경계를 사용하고, direct temp prefix 정리가 끝나기 전에는 profile/session을 삭제하지 않는다([`handlers_uploads_cleanup.go`](../backend/internal/api/handlers_uploads_cleanup.go#L9-L43), [`handlers_uploads_session_http.go`](../backend/internal/api/handlers_uploads_session_http.go#L152-L180), [`handlers_profiles_delete.go`](../backend/internal/api/handlers_profiles_delete.go#L85-L163)).
- profile 삭제는 queued/running job을 취소하고 완료를 기다린 뒤 cleanup하며, 마지막 DB delete 조건도 active job 상태를 재검증한다. drain 실패는 HTTP 409로 반환하고 profile을 보존한다. active-job poll 중 request/deadline context가 DB 조회에서 반환되는 경우도 내부 오류 500이 아니라 같은 conflict 경계로 보존한다([`handlers_profiles_delete.go`](../backend/internal/api/handlers_profiles_delete.go#L72-L163), [`handlers_profiles_delete_test.go`](../backend/internal/api/handlers_profiles_delete_test.go#L157-L203), [`store_profiles.go`](../backend/internal/store/store_profiles.go#L807-L831)).
- Helm values schema와 template validation이 `replicaCount > 1`을 거부하고, chart/runbook에 job queue·realtime·`DATA_DIR`의 single-writer topology를 명시한다([`values.schema.json`](../charts/s3desk/values.schema.json#L93-L97), [`_helpers.tpl`](../charts/s3desk/templates/_helpers.tpl#L108-L154), [`check_helm_chart.sh`](../scripts/check_helm_chart.sh#L47-L58)).
- 한 프로세스 안의 병렬 direct chunk 요청은 multipart create/read/upsert 구간을 직렬화해 동일 파일에 provider upload ID가 여러 개 생기지 않게 했다([`server.go`](../backend/internal/api/server.go#L14-L32), [`handlers_uploads_direct.go`](../backend/internal/api/handlers_uploads_direct.go#L28-L86)). 이 lock은 HA용 durable claim이 아니며 single-replica 지원 계약의 보강이다.
- provider multipart create 뒤 metadata upsert 또는 byte reservation이 실패하면 shared rollback이 먼저 provider abort를 시도한다. abort 성공 때만 metadata를 지우고, abort 실패 시 metadata를 보존·재기록해 maintenance/session cleanup이 재시도할 수 있게 했다([`handlers_uploads_multipart.go`](../backend/internal/api/handlers_uploads_multipart.go#L230-L247), [`handlers_uploads_direct.go`](../backend/internal/api/handlers_uploads_direct.go#L48-L90), [`handlers_uploads_presign_http.go`](../backend/internal/api/handlers_uploads_presign_http.go#L237-L304)).
- 앱은 `Manager.Start`에서 worker와 maintenance lifecycle을 먼저 `WaitGroup`에 등록한 뒤 goroutine을 시작하고, HTTP server의 정상 종료와 listen 오류 양쪽에서 server shutdown → manager cancel → `Manager.Wait` 순서를 수행해 두 goroutine과 active job이 DB close 전에 종료될 기회를 보장한다([`manager.go`](../backend/internal/jobs/manager.go#L161-L219), [`manager_maintenance.go`](../backend/internal/jobs/manager_maintenance.go#L25-L48), [`app.go`](../backend/internal/app/app.go#L175-L230)). deadline을 넘기면 warning을 남기고 반환하므로 강제 종료 보장은 아니며, subprocess가 실제로 종료되는지는 별도 provider/process proof다.
- `/readyz`는 process/DB/local storage readiness를 유지하고, 실제 in-process worker loop와 queue depth/capacity는 local-only `/workerz`로 분리해 노출한다. worker가 종료된 상태는 `503 worker_unavailable`로 구분하며 provider availability를 readiness에 묶지 않는다([`handlers_health.go`](../backend/internal/api/handlers_health.go#L48-L74), [`manager.go`](../backend/internal/jobs/manager.go#L160-L207), [`handlers_health_test.go`](../backend/internal/api/handlers_health_test.go#L94-L170)).
- `DATA_DIR` lock 이후 startup recovery에서 이전 프로세스의 API 임시 config를 즉시 제거하고, maintenance에서 현재 프로세스의 24시간 초과 config를 제거해 crash 잔류 secret의 보존 시간을 제한한다([`manager_state_transitions.go`](../backend/internal/jobs/manager_state_transitions.go#L12-L18), [`manager_maintenance.go`](../backend/internal/jobs/manager_maintenance.go#L187-L253)).
- 전역 HTTP `ReadTimeout`을 제거하고 API body middleware에서 control-plane은 30초 idle, `/api/v1/uploads/{uploadId}/files`는 2분 idle deadline을 적용한다. 따라서 streaming upload의 전체 수신 시간은 제한하지 않으면서 기존 content/byte limit은 유지한다([`app.go`](../backend/internal/app/app.go#L191-L201), [`request_body_timeout.go`](../backend/internal/api/request_body_timeout.go#L1-L67)).
- immediate upload의 object-index upsert 실패를 더 이상 버리지 않고 구조화 로그를 남긴 뒤 `fullReindex`인 `s3_index_objects` repair job을 durable queued row로 기록·enqueue한다. enqueue가 성공하면 startup recovery가 재시작 중 남은 queued row를 재시도하고, queue가 가득 차면 공통 bounded rollback으로 방금 만든 row를 삭제한다. rollback 자체가 실패한 경우에만 row를 보존하고 enqueue/rollback 오류를 함께 기록한다([`handlers_uploads_commit_finalize_service.go`](../backend/internal/api/handlers_uploads_commit_finalize_service.go#L35-L119), [`handlers_jobs_submission.go`](../backend/internal/api/handlers_jobs_submission.go#L320-L342)).
- immediate upload commit의 결과 job은 `succeeded` status, start/finish timestamp, progress를 처음부터 한 번의 `CreateJob` insert로 저장한다. 별도 status update 실패로 `transfer_direct_upload` queued orphan row가 남는 경계를 제거했다([`store_jobs.go`](../backend/internal/store/store_jobs.go#L13-L72), [`handlers_uploads_commit_finalize_service.go`](../backend/internal/api/handlers_uploads_commit_finalize_service.go#L105-L132)).
- startup recovery는 worker가 지원하지 않는 legacy queued job을 다시 queue에 넣지 않고 `failed`/`unknown`으로 기록한다. 따라서 atomic persistence 보강 이전에 남은 `transfer_direct_upload` orphan도 영구 queued 상태로 남지 않는다([`manager_state_transitions.go`](../backend/internal/jobs/manager_state_transitions.go#L62-L139), [`manager_recovery_test.go`](../backend/internal/jobs/manager_recovery_test.go#L89-L153)).
- portable import의 clear payload는 destination encryption key가 다를 때 payload checksum은 검증하되 HMAC 오류로 먼저 중단하지 않고, `encryption fingerprint` preflight blocker를 200 응답으로 반환한다. encrypted payload의 잘못된 password/key는 기존 authentication failure로 계속 거부한다([`handlers_server_portable.go`](../backend/internal/api/handlers_server_portable.go#L408-L430), [`handlers_server_restore_verify.go`](../backend/internal/api/handlers_server_restore_verify.go#L18-L75), [`handlers_server_portable_test.go`](../backend/internal/api/handlers_server_portable_test.go#L364-L402)).
- direct multipart form upload의 임시 object cleanup(`deletefile`) 실패를 더 이상 버리지 않고 원래 upload error의 redacted `cleanupError`로 보존한다. 따라서 provider temp object가 남을 수 있다는 경계를 caller와 후속 session-prefix cleanup이 관찰할 수 있다([`handlers_uploads_direct.go`](../backend/internal/api/handlers_uploads_direct.go#L121-L166), [`handlers_uploads_parts.go`](../backend/internal/api/handlers_uploads_parts.go#L108-L122)).
- 수동 upload session 삭제의 DB multipart/object/session metadata 삭제도 각 단계의 오류를 500으로 반환하도록 바꿨다. remote abort 또는 metadata cleanup이 실패하면 성공 204를 보내지 않고 session을 재시도 가능한 상태로 보존한다([`handlers_uploads_session_http.go`](../backend/internal/api/handlers_uploads_session_http.go#L155-L184)).
- immediate upload commit이 성공한 뒤 수행하는 multipart/object/session metadata cleanup은 취소된 request context를 그대로 사용하지 않고, `WithoutCancel`과 5초 bounded context를 사용한다. 각 cleanup 단계의 실패는 구조화 로그로 남겨 성공 응답 뒤의 정리 실패도 관찰 가능하게 했다([`handlers_uploads_commit_cleanup.go`](../backend/internal/api/handlers_uploads_commit_cleanup.go#L10-L33), [`handlers_uploads_commit_index_test.go`](../backend/internal/api/handlers_uploads_commit_index_test.go#L13-L48)).
- 만료 session maintenance는 provider, metadata, staging directory, session row 중 하나라도 정리하지 못하면 해당 row를 삭제하지 않고 단계별 오류를 로그로 남긴다. `deleted` count도 모든 cleanup 성공 뒤에만 증가하므로 다음 cycle에서 재시도할 수 있다([`manager_maintenance.go`](../backend/internal/jobs/manager_maintenance.go#L49-L113), [`manager_retention_test.go`](../backend/internal/jobs/manager_retention_test.go#L295-L617)).
- staging session 생성 중 directory resolve/create 또는 staging path 저장이 실패하면 staging directory와 session row를 bounded rollback하고, rollback 실패는 `cleanupError`로 함께 반환한다([`handlers_uploads_session_http.go`](../backend/internal/api/handlers_uploads_session_http.go#L90-L143), [`handlers_uploads_session_http_test.go`](../backend/internal/api/handlers_uploads_session_http_test.go#L110-L147)).
- staging-to-S3 sync가 원격 성공한 뒤에는 local staging, multipart/object metadata, session row를 차례로 정리한다. cleanup 실패는 성공한 remote sync를 다시 실행하지 않도록 job을 실패시키지 않고 구조화 로그와 남은 session으로 maintenance 재시도 경계를 유지한다([`manager_transfer_execution.go`](../backend/internal/jobs/manager_transfer_execution.go#L70-L109), [`manager_paths_test.go`](../backend/internal/jobs/manager_paths_test.go#L146-L274)).
- provider multipart complete/abort 뒤 metadata 삭제는 취소된 request context를 그대로 사용하지 않는 5초 bounded cleanup으로 통일했다. presigned complete/abort endpoint는 metadata cleanup 실패를 더 이상 204로 숨기지 않고, direct commit 경로는 최종 commit cleanup이 계속되도록 구조화 로그를 남긴다([`handlers_uploads_cleanup.go`](../backend/internal/api/handlers_uploads_cleanup.go#L10-L14), [`handlers_uploads_multipart_http.go`](../backend/internal/api/handlers_uploads_multipart_http.go#L152-L235), [`handlers_uploads_commit_multipart.go`](../backend/internal/api/handlers_uploads_commit_multipart.go#L15-L67)).
- staging chunk assembly은 이미 각 part 저장 시 예약된 `bytes_tracked`를 다시 조정하지 않고, temp 파일 작성 후 final rename과 chunk directory cleanup만 수행한다. 조립 실패 시 part를 보존하고, rename rollback·기존 final release·multipart form 파일 cleanup의 2차 오류는 `rollbackError`/`cleanupError`로 caller가 관찰할 수 있다([`handlers_uploads_chunks.go`](../backend/internal/api/handlers_uploads_chunks.go#L92-L164), [`handlers_uploads_staging.go`](../backend/internal/api/handlers_uploads_staging.go#L21-L109), [`handlers_uploads_test.go`](../backend/internal/api/handlers_uploads_test.go#L224-L296)).
- 일반 job 제출과 staging upload commit은 durable job 생성 뒤 enqueue가 실패하면 request cancellation을 무시하는 5초 bounded rollback을 수행한다. rollback 자체가 실패하면 orphan queued row를 queue-full 성공 경로로 숨기지 않고 구조화 로그와 내부 오류로 남긴다([`handlers_jobs_submission.go`](../backend/internal/api/handlers_jobs_submission.go#L297-L345), [`handlers_uploads_commit_queue.go`](../backend/internal/api/handlers_uploads_commit_queue.go#L12-L33), [`handlers_jobs_submission_rollback_test.go`](../backend/internal/api/handlers_jobs_submission_rollback_test.go#L11-L35)).
- 수동 upload session/profile 삭제는 local staging directory를 DB session 삭제보다 먼저 정리하고, path resolve 또는 `RemoveAll` 실패를 반환한다. 따라서 local cleanup 실패가 성공 204와 이미 삭제된 session 뒤에 숨지 않고 maintenance/retry 가능한 row를 보존한다([`handlers_uploads_session_http.go`](../backend/internal/api/handlers_uploads_session_http.go#L170-L216), [`handlers_profiles_delete.go`](../backend/internal/api/handlers_profiles_delete.go#L185-L216)).
- API rclone 실행도 jobs와 동일하게 process group을 만들고 context 취소 시 자식 process까지 종료하도록 공통 helper를 사용한다. fake rclone이 만든 child의 종료 marker를 확인하는 API 회귀 테스트로 부모만 종료되는 경계를 검증했다([`process_kill.go`](../backend/internal/jobs/process_kill.go#L50-L78), [`rclone_helpers.go`](../backend/internal/api/rclone_helpers.go#L183-L326), [`rclone_endpoint_guard_test.go`](../backend/internal/api/rclone_endpoint_guard_test.go#L81-L162)).
- API와 jobs의 모든 rclone subprocess에 short-lived authenticated loopback proxy를 주입한다. proxy는 HTTP와 HTTPS `CONNECT`를 처리하고, 실제 outbound dial은 기존 `profileendpoint.GuardedDialContext`로 재해석·검증한다. proxy 생성 실패 시 direct fallback 없이 실행을 중단하며, `NO_PROXY`를 비운 child environment를 사용한다([`proxy.go`](../backend/internal/rcloneegress/proxy.go#L1-L393), [`rclone_helpers.go`](../backend/internal/api/rclone_helpers.go#L177-L327), [`rclone_exec.go`](../backend/internal/jobs/rclone_exec.go#L59-L132), [`rclone_attempt.go`](../backend/internal/jobs/rclone_attempt.go#L31-L112)).
- job 생성과 staging commit의 rclone preflight도 missing/incompatible capability를 구분해 `transfer_engine_missing` 또는 `transfer_engine_incompatible`와 version details를 같은 API contract로 반환한다([`rclone_helpers.go`](../backend/internal/api/rclone_helpers.go#L534-L593), [`handlers_jobs_submission.go`](../backend/internal/api/handlers_jobs_submission.go#L276-L290), [`handlers_uploads_commit_execution.go`](../backend/internal/api/handlers_uploads_commit_execution.go#L118-L148)).
- bucket policy의 S3/S3-compatible, GCS, Azure provider 호출 dispatch와 `AllowRemote` 옵션은 [`bucketpolicy.Service`](../backend/internal/bucketpolicy/service.go#L1-L105)로 옮겼다. HTTP handler는 provider 응답 status 해석과 redacted upstream error mapping만 유지하므로 provider client 선택이 route layer에 더 이상 직접 섞이지 않는다([`handlers_bucket_policy_http.go`](../backend/internal/api/handlers_bucket_policy_http.go#L87-L218)).
- bucket list/create/delete의 rclone command construction과 GCS region 분기는 [`bucketops.Service`](../backend/internal/bucketops/service.go#L51-L112)로 옮겼다. API handler는 profile/request validation, governance defaults, HTTP error mapping만 유지하고 guarded runner를 service에 주입한다([`handlers_buckets_http.go`](../backend/internal/api/handlers_buckets_http.go#L31-L65)).
- S3-compatible folder marker 생성, bulk-delete 후 marker 정리, empty-prefix marker 삭제는 [`s3client` object helpers](../backend/internal/s3client/objects.go#L14-L118)가 guarded client 생성과 SDK 호출을 담당하도록 수렴시켰다. marker 삭제는 client를 한 번만 만들고 실패한 key를 typed error로 보존하며, HTTP 계층은 setup failure와 provider operation failure를 구분한다([`handlers_object_folder_http.go`](../backend/internal/api/handlers_object_folder_http.go#L99-L113), [`handlers_object_delete_http.go`](../backend/internal/api/handlers_object_delete_http.go#L87-L107), [`delete_prefix_marker.go`](../backend/internal/jobs/delete_prefix_marker.go#L14-L30)).
- multipart create/complete/abort의 SDK input construction은 [`s3client` multipart helpers](../backend/internal/s3client/multipart.go#L11-L41)로 수렴시켰다. direct/presign/commit API와 maintenance가 같은 operation helper를 사용하고, streaming `UploadPart`, paginated `ListParts`, verification `HeadObject`는 호출별 lifecycle 의미 때문에 각 owner에 남겼다([`handlers_uploads_direct.go`](../backend/internal/api/handlers_uploads_direct.go#L59-L64), [`handlers_uploads_presign_http.go`](../backend/internal/api/handlers_uploads_presign_http.go#L252-L259), [`handlers_uploads_multipart_http.go`](../backend/internal/api/handlers_uploads_multipart_http.go#L166-L171), [`manager_maintenance.go`](../backend/internal/jobs/manager_maintenance.go#L143-L146)).
- multipart provider 오류는 [`newUploadProviderError`](../backend/internal/api/handlers_uploads_errors.go#L41-L55)로 분류해 `access_denied`/`rate_limited`/network 계열의 HTTP status와 `normalizedError.retryable`을 같은 계약으로 반환하고, 알 수 없는 오류는 기존 `upload_failed`/502를 유지한다. upload route의 응답은 공통 [`writeError`](../backend/internal/api/json.go#L50-L60)를 사용해 `Retry-After`와 diagnostic redaction을 적용한다. `UploadPart` request body는 재생 불가능하므로 서버 자동 재시도는 하지 않고, retryable 신호만 caller가 새 body로 재전송할 때 사용한다([`handlers_uploads_chunk_flows.go`](../backend/internal/api/handlers_uploads_chunk_flows.go#L89-L97), [`handlers_uploads_commit_multipart.go`](../backend/internal/api/handlers_uploads_commit_multipart.go#L25-L57), [`handlers_uploads_commit_verify_service.go`](../backend/internal/api/handlers_uploads_commit_verify_service.go#L120-L136), [`handlers_uploads_presign_http.go`](../backend/internal/api/handlers_uploads_presign_http.go#L143-L150)).
- S3 SDK의 folder marker 생성과 bulk-delete 후 marker 정리 실패도 rclone 전용 응답 우회를 제거하고 [`writeClassifiedProviderAPIError`](../backend/internal/api/rclone_helpers.go#L596-L629)를 공유한다. 따라서 SDK `AccessDenied`/`SlowDown`도 provider-agnostic status, `normalizedError`, `Retry-After`, redacted diagnostic으로 반환하며, typed error가 보존한 bucket/key만 details에 노출한다([`handlers_object_folder_http.go`](../backend/internal/api/handlers_object_folder_http.go#L101-L121), [`handlers_object_delete_http.go`](../backend/internal/api/handlers_object_delete_http.go#L121-L138)).
- object download URL의 S3/AWS presign 경계도 공통 오류 계약으로 수렴시켰다. presigner setup failure는 `invalid_config`/400으로 반환하고, `PresignGetObject` operation failure는 기존 `writeRcloneAPIError`에서 provider status, retry signal, redacted diagnostic을 분류한다. proxy/rclone 경로는 기존 공통 경계를 유지하며, 이미 response headers를 쓴 뒤의 streaming failure는 HTTP status를 바꿀 수 없는 log-only 경계로 남는다([`handlers_object_download_url_http.go`](../backend/internal/api/handlers_object_download_url_http.go#L130-L168)).

검증 결과:

- `go test ./internal/api ./internal/jobs`: 통과
- `go vet ./internal/api ./internal/jobs`: 통과
- 새 provider abort, abort 실패 시 metadata 보존, profile 삭제 cleanup, concurrent create 회귀 테스트: 통과
- shutdown wait deadline 테스트와 worker/maintenance lifecycle 변경을 포함한 jobs/app focused test: 통과
- API rclone temp config의 expired-only cleanup 회귀 테스트: 통과
- fast body, slow control-plane body timeout, streaming upload idle-window 회귀 테스트: 통과
- object-index repair job의 payload·queue 등록 및 queue-full rollback 회귀 테스트: 통과
- API `startRclone`/`runRcloneStdin` process-group cancellation 회귀 테스트: 통과
- guarded rclone proxy의 HTTP/CONNECT/auth/DNS-rebind 및 child environment 회귀 테스트: 통과
- `go test -race ./internal/api`의 새 concurrent create/cleanup 테스트: 통과
- profile 삭제 active-job drain/DB guard 회귀 테스트와 `go test -race ./internal/api ./internal/store`: 통과
- marker/prefix helper 수렴 후 `go test ./...`: 34개 패키지, 1,422개 통과
- marker/prefix helper 수렴 후 `go test -race ./internal/api ./internal/jobs`: 1,142개 통과
- marker/prefix helper 수렴 후 `go vet ./internal/api ./internal/s3client`, `scripts/check_ci_pair.sh`: 통과. `actionlint`는 없어 built-in workflow validator fallback을 사용했다. 앞선 정책 service 변경에 대해서는 `scripts/check_helm_chart.sh`와 `scripts/check_release_gate.sh`도 통과했다.
- bucketops service 수렴 후 `go test ./...`: 35개 패키지, 1,424개 통과
- bucketops/API `go test -race ./internal/bucketops ./internal/api`: 992개 통과
- bucketops service 수렴 후 `go vet ./internal/api ./internal/bucketops`, `scripts/check_ci_pair.sh`: 통과. `actionlint`는 없어 built-in workflow validator fallback을 사용했다.
- multipart rollback 보강 후 `go test ./...`: 35개 패키지, 1,426개 통과
- multipart rollback 보강 후 `go test -race ./internal/bucketops ./internal/api ./internal/jobs`: 1,146개 통과
- multipart rollback 보강 후 `go vet ./internal/api ./internal/bucketops ./internal/jobs`, `git diff --check`: 통과
- multipart SDK helper 수렴 후 `go test ./...`: 35개 패키지, 1,427개 통과
- multipart SDK helper 수렴 후 `go test -race ./internal/s3client ./internal/bucketops ./internal/api ./internal/jobs`: 1,156개 통과
- multipart SDK helper 수렴 후 `go vet ./internal/s3client ./internal/bucketops ./internal/api ./internal/jobs`, `git diff --check`: 통과
- multipart SDK helper 수렴 후 `scripts/check_ci_pair.sh`: 통과. `actionlint`는 없어 built-in workflow validator fallback을 사용했다.
- provider 오류 계약 수렴 후 `go test ./...`: 35개 패키지, 1,429개 통과
- provider 오류 계약 수렴 후 `go test -race ./internal/s3client ./internal/bucketops ./internal/api ./internal/jobs`: 1,158개 통과
- provider 오류 계약 수렴 후 `go vet ./internal/s3client ./internal/bucketops ./internal/api ./internal/jobs`, `git diff --check`: 통과
- provider 오류 계약 수렴 후 `scripts/check_ci_pair.sh`: 통과. `actionlint`는 없어 built-in workflow validator fallback을 사용했다. OpenAPI drift, frontend build, backend full test도 통과했다.
- object SDK provider 오류 경계 보강 후 folder marker의 `AccessDenied`, bulk-delete marker의 `SlowDown` fake-provider 회귀: 3개 통과
- object SDK provider 오류 경계 보강 후 `go test ./internal/api`: 996개 통과
- object SDK provider 오류 경계 보강 후 `go test -race ./internal/api ./internal/s3client ./internal/rcloneerrors`: 1,026개 통과
- object SDK provider 오류 경계 보강 후 `go test ./...`: 35개 패키지, 1,431개 통과
- object SDK provider 오류 경계 보강 후 `go vet ./internal/api ./internal/s3client ./internal/rcloneerrors`, `git diff --check`: 통과
- object SDK provider 오류 경계 보강 후 `scripts/check_ci_pair.sh`: 통과. `actionlint`는 없어 built-in workflow validator fallback을 사용했다. OpenAPI drift, frontend build, backend full test도 통과했다.
- object presign provider 오류 경계 보강 후 download-url focused test 6개와 object/provider focused test 21개: 통과
- object presign provider 오류 경계 보강 후 `go test ./...`: 35개 패키지, 1,432개 통과
- object presign provider 오류 경계 보강 후 `go test -race ./internal/api ./internal/s3client ./internal/rcloneerrors`: 1,027개 통과
- object presign provider 오류 경계 보강 후 `go vet ./internal/api ./internal/s3client ./internal/rcloneerrors`, `git diff --check`: 통과
- object presign provider 오류 경계 보강 후 `scripts/check_ci_pair.sh`: 통과. `actionlint`는 없어 built-in workflow validator fallback을 사용했다. OpenAPI drift, frontend build, backend full test도 통과했다.
- download proxy local/store 경계 보강 후 unconfigured store 회귀와 profile encryption error normalization focused test 13개: 통과
- download proxy local/store 경계 보강 후 `go test ./internal/api`: 1,001개 통과
- download proxy local/store 경계 보강 후 `go test ./...`: 35개 패키지, 1,436개 통과
- download proxy local/store 경계 보강 후 `go test -race ./internal/api ./internal/s3client ./internal/rcloneerrors`: 1,031개 통과
- download proxy local/store 경계 보강 후 `go vet ./internal/api ./internal/s3client ./internal/rcloneerrors`, `git diff --check`: 통과
- download proxy stat provider 오류 경계 보강 후 `AccessDenied`/`SlowDown` route regression 5개와 `go test ./internal/api`: 1,004개 통과
- download proxy stat provider 오류 경계 보강 후 `go test -race ./internal/api -run '^TestHandleDownloadProxy_'`: 5개 통과
- direct multipart temp cleanup failure 보강 후 promotion 실패 시 redacted `cleanupError` regression과 `go test -race ./internal/api -run '^TestUploadDirectHTTPService_'`: 8개 통과
- direct multipart temp cleanup failure 보강 후 `go test ./...`: 35개 패키지, 1,439개 통과
- direct multipart temp cleanup failure 보강 후 `go vet ./internal/api`, `git diff --check`: 통과
- upload session DB cleanup failure 보강 후 session deletion regression과 `go test -race ./internal/api -run '^TestUploadSessionHTTPService_'`: 9개 통과
- upload session DB cleanup failure 보강 후 `go test ./internal/api`: 1,005개 통과
- upload session DB cleanup failure 보강 후 `go test ./...`: 35개 패키지, 1,440개 통과
- upload session DB cleanup failure 보강 후 `go vet ./internal/api`, `git diff --check`: 통과
- immediate commit cleanup의 cancelled-request 회귀와 `go test -race ./internal/api -run '^Test(CleanupImmediateUploadCommitState|UploadCommitFinalizeService_)'`: 3개 통과
- expiry maintenance의 remote/temp/metadata/session cleanup 회귀와 `go test ./internal/jobs -run '^TestCleanupExpiredUploadSessions'`: 4개 통과
- immediate commit cleanup 및 expiry maintenance 반영 후 `go test ./...`: 35개 패키지, 1,441개 통과
- immediate commit cleanup 및 expiry maintenance 반영 후 `go test -race ./internal/api ./internal/jobs`: 2개 패키지, 1,158개 통과
- immediate commit cleanup 및 expiry maintenance 반영 후 `go vet ./internal/api ./internal/jobs`, `git diff --check`: 통과
- staging rollback, staging transfer cleanup, multipart remote-metadata cleanup 보강 후 API focused 21개와 jobs focused 6개: 통과
- staging rollback, staging transfer cleanup, multipart remote-metadata cleanup 보강 후 `go test ./...`: 35개 패키지, 1,443개 통과
- staging rollback, staging transfer cleanup, multipart remote-metadata cleanup 보강 후 `go test -race ./internal/api ./internal/jobs`: 2개 패키지, 1,160개 통과
- staging rollback, staging transfer cleanup, multipart remote-metadata cleanup 보강 후 `go vet ./internal/api ./internal/jobs`, `git diff --check`: 통과
- staging chunk byte-accounting/part-preservation 보강 후 관련 API focused test 11개, `go test ./internal/api` 1,008개, `go test ./internal/jobs` 152개 통과
- staging chunk byte-accounting/part-preservation 보강 후 `go test ./...`: 35개 패키지, 1,443개 통과
- staging chunk byte-accounting/part-preservation 보강 후 `go test -race ./internal/api ./internal/jobs`: 2개 패키지, 1,160개 통과
- staging chunk byte-accounting/part-preservation 보강 후 `go vet ./internal/api ./internal/jobs`, `git diff --check`: 통과
- job enqueue rollback 보강 후 queue-full/취소된 request rollback focused test 5개와 `go test ./internal/api`: 1,009개 통과
- job enqueue rollback 보강 후 `go test ./...`: 35개 패키지, 1,444개 통과
- job enqueue rollback 보강 후 `go test -race ./internal/api ./internal/jobs`: 1,161개 통과
- job enqueue rollback 보강 후 `go vet ./internal/api ./internal/jobs`, `git diff --check`: 통과
- object-index repair enqueue queue-full rollback 보강 후 focused test 2개, `go test ./internal/api ./internal/jobs ./internal/store` 1,219개, race 1,219개, vet 및 `git diff --check`: 통과
- upload session/profile staging cleanup ordering 보강 후 관련 API regression 16개 통과; current `go test ./...`는 35개 패키지, 1,444개, `go test -race ./internal/api ./internal/jobs`는 1,161개 통과
- worker `/workerz` diagnostics 보강 후 focused API/jobs test 19개, `go test ./internal/api ./internal/jobs` 1,164개, race 1,164개, 전체 `go test ./...` 35개 패키지 1,447개 통과
- immediate commit result의 atomic completion persistence 보강 후 store/API focused test 2개, `go test ./internal/api ./internal/store ./internal/jobs` 1,216개, race 1,216개, 전체 `go test ./...` 35개 패키지 1,448개, `go vet ./internal/api ./internal/store ./internal/jobs` 통과
- legacy queued job recovery guard 보강 후 `TestRecoverAndRequeue`, jobs 전체 152개와 race 152개 통과
- portable SQLite→Postgres 및 Postgres→SQLite container smoke에서 entity/asset checksum, post-import health, row-count verification 통과
- portable failure smoke에서 wrong-password rejection, thumbnail asset warning, encryption-key mismatch preflight blocker 통과
- portable key-mismatch preflight fix 후 focused API 13개, `go test ./internal/api ./internal/store ./internal/jobs` 1,217개, race 1,217개, 전체 `go test ./...` 35개 패키지 1,449개, `go vet ./internal/api ./internal/store ./internal/jobs` 통과
- profile delete context-cancellation mapping 보강 후 active-job deletion race test 5회, API/store/jobs race 1,217개, 전체 1,449개, vet 및 `git diff --check` 통과; 최신 portable failure smoke의 세 시나리오도 통과
- manager/app shutdown lifecycle 사전 등록 후 lifecycle focused test 40개 및 race 40개 통과; 현재 전체 `go test ./...` 35개 패키지 1,450개, API/app/jobs/store race 1,241개, vet 및 `git diff --check` 통과. app은 `Manager.Start`를 통해 shutdown `Wait` 이전에 worker/maintenance counter를 등록한다
- 고유 compose project로 MinIO demo runtime smoke를 실행해 `/healthz`, `/readyz`, `/workerz`, 인증된 meta/profile/bucket/object 목록, signed download URL 및 `/download-proxy` 본문 검증을 모두 통과했다(`S3DESK_PORT=18080`, `DEMO_EXTERNAL_BASE_URL=http://127.0.0.1:18080`, download 200/243 bytes). 이 결과는 local MinIO/provider-backed runtime 증거이며 외부 provider/deployment 증거는 아니다.
- 현재 dirty worktree에서 portable smoke 네 경로도 재실행했다: `run_portable_failure_smoke.sh`(sqlite→postgres), `run_portable_postgres_to_sqlite_failure_smoke.sh`, `run_portable_sqlite_to_postgres_smoke.sh`, `run_portable_postgres_to_sqlite_smoke.sh`가 모두 성공했고, 양방향 import에서 entity checksum/count 및 post-import health를 검증했다. 이는 release candidate-bound evidence가 아닌 local worktree 증거다.
- 고유 MinIO demo(`127.0.0.1:19010`, `demo-bucket`)를 `S3DESK_LIVE_MINIO_*` 환경으로 연결한 `TestLiveValidationMinioS3Compatible`도 통과했다. 이 테스트는 profile connectivity와 `maxKeys=1` object listing만 수행하며, local MinIO provider 증거일 뿐 AWS/GCS/Azure/OCI/Ceph 또는 deployment 증거는 아니다.
- 외부 provider live evidence preflight는 AWS/GCS/Azure/OCI/Ceph의 required environment variable missing으로 `blocked`를 반환했다. MinIO는 위의 isolated local test만 통과했으며, release candidate-bound provider evidence와 deployment evidence는 아직 없다.
- 2026-08-12 현재 dirty worktree에서 `STATICCHECK_BIN=... scripts/check.sh full`을 재실행했다. `staticcheck` v0.6.1, `gosec`/`govulncheck`, Go 전체 테스트 35개 패키지, frontend 252개 테스트 파일/1,025개 테스트, production build, Chromium smoke 2/2, third-party notices가 모두 통과했다. 이는 현재 worktree의 local gate 증거이며 release candidate-bound 또는 deployment 증거는 아니다.

다음 provider 경계 큐는 실제 provider/deployment smoke다. 현재 변경은 bucket CRUD command 경계, folder marker SDK operation, multipart orphan rollback, direct multipart temp cleanup, upload session DB cleanup, staging rollback/transfer cleanup와 chunk byte-accounting/part-preservation, job enqueue rollback, worker `/workerz` diagnostics, immediate commit cleanup와 atomic completion persistence, legacy queued-job recovery, expiry maintenance, per-file multipart complete/abort metadata cleanup, create/complete/abort SDK operation, UploadPart/ListParts/HeadObject/PresignUploadPart/PresignGetObject와 download proxy stat/stream-start의 오류 분류·redaction·retry signal/local failure 경계를 닫았으며, streaming body replay와 provider live semantics는 별도 증거로 남아 있다.

이 변경은 provider live credential, Kubernetes CNI NetworkPolicy enforcement, 다중 replica, 실제 deployment 동작을 증명하지 않는다. rclone의 application-level runtime egress guard는 local proxy/dial 테스트로 증명했지만, provider live/deployment evidence는 별도 opt-in lane으로 남는다.
