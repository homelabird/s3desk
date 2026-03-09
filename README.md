# S3Desk

S3Desk is a self-hosted dashboard for multi-provider object storage. It provides one UI and API for profiles, buckets, objects, uploads, and long-running transfer jobs powered by `rclone`.

# UI
![alt text](img/image.png)
![alt text](img/objects.png)

## Core Features

- Multiple storage profiles in one workspace
- Bucket and object browsing
- Upload, download, copy, move, sync, and delete jobs
- Job history, logs, and retry actions
- Server backup bundle download and staged restore for migration
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

### Docker Compose From Local Source

If you want Docker Compose to build the current local frontend and backend sources instead of pulling a published image, use the local-build stack.

1. Update `API_TOKEN` in `docker-compose.local-build.yml` before exposing the service.
2. Build and start the stack:

```bash
docker compose -f docker-compose.local-build.yml up --build -d
```

This uses `Containerfile.local`, which builds the frontend bundle and backend binary from the current checkout using public base images.

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

### E2E GIF recording (ffmpeg-static)

`ffmpeg-static` is an optional build-time dependency used only for local artifact conversion, so it is excluded from regular runtime builds.

Use this when you want to generate GIFs from Playwright recordings:

```bash
cd frontend
npm run test:e2e:record:gif:deps
```

`test:e2e:record:gif:deps` does a full dependency install and then runs `scripts/record-e2e-gif.mjs`.  
If you already installed optional dependencies manually, use:

```bash
cd frontend
npm run test:e2e:record:gif
```

If no ffmpeg binary is available, install system `ffmpeg` or keep `ffmpeg-static` installed.

## Documentation

- [Docs index](docs/README.md)
- [Usage](docs/USAGE.md)
- [Providers](docs/PROVIDERS.md)
- [Runbook](docs/RUNBOOK.md)
- [Testing](docs/TESTING.md)

## License

This project is licensed under Apache License 2.0.

See the full [LICENSE](LICENSE).

## License migration notes

- `ffmpeg-static` was moved to `optionalDependencies` in frontend package configuration, so it is excluded by default from runtime build outputs.
- Runtime artifacts for deployment (container image/binaries) include only `frontend/dist` and the backend binary; the full `node_modules` tree is not included.
- Third-party license notices are tracked in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); when needed, run `scripts/license-audit.sh`.
- Apache-2.0 NOTICE text should be added in a dedicated NOTICE file (or as part of LICENSE-related documentation) to match release packaging policy.
