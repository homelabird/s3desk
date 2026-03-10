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
- Postgres compose deployment uses Docker volumes but should not be treated as a hardened remote deployment template

## Start and Stop

```bash
export API_TOKEN='set-a-local-token'
docker compose up -d
docker compose down
docker compose logs -f
```

If you are using `docker-compose.local-build.yml`, keep it local-only.

For remote exposure, require all of the following:

- `ALLOW_REMOTE=true`
- a non-placeholder `API_TOKEN`
- explicit review of exposed host/port bindings
- `ALLOWED_HOSTS` for non-private hostnames

## Health Checks

- Liveness: `GET /healthz`
- Readiness: `GET /readyz`
- Metrics: `GET /metrics` with an API token

Useful endpoints:

- UI: `http://192.168.0.200:8080`
- API docs: `http://192.168.0.200:8080/docs`
- OpenAPI spec: `http://192.168.0.200:8080/openapi.yml`

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
