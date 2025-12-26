# Local Object Storage Dashboard (S3-compatible)

Backend + local-only dashboard for browsing and bulk transfer jobs (powered by `s5cmd`).

## Docs

- `docs/USAGE.md`

## Run (dev)

1) Start backend

```bash
cd backend
go run ./cmd/server
```

2) Start frontend (Vite dev server)

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
podman build -f Containerfile -t object-storage:local .
podman run --rm --network host -v object-storage-data:/data object-storage:local
```

WSL2 / rootless Podman (port mapping; requires `ALLOW_REMOTE` + `API_TOKEN`):

```bash
podman run --rm -p 8080:8080 \
  -e ADDR=0.0.0.0:8080 \
  -e ALLOW_REMOTE=true \
  -e API_TOKEN=change-me \
  -v object-storage-data:/data \
  object-storage:local
```

Or use `./scripts/podman.sh build` / `./scripts/podman.sh run` / `./scripts/podman.sh run-port` (needs `API_TOKEN=...`).

Open `http://localhost:8080` (or `http://127.0.0.1:8080`).

The container image bundles `s5cmd` by default. If you want to override it (or use a host-installed `s5cmd`), mount it and set `S5CMD_PATH`:

```bash
podman run --rm --network host \
  -v object-storage-data:/data \
  -v "$(command -v s5cmd)":/usr/local/bin/s5cmd:ro \
  -e S5CMD_PATH=/usr/local/bin/s5cmd \
  object-storage:local
```

## Run (Helm/Kubernetes)

The Helm chart lives at `charts/object-storage`.

```bash
helm install object-storage charts/object-storage \
  --set image.repository=object-storage \
  --set image.tag=latest \
  --set server.apiToken=change-me
```

Notes:
- If you expose this via Ingress with a hostname, set `server.allowedHosts` to that hostname (so Host/Origin checks allow it).
- The chart defaults to `ADDR=0.0.0.0:8080` and `ALLOW_REMOTE=true`, so an API token is required.

## Build

```bash
./scripts/build.sh
```

Verify everything:

```bash
./scripts/check.sh
```

`scripts/check.sh` also regenerates runtime-only third-party notices/licenses.

Build output:
- `dist/object-storage-server`
- `dist/ui/` (packaged frontend)
- `dist/openapi.yml`

Run the packaged UI:

```bash
./dist/object-storage-server
```

## s5cmd

Jobs require `s5cmd`. If you don't have it installed globally, you can install it locally:

```bash
./scripts/install_s5cmd.sh
```

The server auto-detects `dist/bin/s5cmd`, `./.tools/bin/s5cmd` (or `../.tools/bin/s5cmd`) when `S5CMD_PATH` is not set.

`./scripts/build.sh` bundles `s5cmd` into `dist/bin/s5cmd` if it is available on `PATH` (or `./.tools/bin/s5cmd` exists).

## Job types

