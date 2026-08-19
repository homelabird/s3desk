# S3Desk 설정·로그·모니터링 운영 품질 감사

작성일: 2026-08-13  
범위: 브라우저 설정, 서버 런타임 설정, HTTP·job 로그, health/readiness, Prometheus·Helm 관측성

## 결론

S3Desk에는 구조화 로그·민감정보 redaction, job별 로그와 tail polling, health/readiness/worker 진단, 인증된 Prometheus endpoint, ServiceMonitor/PodMonitor까지 기본 운영 바닥이 있다. 단일 프로세스·단일 운영자 제품으로서는 기능 기반이 양호하다.

이번 감사에서 probe 실패 로그, 런타임 자원 지표, production job log 상한, Settings 진단 가시성, HTTP→job 상관관계, maintenance cleanup 계측과 최소 alert rule을 보강했다. 다만 workload별 dashboard·SLO, 실제 디스크/Prometheus Operator 배포 증거가 없어 **운영 모니터링 완성 상태로 판정할 수는 없다.**

## 소유 경계

| 영역 | 실제 소유 지점 | 현재 역할 |
| --- | --- | --- |
| 브라우저 설정 | `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/settings/*` | API token session 상태, 브라우저별 Objects·Transfers·retry·recovery 기본값 |
| 네트워크 진단 | `frontend/src/lib/networkStatus.ts`, `NetworkSettingsSection.tsx` | 현재 탭 메모리에 최근 status/retry 50건 보관 |
| job 로그 | `backend/internal/jobs/joblog.go`, `manager_maintenance.go`, `frontend/src/pages/jobs/useJobsLogsState.ts` | 파일 저장·redaction·tail offset·검색·복사·다운로드·보존 |
| 서버 로그 | `backend/internal/logging`, `backend/internal/api/middleware_logging.go` | text/JSON level, 구조화 field, request ID, 공통 redaction |
| health | `backend/internal/api/handlers_health.go` | process liveness, DB+DATA_DIR readiness, worker loop·queue diagnostics 분리 |
| metrics | `backend/internal/metrics`, `/metrics` | HTTP, jobs, transfer, provider storage, cache, realtime, Go/process 자원 지표 |
| 배포 모니터링 | `charts/s3desk/templates/{service,pod}monitor.yaml` | API token을 사용하는 Prometheus Operator scrape 계약 |

## 이번에 완료한 개선

### OPS-01 — 실패한 probe와 metrics 요청도 로그에서 누락됨

정상 `/healthz`, `/readyz`, `/workerz`, `/metrics` 요청은 access log 양을 줄이기 위해 제외하는 것이 합리적이다. 기존 구현은 status와 무관하게 이 경로를 전부 제외해 `503` readiness와 인증 실패 metrics scrape도 서버 로그에서 사라졌다.

수정:

- `2xx/3xx` probe만 access log에서 제외
- `4xx`는 warning, `5xx`는 error로 기존 공통 request log에 기록
- 정상 health log suppression과 실패 readiness log를 모두 단위 테스트

### OPS-02 — 애플리케이션 지표만 있고 프로세스 자원 지표가 없음

커스텀 Prometheus registry는 cardinality 통제가 쉽지만 기본 registry가 제공하는 Go runtime·process collector도 빠져 있었다. 따라서 메모리, GC, goroutine, CPU, file descriptor 이상을 같은 target에서 볼 수 없었다.

수정:

- 설치된 Prometheus client의 `GoCollector`와 `ProcessCollector`를 custom registry에 등록
- `go_goroutines`, `process_cpu_seconds_total` metric family 존재를 테스트

### OPS-03 — production 예시의 job log가 무제한·무기한임

기본값 `JOB_LOG_MAX_BYTES=0`, `JOB_LOG_RETENTION=0`은 로컬 개발에는 편하지만 production persistence에서는 noisy job 하나 또는 장기 운용이 PVC를 채울 수 있다.

수정:

- `values-production.yaml`: job별 `100 MiB`, 완료 후 `30일` 로그 보존
- job record 보존은 변경하지 않음
- Helm이 큰 byte 정수를 지수 표기 문자열로 렌더링하던 계약을 `int64`로 고정
- production render에서 `JOB_LOG_MAX_BYTES=104857600`, `JOB_LOG_RETENTION=720h`를 gate로 확인

### OPS-04 — Settings에서 서버 운영 상태를 확인할 수 없음

인증된 meta API는 version, DB backend, token/encryption, transfer engine, job concurrency, log 정책, upload mode를 이미 제공하지만 Settings는 warning과 backup UI만 표시했다.

수정:

- Support의 `Server and backup`에 read-only runtime diagnostics 표 추가
- browser-local Objects·Transfers·Network 값은 “Saved immediately in this browser.”로 저장 범위를 명시
- 모바일 `320px` reflow와 dark-mode axe 검사를 실제 진단 표가 열린 상태로 실행

### OPS-05 — HTTP 요청과 background job 로그 상관관계가 끊김

수정:

- 세 job enqueue 경로가 공통 `job.enqueued` 구조화 이벤트를 사용
- HTTP middleware의 request ID를 job ID, job type, profile ID와 같은 이벤트에 기록
- 자동 object-index repair도 같은 상관관계 필드를 사용하면서 repair reason을 유지

