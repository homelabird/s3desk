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

본 프로젝트는 Apache License 2.0으로 운영됩니다.

라이선스 전문은 [LICENSE](LICENSE)를 확인하세요.

## License migration notes

- npm 빌드 의존성 중 `ffmpeg-static`은 `optionalDependencies`로 이동되어, 빌드 산출물 생성 시 기본적으로 제외하도록 구성했습니다.
- 운영 환경에 포함되는 산출물(배포 바이너리/이미지)에는 `frontend/dist`와 백엔드 바이너리만 포함되며, `node_modules` 전체는 포함되지 않습니다.
- 제3자 라이선스 공지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에서 확인하며, 필요 시 `scripts/license-audit.sh`로 감사 가능합니다.
- Apache-2.0 NOTICE 문구는 NOTICE 파일 또는 `LICENSE` 부속문서에 별도 추가하여 배포 정책을 맞춥니다.