Currently supported `POST /api/v1/jobs` types:
- `s5cmd_sync_local_to_s3` (`payload.bucket`, `payload.localPath`, optional `payload.prefix`, `payload.deleteExtraneous`, `payload.include[]`, `payload.exclude[]`, `payload.dryRun`)
- `s5cmd_sync_staging_to_s3` (`payload.uploadId`)
- `s5cmd_sync_s3_to_local` (`payload.bucket`, `payload.localPath`, optional `payload.prefix`, `payload.deleteExtraneous`, `payload.include[]`, `payload.exclude[]`, `payload.dryRun`)
- `s5cmd_rm_prefix` (`payload.bucket`, `payload.prefix` or `payload.deleteAll=true`, optional `payload.allowUnsafePrefix=true` (when prefix doesn't end with `/`), `payload.include[]`, `payload.exclude[]`, `payload.dryRun`; wildcards `*` not allowed in prefix)
- `s3_delete_objects` (`payload.bucket`, `payload.keys[]` (max 50000))
- `s5cmd_cp_s3_to_s3` (`payload.srcBucket`, `payload.srcKey`, `payload.dstBucket`, `payload.dstKey`, optional `payload.dryRun`)
- `s5cmd_mv_s3_to_s3` (`payload.srcBucket`, `payload.srcKey`, `payload.dstBucket`, `payload.dstKey`, optional `payload.dryRun`)
- `s5cmd_cp_s3_prefix_to_s3_prefix` (`payload.srcBucket`, `payload.srcPrefix` (must end with `/`), `payload.dstBucket`, `payload.dstPrefix`, optional `payload.include[]`, `payload.exclude[]`, `payload.dryRun`)
- `s5cmd_mv_s3_prefix_to_s3_prefix` (`payload.srcBucket`, `payload.srcPrefix` (must end with `/`), `payload.dstBucket`, `payload.dstPrefix`, optional `payload.include[]`, `payload.exclude[]`, `payload.dryRun`)

s5cmd jobs use the profile's `endpoint` (via `--endpoint-url`) and `tlsInsecureSkipVerify` (via `--no-verify-ssl`).

Cleanup:
- `DELETE /api/v1/jobs/{jobId}` deletes a non-active job record and its log file.

## Config

Backend flags/env:
- `--addr` / `ADDR` (default `127.0.0.1:8080`)
- `--data-dir` / `DATA_DIR` (default `./data`)
- `--db-backend` / `DB_BACKEND` (default `sqlite`; `sqlite` uses `DATA_DIR/object-storage.db`, `postgres` uses `DATABASE_URL`)
- `--database-url` / `DATABASE_URL` (required when `DB_BACKEND=postgres`)
- `--db-max-open-conns` / `DB_MAX_OPEN_CONNS` (default `0` = driver default)
- `--db-max-idle-conns` / `DB_MAX_IDLE_CONNS` (default `0` = driver default)
- `--db-conn-max-lifetime` / `DB_CONN_MAX_LIFETIME` (default `0` = unlimited)
- `--db-conn-max-idle-time` / `DB_CONN_MAX_IDLE_TIME` (default `0` = unlimited)
- `--log-format` / `LOG_FORMAT` (default `text`; `json` outputs JSON Lines to stdout)
- `--static-dir` / `STATIC_DIR` (default `../frontend/dist`)
- `--api-token` / `API_TOKEN` (optional; UI Settings sets it)
- `--allow-remote` / `ALLOW_REMOTE` (default `false`; allow non-loopback bind and accept private remote clients (including `Host`/`Origin`); requires `API_TOKEN` when binding non-loopback; useful for WSL2 / container port mapping)
- `--encryption-key` / `ENCRYPTION_KEY` (optional; base64-encoded 32 bytes, encrypts stored profile credentials; also migrates existing plaintext profiles on startup)
- `--allow-local-dir` / `ALLOWED_LOCAL_DIRS` (optional; repeatable / comma-separated; restricts `localPath` for sync jobs)
- `--job-concurrency` / `JOB_CONCURRENCY` (default `2`)
- `--job-log-max-bytes` / `JOB_LOG_MAX_BYTES` (default `0` = unlimited; max bytes per job log file; old bytes are truncated when exceeded)
- `--job-log-emit-stdout` / `JOB_LOG_EMIT_STDOUT` (default `false`; mirror job logs to stdout as JSON Lines)
- `--job-retention` / `JOB_RETENTION` (default `0` = keep forever; deletes finished jobs older than this duration)
- `--upload-ttl` / `UPLOAD_TTL` (default `24h`)
- `--upload-max-bytes` / `UPLOAD_MAX_BYTES` (default `0` = unlimited; max total bytes per upload session)
- `S5CMD_TUNE` (default `true`; enable s5cmd auto-tuning)
- `S5CMD_MAX_NUMWORKERS` (default `CPU*32`, min 32, max 512; split across active jobs)
- `S5CMD_MAX_CONCURRENCY` (default `CPU*2`, min 2, max 64; split across active jobs)
- `S5CMD_MIN_PART_SIZE_MIB` (default `16`, min 5)
- `S5CMD_MAX_PART_SIZE_MIB` (default `128`)
- `S5CMD_DEFAULT_PART_SIZE_MIB` (default `64`)

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

Frontend types are generated to `frontend/src/api/openapi.ts` via `npm run gen:openapi` (also run during `./scripts/build.sh`).

## System meta

`GET /api/v1/meta` returns server configuration and tool detection (version, dirs, `s5cmd` availability, etc). If `API_TOKEN` is set, send `X-Api-Token`.

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
- Jobs require `s5cmd` on `PATH` (or `S5CMD_PATH`).

## License

- Project license: MPL-2.0 (`LICENSE`)
- Third-party notices: `THIRD_PARTY_NOTICES.md`
- Third-party license texts: `third_party/licenses/`
- Source file headers: not added retroactively; use `LICENSE_HEADER.txt` for new files when desired.
- OpenAPI draft: `openapi.yml`
