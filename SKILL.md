---
name: s3desk-local-dashboard
description: Repository-specific operating rules for S3Desk tasks with trigger routing, command templates, CI mappings, environment contracts, and safety constraints.
metadata:
  short-description: S3Desk backend/frontend/CI/infra execution policy.
---

# S3Desk Skill v2

## Purpose

- This file defines project-specific behavior for the S3Desk repository.
- It complements and must not conflict with `AGENTS.md`.

## When to use this skill

- Use for tasks touching: `backend/`, `frontend/`, `charts/`, `scripts/`, `e2e/`, `k8s/`, `docker-compose*.yml`, `.gitlab-ci.yml`, `docs/USAGE.md`, `docs/TESTING.md`, `docs/RUNBOOK.md`.
- Use when task is about build, tests, e2e, helm, release, security scans, or operations.
- Ignore unrelated global-domain skill assumptions unless the user explicitly asks for those domains.

## Trigger rules by path/domain

- `backend/**` -> Backend checks and API-server runtime behavior.
- `frontend/**` -> UI build/lint/unit/e2e tasks.
- `charts/**` or `k8s/**` -> Helm template/render/smoke and cluster validation.
- `scripts/**` -> Script-level runbooks, local harness, and packaging.
- `e2e/**` + `frontend/tests/**` -> local/CI E2E routing and env mapping.
- `.gitlab-ci.yml` -> CI-equivalent command templates for job reproduction.
- `docs/**` -> operational runbook and testing interpretation.

## URL and policy constraints

- Do not use `localhost` or `127.0.0.1` in user-visible URLs.
- Use canonical host URLs:
  - `http://192.168.0.200:8080`
  - `http://192.168.0.200:8080/docs`
  - `http://192.168.0.200:8080/openapi.yml`
  - `http://192.168.0.200:5173`
- Prefer `ALLOW_REMOTE=true` with explicit `API_TOKEN` for non-loopback binds.

## Environment contract

- Core server:
  - `ADDR` default `192.168.0.200:8080` for documented examples
  - `ALLOW_REMOTE=true` requires `API_TOKEN` when bind is non-loopback
  - `API_TOKEN` required for remote writes and protected endpoints
  - `ALLOWED_HOSTS` for hostname-based access (Ingress/Service DNS)
  - `DB_BACKEND=sqlite|postgres`
  - `DATABASE_URL` required when `DB_BACKEND=postgres`
- Runtime quality defaults:
  - `LOG_FORMAT=json`
  - `JOB_LOG_EMIT_STDOUT=true`
  - `LOG_LEVEL=info`
- E2E/Playwright:
  - `E2E_BASE_URL` for live/UI suites in CI
  - `E2E_API_TOKEN`
  - `PLAYWRIGHT_BASE_URL`, `DOCS_BASE_URL`, `PERF_BASE_URL`
- Podman helper:
  - `scripts/podman.sh run-port` sets/needs `ADDR=0.0.0.0:8080` and `ALLOW_REMOTE=true`
- Helm default values:
  - `charts/s3desk/ci-values.yaml` is the smoke baseline
  - `server.allowRemote=true` and `server.apiToken` must be set for remote smoke

## Command mapping templates

### 1) Backend changes (`backend/`)

```bash
cd /home/homelabird/Documents/project/s3desk/backend
gofmt -l .
go vet ./...
go test ./...
go build -o /tmp/s3desk-server ./cmd/server
```

### 2) Full repository check

```bash
cd /home/homelabird/Documents/project/s3desk
./scripts/check.sh
```

### 3) OpenAPI contract flow

```bash
cd /home/homelabird/Documents/project/s3desk
bash scripts/validate_openapi.sh
cd frontend
npm ci --no-audit --no-fund
npm run gen:openapi
git diff --exit-code src/api/openapi.ts
```

### 4) Frontend changes (`frontend/`)

