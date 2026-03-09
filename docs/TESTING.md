# Testing

This document keeps only the commands most contributors need.

## Full Local Check

```bash
./scripts/check.sh
```

## Backend

```bash
cd backend
go test ./...
```

## Frontend

```bash
cd frontend
npm run lint
npm run test:unit
npm run build
```

Frontend tooling expects Node.js `22.x`.

## API / Provider E2E

```bash
docker compose -f docker-compose.e2e.yml up -d --build
docker compose -f docker-compose.e2e.yml run --rm runner
```

## UI E2E

```bash
cd frontend
E2E_LIVE=1 E2E_API_TOKEN=change-me npm run test:e2e
```

Use `docs/ci/e2e_live.env.example` as the starting point for live Playwright environment variables.

### Nightly Live UI Flows

Nightly CI and local migration smoke checks currently run these browser flows:

- `tests/api-crud.spec.ts`
- `tests/objects-live-flow.spec.ts`
- `tests/jobs-live-flow.spec.ts`
- `tests/transfers-live-fallback.spec.ts`
- `tests/bucket-policy-live.spec.ts`
- `tests/docs-smoke.spec.ts`
- `tests/server-migration-live.spec.ts`
- `tests/uploads-folder-live.spec.ts`
- `tests/objects-image-preview-live.spec.ts`

Run the nightly live suite locally with:

```bash
LIVE_E2E_SUITE=critical ./scripts/run_live_e2e_local.sh
```