### OPS-06 — maintenance cleanup 실패와 삭제량을 관측할 수 없음

수정:

- `maintenance_cleanup_total{resource,outcome}` counter로 run, deleted, error를 기록
- upload session, job retention, job log, orphan artifact/staging, 임시 rclone config cleanup을 낮은 cardinality resource로 구분
- 기존에 버리던 파일 삭제 오류를 구조화 로그와 error counter에 기록

### OPS-07 — scrape 이후의 최소 장애 감지 계약이 없음

수정:

- opt-in `PrometheusRule`에 metrics target down, 5분 queue 포화, 30분 내 maintenance cleanup 오류 alert를 추가
- workload baseline이 필요한 provider/HTTP error ratio와 latency threshold는 배포 환경 소유로 유지
- Helm lint/render gate에서 세 alert와 PrometheusRule 생성을 확인

## 현재 강점

### 설정 안전성

- remote non-loopback 구성은 token·encryption key·allowed local directory를 fail-closed 검증한다.
- Helm은 remote/monitoring token, Postgres URL, single-replica topology, immutable production image를 template gate로 검사한다.
- API token 필드는 password input이며 session 범위를 사용자에게 알린다.
- 위험한 browser reset은 typed confirmation을 거치고 token/profile을 보존한다.

### 로그 안전성과 사용성

- 공통 logger가 message와 nested structured field를 모두 redaction한다.
- job log는 저장 파일과 realtime event 양쪽에서 redaction 테스트가 있다.
- job log 파일은 `0600`, 임시 secret config는 startup/maintenance cleanup 대상이다.
- UI는 tail offset, 지수 backoff, 3회 실패 후 polling pause, 수동 resume, 검색·severity 요약·복사·다운로드를 제공한다.
- HTTP access log는 query 전체가 아닌 path만 기록하고 request ID·route·status·duration을 구조화한다.

### health와 metrics 계약

- `/healthz`는 process liveness만 확인한다.
- `/readyz`는 store/jobs 존재, 2초 DB ping, 실제 `DATA_DIR` 임시 파일 생성·삭제를 확인한다.
- `/workerz`는 worker loop와 queue depth/capacity를 readiness와 분리한다.
- `/metrics`는 local-peer와 API token을 모두 요구하며 Helm monitor가 Secret을 bearer token으로 연결한다.
- provider·operation·status metric label은 raw object key나 profile ID를 사용하지 않아 고 cardinality를 피한다.

## 남은 우선순위

### P1 — workload별 dashboard·SLO가 저장소 계약에 없음

ServiceMonitor/PodMonitor와 불변 실패용 `PrometheusRule`은 있다. 그러나 provider latency/error budget, HTTP SLO, Grafana dashboard는 실제 workload baseline 없이 저장소가 임의로 소유하지 않는다.

최소 후속안:

- provider remote error ratio, HTTP 5xx, job failure ratio, latency SLO는 실제 workload baseline을 측정한 뒤 배포 환경에서 승인
- Grafana dashboard는 운영 datasource와 label 계약이 확정될 때 추가

### P1 — disk capacity의 실제 배포 증거가 없음

`/readyz`는 쓰기 가능 여부만 확인한다. Kubernetes는 kubelet의 `kubelet_volume_stats_available_bytes`/inode 지표를 PVC SOT로 사용하고, Compose는 `/data`를 제공하는 host filesystem collector를 사용한다. 애플리케이션은 같은 디스크 지표를 중복 노출하지 않는다.

최소 후속안:

- 실제 cluster/host에서 collector가 해당 volume을 노출하는지 확인
- 배포별 용량·증가율 baseline을 측정한 뒤 warning/critical threshold 승인

### P2 — 실제 운영 환경 증거 필요

아래는 로컬 소스·테스트로 증명할 수 없다.

- Prometheus Operator CRD와 Secret RBAC가 있는 cluster에서 실제 scrape 성공
- alert delivery, silencing, retention, dashboard datasource 동작
- production PVC 증가율과 30일 log 정책의 적합성
- Kubernetes NetworkPolicy/CNI가 monitor namespace의 scrape를 실제 허용하는지
- 외부 provider 장애 시 metric·log·alert가 같은 incident를 일관되게 설명하는지

## 검증 결과

```text
go test ./...
  1,489 passed in 35 packages

go vet ./internal/api ./internal/metrics
  pass

npm run test:unit -- src/pages/settings/__tests__/ServerSettingsSection.test.tsx
  2 passed

npm run test:e2e -- tests/wcag-reflow.spec.ts tests/dark-theme-accessibility.spec.ts \
  --project=chromium --grep Settings
  2 passed

npm run test:e2e -- tests/settings-mobile-responsive.spec.ts \
  --project=mobile-iphone-13
  3 passed

npm run typecheck
  pass

npm run lint
  pass

bash scripts/check_helm_chart.sh
  pass (default, CI, production, Istio lint/render and negative gates)
```

## 증거 경계

이 결과는 현재 dirty worktree의 로컬 Go/React/Helm 계약과 fixture 기반 Chromium 증거다. 실제 cluster scrape, production log retention, provider incident, external alert delivery, HA 또는 다중 replica 운영을 증명하지 않는다.