```bash
cd /home/homelabird/Documents/project/s3desk/frontend
npm ci --no-audit --no-fund
npm run gen:openapi
npm run lint
npm run test:unit
npm run build
```

### 5) Dev startup

```bash
cd /home/homelabird/Documents/project/s3desk
S3DESK_BACKEND_ADDR=0.0.0.0:8080 S3DESK_FRONTEND_HOST=192.168.0.200 bash scripts/dev.sh
```

### 6) Local integration and live flow

```bash
docker compose -f docker-compose.e2e.yml up -d --build
docker compose -f docker-compose.e2e.yml run --rm runner
bash scripts/run_live_e2e_local.sh
```

```bash
cd /home/homelabird/Documents/project/s3desk/frontend
E2E_LIVE=1 \
E2E_BASE_URL="${E2E_BASE_URL:-http://192.168.0.200:8080}" \
E2E_API_TOKEN="${API_TOKEN}" \
npx playwright test tests/api-crud.spec.ts tests/jobs-live-flow.spec.ts tests/objects-live-flow.spec.ts tests/transfers-live-fallback.spec.ts tests/bucket-policy-live.spec.ts tests/docs-smoke.spec.ts
```

### 7) Helm and k8s smoke

```bash
helm lint charts/s3desk
helm template s3desk charts/s3desk -f charts/s3desk/ci-values.yaml
helm template s3desk charts/s3desk -f charts/s3desk/ci-values.yaml --set server.allowRemote=true --set-string server.apiToken=
```

```bash
bash scripts/helm_k8s_smoke.sh sqlite
bash scripts/helm_k8s_smoke.sh postgres
bash scripts/helm_k8s_smoke.sh upgrade
bash scripts/helm_k8s_smoke.sh pvc
```

### 8) Podman operations and build artifact

```bash
cd /home/homelabird/Documents/project/s3desk
bash scripts/podman.sh build
bash scripts/podman.sh run
API_TOKEN="${API_TOKEN}" bash scripts/podman.sh run-port
bash scripts/build.sh
```

### 9) Operations quick checks

```bash
curl -H "X-Api-Token: ${API_TOKEN}" http://192.168.0.200:8080/healthz
curl -H "X-Api-Token: ${API_TOKEN}" http://192.168.0.200:8080/readyz
curl -H "X-Api-Token: ${API_TOKEN}" http://192.168.0.200:8080/metrics
curl -H "Authorization: Bearer ${API_TOKEN}" http://192.168.0.200:8080/metrics
```

## CI mapping (strict, aligned to latest `.gitlab-ci.yml` signature)

### Pipeline/workflow preconditions

- `workflow.rules` triggers on: `CI_COMMIT_TAG`, `merge_request_event`, `web`, `schedule`.
- Excludes branch pipeline when `CI_OPEN_MERGE_REQUESTS` is enabled for that branch context.
- Defaults used by CI jobs: `GO_IMAGE`, `NODE_IMAGE`, `PODMAN_IMAGE`, `PLAYWRIGHT_IMAGE`, `TRIVY_IMAGE`, `ALPINE_IMAGE`.
- Default tooling variables: `NPM_VERSION=10.9.4`, `TRIVY_SEVERITY=HIGH,CRITICAL`, `TRIVY_EXIT_CODE=1`, `GOVULNCHECK_VERSION=latest`, `GITLEAKS_VERSION=8.21.2`, `HELM_VERSION=3.16.4`, `KUBECTL_VERSION=1.30.4`, `KUBECONFORM_VERSION=0.6.7`.

### CI job deep mapping (rules/vars/repro commands)

