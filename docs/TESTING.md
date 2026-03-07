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
