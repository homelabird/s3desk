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

### Backend Live Provider Smoke

These env-gated smoke tests are read-only and meant for minimal-cost provider validation.

```bash
cd backend
set -a
source ../docs/ci/provider_live_validation.env.example
set +a
go test ./internal/api -run 'TestLiveValidation(AwsS3|GcpGcs|AzureBlob|OciObjectStorage|MinioS3Compatible|CephS3Compatible)$'
```

## Frontend

```bash
cd frontend
npm run lint
npm run test:unit
npm run build
```

Frontend tooling expects Node.js `22.x`.

## Release Gate

Use [RELEASE_GATE.md](RELEASE_GATE.md) when deciding whether a build is releasable. Provider-facing changes are not release-ready without the required live validation evidence.

```bash
./scripts/check_release_gate.sh
```

GitHub Actions also runs this as the `Release Gate` workflow so changelog and release-evidence scaffolding stay enforced in CI.

## OpenAPI Schema Workflow

Edit [openapi.yml](/home/homelab/Downloads/project/s3desk/openapi.yml), not the generated frontend schema file.

```bash
cd frontend
npm run gen:openapi
npm run check:openapi
```

`npm run check:openapi` fails when [src/api/openapi.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/openapi.ts) no longer matches [openapi.yml](/home/homelab/Downloads/project/s3desk/openapi.yml).

## API / Provider E2E

```bash
docker compose -f docker-compose.e2e.yml up -d --build
docker compose -f docker-compose.e2e.yml run --rm runner
```

## Portable Migration Smoke

These are the concrete portable backup/import validation paths.

```bash
./scripts/run_portable_sqlite_to_postgres_smoke.sh
./scripts/run_portable_postgres_to_sqlite_smoke.sh
```

The smoke stack uses [docker-compose.portable-smoke.yml](../docker-compose.portable-smoke.yml) and verifies:

- source fixture creation through the public API on either sqlite or postgres
- portable backup export from the configured source backend
- preview and import on the configured target backend
- imported `profiles`, `profile_connection_options`, `jobs`, `object_favorites`, and `object_index`
- thumbnail asset copy into the target `DATA_DIR`

## Reverse Proxy Smoke

Use this minimal pass when auth, realtime transport, `download-proxy`, `EXTERNAL_BASE_URL`, or `ALLOWED_HOSTS` changes.

With the built-in Caddy example:

```bash
podman run -d --rm \
  --name s3desk-caddy-smoke \
  --network host \
  --security-opt label=disable \
  -v "$PWD/scripts/Caddyfile:/etc/caddy/Caddyfile:ro" \
  docker.io/library/caddy:2.8.4

curl -k https://localhost:8443/healthz
curl -k -H "X-Api-Token: <token>" https://localhost:8443/api/v1/meta
curl -k -X POST -H "X-Api-Token: <token>" "https://localhost:8443/api/v1/realtime-ticket?transport=ws"
curl -k -H "X-Api-Token: <token>" -H "X-Profile-Id: <profile-id>" \
  "https://localhost:8443/api/v1/buckets/<bucket>/objects/download-url?key=<key>&proxy=true"
```

Expected result:

- `healthz` returns `200`
- `/api/v1/meta` returns `200`
- `/api/v1/realtime-ticket` returns `201`
- proxied download URL returns `200` and is rooted at the expected external base URL

## UI E2E

```bash
cd frontend
E2E_LIVE=1 E2E_API_TOKEN=change-me npm run test:e2e
```

Use `docs/ci/e2e_live.env.example` as the starting point for live Playwright environment variables.
Use `docs/ci/provider_live_validation.env.example` as the starting point for backend live-provider smoke variables.

For a local capture bundle with video, trace, screenshots, and an HTML report:

```bash
cd frontend
npm run test:e2e:capture
```

The capture bundle is written under `frontend/recordings/<run-id>/`.

To record the nightly live suite with the same artifact set:

```bash
PLAYWRIGHT_RECORD_ARTIFACTS=1 LIVE_E2E_SUITE=critical ./scripts/run_live_e2e_local.sh
```

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
