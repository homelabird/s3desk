# Runbook

This runbook covers the minimum operational checks for a normal S3Desk deployment.

## Service Basics

- S3Desk is local-first by default
- Remote access should always use:
  - `ADDR=0.0.0.0:8080`
  - `ALLOW_REMOTE=true`
  - `API_TOKEN` with a non-placeholder value of at least 32 bytes
  - `ENCRYPTION_KEY` so provider credentials and mTLS material are encrypted at rest
- `ALLOWED_HOSTS` must include every browser-facing host when `ALLOW_REMOTE=true`

Containerized defaults:

- SQLite image stores data under `/data`
- `./scripts/compose.sh dev` is loopback-only and meant for local work
- `./scripts/compose.sh remote` is the hardened Postgres-backed remote stack
- `./scripts/compose.sh caddy` adds public HTTPS in front of the remote stack
- remote stack requires explicit `S3DESK_BIND_ADDRESS`, `API_TOKEN`, `ENCRYPTION_KEY`, and `POSTGRES_PASSWORD`

## Start and Stop

```bash
cp .env.example .env.local
$EDITOR .env.local
set -a; . ./.env.local; set +a
./scripts/compose.sh remote up -d
./scripts/compose.sh remote down
./scripts/compose.sh remote logs -f
```

Use [.env.example](../.env.example) as the starting point for remote/Postgres deployments.
The repository root `.env` is checked in for non-secret compose defaults. Keep
real deployment secrets in exported environment variables or ignored local files
such as `.env.local`; do not commit real `API_TOKEN`, `POSTGRES_PASSWORD`,
`ENCRYPTION_KEY`, or provider credentials.

If you are using `./scripts/compose.sh dev`, keep it local-only.

For remote exposure, require all of the following:

- `ALLOW_REMOTE=true`
- a non-placeholder `API_TOKEN` of at least 32 bytes
- `ENCRYPTION_KEY`
- explicit review of exposed host/port bindings
- `ALLOWED_HOSTS` for every browser-facing hostname or IP address
- an explicit `S3DESK_BIND_ADDRESS` choice in the compose environment
- `EXTERNAL_BASE_URL` whenever generated browser-facing download links should stay rooted at a public hostname or reverse proxy URL

## TLS Skip Verify Policy

`tlsInsecureSkipVerify` is intended only for private, self-signed provider endpoints. The API validates that the profile endpoint is a custom private HTTPS endpoint before storing the setting.

Runtime policy:

- `./scripts/compose.sh remote` and `./scripts/compose.sh caddy` set `LOG_ENV=production` by default.
- In production, rclone jobs refuse `tlsInsecureSkipVerify` unless `S3DESK_ALLOW_INSECURE_TLS_SKIP_VERIFY=true` is set.
- When the exception is allowed, the backend emits a structured warning event named `job.rclone_tls_skip_verify`.
- Do not enable the exception for public provider endpoints or shared credentials.

## Public HTTPS with Caddy

Use `./scripts/compose.sh caddy` when you want Caddy to terminate TLS in front
of S3Desk.

Required environment:

- `S3DESK_DOMAIN`
- `EXTERNAL_BASE_URL`
- `ALLOWED_HOSTS`
- `API_TOKEN`
- `ENCRYPTION_KEY`
- `POSTGRES_PASSWORD`
- `ALLOWED_LOCAL_DIRS`

Rules:

- `S3DESK_DOMAIN`, `EXTERNAL_BASE_URL`, and `ALLOWED_HOSTS` must all describe the same browser-facing hostname
- `./scripts/compose.sh remote` publishes S3Desk on `${S3DESK_BIND_ADDRESS:-127.0.0.1}:${S3DESK_PORT:-8080}`
- `./scripts/compose.sh caddy` keeps S3Desk internal to the compose network and publishes only Caddy on ports `80` and `443`
- `S3DESK_BIND_ADDRESS` is a direct remote-compose setting; it is not the public bind for the Caddy topology
- Caddy is the only public entrypoint in the Caddy topology

Start and inspect the stack with:

```bash
./scripts/compose.sh caddy up -d
./scripts/compose.sh caddy logs -f caddy s3desk
```

Minimal reverse-proxy smoke:

```bash
curl -I https://s3desk.example.com/healthz
curl -H "X-Api-Token: <token>" https://s3desk.example.com/api/v1/meta
curl -X POST -H "X-Api-Token: <token>" \
  "https://s3desk.example.com/api/v1/realtime-ticket?transport=ws"
curl -H "X-Api-Token: <token>" -H "X-Profile-Id: <profile-id>" \
  "https://s3desk.example.com/api/v1/buckets/<bucket>/objects/download-url?key=<key>&proxy=true"
```

Expected result:

- `/healthz` returns `200`
- `/api/v1/meta` returns `200`
- `/api/v1/realtime-ticket` returns `201`
- proxied download URLs stay rooted at the expected external hostname

Release evidence smoke is stricter than this quick operator smoke. For release
approval, run `scripts/deploy_smoke.sh` with `DEPLOY_SMOKE_EVIDENCE_FILE` and
verify the evidence includes candidate metadata, the signed proxy URL root, and
the `HEAD` check against the returned signed proxy URL.

Common failures:

- wrong hostname in `/download-proxy` output:
  `EXTERNAL_BASE_URL`, `S3DESK_DOMAIN`, and `ALLOWED_HOSTS` do not match
- host/origin `403`:
  `ALLOWED_HOSTS` is missing the browser-facing hostname
