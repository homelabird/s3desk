# Runbook (Operations)

This document describes baseline operational procedures for S3Desk.

## Scope
- Local/default deployment (single instance)
- Health checks, metrics access, backup/restore, token rotation
- Job logs/artifacts and basic incident handling

## Preconditions
- Access to host/containers
- `API_TOKEN` value (if enabled)
- `ENCRYPTION_KEY` (if credential encryption is enabled)
- `DATA_DIR` location

Note: S3Desk enforces a single active writer per `DATA_DIR` using an OS-level lock file (`DATA_DIR/.s3desk.lock`).
If you start a second instance pointing at the same `DATA_DIR`, it will refuse to start (by design).

## Quick checks
- Liveness: `GET /healthz` should return `ok`
- Readiness: `GET /readyz` should return `ok`
- Metrics: `GET /metrics` (requires API token; remote must be localhost/private + allowed Host)
- Disk usage: verify free space for `DATA_DIR`

## Recommended runtime settings (long-running)

Set these envs for better observability and fewer surprises in containerized setups:

- `LOG_FORMAT=json` (structured logs)
- `JOB_LOG_EMIT_STDOUT=true` (emit job logs to stdout)
- `LOG_LEVEL=info` (use `debug` only while investigating)
- `ALLOWED_HOSTS` should include any non-local hostnames used by clients or service DNS.
  - Example (local containers): `ALLOWED_HOSTS=s3desk_local,localhost,127.0.0.1`
  - Example (K8s Service DNS): `ALLOWED_HOSTS=s3desk,s3desk.default.svc,s3desk.default.svc.cluster.local`

## Start/stop (docker compose)
- Start: `docker compose up -d`
- Stop: `docker compose down`
- Logs: `docker compose logs -f`

## Metrics access
- Example:
  - `curl -H "X-Api-Token: $API_TOKEN" http://127.0.0.1:8080/metrics`
  - `curl -H "Authorization: Bearer $API_TOKEN" http://127.0.0.1:8080/metrics`

## Kubernetes / remote operation notes

When running behind an Ingress (or Istio VirtualService) with a hostname, requests will be rejected unless that hostname is allowed.

- Set `ALLOWED_HOSTS` (or Helm `server.allowedHosts`) to include your external hostname(s).
- Prometheus scraping usually hits `/metrics` via the Service DNS name (for example `s3desk.default.svc`), so include the Service DNS name too if you're not using the Helm chart.
- The Helm chart templates auto-populate `ALLOWED_HOSTS` with:
  - the Service DNS variants
  - Ingress hosts (if `ingress.enabled=true`)
  - Istio VirtualService hosts (if enabled)

Prometheus Operator example:
- Configure a bearer token (same value as `API_TOKEN`) using `bearerTokenSecret` in your ServiceMonitor, and scrape path `/metrics`.
- Keep `/metrics` off public Ingress unless you actually enjoy explaining leaks.

## Log locations
- Job logs: `DATA_DIR/logs/jobs/{job_id}.log`
- Job commands: `DATA_DIR/logs/jobs/{job_id}.cmd`
- Job artifacts: `DATA_DIR/artifacts/jobs/{job_id}.zip`
- App logs: container/stdout logs (see `docker compose logs`)

## Backup (SQLite)
- Stop service (recommended for consistency)
- Copy `DATA_DIR/s3desk.db` to backup location
- Verify file permissions/size

## Restore (SQLite)
- Stop service
- Replace `DATA_DIR/s3desk.db` with backup
- Start service, check `/healthz` and `/readyz`
- Verify Jobs list and log access

## Backup (PostgreSQL)
- Use `pg_dump` with the same credentials as runtime
- Store dump in durable storage

## Restore (PostgreSQL)
- Restore with `pg_restore` or `psql` as appropriate
- Restart service and validate `/readyz`

## API token rotation
- Update `API_TOKEN` (env/flag) and restart service
- Update UI Settings (X-Api-Token)
- Validate API calls, SSE/WS reconnect

## Encryption key rotation (conservative)
- Ensure a DB backup exists
- Restart with new `ENCRYPTION_KEY`
- Re-save profiles (re-encrypt secrets)
- Verify profile access and TLS config
- If decryption fails, revert to previous key and restore backup

## Incident checklist
- Check `/healthz` and `/readyz`
- Check disk space and file permissions under `DATA_DIR`
- Inspect recent logs (container logs + job logs)
- Confirm API token matches runtime configuration
- Verify DB connectivity and credentials

## CI pipeline notes (summary)
- `check` is a full verification job that runs only when `RUN_FULL_CHECK=1` or on scheduled pipelines.
- Frontend validation is consolidated into `frontend_ci` (OpenAPI gen + diff, lint, unit tests, build).
- `security_fs_scan` and `gitleaks_scan` run on tags, schedules, default-branch pipelines, or when code/infrastructure paths change.
- `api_integration` triggers on backend, `e2e/runner`, OpenAPI, or `docker-compose.e2e.yml` changes.
- Optional toggles:
  - `FRONTEND_PARALLEL=1` runs frontend checks as separate jobs (openapi types, lint, unit tests, build).
  - `RUN_DEV_AUDIT=1` runs the dev license audit job outside schedules.
