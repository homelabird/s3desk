# Technical roadmap (prioritized)

> This roadmap is *code-first*: each item includes a “definition of done” so we can translate it into PRs.

## P0 — CI/CD & test reliability (now)

### 1) E2E failure visibility (runner / CI logs)
- **Done**
  - E2E runner prints `ErrorResponse.code`, `normalizedError`, and `Retry-After` (if present) on HTTP failures.
  - GitLab CI prints `docker compose logs` on E2E failure for faster root-cause.

### 2) Error normalization hardening
- **Done (incremental)**
  - Expand `rcloneerrors` patterns for Azure/GCS/OCI common variants.
  - Classify *bucket-not-empty* cases as `conflict` at the taxonomy level.
  - API returns `Retry-After` for `rate_limited` responses.

### 3) CI quality gates
- **Next**
  - Add a small “contract” check that asserts API error payloads always include `normalizedError` for a fixed set of codes.
  - Make E2E job upload artifacts (runner stdout + compose logs) for longer retention.

### 4) Transfer flow test coverage (definition)
- **Next**
  - **Job creation**: API + UI (sync local<->s3, copy/move object, copy/move prefix, delete prefix).
  - **Progress tracking**: events/SSE → UI counters, speed/eta updates, completion state transitions.
  - **Error recovery**: retryable failure shows normalized code + retry action; cancel + retry clears state; rerun job succeeds.

## P1 — Multi-cloud feature integration (core platform)

### 4) Provider capability matrix
- **Next**
  - Define a provider capability model (bucket CRUD, policy, presigned URL, multipart upload, etc).
  - Expose it via `/meta` (or a dedicated `/capabilities`) so UI can hide unsupported controls.

### 5) Bucket policy support (scope-first)
- **Next (design + implementation)**
  - **S3-family first**: AWS S3 / MinIO / Ceph RGW / OCI S3 compat
    - `GET/PUT/DELETE /buckets/{bucket}/policy` (S3 Bucket Policy JSON)
    - UI: JSON editor + “Apply / Delete / Validate”
    - E2E: MinIO scenario `policy get -> put -> get -> delete -> get`
  - **GCS**
    - Map bucket IAM policy bindings into a normalized representation (initially: public access toggles + role bindings)
  - **Azure Blob**
    - Define the initial scope (container public access level + stored access policy)

## P2 — Automation & UX quality

### 6) Retry/backoff & self-healing
- Implement retry semantics based on `normalizedError.retryable` + `Retry-After`.
- For background jobs: backoff + max attempts + jitter.

### 7) UX improvements
- Provider-specific form guidance (field-level validation + docs links)
- Policy editor validation and “diff preview”
- Better error UX: show normalized code + recommended actions
