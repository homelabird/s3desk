---
name: s3desk-backend
description: Implement, diagnose, or review S3Desk Go backend, API, jobs, store, provider, OpenAPI, security, and runtime changes. Do not use for frontend-only styling or release-metadata-only work.
---

# S3Desk Backend

Use the current code and these maintained references:

- `docs/BACKEND_ARCHITECTURE.md` for package and runtime ownership.
- `docs/TESTING.md` for focused and repository-level checks.
- `docs/CODE_OWNERSHIP.md` for cross-surface review boundaries.
- `docs/PROVIDERS.md` when provider capabilities change.

## Work

1. Trace the request from route or job registration through every caller before editing.
2. Keep HTTP decoding, validation, auth, and response mapping in `internal/api`.
3. Keep durable state changes in `internal/store` and queued or long-running work in `internal/jobs`.
4. Keep provider-specific behavior in its provider owner and expose support through the capability model.
5. Preserve the supported single-replica, single-`DATA_DIR` topology unless the user explicitly requests an HA design.
6. Treat profile credentials, local paths, auth, backup/restore, and outbound provider endpoints as trust boundaries.

For public API changes, update `openapi.yml`, backend contract tests, and frontend consumers together. Generate types with:

```bash
cd frontend
npm run gen:openapi
npm run check:openapi
```

Do not edit `frontend/src/api/openapi.ts` directly.

## Validate

Start with the narrow package or named test that covers the change:

```bash
cd backend
go test ./internal/<owner>
```

Then scale to the changed surface:

```bash
cd backend
gofmt -w <changed-go-files>
go test ./...
```

Use `./scripts/repro_backend_focus.sh list` for maintained realtime and upload repro groups. Use `./scripts/check.sh fast` only when cross-repository coverage is warranted.

Provider-emulator or source tests are not live-provider evidence. When the result needs provider, reverse-proxy, backup-portable, or deployment proof, also use `$s3desk-live-evidence`.
