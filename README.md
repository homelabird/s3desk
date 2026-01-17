# S3Desk (multi-provider object storage)

S3Desk is a local-only dashboard for browsing and bulk transfer jobs (powered by `rclone`).

> **Getting started (summary)**
> - Run a single container with `docker run` (see Quick start)
> - Open `http://localhost:8080` in your browser
> - For remote access, set `ALLOW_REMOTE=true` and `API_TOKEN`

## Providers

S3Desk uses `rclone`, with a long-term goal of a single UI/API across multiple object-storage providers.

Supported providers:
- AWS S3 / S3-compatible (Ceph RGW, MinIO, etc.)
- Microsoft Azure Blob Storage
- Google Cloud Storage (GCS)
- Oracle Cloud Infrastructure (OCI)
  - OCI S3-compatible endpoint
  - OCI native Object Storage (rclone `oracleobjectstorage` backend)

Support tiers:
- **Tier 1**: AWS S3, S3-compatible (MinIO/Ceph), Azure Blob, GCS
- **Tier 2**: OCI S3-compatible, OCI Object Storage (native)

Details:
- `docs/USAGE.md`
- `docs/PROVIDERS.md`

## Quick start (single container)

Single-container run uses sqlite by default at `/data/s3desk.db`.
The image includes the `sqlite3` CLI for ad-hoc inspection.

```bash
docker run --rm -p 8080:8080 \
  -e ADDR=0.0.0.0:8080 \
  -e ALLOW_REMOTE=true \
  -e API_TOKEN=change-me \
  -v s3desk-data:/data \
  homelabird/s3desk:beta
```

```bash
docker exec -it <container> sqlite3 /data/s3desk.db
```

## Run with Postgres (docker compose, headless)

`docker-compose.yml` is configured for a headless Postgres setup (no bundled DB). It starts Postgres + the `postgres-beta` image.

```bash
docker compose up -d
```

Defaults (overridable via environment):
- Postgres: `POSTGRES_DB/USER/PASSWORD = s3desk`
- App: `ADDR=0.0.0.0:8080`, `ALLOW_REMOTE=true`, `API_TOKEN=change-me`
- DB: `DB_BACKEND=postgres`, `DATABASE_URL=postgres://s3desk:s3desk@postgres:5432/s3desk?sslmode=disable`

Open `http://localhost:8080` and use the configured `API_TOKEN`.

### UI preview

![Profiles page](s3desk-desktop.png)

## Docs

- `docs/USAGE.md`
- `docs/PROVIDERS.md`
- `docs/ROADMAP.md`
- `docs/wiki/` (GitLab wiki source)

## Run (dev)

> Frontend build/dev requires **Node.js 22+** (or Node 20.19+). If you run an older Node, `npm ci` and Vite will fail with engine errors.

1) Start the backend

```bash
cd backend
go run ./cmd/server
```

2) Start the frontend (Vite dev server)

```bash
cd frontend
npm install
npm run dev
```

Frontend proxies `/api/*` to `http://127.0.0.1:8080`.

Or run both:

```bash
./scripts/dev.sh
```

## Run (single origin: backend serves UI)

```bash
cd frontend
npm run build

cd ../backend
go run ./cmd/server
```

Default `--static-dir` is `../frontend/dist`, so opening `http://127.0.0.1:8080` serves the built UI.

## Run (Podman)

This app is **local-only** by default (binds to `127.0.0.1` and rejects non-local requests).

Linux (host networking):

```bash
podman build -f Containerfile -t s3desk:local .
podman run --rm --network host -v s3desk-data:/data s3desk:local
```

WSL2 / rootless Podman (port mapping; requires `ALLOW_REMOTE` + `API_TOKEN`):

```bash
podman run --rm -p 8080:8080 \
  -e ADDR=0.0.0.0:8080 \
  -e ALLOW_REMOTE=true \
  -e API_TOKEN=change-me \
  -v s3desk-data:/data \
  s3desk:local
```

Or use `./scripts/podman.sh build` / `./scripts/podman.sh run` / `./scripts/podman.sh run-port` (needs `API_TOKEN=...`).

Open `http://localhost:8080` (or `http://127.0.0.1:8080`).

