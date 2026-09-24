---
name: s3desk-backend
description: Implement, diagnose, or review S3Desk Go backend, API, jobs, store, provider, OpenAPI, security, or runtime changes. Skip for frontend-only and release-metadata-only work.
---

# S3Desk Backend

Trace the route/job through its callers and keep behavior with its owner:

- HTTP decoding, validation, auth, and response mapping: `backend/internal/api`.
- Durable state: `backend/internal/store`; queued work: `backend/internal/jobs`.
- Provider behavior and capabilities: the owning provider package.
- Preserve the supported single-replica, single-`DATA_DIR` topology unless HA is requested.
- Treat credentials, local paths, auth, backup/restore, and outbound endpoints as trust boundaries.

For API contract changes, update `openapi.yml`, backend contract coverage, and frontend consumers. Regenerate types; never edit `frontend/src/api/openapi.ts` by hand:

```bash
cd frontend && npm run gen:openapi && npm run check:openapi
```

Run the narrowest relevant Go test first, then expand only as needed:

```bash
cd backend && go test ./internal/<owner>
```

`./scripts/repro_backend_focus.sh list` lists maintained API repro groups. Use `./scripts/check.sh fast` when changes cross repository owners. Source tests and emulators do not prove live provider behavior; use `$s3desk-live-evidence` when that proof is required.
