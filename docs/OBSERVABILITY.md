# Observability

## Health checks

- `GET /healthz` returns `ok` when the server process is running (liveness).
- `GET /readyz` checks core dependencies (store/job manager) plus database reachability.
- `GET /readyz` returns `503` with one of `store_unavailable`, `jobs_unavailable`, or `db_error` when not ready.
- Use `healthz` for liveness, `readyz` for readiness in local or container orchestration.

## Metrics (Prometheus)

- `GET /metrics` exposes Prometheus text format.
- This endpoint follows the same local-host + API token checks as other internal endpoints.

Auth:
- `X-Api-Token: <token>`
- or `Authorization: Bearer <token>` (handy for Prometheus Operator / ServiceMonitor)

Kubernetes notes:
- `/metrics` is usually scraped via the Service DNS name, so the Host allowlist needs to include it.
- The Helm chart templates automatically add common Service DNS names, plus Ingress/Istio hostnames, to `ALLOWED_HOSTS`.

### Job lifecycle
- `jobs_queue_depth` (gauge)
- `jobs_queue_capacity` (gauge)
- `jobs_started_total` (counter, labels: `type`)
- `jobs_completed_total` (counter, labels: `type`, `status`, `error_code`)
- `jobs_duration_ms` (histogram, labels: `type`, `status`, `error_code`)
- `jobs_canceled_total` (counter, labels: `type`)
- `jobs_retried_total` (counter, labels: `type`)

`error_code` is recorded as `none` for non-failed statuses.

### API
- `http_requests_total` (counter, labels: `method`, `route`, `status`)
- `http_request_duration_ms` (histogram, labels: `method`, `route`)

### Transfers
- `transfer_bytes_total` (counter, labels: `direction`)
- `transfer_errors_total` (counter, labels: `code`)

### UI/Realtime
- `events_connections` (gauge)
- `events_reconnects_total` (counter)

## Structured logs

- Event types and fields are documented in `docs/LOGGING_PIPELINE.md`.
- Required fields for all logs: `ts`, `level`, `msg`, `service`, `component`.
- Job events: `job.queued`, `job.started`, `job.completed`, `job.log`.
- HTTP events: `http.request` with latency and status.

## Dashboards

- Failure taxonomy and dashboard queries are defined in `docs/FAILURE_TAXONOMY.md`.
- Retry/failure 운영 패널 템플릿은 `docs/OBSERVABILITY_DASHBOARD.md`의 Jobs 섹션(예: retry pressure %, final failure ratio %)을 사용.
- 바로 import 가능한 Grafana JSON 템플릿: `docs/grafana/s3desk-jobs-retry-failure.dashboard.json`

## Performance notes

- Local performance measurements and large-prefix tuning guidance: `docs/PERF_NOTES.md`.
- Profiling plan + script: `docs/PERF_PROFILING.md` and `scripts/perf_profile.sh`.
- Dashboard panel template: `docs/OBSERVABILITY_DASHBOARD.md`.
