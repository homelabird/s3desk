# Runbook

This runbook covers the minimum operational checks for a normal S3Desk deployment.

## Service Basics

- S3Desk is local-first by default
- Remote access should always use:
  - `ADDR=0.0.0.0:8080`
  - `ALLOW_REMOTE=true`
  - `API_TOKEN`
- `ALLOWED_HOSTS` is only required for non-private hostnames

Containerized defaults:

- SQLite image stores data under `/data`
- Compose deployment uses Postgres plus Docker volumes

## Start and Stop

```bash
docker compose up -d
docker compose down
docker compose logs -f
```

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
- Keep `API_TOKEN` and any encryption-related secrets outside of the repository

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
