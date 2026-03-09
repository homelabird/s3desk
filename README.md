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

Build and run the current checkout with Postgres:

```bash
docker compose -f docker-compose.local-build.yml up --build -d
```

The service is exposed on `http://127.0.0.1:8080` by default.

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