- remote-address `403`:
  traffic is bypassing the intended reverse-proxy path

## Health Checks

- Liveness: `GET /healthz`
- Readiness: `GET /readyz`
- Metrics: `GET /metrics` with an API token

Useful endpoints:

- UI: `http://127.0.0.1:8080` for local checks, or `https://s3desk.example.com` behind Caddy
- API docs: `http://127.0.0.1:8080/docs`
- OpenAPI spec: `http://127.0.0.1:8080/openapi.yml`

## Cost and Restore Thresholds

Watch these metrics together:

- `storage_operations_total{provider,operation,status}`
- `storage_operation_duration_ms{provider,operation,status}`
- `thumbnail_cache_hits_total{source}`
- `download_proxy_mode_total{mode}`
- `transfer_errors_total{code}`

Use these operational thresholds:

### Thumbnail cache behavior

- Reopening the same object-heavy bucket view should produce visible `thumbnail_cache_hits_total` growth.
- If a second browse of the same object set still causes thumbnail-related storage calls to rise almost 1:1 with rendered cards, treat that as abnormal cache behavior.
- As a working threshold, investigate when repeated browsing of the same bucket yields less than roughly `80%` cache reuse after the first warm pass.
- Also investigate if thumbnail-related `storage_operation_duration_ms` p95 stays above `1000ms` for more than a few minutes during normal browsing.

### Download proxy behavior

- `download_proxy_mode_total{mode="stat_required"}` should not dominate normal image or object download traffic once metadata hints are flowing.
- If `stat_required` remains above roughly `20%` of proxy traffic during steady-state use, inspect recent preview and download callers for missing signed metadata hints.

### Object-storage cost pressure

- Compare `storage_operations_total` by provider and operation before and after high-traffic UI changes.
- Investigate when list/stat/head-style operations grow faster than the user-visible browse or preview workload they support; as a working threshold, treat sustained growth above roughly `2x` the expected browse/preview action rate as cost pressure.
- Investigate when any provider operation has an error ratio above roughly `5%` for more than `10 minutes`; repeated failed operations often create both cost and latency pressure.
- Investigate when `storage_operation_duration_ms` p95 for list or metadata operations stays above `3000ms` for more than `10 minutes`, because slow control-plane calls usually amplify retries, queue depth, and user refreshes.
- For live providers with request pricing, review dashboards after any release that changes object listing, thumbnailing, preview, or download URL behavior.

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
- Create an alert or scheduled review for any of these conditions:
  - staged restore count > `2`
  - staged restore age > `7 days`
  - thumbnail cache reuse staying below the `80%` warm-cache threshold for a commonly revisited bucket
  - storage operation error ratio > `5%` for `10 minutes`
  - list or metadata operation p95 > `3000ms` for `10 minutes`

## Backup Guidance

- SQLite deployment: back up the `/data` volume
- Postgres deployment: back up the database volume or use your standard Postgres backup flow
- The in-product `Full backup` / `Cache + metadata backup` export is sqlite-only
- Uploading a restore bundle stages a sqlite-backed `DATA_DIR`; it does not restore a running Postgres deployment
- Keep `API_TOKEN` and any encryption-related secrets outside of the repository

### Profile YAML Exports

- Default profile YAML export omits provider secrets and TLS private material.
- Secret-inclusive profile YAML export (`includeSecrets=true` or the UI's secret-loading option) is for controlled migration only.
- Keep secret-inclusive YAML out of git, release evidence, support bundles, and shared chat/log systems.
- Rotate provider credentials or TLS private material if a secret-inclusive export is shared outside the intended operator channel.

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

### Portable Backup and Import

- `Portable backup` is the database-neutral migration path.
- Use it when you need to move S3Desk state between sqlite and Postgres deployments.
- Portable bundles contain logical application data rather than a raw `s3desk.db` snapshot.
- Portable import currently assumes replace semantics for portable-scope entities.
- Keep `ENCRYPTION_KEY` aligned between source and destination when encrypted profile data is present.
- When using `confidentiality=encrypted`, a non-empty backup password overrides the destination `ENCRYPTION_KEY`; keep the export/import password aligned, or leave the password blank for server-key encrypted bundles.
- New encrypted backup bundles use versioned PBKDF2-SHA256 plus AES-256-GCM payload encryption; older `payloadEncryptionIv` bundles remain import-compatible.
- A safe migration flow is:
  1. Export a portable backup from the source server.
  2. Run portable import preview on the destination server.
  3. Resolve blockers such as encryption-key mismatch or missing disk space for thumbnails.
  4. Run the actual portable import into the destination database.
  5. Verify health and imported row counts before switching users to the new instance.
- For a disposable local proof of the supported paths, run:
  - `bash scripts/run_portable_sqlite_to_postgres_smoke.sh`
  - `bash scripts/run_portable_postgres_to_sqlite_smoke.sh`
- For encrypted/password-protected bundles, run:
  - `PORTABLE_BUNDLE_CONFIDENTIALITY=encrypted PORTABLE_BUNDLE_PASSWORD=operator-secret bash scripts/run_portable_sqlite_to_postgres_smoke.sh`
  - `PORTABLE_BUNDLE_CONFIDENTIALITY=encrypted PORTABLE_BUNDLE_PASSWORD=operator-secret bash scripts/run_portable_postgres_to_sqlite_smoke.sh`
- For failure-path validation, run:
  - `bash scripts/run_portable_failure_smoke.sh`
  - `bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh`

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
