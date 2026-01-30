# Testing

## Test layout

- Backend unit tests: `backend/**/_test.go`
- Frontend unit tests: `frontend/src/**/__tests__` (run with `npm run test:unit`)
- API integration (provider smoke): `e2e/runner/runner.py` with `docker-compose.e2e.yml`
- UI E2E: Playwright specs in `frontend/tests`

## Naming and tag rules

Use file prefixes as the primary category signal:

- `frontend/tests/api-*.spec.ts` -> API integration (frontend-side)
- `frontend/tests/transfers-*.spec.ts` -> transfer scenarios
- `frontend/tests/objects-*.spec.ts` -> objects UI flows
- `frontend/tests/profiles-*.spec.ts` -> profile/provider UI flows
- `frontend/tests/settings-*.spec.ts` -> settings/auth flows
- `frontend/tests/jobs-*.spec.ts` -> job flows
- `frontend/tests/docs-*.spec.ts` -> docs/UI smoke
- `frontend/tests/*-perf.spec.ts` -> performance

Optional test title tags for filtering:

- `@api`, `@transfer`, `@ui`, `@perf`

Example:

```ts
test.describe('@transfer', () => {
  test('transfer progress updates are streamed', async () => {
    // ...
  })
})
```

## CI job mapping

- `openapi_validate`: OpenAPI spec validation
- `gofmt`: gofmt enforcement
- `go_test`: `go vet` + `go test`
- `govulncheck`: dependency vulnerability scan
- `frontend_ci`: OpenAPI gen + diff check, lint, unit tests, build (default)
- `frontend_openapi_types`: OpenAPI types generation + diff check (`FRONTEND_PARALLEL=1`)
- `frontend_lint`: ESLint (`FRONTEND_PARALLEL=1`)
- `frontend_build`: `vite build` (`FRONTEND_PARALLEL=1`)
- `frontend_unit_tests`: `npm run test:unit` (`FRONTEND_PARALLEL=1`)
- `third_party_notices`: runtime-only notices + diff check
- `dev_license_audit`: dev-only notices (audit stage; schedule or `RUN_DEV_AUDIT=1`)
- `api_integration`: `docker-compose.e2e.yml` + `e2e/runner/runner.py`
- `e2e` (optional, `E2E_BASE_URL` required): `tests/objects-smoke.spec.ts`, `tests/docs-smoke.spec.ts`, `tests/jobs-network.spec.ts`, `tests/transfers-*.spec.ts`
- `e2e_live` (optional, `E2E_LIVE=1`, `E2E_BASE_URL` required): `tests/api-crud.spec.ts`, `tests/jobs-live-flow.spec.ts`, `tests/objects-live-flow.spec.ts`, `tests/docs-smoke.spec.ts`
- `perf_tests` (optional, `PERF_TESTS=1`): `tests/jobs-perf.spec.ts`

## CI toggles (pipeline variables)

- `RUN_FULL_CHECK=1`: runs the full `check` job (backend + frontend + notices).
- `FRONTEND_PARALLEL=1`: splits frontend checks into separate jobs (`frontend_openapi_types`, `frontend_lint`, `frontend_unit_tests`, `frontend_build`).
- `RUN_DEV_AUDIT=1`: runs `dev_license_audit` outside schedules.
- `E2E_LIVE=1`: enables live UI specs in `e2e_live` (requires `E2E_BASE_URL`).
- `PERF_TESTS=1`: enables Playwright perf tests in `perf_tests`.

## Pipeline validation checklist

- Default pipeline (no extra variables): verify `frontend_ci` runs; `check` stays manual-only.
- `FRONTEND_PARALLEL=1`: verify `frontend_ci` is skipped and split jobs run.
- `RUN_FULL_CHECK=1`: verify `check` runs alongside the split jobs.
- `RUN_DEV_AUDIT=1`: verify `dev_license_audit` runs.

## Pipeline performance tracking (fill after CI runs)