| Job | Condition (`rules`) | Main vars/dependencies | Repro command |
| --- | --- | --- | --- |
| `helm_lint` | Changes: `charts/**/*`, `charts/s3desk/ci-values.yaml`, `scripts/helm_k8s_smoke.sh` | `<<: *helm_tools` (Alpine + helm) | `helm lint charts/s3desk -f charts/s3desk/ci-values.yaml` |
| `helm_template` | Changes: same paths as above | `<<: *helm_tools`, `kubeconform` | `helm template s3desk charts/s3desk -f charts/s3desk/ci-values.yaml > /tmp/helm-rendered.yaml` + `kubeconform -strict -summary -ignore-missing-schemas` |
| `helm_template_negative` | Changes: same paths as above | `<<: *helm_tools` | `helm template ... --set server.allowRemote=true --set-string server.apiToken=` + assert error text |
| `helm_k8s_smoke_sqlite` | Exclude MR pipelines / `tag && RUN_HELM_SMOKE != 1` excluded / enable on `RUN_HELM_SMOKE == 1` + file changes in `charts/**/*`, `k8s/**/*`, `scripts/helm_k8s_smoke.sh` | `<<: *helm_k8s_tools`, `HARBOR_REGISTRY`, `S3DESK_IMAGE_REPOSITORY`, `S3DESK_FALLBACK_TAG=dev`, `S3DESK_IMAGE_TAG=$CI_COMMIT_SHA`, heavy tags | `bash scripts/helm_k8s_smoke.sh sqlite` |
| `helm_k8s_smoke_postgres` | Same pattern as above | Same vars | `bash scripts/helm_k8s_smoke.sh postgres` |
| `helm_k8s_upgrade` | Same pattern as above | Same vars | `bash scripts/helm_k8s_smoke.sh upgrade` |
| `helm_k8s_pvc` | Same pattern as above | Same vars | `bash scripts/helm_k8s_smoke.sh pvc` |
| `security_fs_scan` | `CI_COMMIT_TAG` OR `schedule` OR `default-branch`, or change-based trigger | `TRIVY_IMAGE`, `<<: *trivy_cache`, default `needs: []` | `trivy fs` + `trivy config --helm-values charts/s3desk/ci-values.yaml .` |
| `gitleaks_scan` | `CI_COMMIT_TAG` OR `schedule` OR `default-branch`, or change-based trigger | `GIT_DEPTH=0`, `ALPINE_IMAGE`, `GITLEAKS_VERSION` | install architecture-specific gitleaks in `before_script`, then `gitleaks detect --source . --config .gitleaks.toml` |
| `openapi_validate` | Changes: `openapi.yml`, `scripts/validate_openapi.sh` | `GO_IMAGE` | `bash scripts/validate_openapi.sh` |
| `check` | `RUN_FULL_CHECK==1` OR `schedule` => on_success, or manual (`allow_failure: true`) | `GO_IMAGE`, `.cache` (go/npm/npm-global), `node` bootstrapped in `before_script` | `bash scripts/check.sh` |
| `build_s3desk_image` | `RUN_IMAGE_BUILD==1` OR changes in `Containerfile`/`backend/**/*`/`frontend/**/*`/`openapi.yml` | `PODMAN_IMAGE`, Harbor auth required, build/push vars | `podman build` + `podman push` (`S3DESK_IMAGE=${HARBOR_REGISTRY}/library/s3desk:$CI_COMMIT_SHA`) |
| `build_release_images` | `CI_COMMIT_TAG` only | `PODMAN_IMAGE`, `podman build --build-arg DB_BACKEND=postgres/sqlite` | generates `release-postgres.tar`, `release-sqlite.tar` |
| `gofmt` | Changes: `backend/**/*` | `GO_IMAGE` + go cache | `find backend -name '*.go' ... gofmt -l` |
| `go_test` | Changes: `backend/**/*` | `GO_IMAGE`, mem request/limit override | `cd backend && go vet ./... && go test ./...` |
| `govulncheck` | Changes: `backend/**/*` | `GO_IMAGE`, `GOVULNCHECK_TIMEOUT=30m`, `GOVULNCHECK_PATTERN=./internal/api/...`, GOPROXY/GOSUMDB, `gobin` setup | `go install golang.org/x/vuln/cmd/govulncheck@${GOVULNCHECK_VERSION}` then scan |
| `frontend_smoke` | `CI_COMMIT_TAG` OR frontend/openapi changes | `NODE_IMAGE`, smoke tags | `cd frontend && npm ci` + `npm run test:unit -- src/pages/objects/__tests__/ObjectsPage.smoke.test.tsx` |
| `e2e_smoke` | `CI_COMMIT_TAG` OR `merge_request_event` | `PLAYWRIGHT_IMAGE`, heavy tags, node+playwright cache, `PLAYWRIGHT_BROWSERS_PATH` prepared | `npm run gen:openapi`, `npm run build`, `npm run preview -- --host 0.0.0.0 --port 4173`, then `npx playwright test --project=chromium tests/objects-smoke.spec.ts tests/jobs-flow.spec.ts tests/uploads-folder.spec.ts` |
| `frontend_ci` | `FRONTEND_PARALLEL != 1` AND frontend/openapi changes | `NODE_OPTIONS="--max-old-space-size=2048"`, mem request/limit | `npm ci` + `gen:openapi` + API diff check + `lint` + `test:unit` + `build` |
| `frontend_deps` | `FRONTEND_PARALLEL == 1` AND frontend/openapi changes | `NODE_OPTIONS`, mem request/limit, artifact: `frontend/node_modules/` | `npm ci` + `gen:openapi` + API diff check |
| `frontend_openapi_types` | `FRONTEND_PARALLEL == 1` AND frontend/openapi changes | needs `frontend_deps` | `npm run gen:openapi` + API diff check |
| `frontend_lint` | `FRONTEND_PARALLEL == 1` AND frontend/openapi changes | needs `frontend_deps` | `npm run gen:openapi` + `npm run lint` |
| `frontend_unit_tests` | `FRONTEND_PARALLEL == 1` AND frontend/openapi changes | needs `frontend_deps` | `npm run test:unit` |
| `frontend_build` | `FRONTEND_PARALLEL == 1` AND frontend/openapi changes | needs `frontend_deps` | `npm run gen:openapi` + `npm run build` |
| `frontend_bundle_analyze` | `CI_COMMIT_TAG` OR frontend/openapi/scripts/bundle_report.js changes | node memory + node cache; conditional node_modules install behavior | `npm run build:analyze` + `node scripts/bundle_report.js ...` + bundle guard rules |
| `third_party_notices` | Changes in frontend/Golang NOTICE generation paths | `GO_IMAGE`, node bootstrap in before_script | `cd frontend && npm ci` + `python3 scripts/generate_third_party_notices.py` + `git diff -I '^Generated at ' --exit-code` |
| `api_integration` | Changes in `Containerfile`/`backend/**/*`/`e2e/runner/**/*`/`openapi.yml`/`docker-compose.e2e.yml`/`scripts/ci_podman_compose.sh` | `PODMAN_IMAGE` + heavy tags + podman networking vars + `needs: build_s3desk_image(optional)` + env: `S3DESK_IMAGE`, `E2E_BASE_URL`, `E2E_MINIO_ENDPOINT`, `E2E_AZURITE_ENDPOINT`, `E2E_GCS_ENDPOINT`, `COMPOSE_POD_NAME` | `bash scripts/ci_podman_compose.sh` + `docker-compose.e2e.yml up --abort-on-container-exit --exit-code-from runner` |
| `release_postgres_smoke` | `CI_COMMIT_TAG` | `needs build_release_images` + podman vars | `podman load -i release-postgres.tar` + `docker-compose.postgres.yml` up/down + `/healthz`, `/readyz`, `/api/v1/meta` with `X-Api-Token: ${API_TOKEN}` |
| `e2e` | when `E2E_BASE_URL` is set | `PLAYWRIGHT_IMAGE`, `E2E_BASE_URL`, `DOCS_BASE_URL`, heavy playwright cache | `npx playwright test tests/objects-smoke.spec.ts tests/docs-smoke.spec.ts tests/jobs-network.spec.ts tests/transfers-*.spec.ts` |
| `e2e_live` | `E2E_LIVE == "1" && E2E_BASE_URL` | `PLAYWRIGHT_IMAGE`, force `E2E_LIVE=1` | `npx playwright test tests/api-crud.spec.ts tests/jobs-live-flow.spec.ts tests/objects-live-flow.spec.ts tests/transfers-live-fallback.spec.ts tests/bucket-policy-live.spec.ts tests/docs-smoke.spec.ts` + render policy summary in `after_script` |
| `perf_tests` | `PERF_TESTS == 1` | `PLAYWRIGHT_IMAGE`, node apt source + browser toolchain | `npm ci` + `PERF_TESTS=1 npx playwright test tests/jobs-perf.spec.ts` |
| `dev_license_audit` | `RUN_DEV_AUDIT == 1` OR `schedule` | `GO_IMAGE` + node bootstrap | `npm ci` + `python3 scripts/generate_third_party_notices.py --include-dev` |
| `trivy_scan` | `CI_COMMIT_TAG` only (or manual if `RUN_TRIVY != 1`) | `needs build_release_images` | `trivy image --input release-postgres.tar` and `release-sqlite.tar` |
| `publish_dockerhub` | `CI_COMMIT_TAG` | `needs: build_release_images`, `trivy_scan` | Docker Hub login/tag/push for postgres+sqlite tags, optional description upload |
| `publish_helm_chart` | `CI_COMMIT_TAG` | `HELM_OCI_REPO`, Harbor auth, helm bootstrap | `bash scripts/update_chart_version.sh`, `helm package charts/s3desk`, `helm push` |
| `release_image_smoke` | `CI_COMMIT_TAG` | `needs publish_dockerhub`, podman vars + compose bootstrap | `podman pull $DOCKERHUB_REPO:$BASE_TAG` + post-smoke + `s3desk-sqlite-smoke` on port `18080` |

