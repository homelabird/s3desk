# Docs

This folder intentionally keeps only the small set of docs needed to run and work on S3Desk.

## Core Docs

- [USAGE.md](USAGE.md): product workflow and day-to-day UI usage
- [PROVIDERS.md](PROVIDERS.md): provider support summary, capability model, and bucket governance support matrix
- [CADDY_DEPLOYMENT.md](CADDY_DEPLOYMENT.md): public HTTPS deployment path with Caddy in front of S3Desk
- [BUCKET_GOVERNANCE_LIVE_VALIDATION.md](BUCKET_GOVERNANCE_LIVE_VALIDATION.md): real-provider validation checklist for typed bucket governance flows
- [BUCKET_GOVERNANCE_DESIGN.md](BUCKET_GOVERNANCE_DESIGN.md): provider-aware bucket governance redesign draft
- [BUCKET_GOVERNANCE_REMAINING_WORK.md](BUCKET_GOVERNANCE_REMAINING_WORK.md): remaining checklist after the bucket governance rollout
- [TECH_DEBT.md](TECH_DEBT.md): current engineering debt, risk areas, and recommended issue order
- [TECH_DEBT_CHECKLIST.md](TECH_DEBT_CHECKLIST.md): execution checklist derived from the debt register
- [FRONTEND_UX_BACKLOG.md](FRONTEND_UX_BACKLOG.md): prioritized frontend UI/UX improvements and execution order
- [PORTABLE_BACKUP_DESIGN.md](PORTABLE_BACKUP_DESIGN.md): design for database-neutral backup/import across sqlite and postgres
- [PORTABLE_BACKUP_CHECKLIST.md](PORTABLE_BACKUP_CHECKLIST.md): execution checklist for portable backup/import work
- [RELEASE_GATE.md](RELEASE_GATE.md): minimum release checklist, live validation gate, and release note requirements
- [UI_OPERATION_FEEDBACK.md](UI_OPERATION_FEEDBACK.md): frontend rules for `ok=true` / `ok=false` API outcomes and API error UX
- [RUNBOOK.md](RUNBOOK.md): operating the service in real environments
- [TESTING.md](TESTING.md): local and CI-oriented test commands

## Built-In Endpoints

- UI: `http://127.0.0.1:8080`
- API docs: `http://127.0.0.1:8080/docs`
- OpenAPI spec: `http://127.0.0.1:8080/openapi.yml`
- Frontend dev server: `http://127.0.0.1:5173`

For remote access, make sure these are configured when relevant:

- `ADDR=0.0.0.0:8080`
- `ALLOW_REMOTE=true`
- `API_TOKEN` with a non-placeholder value
- `ALLOWED_HOSTS` only for non-private hostnames

## Supporting Assets

- `S3Desk.postman_collection.json`
- `S3Desk.insomnia_collection.json`
- `ci/e2e_live.env.example`
- `ci/provider_live_validation.env.example`
- `grafana/s3desk-jobs-retry-failure.dashboard.json`