| Date | Pipeline type | Duration | Jobs | Cache notes | Notes |
| --- | --- | --- | --- | --- | --- |
| TBD | Baseline (before changes) | TBD | TBD | TBD | TBD |
| 2026-01-30 | `FRONTEND_PARALLEL=1` + `RUN_FULL_CHECK=1` + `RUN_DEV_AUDIT=1` (project vars) | 15m25s (failed) | 22 (18 ok, 4 failed) | N/A | Failed `helm_k8s_*` jobs (RUN_HELM_SMOKE likely enabled). |
| TBD | `FRONTEND_PARALLEL=1` | TBD | TBD | TBD | TBD |
| TBD | `RUN_FULL_CHECK=1` | TBD | TBD | TBD | TBD |
| TBD | `RUN_DEV_AUDIT=1` | TBD | TBD | TBD | TBD |

## CI environment variables (Live UI tests)

Set these in CI when running `e2e_live` (or local live runs):

- `E2E_LIVE=1` (enables live specs)
- `E2E_BASE_URL` (UI base URL, e.g. `http://s3desk:8080`)
- `E2E_API_TOKEN` (default `change-me`)
- `E2E_S3_ENDPOINT` (MinIO/S3 endpoint reachable **from the API service**; in containers use the service DNS like `http://minio:9000`, not `127.0.0.1`)
- `E2E_S3_ACCESS_KEY` / `E2E_S3_SECRET_KEY` (defaults `minioadmin`)
- `E2E_S3_REGION` (default `us-east-1`)
- `E2E_S3_FORCE_PATH_STYLE` (default `true`)
- `E2E_S3_TLS_SKIP_VERIFY` (default `true`)

Optional overrides when UI/Docs/Perf are split:

- `PLAYWRIGHT_BASE_URL` (UI base URL)
- `DOCS_BASE_URL` (docs backend base URL)
- `PERF_BASE_URL` (perf test base URL)

Sample CI env file:

- `docs/ci/e2e_live.env.example`

## Transfer scenario test list

Define scenarios to cover end-to-end transfer behavior:

- Create transfer for each job type:
  - `transfer_sync_local_to_s3`
  - `transfer_sync_staging_to_s3`
  - `transfer_sync_s3_to_local`
  - `transfer_copy_object`
  - `transfer_delete_prefix`
- Progress visibility:
  - progress percent advances
  - per-file counters and bytes updated
  - final success status transitions
- Error recovery:
  - transient network error -> retry/backoff -> success
  - permission error -> terminal failure with normalized error
  - conflict handling (existing objects) -> expected behavior
- Cancellation/cleanup:
  - user cancel stops job
  - partial artifacts cleaned as expected
- Resume/re-run behavior:
  - rerun after failure does not regress metadata/state

## Local runs

API integration (docker compose):

```bash
docker compose -f docker-compose.e2e.yml up -d --build
docker compose -f docker-compose.e2e.yml run --rm runner
```

Playwright:

```bash
cd frontend
npm install
E2E_LIVE=1 E2E_API_TOKEN=change-me npm run test:e2e
```

Live UI flow (CI-like):

```bash
cd frontend
npm install
E2E_LIVE=1 \
E2E_BASE_URL=http://127.0.0.1:8080 \
E2E_API_TOKEN=change-me \
E2E_S3_ENDPOINT=http://minio:9000 \
E2E_S3_ACCESS_KEY=minioadmin \
E2E_S3_SECRET_KEY=minioadmin \
E2E_S3_REGION=us-east-1 \
npx playwright test tests/api-crud.spec.ts tests/jobs-live-flow.spec.ts tests/objects-live-flow.spec.ts tests/docs-smoke.spec.ts
```

When the UI and API base URLs differ (e.g. Vite dev server), set:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 \
DOCS_BASE_URL=http://127.0.0.1:8080 \
PERF_BASE_URL=http://127.0.0.1:8080 \
E2E_LIVE=1 E2E_API_TOKEN=change-me \
npm run test:e2e
```