The container image bundles `rclone` by default. If you want to override it (or use a host-installed `rclone`), mount it and set `RCLONE_PATH`:

```bash
podman run --rm --network host \
  -v s3desk-data:/data \
  -v "$(command -v rclone)":/usr/local/bin/rclone:ro \
  -e RCLONE_PATH=/usr/local/bin/rclone \
  s3desk:local
```

## Run (Helm/Kubernetes)

The Helm chart lives at `charts/s3desk`.

```bash
helm install s3desk charts/s3desk \
  --set image.repository=s3desk \
  --set image.tag=latest \
  --set server.apiToken="REPLACE_WITH_A_STRONG_RANDOM_TOKEN"
```

Notes:
- If you expose this via Ingress/Istio with a hostname, that hostname must be in the Host allowlist.
  - The chart auto-populates `ALLOWED_HOSTS` with common Service DNS variants plus any Ingress/Istio hosts.
  - Use `server.allowedHosts` for any additional hostnames.
- The chart defaults to `ADDR=0.0.0.0:8080` and `ALLOW_REMOTE=true`, so an API token is required.
- The chart intentionally fails install/upgrade if `server.allowRemote=true` and no token is configured.
- The chart rejects the insecure placeholder token value `change-me`.
- Kubernetes deployment is not verified yet.

## Build

```bash
./scripts/build.sh
```

Verify everything locally:

```bash
./scripts/check.sh
```

`scripts/check.sh` also regenerates runtime-only third-party notices/licenses.

Build output:
- `dist/s3desk-server`
- `dist/ui/` (packaged frontend)
- `dist/openapi.yml`

Run the packaged UI:

```bash
./dist/s3desk-server
```

## E2E tests

There are two flavors of E2E coverage (see `docs/TESTING.md` for the full test map and CI split):

- **Backend provider smoke / API integration** (CI): `docker-compose.e2e.yml` + `e2e/runner/runner.py`
  - Scenario: “profile create → connection test → bucket list → upload/download”
  - Covers MinIO (S3), Azurite (Azure Blob), fake-gcs-server (GCS)
- **UI E2E** (local): Playwright specs live in `frontend/tests` (gated by `E2E_LIVE=1`)

Docker (provider smoke) example:

```bash
docker compose -f docker-compose.e2e.yml up -d --build

# Run the provider-agnostic API flow runner
docker compose -f docker-compose.e2e.yml run --rm runner
```

Playwright (UI) example:

```bash
cd frontend
npm install
E2E_LIVE=1 E2E_API_TOKEN=change-me npm run test:e2e
```

Environment overrides:
- `E2E_API_TOKEN` (default `change-me`)
- `E2E_S3_ENDPOINT` (default `http://minio:9000`)
- `E2E_S3_ACCESS_KEY` / `E2E_S3_SECRET_KEY` (defaults `minioadmin`)
- `E2E_S3_REGION` (default `us-east-1`)
- `E2E_S3_FORCE_PATH_STYLE` (default `true`)
- `E2E_S3_TLS_SKIP_VERIFY` (default `true`)

If you run MinIO on the host with a locally running server, set `E2E_S3_ENDPOINT=http://127.0.0.1:9000`.

## rclone

Object browsing and jobs require `rclone`. If you don't have it installed globally, you can install it locally:

```bash
./scripts/install_rclone.sh
```

The server auto-detects `dist/bin/rclone`, `./.tools/bin/rclone` (or `../.tools/bin/rclone`) when `RCLONE_PATH` is not set.

`./scripts/build.sh` bundles `rclone` into `dist/bin/rclone` if it is available on `PATH` (or `./.tools/bin/rclone` exists).

## Job types

