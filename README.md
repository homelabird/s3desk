# S3Desk

S3Desk is a self-hosted dashboard for multi-provider object storage.


![S3Desk dashboard](img/image.png)
![S3Desk objects view](<img/image copy.png>)


## Build Requirements

- Go `1.24+`
- Node.js `22.x`
- Docker and Docker Compose for container-based builds

## Build From Source

Build the frontend bundle, backend binary, and packaged `dist/` artifacts:

```bash
./scripts/build.sh
```

Build outputs:

- `dist/s3desk-server`
- `dist/ui`
- `dist/openapi.yml`

## Docker Build

Build and run the current checkout with Postgres using the local-only compose file:

```bash
export API_TOKEN='set-a-local-token'
docker compose -f docker-compose.local-build.yml up --build -d
```

`docker-compose.local-build.yml` is intentionally local-only:

- binds `127.0.0.1:${S3DESK_PORT:-8080}` on the host
- keeps `ALLOW_REMOTE=false`
- requires an explicit `API_TOKEN`

The service is exposed on `http://127.0.0.1:8080` by default.

For remote exposure, use a separate deployment manifest and set:

- `ALLOW_REMOTE=true`
- a non-placeholder `API_TOKEN`
- `ALLOWED_HOSTS` when using non-private hostnames

## Remote Deployment Template

The repository root compose files are now the hardened Postgres-backed remote templates:

- `docker-compose.yml`
- `docker-compose.postgres.yml`

Before starting them, set all required variables explicitly:

```bash
cp .env.example .env
$EDITOR .env
docker compose up -d
```

Notes:

- Start from [.env.example](/home/homelab/Downloads/project/s3desk/.env.example) for remote/Postgres deployments.
- `S3DESK_BIND_ADDRESS` is required so host exposure is always deliberate.
- `API_TOKEN` and `POSTGRES_PASSWORD` are required; placeholder defaults are not shipped in the remote template.
- Keep using `docker-compose.local-build.yml` for local development and local verification.

## Local Development

Run the backend and frontend together:

```bash
./scripts/dev.sh
```

Default local endpoints:

- Frontend dev server: `http://127.0.0.1:5173`
- UI and API: `http://127.0.0.1:8080`
- API docs: `http://127.0.0.1:8080/docs`
- OpenAPI spec: `http://127.0.0.1:8080/openapi.yml`

## Backup Model

- In-product `Full backup` and `Cache + metadata backup` exports are for sqlite-backed `DATA_DIR` state.
- Restore bundle uploads are `stage only`: the bundle is unpacked under `DATA_DIR/restores/<restore-id>` for review and manual cutover.
- Postgres deployments still need a separate database backup workflow such as `pg_dump`, physical base backups, or managed snapshots.
- A staged restore bundle does not replace a Postgres database restore.

## Documentation

- [Docs index](docs/README.md)
- [Usage](docs/USAGE.md)
- [Providers](docs/PROVIDERS.md)
- [Bucket governance design](docs/BUCKET_GOVERNANCE_DESIGN.md)
- [Bucket governance remaining work](docs/BUCKET_GOVERNANCE_REMAINING_WORK.md)
- [Runbook](docs/RUNBOOK.md)
- [Testing](docs/TESTING.md)

## Demo

Profile selection, bucket creation, file upload, object deletion, and jobs view:

![S3Desk demo flow](img/demo-flow-1920x1080.gif)

## License

This project is licensed under the Mozilla Public License 2.0 (`MPL-2.0`).

See the full [LICENSE](LICENSE).
