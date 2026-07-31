# S3Desk

S3Desk is a self-hosted dashboard for multi-provider object storage.

## Usage

Use the local scripts as the entrypoint. The detailed operator and release docs stay under `docs/`.

## Quick Start
- `cp .env.example .env.local && ./scripts/compose.sh demo up --build -d`

### Run
- `./scripts/dev.sh`
- `./scripts/compose.sh demo up --build -d`
- `./scripts/compose.sh remote up -d`
- `./scripts/compose.sh caddy up -d`

### Build and Verify
- `./scripts/build.sh`
- `./scripts/check.sh`
- `helm upgrade --install s3desk ./charts/s3desk`

### Cleanup
- `./scripts/compose.sh remote down`
- `./scripts/compose.sh caddy down`

## Detailed Guides

- [Operations and deployment](docs/RUNBOOK.md)
- [Testing and checklists](docs/TESTING.md)
- [Release gate](docs/RELEASE_GATE.md)
- [Provider configuration](docs/PROVIDERS.md)
- [Backup and restore](docs/PORTABLE_BACKUP.md)
- [Helm chart details](charts/s3desk/README.md)
- [All docs index](docs/README.md)

## License

MPL-2.0, [LICENSE](LICENSE)
