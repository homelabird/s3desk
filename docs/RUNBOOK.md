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

## Quick checks
- Liveness: `GET /healthz` should return `ok`
- Readiness: `GET /readyz` should return `ok`
- Metrics: `GET /metrics` (requires local host + API token)
- Disk usage: verify free space for `DATA_DIR`

## Start/stop (docker compose)
- Start: `docker compose up -d`
- Stop: `docker compose down`
- Logs: `docker compose logs -f`

## Metrics access
- Example:
  - `curl -H "X-Api-Token: $API_TOKEN" http://127.0.0.1:8080/metrics`

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
