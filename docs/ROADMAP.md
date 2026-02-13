# Technical roadmap (prioritized)

> This roadmap is *code-first*: each item includes a “definition of done” so we can translate it into PRs.

## P0 — CI/CD & test reliability (now)

### 0) Service hardening baseline
- **Done**
  - Queue-full enqueue failures no longer leave failed job rows; created jobs are rolled back on `429/500`.
  - `/readyz` now returns explicit `503` readiness reasons (`store_unavailable`, `jobs_unavailable`, `db_error`).
  - Local sync jobs validate `payload.localPath` against `ALLOWED_LOCAL_DIRS` at API create/retry time.
  - Safe defaults hardened for invalid runtime config values (for example negative upload concurrency).
  - Static fallback hint and observability docs aligned with runtime behavior.

### 1) E2E failure visibility (runner / CI logs)
- **Done**
  - E2E runner prints `ErrorResponse.code`, `normalizedError`, and `Retry-After` (if present) on HTTP failures.
  - GitLab CI prints `docker compose logs` on E2E failure for faster root-cause.
  - `api_integration` now preserves failure logs as CI artifacts for post-mortem review.

### 2) Error normalization hardening
- **Done (incremental)**
  - Expand `rcloneerrors` patterns for Azure/GCS/OCI common variants.
  - Classify *bucket-not-empty* cases as `conflict` at the taxonomy level.
  - API returns `Retry-After` for `rate_limited` responses.

### 3) CI quality gates
- **Done**
  - [Done] Add a small “contract” check that asserts API error payloads include `normalizedError` for stable mapped codes.
  - [Done] Make E2E job upload artifacts (runner stdout + compose logs) for longer retention.
  - [Done] `bucket-policy-live`에서 provider별 정책 API 요청/응답 요약을 `test-results/policy-live-summary.ndjson`로 아카이빙.
  - [Done] `e2e_live` after_script에서 NDJSON 요약을 Markdown(`frontend/test-results/policy-live-summary.md`)으로 변환해 로그/아티팩트에서 즉시 확인 가능하도록 정리.
  - [Done] `e2e_live`가 policy summary markdown preview를 CI 로그에 출력하고(`CI_JOB_SUMMARY` 지원 시) Job Summary에도 append.

### 4) Transfer flow test coverage (definition)
- **Done**
  - **Job creation**: API + UI (sync local<->s3, copy/move object, copy/move prefix, delete prefix).
  - **Progress tracking**: events/SSE → UI counters, speed/eta updates, completion state transitions.
  - **Error recovery**: retryable failure shows normalized code + retry action; cancel + retry clears state; rerun job succeeds.
  - **Validated (local live)**: `api-crud`, `jobs-live-flow`, `objects-live-flow`, `transfers-live-fallback`, `docs-smoke`, `mobile-smoke`.
  - **Live fallback coverage**: non-S3 profile(`azure_blob`)에서 `mode=presigned` 거부 + staging 경로 확인, direct download 실패(CORS-like) 시 proxy fallback 확인.

## P1 — Multi-cloud feature integration (core platform)

### 4) Provider capability matrix
- **Done**
  - [Done] Define provider capability model (`bucketCrud`, `objectCrud`, `jobTransfer`, policy family, presigned/direct upload flags).
  - [Done] Expose capability matrix in `/meta.capabilities.providers`.
  - [Done] Buckets UI now prefers server capability matrix and keeps local fallback for backward compatibility.
  - [Done] Uploads/Objects/Jobs UI에서 provider 미지원 upload 기능을 사전 차단(버튼 비활성 + 힌트)하도록 정리.
  - [Done] Transfers가 profile capability를 직접 반영해 presigned 미지원 provider에서는 presigned 시도를 건너뛰도록 개선.
  - [Done] capability 기반 E2E 케이스 확장(`capabilities-ui-gating`, `transfers-presigned`).

### 5) Bucket policy support (scope-first)
- **Done**
  - **S3-family first**: AWS S3 / MinIO / Ceph RGW / OCI S3 compat
    - [Done] API 구현: `GET/PUT/DELETE /buckets/{bucket}/policy`, `POST /buckets/{bucket}/policy/validate`
    - [Done] UI 구현: Bucket Policy editor(Validate / Apply / Delete)
    - [Done] Live E2E 추가: MinIO 시나리오 `policy get -> put -> get -> delete -> get` (`bucket-policy-live.spec.ts`)
  - **GCS**
    - [Done] Bucket IAM policy를 공통 UX로 매핑(공개 읽기 토글 + role/member bindings 편집)
    - [Done] provider 정적 검증 커버리지 추가(백엔드 단위 테스트 + live E2E validate 케이스)
    - [Done] 실제 GCS 계정/에뮬레이터 기반 `GET/PUT` 라이브 스모크를 CI 옵션으로 확장(`E2E_GCS_POLICY_LIVE=1`)
  - **Azure Blob**
    - [Done] 초기 범위 확정/구현(container public access + stored access policies)
    - [Done] provider 정적 검증 커버리지 추가(백엔드 단위 테스트 + live E2E validate 케이스)
    - [Done] Azurite/실계정 기준 `GET/PUT/GET` 라이브 스모크(+복원)를 CI 옵션으로 확장(`E2E_AZURE_POLICY_LIVE=1`)

## P2 — Automation & UX quality

### 6) Retry/backoff & self-healing
- [Done] Frontend idempotent API retry가 `normalizedError.retryable` + `Retry-After`를 함께 반영하도록 확장(단위 테스트 포함).
- [Done] Background jobs(rclone) retry에 exponential backoff + max attempts + jitter(`RCLONE_RETRY_JITTER_RATIO`) 적용, 단위 테스트 추가, 배포 샘플 env 노출 반영.

### 7) UX improvements
- [Done] Bucket policy editor에 provider별 최소권한 템플릿 프리셋 추가(S3/GCS/Azure)
- [Done] Provider-specific form guidance: Profile modal에 provider별 입력 검증(URL/region/account/json) + setup docs 링크 추가
- [Done] Policy editor validation + diff preview 강화(변경 라인 수 표시, no-op 저장 차단)
- [Done] Better error UX: shared formatter now surfaces `normalized` code + explicit recommended action text across Alerts/Toasts
- [Done] Network diagnostics에서 retry 로그를 대기시간/원인(`Retry-After`, normalized code) 중심으로 가시화.
