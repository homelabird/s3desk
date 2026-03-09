# Docs

This folder intentionally keeps only the small set of docs needed to run and work on S3Desk.

## Core Docs

- [USAGE.md](USAGE.md): product workflow and day-to-day UI usage
- [PROVIDERS.md](PROVIDERS.md): provider support summary, capability model, and bucket governance support matrix
- [BUCKET_GOVERNANCE_LIVE_VALIDATION.md](BUCKET_GOVERNANCE_LIVE_VALIDATION.md): real-provider validation checklist for typed bucket governance flows
- [BUCKET_GOVERNANCE_DESIGN.md](BUCKET_GOVERNANCE_DESIGN.md): provider-aware bucket governance redesign draft
- [BUCKET_GOVERNANCE_REMAINING_WORK.md](BUCKET_GOVERNANCE_REMAINING_WORK.md): remaining checklist after the bucket governance rollout
- [UI_OPERATION_FEEDBACK.md](UI_OPERATION_FEEDBACK.md): frontend rules for `ok=true` / `ok=false` API outcomes and API error UX
- [RUNBOOK.md](RUNBOOK.md): operating the service in real environments
- [TESTING.md](TESTING.md): local and CI-oriented test commands

## Built-In Endpoints

- UI: `http://192.168.0.200:8080`
- API docs: `http://192.168.0.200:8080/docs`
- OpenAPI spec: `http://192.168.0.200:8080/openapi.yml`
- Frontend dev server: `http://192.168.0.200:5173`

For remote access, make sure these are configured when relevant:

- `ADDR=0.0.0.0:8080`
- `ALLOW_REMOTE=true`
- `API_TOKEN`
- `ALLOWED_HOSTS` only for non-private hostnames

## Supporting Assets

- `S3Desk.postman_collection.json`
- `S3Desk.insomnia_collection.json`
- `ci/e2e_live.env.example`
- `grafana/s3desk-jobs-retry-failure.dashboard.json`
