# Runbook

This runbook covers the minimum operational checks for a normal S3Desk deployment.

## Service Basics

- S3Desk is local-first by default
- Remote access should always use:
  - `ADDR=0.0.0.0:8080`
  - `ALLOW_REMOTE=true`
  - `API_TOKEN` with a non-placeholder value
- `ALLOWED_HOSTS` is only required for non-private hostnames

Containerized defaults:

- SQLite image stores data under `/data`
- `docker-compose.local-build.yml` is loopback-only and meant for local work
- `docker-compose.yml` and `docker-compose.postgres.yml` are the hardened Postgres-backed remote templates
- remote templates require explicit `S3DESK_BIND_ADDRESS`, `API_TOKEN`, and `POSTGRES_PASSWORD`

## Start and Stop

```bash
cp .env.example .env
$EDITOR .env
docker compose up -d
docker compose down
docker compose logs -f
```

Use [.env.example](/home/homelab/Downloads/project/s3desk/.env.example) as the starting point for remote/Postgres deployments.

If you are using `docker-compose.local-build.yml`, keep it local-only.

For remote exposure, require all of the following:

- `ALLOW_REMOTE=true`
- a non-placeholder `API_TOKEN`
- explicit review of exposed host/port bindings
- `ALLOWED_HOSTS` for non-private hostnames
- an explicit `S3DESK_BIND_ADDRESS` choice in the compose environment

## Health Checks

- Liveness: `GET /healthz`
- Readiness: `GET /readyz`
- Metrics: `GET /metrics` with an API token

Useful endpoints:

- UI: `http://192.168.0.200:8080`
- API docs: `http://192.168.0.200:8080/docs`
- OpenAPI spec: `http://192.168.0.200:8080/openapi.yml`

## Cost and Restore Thresholds

Watch these metrics together:

- `storage_operations_total{provider,operation,status}`
- `storage_operation_duration_ms{provider,operation,status}`
- `thumbnail_cache_hits_total{source}`
- `download_proxy_mode_total{mode}`

Use these operational thresholds:

### Thumbnail cache behavior

- Reopening the same object-heavy bucket view should produce visible `thumbnail_cache_hits_total` growth.
- If a second browse of the same object set still causes thumbnail-related storage calls to rise almost 1:1 with rendered cards, treat that as abnormal cache behavior.
- As a working threshold, investigate when repeated browsing of the same bucket yields less than roughly `80%` cache reuse after the first warm pass.
- Also investigate if thumbnail-related `storage_operation_duration_ms` p95 stays above `1000ms` for more than a few minutes during normal browsing.

### Download proxy behavior

- `download_proxy_mode_total{mode="stat_required"}` should not dominate normal image or object download traffic once metadata hints are flowing.
- If `stat_required` remains above roughly `20%` of proxy traffic during steady-state use, inspect recent preview and download callers for missing signed metadata hints.

### Staged restore buildup

- `DATA_DIR/restores` should normally contain at most:
  - one active validation candidate
  - one rollback candidate
- Treat more than `2` staged restore directories or more than `5 GiB` of staged restore payloads as cleanup-required.
- Any staged restore older than `7 days` should be considered stale unless a cutover is actively in progress.

### Dashboard and alert expectations

- Dashboard panels should break down `storage_operations_total` by provider and operation so thumbnail, list, and download spikes are obvious.
- Track `thumbnail_cache_hits_total` by source to see whether hits come from request fingerprint, manifest, or post-stat paths.
- Track `download_proxy_mode_total` split between `stat_skipped` and `stat_required`.
- Create an alert or scheduled review for either of these conditions:
  - staged restore count > `2`
  - staged restore age > `7 days`
  - thumbnail cache reuse staying below the `80%` warm-cache threshold for a commonly revisited bucket

## Backup Guidance

- SQLite deployment: back up the `/data` volume
- Postgres deployment: back up the database volume or use your standard Postgres backup flow
- The in-product `Full backup` / `Cache + metadata backup` export is sqlite-only
- Uploading a restore bundle stages a sqlite-backed `DATA_DIR`; it does not restore a running Postgres deployment
- Keep `API_TOKEN` and any encryption-related secrets outside of the repository

### Postgres Backup Story

- Treat S3Desk's in-product backup/restore UI as a sqlite `DATA_DIR` export and staging tool, not as a Postgres disaster-recovery system.
- For Postgres deployments, the database of record must be protected with your normal Postgres backup process:
  - `pg_dump` / `pg_restore` for logical backups
  - physical base backups and WAL archiving
  - managed-service snapshots or backups when running on a hosted Postgres platform
- If you also want thumbnail and local cache reuse, you can still archive the S3Desk data directory separately, but that does not replace the Postgres backup.
- Restore order for a Postgres deployment is:
  1. Restore the Postgres database with your database backup tooling.
  2. Restore or replace the S3Desk data directory if you need thumbnails, artifacts, or staged bundle contents.
  3. Restart S3Desk with the restored database connection and required secrets.

### Staged Restore Lifecycle

- Uploaded restore bundles land under `DATA_DIR/restores/<restore-id>`.
- A staged restore is a review artifact. It is not active until you explicitly cut over to it.
- Before cutover:
  1. Inspect the staged manifest and warnings in the UI.
  2. Verify the expected backup kind, creation time, and database backend.
  3. Confirm that required secrets such as `ENCRYPTION_KEY` are available before switching.
- After cutover:
  1. Keep the previous live data directory until the restored instance is verified.
  2. Delete stale staged restores that are no longer needed.
  3. Delete the superseded data directory only after the restored instance is stable.

### Staged Restore Cleanup Policy

- `DATA_DIR/restores` should be treated as temporary storage, not as a long-term archive.
- Delete abandoned staged restores after the related validation or cutover window closes.
- For local single-user setups, a simple policy is to remove staged restores older than 7 days once the active instance is confirmed healthy.
- For shared or production-like environments, keep only:
  - the restore currently under review
  - the most recent known-good staged restore if you need a short rollback window
- If disk pressure appears, clean `DATA_DIR/restores` before removing the live data directory or current database backups.

## Token Rotation

1. Update the token in the runtime environment
2. Restart the service
3. Reconfigure clients, automation, and dashboards that call the API

## Basic Incident Checklist

1. Confirm `/readyz` is healthy
2. Inspect container or process logs
3. Check recent job logs from the `Jobs` page
4. Verify free disk space and provider credentials
5. Retry or requeue failed work only after the root cause is understood
