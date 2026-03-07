# S3Desk

S3Desk is a self-hosted dashboard for multi-provider object storage. It provides one UI and API for profiles, buckets, objects, uploads, and long-running transfer jobs powered by `rclone`.

## Playwright GIF Recording
![Playwright E2E recording GIF](frontend/recordings/gifs/live-test2/docs-smoke-loads-Swagger-UI-chromium.gif)

## Core Features

- Multiple storage profiles in one workspace
- Bucket and object browsing
- Upload, download, copy, move, sync, and delete jobs
- Job history, logs, and retry actions
- Built-in API docs and OpenAPI spec

## Supported Providers

- Tier 1: AWS S3, S3-compatible storage, Azure Blob Storage, Google Cloud Storage
- Tier 2: OCI S3-compatible, OCI Object Storage

See [docs/PROVIDERS.md](docs/PROVIDERS.md) for the short provider matrix.

## Quick Start

### Docker Compose

The repository includes a compose file for `Postgres + S3Desk`.

1. Review `.env` for the image and tag.
2. Update `API_TOKEN` in `docker-compose.yml` before exposing the service.
3. Start the stack:

```bash
docker compose up -d
```

Open:

- UI: `http://192.168.0.200:8080`
- API docs: `http://192.168.0.200:8080/docs`
- OpenAPI spec: `http://192.168.0.200:8080/openapi.yml`

Remote access requirements:

- `ADDR=0.0.0.0:8080`
- `ALLOW_REMOTE=true`
- `API_TOKEN` must be set
- `ALLOWED_HOSTS` is only required for non-private hostnames

### Local Development

Requirements:

- Go `1.24+`
- Node.js `22.x`

Start the backend and frontend together:

```bash
./scripts/dev.sh
```

Expected URLs:

- Frontend dev server: `http://192.168.0.200:5173`
- Backend UI/API: `http://192.168.0.200:8080`

## Common Commands

```bash
./scripts/check.sh
cd backend && go test ./...
cd frontend && npm run lint
cd frontend && npm run test:unit
cd frontend && npm run build
```

## Documentation

- [Docs index](docs/README.md)
- [Usage](docs/USAGE.md)
- [Providers](docs/PROVIDERS.md)
- [Runbook](docs/RUNBOOK.md)
- [Testing](docs/TESTING.md)

## License

See [LICENSE](LICENSE).
