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
- `frontend_openapi_types`: OpenAPI types generation + diff check
- `frontend_lint`: ESLint
- `frontend_build`: `vite build`
- `frontend_unit_tests`: `npm run test:unit`
- `third_party_notices`: runtime-only notices + diff check
- `dev_license_audit`: dev-only notices (audit stage)
- `api_integration`: `docker-compose.e2e.yml` + `e2e/runner/runner.py`
- `ui_smoke` (optional, `E2E_UI=1`, `E2E_BASE_URL` required): `tests/objects-smoke.spec.ts`, `tests/docs-smoke.spec.ts`
- `transfer_scenarios` (optional, `E2E_TRANSFERS=1`, `E2E_BASE_URL` required): `tests/transfers-*.spec.ts`
- `e2e_live` (optional, `E2E_LIVE=1`, `E2E_BASE_URL` required): `tests/api-crud.spec.ts`, `tests/objects-live-flow.spec.ts`, `tests/docs-smoke.spec.ts`
- `perf_tests` (optional, `PERF_TESTS=1`): `tests/jobs-perf.spec.ts`

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

When the UI and API base URLs differ (e.g. Vite dev server), set:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 \
DOCS_BASE_URL=http://127.0.0.1:8080 \
PERF_BASE_URL=http://127.0.0.1:8080 \
E2E_LIVE=1 E2E_API_TOKEN=change-me \
npm run test:e2e
```