### CI mapping principles

- Follow every job `rules` condition exactly and record trigger reasoning in the response.
- Always state `RUN_FULL_CHECK`, `FRONTEND_PARALLEL`, `RUN_IMAGE_BUILD`, `RUN_HELM_SMOKE`, `E2E_LIVE`, `PERF_TESTS`, `RUN_TRIVY`, `RUN_DEV_AUDIT` explicitly.
- Tag-based release/publish flow requires `CI_COMMIT_TAG` precondition and suffix parsing (`-postgres`, `-sqlite`) validation.
- Add an explicit branch gate for all write/release/build tasks: `CI_COMMIT_BRANCH == "main"` is required unless the user explicitly authorizes an exception.

### CI exact rules block (literal conditions)

```yaml
workflow:
  rules:
    - if: '$CI_COMMIT_TAG'
      when: always
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: always
    - if: '$CI_PIPELINE_SOURCE == "web"'
      when: always
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
      when: always
    - if: '$CI_COMMIT_BRANCH && $CI_OPEN_MERGE_REQUESTS'
      when: never
    - changes:
        - .gitlab-ci.yml
        - Containerfile
        - docker-compose*.yml
        - openapi.yml
        - backend/**/*
        - charts/**/*
        - e2e/**/*
        - frontend/**/*
        - k8s/**/*
        - scripts/**/*
        - third_party/licenses-manual/**/*
        - third_party/licenses/**/*
      when: always
    - changes:
        - README.md
        - LICENSE*
        - docs/**/*
        - docs/wiki/**/*
      when: never
    - when: never

helm_lint:
  rules:
    - changes:
        - charts/**/*
        - charts/s3desk/ci-values.yaml
        - scripts/helm_k8s_smoke.sh
    - when: never

helm_template:
  rules:
    - changes:
        - charts/**/*
        - charts/s3desk/ci-values.yaml
        - scripts/helm_k8s_smoke.sh
    - when: never

helm_template_negative:
  rules:
    - changes:
        - charts/**/*
        - charts/s3desk/ci-values.yaml
        - scripts/helm_k8s_smoke.sh
    - when: never

helm_k8s_smoke_sqlite:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: never
    - if: '$CI_COMMIT_TAG && $RUN_HELM_SMOKE != "1"'
      when: never
    - if: '$RUN_HELM_SMOKE == "1"'
      when: on_success
    - changes:
        - charts/**/*
        - k8s/**/*
        - scripts/helm_k8s_smoke.sh
    - when: never

helm_k8s_smoke_postgres:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: never
    - if: '$CI_COMMIT_TAG && $RUN_HELM_SMOKE != "1"'
      when: never
    - if: '$RUN_HELM_SMOKE == "1"'
      when: on_success
    - changes:
        - charts/**/*
        - k8s/**/*
        - scripts/helm_k8s_smoke.sh
    - when: never

helm_k8s_upgrade:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: never
    - if: '$CI_COMMIT_TAG && $RUN_HELM_SMOKE != "1"'
      when: never
    - if: '$RUN_HELM_SMOKE == "1"'
      when: on_success
    - changes:
        - charts/**/*
        - k8s/**/*
        - scripts/helm_k8s_smoke.sh
    - when: never

helm_k8s_pvc:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: never
    - if: '$CI_COMMIT_TAG && $RUN_HELM_SMOKE != "1"'
      when: never
    - if: '$RUN_HELM_SMOKE == "1"'
      when: on_success
    - changes:
        - charts/**/*
        - k8s/**/*
        - scripts/helm_k8s_smoke.sh
    - when: never

security_fs_scan:
  rules:
    - if: '$CI_COMMIT_TAG'
      when: on_success
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
      when: on_success
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
      when: on_success
    - changes:
        - .gitlab-ci.yml
        - Containerfile
        - docker-compose*.yml
        - openapi.yml
        - backend/**/*
        - charts/**/*
        - e2e/**/*
        - frontend/**/*
        - k8s/**/*
        - scripts/**/*
        - third_party/**/*
      when: on_success
    - when: never

gitleaks_scan:
  rules:
    - if: '$CI_COMMIT_TAG'
      when: on_success
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
      when: on_success
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
      when: on_success
    - changes:
        - .gitlab-ci.yml
        - .gitleaks.toml
        - Containerfile
        - docker-compose*.yml
        - openapi.yml
        - backend/**/*
        - charts/**/*
        - e2e/**/*
        - frontend/**/*
        - k8s/**/*
        - scripts/**/*
        - third_party/**/*
      when: on_success
    - when: never

openapi_validate:
  rules:
    - changes:
        - openapi.yml
        - scripts/validate_openapi.sh
    - when: never

check:
  rules:
    - if: '$RUN_FULL_CHECK == "1"'
      when: on_success
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
      when: on_success
    - when: manual
      allow_failure: true
    - when: never

build_s3desk_image:
  rules:
    - if: '$RUN_IMAGE_BUILD == "1"'
      when: on_success
    - changes:
        - Containerfile
        - backend/**/*
        - frontend/**/*
        - openapi.yml
    - when: never

build_release_images:
  rules:
    - if: '$CI_COMMIT_TAG'

gofmt:
  rules:
    - changes:
        - backend/**/*
    - when: never

go_test:
  rules:
    - changes:
        - backend/**/*
    - when: never

govulncheck:
  rules:
    - changes:
        - backend/**/*
    - when: never

frontend_smoke:
  rules:
    - if: '$CI_COMMIT_TAG'
      when: on_success
    - changes:
        - frontend/**/*
        - openapi.yml
    - when: never

e2e_smoke:
  rules:
    - if: '$CI_COMMIT_TAG'
      when: on_success
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: on_success
    - when: never

frontend_ci:
  rules:
    - if: '$FRONTEND_PARALLEL == "1"'
      when: never
    - changes:
        - frontend/**/*
        - openapi.yml
    - when: never

frontend_deps:
  rules:
    - if: '$FRONTEND_PARALLEL == "1"'
      changes:
        - frontend/**/*
        - openapi.yml
      when: on_success
    - when: never

frontend_openapi_types:
  rules:
    - if: '$FRONTEND_PARALLEL == "1"'
      changes:
        - frontend/**/*
        - openapi.yml
      when: on_success
    - when: never

frontend_lint:
  rules:
    - if: '$FRONTEND_PARALLEL == "1"'
      changes:
        - frontend/**/*
        - openapi.yml
      when: on_success
    - when: never

frontend_unit_tests:
  rules:
    - if: '$FRONTEND_PARALLEL == "1"'
      changes:
        - frontend/**/*
        - openapi.yml
      when: on_success
    - when: never

frontend_build:
  rules:
    - if: '$FRONTEND_PARALLEL == "1"'
      changes:
        - frontend/**/*
        - openapi.yml
      when: on_success
    - when: never

frontend_bundle_analyze:
  rules:
    - if: '$CI_COMMIT_TAG'
      when: on_success
    - changes:
        - frontend/**/*
        - openapi.yml
        - scripts/bundle_report.js
    - when: never

third_party_notices:
  rules:
    - changes:
        - frontend/**/*
        - scripts/generate_third_party_notices.py
        - third_party/**/*
    - when: never

api_integration:
  rules:
    - changes:
        - Containerfile
        - backend/**/*
        - e2e/runner/**/*
        - openapi.yml
        - docker-compose.e2e.yml
        - scripts/ci_podman_compose.sh
    - when: never

release_postgres_smoke:
  rules:
    - if: '$CI_COMMIT_TAG'

e2e:
  rules:
    - if: '$E2E_BASE_URL'
      when: on_success
    - when: never

e2e_live:
  rules:
    - if: '$E2E_LIVE == "1" && $E2E_BASE_URL'
      when: on_success
    - when: never

perf_tests:
  rules:
    - if: '$PERF_TESTS == "1"'
      when: on_success
    - when: never

dev_license_audit:
  rules:
    - if: '$RUN_DEV_AUDIT == "1"'
      when: on_success
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
      when: on_success
    - when: never

trivy_scan:
  rules:
    - if: '$CI_COMMIT_TAG && $RUN_TRIVY != "1"'
      when: manual
      allow_failure: true
    - if: '$CI_COMMIT_TAG'
      when: on_success
    - when: never

publish_dockerhub:
  rules:
    - if: '$CI_COMMIT_TAG'

publish_helm_chart:
  rules:
    - if: '$CI_COMMIT_TAG'

release_image_smoke:
  rules:
    - if: '$CI_COMMIT_TAG'
```