Currently supported `POST /api/v1/jobs` types:
- `transfer_sync_local_to_s3` (`payload.bucket`, `payload.localPath`, optional `payload.prefix`, `payload.deleteExtraneous`, `payload.include[]`, `payload.exclude[]`, `payload.dryRun`)
- `transfer_sync_staging_to_s3` (`payload.uploadId`)
- `transfer_sync_s3_to_local` (`payload.bucket`, `payload.localPath`, optional `payload.prefix`, `payload.deleteExtraneous`, `payload.include[]`, `payload.exclude[]`, `payload.dryRun`)
- `transfer_delete_prefix` (`payload.bucket`, `payload.prefix` or `payload.deleteAll=true`, optional `payload.allowUnsafePrefix=true` (when prefix doesn't end with `/`), `payload.include[]`, `payload.exclude[]`, `payload.dryRun`; wildcards `*` not allowed in prefix)
- `s3_delete_objects` (`payload.bucket`, `payload.keys[]` (max 50000))
- `transfer_copy_object` (`payload.srcBucket`, `payload.srcKey`, `payload.dstBucket`, `payload.dstKey`, optional `payload.dryRun`)
- `transfer_move_object` (`payload.srcBucket`, `payload.srcKey`, `payload.dstBucket`, `payload.dstKey`, optional `payload.dryRun`)
- `transfer_copy_batch` (`payload.srcBucket`, `payload.dstBucket`, `payload.pairs[]` (`srcKey`, `dstKey`), optional `payload.dryRun`)
- `transfer_move_batch` (`payload.srcBucket`, `payload.dstBucket`, `payload.pairs[]` (`srcKey`, `dstKey`), optional `payload.dryRun`)
- `transfer_copy_prefix` (`payload.srcBucket`, `payload.srcPrefix` (must end with `/`), `payload.dstBucket`, `payload.dstPrefix`, optional `payload.include[]`, `payload.exclude[]`, `payload.dryRun`)
- `transfer_move_prefix` (`payload.srcBucket`, `payload.srcPrefix` (must end with `/`), `payload.dstBucket`, `payload.dstPrefix`, optional `payload.include[]`, `payload.exclude[]`, `payload.dryRun`)

Transfer jobs use the profile's `endpoint` and respect `tlsInsecureSkipVerify` (via `--no-check-certificate`).

Cleanup:
- `DELETE /api/v1/jobs/{jobId}` deletes a non-active job record and its log file.

## Config

Backend flags/env:
- `--addr` / `ADDR` (default `127.0.0.1:8080`)
- `--data-dir` / `DATA_DIR` (default `./data`)
- `--db-backend` / `DB_BACKEND` (default `sqlite`; `sqlite` uses `DATA_DIR/s3desk.db`, `postgres` uses `DATABASE_URL`)
- `--database-url` / `DATABASE_URL` (required when `DB_BACKEND=postgres`)
- `--db-max-open-conns` / `DB_MAX_OPEN_CONNS` (default `0` = driver default)
- `--db-max-idle-conns` / `DB_MAX_IDLE_CONNS` (default `0` = driver default)
- `--db-conn-max-lifetime` / `DB_CONN_MAX_LIFETIME` (default `0` = unlimited)
- `--db-conn-max-idle-time` / `DB_CONN_MAX_IDLE_TIME` (default `0` = unlimited)
- `--log-format` / `LOG_FORMAT` (default `text`; `json` outputs JSON Lines to stdout)
- `--log-level` / `LOG_LEVEL` (default `info`; `debug`, `info`, `warn`, `error`)
- `--static-dir` / `STATIC_DIR` (default `../frontend/dist`)
- `--api-token` / `API_TOKEN` (optional; UI Settings sets it)
- `--allow-remote` / `ALLOW_REMOTE` (default `false`; allow non-loopback bind and accept private remote clients (including `Host`/`Origin`); requires `API_TOKEN` when binding non-loopback; useful for WSL2 / container port mapping)
- `--encryption-key` / `ENCRYPTION_KEY` (optional; base64-encoded 32 bytes, encrypts stored profile credentials; also migrates existing plaintext profiles on startup)
- `--allow-local-dir` / `ALLOWED_LOCAL_DIRS` (optional; repeatable / comma-separated; restricts `localPath` for sync jobs)
- `--job-concurrency` / `JOB_CONCURRENCY` (default `2`)
- `--job-log-max-bytes` / `JOB_LOG_MAX_BYTES` (default `0` = unlimited; max bytes per job log file; old bytes are truncated when exceeded)
- `--job-log-emit-stdout` / `JOB_LOG_EMIT_STDOUT` (default `false`; mirror job logs to stdout as JSON Lines)
- `--job-retention` / `JOB_RETENTION` (default `0` = keep forever; deletes finished jobs older than this duration)
- `--job-log-retention` / `JOB_LOG_RETENTION` (default `0` = keep forever; deletes job log files older than this duration)
- `--upload-ttl` / `UPLOAD_TTL` (default `24h`)
- `--upload-max-bytes` / `UPLOAD_MAX_BYTES` (default `0` = unlimited; max total bytes per upload session)
- `--rclone-download-multi-thread-streams` / `RCLONE_DOWNLOAD_MULTI_THREAD_STREAMS` (default `4`; `0` = use rclone default)
- `--rclone-download-multi-thread-cutoff-mib` / `RCLONE_DOWNLOAD_MULTI_THREAD_CUTOFF_MIB` (default `256`; `0` = use rclone default)
- `--rclone-download-buffer-size-mib` / `RCLONE_DOWNLOAD_BUFFER_SIZE_MIB` (default `16`; `0` = use rclone default)
- `RCLONE_PATH` (optional; override rclone binary)
- `RCLONE_TUNE` (default `true`; enable rclone auto-tuning)
- `RCLONE_MAX_TRANSFERS` (default `CPU*4`, min 4, max 128; split across active jobs)
- `RCLONE_MAX_CHECKERS` (default `CPU*8`, min 8, max 256; split across active jobs)
- `RCLONE_S3_CHUNK_SIZE_MIB` (default `0` = rclone default)
- `RCLONE_S3_UPLOAD_CONCURRENCY` (default `0` = rclone default)
- `RCLONE_STATS_INTERVAL` (default `2s`, min `500ms`)

Generate an encryption key:

```bash
openssl rand -base64 32
```

## OpenAPI

Validate `openapi.yml`:

```bash
./scripts/validate_openapi.sh
```

The server also serves it at `http://127.0.0.1:8080/openapi.yml`.
Interactive docs are available at `http://127.0.0.1:8080/docs`.

Frontend types are generated to `frontend/src/api/openapi.ts` via `npm run gen:openapi` (also run during `./scripts/build.sh`).

## System meta

`GET /api/v1/meta` returns server configuration and tool detection (version, dirs, transfer engine availability, etc). If `API_TOKEN` is set, send `X-Api-Token`.

## Job logs

`GET /api/v1/jobs/{jobId}/logs` returns `text/plain` logs. It supports:
- tail: `?tailBytes=...`
- incremental polling: `?afterOffset=...&maxBytes=...` (response header `X-Log-Next-Offset`)

## Events

Realtime job events are available via:
- WebSocket: `GET /api/v1/ws` (use `?apiToken=...` when `API_TOKEN` is enabled)
- SSE: `GET /api/v1/events` (use `?apiToken=...` when `API_TOKEN` is enabled)

By default, the stream includes `job.log` events; pass `?includeLogs=false` to reduce event volume (logs can be fetched via the job logs endpoint).

The server may also emit `jobs.deleted` when job records are deleted (manual delete or retention cleanup).

SSE includes `id:` equal to the event `seq` and can resume (buffered non-log events) via `Last-Event-ID` (or `?afterSeq=...`). WebSocket can replay buffered events via `?afterSeq=...`.

## Object download

The UI can download objects via a presigned URL from `GET /api/v1/buckets/{bucket}/objects/download-url?key=...` (requires `X-Profile-Id`, and `X-Api-Token` if enabled).

## Notes

- The server is local-only by default: it refuses to bind to non-local addresses, and API requests must come from localhost (`Host`/`Origin`/remote addr checks). With `ALLOW_REMOTE=true`, it accepts private clients and private `Host`/`Origin` (and requires `API_TOKEN` when binding non-loopback).
- The API blocks browser cross-site requests via Fetch Metadata (`Sec-Fetch-Site: cross-site`) when present.
- The server sets basic security headers (anti-clickjacking + hardening): `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- Jobs require `rclone` on `PATH` (or `RCLONE_PATH`).

## License

- Project license: MPL-2.0 (`LICENSE`)
- Third-party notices: `THIRD_PARTY_NOTICES.md`
- Third-party license texts: `third_party/licenses/`
- Source file headers: not added retroactively; use `LICENSE_HEADER.txt` for new files when desired.
- OpenAPI draft: `openapi.yml`