### CI execution governance matrix (identifier-driven)

| Identifier | Default branch | Affected scope (summary) | Operations check |
| --- | --- | --- | --- |
| `$CI_COMMIT_TAG` | enables full release chain when present | `openapi_validate`, `check`, `build_release_images`, `trivy_scan`, `publish_dockerhub`, `publish_helm_chart`, `release_postgres_smoke`, `release_image_smoke` | verify tag pipeline intent and confirm `-postgres`/`-sqlite` tag derivation |
| `$CI_PIPELINE_SOURCE == "merge_request_event"` | prioritizes MR flow | disables helm smoke (`helm_*`), enables `e2e_smoke` | ensure it does not overlap with `FRONTEND_PARALLEL` |
| `$CI_PIPELINE_SOURCE == "schedule"` | forces maintenance cadence jobs | `check`, `security_fs_scan`, `gitleaks_scan`, `dev_license_audit` | verify periodic jobs run without manual flag dependency |
| `$CI_PIPELINE_SOURCE == "web"` | allows manual workflow trigger | otherwise normal path expansion | verify no accidental `RUN_*` drift on manual invocations |
| `$CI_COMMIT_BRANCH && $CI_OPEN_MERGE_REQUESTS` | workflow-level block for MR-open branches | entire pipeline may be skipped | ensure branch and MR pipelines are not duplicated |
| `$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH` | additional baseline jobs on default branch | `openapi_validate`, `security_fs_scan`, `gitleaks_scan` | verify branch identity and secret availability |
| `$RUN_FULL_CHECK == "1"` | force full precheck mode | `check` job | keep a precheck fallback when this is off |
| `$RUN_IMAGE_BUILD == "1"` | force container build flow | `build_s3desk_image` | use only for release/debug windows |
| `$RUN_HELM_SMOKE == "1"` | force helm smoke jobs | `helm_k8s_smoke_sqlite/postgres/upgrade/pvc` | respect MR `when: never` precedence; block tag-mode misfire |
| `$FRONTEND_PARALLEL == "1"` | split frontend run into 5 shards | `frontend_ci` OFF, `frontend_deps` + `frontend_openapi_types`/`frontend_lint`/`frontend_unit_tests`/`frontend_build` ON | confirm `needs` edges stay intact |
| `$E2E_BASE_URL` | mandatory precondition | `e2e`, `api_integration` | verify URL availability before start |
| `$E2E_LIVE == "1"` | force live E2E profile | `e2e_live` (+ live suites) | validate remote token/schema/network readiness |
| `$PERF_TESTS == "1"` | enable performance run | `perf_tests` | monitor runtime and resource pressure |
| `$RUN_TRIVY == "1"` | manual control for trivy phase | `trivy_scan` runs manually with `allow_failure` behavior | ensure CI-blocking intent is explicit on failure |
| `$RUN_DEV_AUDIT == "1"` | force dev dependency audit | `dev_license_audit` | verify license change retention policy |
| `$SKIP_DOCKERHUB_DESCRIPTION == "1"` | skip Docker Hub description update | `publish_dockerhub` description upload step | clear the variable when description upload is required |

### Preflight 5-second guardrail checklist (operator-safe)

- First confirm: `CI_PIPELINE_SOURCE`, `CI_COMMIT_TAG`, `CI_COMMIT_BRANCH`, `CI_OPEN_MERGE_REQUESTS`.
- Verify no inherited `SKIP_*` / `RUN_*` flags are unexpectedly set.
- Align the current touchpoints (`backend/frontend/charts/e2e/scripts`) with `changes` rules before starting.
- If remote execution is required, verify `ALLOW_REMOTE=true` is paired with `API_TOKEN`.
- If `RUN_IMAGE_BUILD` is on, validate Harbor/PODMAN credentials and network first.
- For e2e/perf/live modes, verify `E2E_BASE_URL`, `E2E_LIVE`, and `PERF_TESTS` values in one pass.
- In release chain (`CI_COMMIT_TAG`), keep order: `build_release_images` → `trivy_scan` → `publish_*`.
- For `e2e_live` / smoke, check `COMPOSE_POD_NAME` uniqueness to avoid token/port collisions.
- For frontend jobs, align worker count with `FRONTEND_PARALLEL`.
- If a job did not run, first record why from `rules` and then apply fallback.

## Forbidden / risky patterns

- Do not output `localhost`/`127.0.0.1` URLs.
- Do not omit `API_TOKEN` when recommending remote starts.
- Do not use destructive git commands (`git reset --hard`, `git checkout --`) without explicit request.
- Do not suggest placeholder secrets (`change-me`) for reusable/shared environments.
- Do not mix project-incompatible global skill assumptions (Bazel/Board-MSA) as defaults.
- Do not propose heavy file edits unrelated to the task domain.
