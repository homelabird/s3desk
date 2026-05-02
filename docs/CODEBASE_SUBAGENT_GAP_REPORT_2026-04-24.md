# S3Desk Codebase Sub-Agent Gap Report

작성일: 2026-04-24
대상: `/home/homelab/Downloads/project/s3desk`
작성 방식: 4개 sub-agent 영역 분석과 로컬 검증 결과를 종합

## 1. 분석 범위와 방법

이번 분석은 현재 작업 트리의 코드베이스를 기준으로 했다. 작업 트리는 분석 시작 시점에 이미 다수의 수정 파일과 미추적 파일이 있는 상태였으므로, 릴리스 산출물이나 로컬 실험 파일은 결함 판단에 직접 포함하지 않았다.

사용한 sub-agent 역할은 다음과 같다.

- Backend/API/Storage/Jobs/Security 분석
- Frontend/React/State/UI/Performance 분석
- Testing/CI/Release/Repository Hygiene 분석
- Operations/Deployment/Security/Data Safety 분석

로컬에서 재검증한 주요 명령은 다음과 같다.

| 명령 | 결과 | 관찰 |
| --- | --- | --- |
| `cd backend && go test ./...` | PASS | 백엔드 기본 테스트는 통과 |
| `cd frontend && npm run typecheck` | PASS | TypeScript 빌드 검사는 통과 |
| `cd frontend && npm run check:openapi` | PASS | OpenAPI 생성물 드리프트 없음 |
| `cd frontend && npm run check:e2e:geometry` | PASS | E2E geometry guard 통과 |
| `bash ./scripts/check_github_workflows.sh` | PASS | GitHub workflow 구조 검사는 통과 |
| `bash ./scripts/check_release_gate.sh` | PASS | release gate 스크립트 통과 |
| `cd frontend && npm run lint` | FAIL | `frontend/src/lib/__tests__/actionHints.test.ts:203`의 불필요한 escape 2건 |
| `cd frontend && npm run test:unit` | FAIL | `BucketsPage` 관련 2개 파일, 10개 테스트 실패 |

## 2. Executive Summary

S3Desk는 전반적으로 기능 폭이 넓고, API/프론트엔드/배포/테스트 자산이 잘 갖춰진 프로젝트다. 백엔드의 fail-closed 성향, 프론트엔드의 라우트별 분리, OpenAPI 드리프트 검사, 번들 예산, Helm/GitHub/GitLab 파이프라인 등은 작은 프로젝트 수준을 넘어선 품질 장치다.

다만 현재 상태에서 가장 큰 위험은 "기능 자체"보다 "운영 경계와 상태 보존 경계"에 있다. 원격 배포 템플릿이 서버의 fail-closed 조건과 맞지 않아 기동 실패 가능성이 있고, Helm probe가 호스트 검증에 막힐 수 있으며, portable migration과 full backup 경로에는 데이터 보존/비밀정보 노출 문제가 있다. 또한 현재 프론트엔드 unit/lint gate가 깨져 있어, 릴리스 전 안정성 판단이 어려운 상태다.

우선순위는 다음 순서가 적절하다.

1. 원격 배포/Helm probe/portable migration/full backup의 운영 안전성 결함을 먼저 고친다.
2. 깨진 프론트엔드 lint/unit test를 복구해 CI 신뢰도를 되돌린다.
3. multipart upload cleanup, job state transition, multi-instance 안전성을 DB 레벨로 보강한다.
4. 프론트엔드 query key/token storage/Objects page orchestration 부채를 줄인다.
5. CI parity, Go 버전 정렬, Kubernetes hardening, provider abstraction을 중기 개선으로 묶는다.

## 3. 좋은 점

- 백엔드는 remote 모드에서 API token, host allowlist, local directory allowlist를 강하게 검증한다. `backend/internal/app/app.go:60-74`
- API middleware가 host/origin/CORS/auth/rate limit을 중앙에서 다루고 있어 보안 경계가 비교적 명확하다.
- Go 테스트, TypeScript typecheck, OpenAPI drift, geometry guard, release gate 같은 자동화 검사가 이미 존재한다.
- 프론트엔드는 app shell, API client, route chunking, responsive layout, accessibility helper가 잘 분리되어 있다.
- Docker Compose, Helm, GitHub Actions, GitLab CI가 모두 존재해 배포 채널 다양성이 좋다.
- 번들 예산과 chunk 분리 정책이 있어 프론트엔드 성능 회귀를 의식하고 있다. `frontend/vite.config.ts:15-80`, `frontend/scripts/bundle-budgets.json:1-26`

## 4. 우선순위별 부족한 점

### P0. 원격 배포 템플릿이 서버 fail-closed 조건과 맞지 않음

서버는 `ALLOW_REMOTE=true`일 때 `ALLOWED_LOCAL_DIRS`가 비어 있으면 시작을 거부한다. `backend/internal/app/app.go:67-74`

하지만 원격 Compose 템플릿은 `ALLOW_REMOTE=true`를 설정하면서 `ALLOWED_LOCAL_DIRS`를 넘기지 않는다.

- `compose/remote/compose.yml:28-35`
- `compose/remote/caddy.yml:28-35`

Helm도 `server.allowRemote: true`가 기본이고 `server.allowedLocalDirs: []`가 기본이다. 값이 비어 있으면 deployment template에서 `ALLOWED_LOCAL_DIRS` env 자체를 만들지 않는다.

- `charts/s3desk/values.yaml:97-109`
- `charts/s3desk/templates/deployment.yaml:145-148`

영향:

- 문서와 템플릿을 따라 원격 배포하면 서버가 기동하지 않을 수 있다.
- 운영자는 API token, host 설정을 맞췄는데도 원인을 찾기 어렵다.

권장 조치:

- Compose remote 템플릿에 `ALLOWED_LOCAL_DIRS`를 필수 env로 추가한다.
- Helm chart는 `server.allowRemote=true`일 때 `server.allowedLocalDirs`가 비어 있으면 template validation으로 실패시키거나, 안전한 기본 mount 경로를 명시한다.
- `docs/README.md`, chart README, `.env.example`에 같은 요구사항을 반복 기재한다.

### P0. Helm health/readiness/metrics가 host 검증에 막힐 수 있음

`/healthz`, `/readyz`, `/metrics`는 `requireLocalHost` 뒤에 있다. `backend/internal/api/api.go:202-204`

Chart는 Service DNS와 ingress host를 `ALLOWED_HOSTS`로 자동 구성한다. `charts/s3desk/templates/deployment.yaml:110-144`
반면 probe 기본값에는 Host header override가 없다. `charts/s3desk/values.yaml:168-187`

middleware는 explicit allowlist가 존재하면 그 목록에 없는 private IP host를 거부한다. `backend/internal/api/middleware.go:358-375`

영향:

- kubelet probe가 Pod IP 또는 기본 Host로 접근할 때 allowlist와 맞지 않으면 readiness/liveness가 실패할 수 있다.
- metrics scraping도 같은 경계에 걸릴 수 있다.

권장 조치:

- Helm 기본 probe에 Service DNS 기반 Host header를 넣는다.
- 또는 health/readiness는 host allowlist보다 더 좁은 네트워크/loopback 판정으로 분리한다.
- metrics는 인증 요구사항과 scrape 경로를 chart values에서 명확히 분리한다.

### P0. 현재 프론트엔드 lint/unit test gate가 깨져 있음

`npm run lint`는 다음 파일에서 실패했다.

- `frontend/src/lib/__tests__/actionHints.test.ts:203`
- 원인: `'No matches for \"report\".'`에서 quote escape가 불필요해 `no-useless-escape` 위반

`npm run test:unit`은 220개 test file 중 2개 파일이 실패했고, 817개 테스트 중 10개가 실패했다. 실패는 모두 `BucketsPage` 렌더링/액션 테스트다.

대표 실패 위치:

- `frontend/src/pages/__tests__/BucketsPage.routes.test.tsx:134`
- `frontend/src/pages/__tests__/BucketsPage.routes.test.tsx:158`
- `frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx:344`
- `frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx:379`
- `frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx:470`
- `frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx:567`
- `frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx:704`
- `frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx:854`
- `frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx:919`
- `frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx:983`

관찰상 `buckets-list-compact` 또는 `buckets-table-desktop` 컨테이너는 렌더링되지만 bucket row/action button이 비어 있는 형태였다. 즉 단순 selector 변경이라기보다 `BucketsPage`의 query/controller/mock 데이터 연결이 현재 테스트 기대와 어긋난 상태로 보인다.

영향:

- 릴리스 전 프론트엔드 회귀 판단이 불가능하다.
- bucket list/action UX의 실제 동작에 대한 신뢰도가 떨어진다.

권장 조치:

- lint escape는 즉시 수정한다.
- `BucketsPage` 테스트 실패는 `useBucketsPageQueriesState`, controller state builder, mock API 응답 shape, responsive branch 조건을 함께 추적한다.
- 실패를 snapshot update로 덮지 말고 row/action이 왜 비어 있는지부터 확인한다.

### P0. portable migration archive에서 `upload_objects`가 누락될 수 있음

portable export store는 `upload_objects`를 만들고 import도 파싱한다.

- export 생성: `backend/internal/store/store_portable.go:72-76`
- import 파싱: `backend/internal/store/store_portable.go:120-123`

하지만 archive writer가 사용하는 `portableEntityOrder`에는 `upload_objects`가 없다.

- `backend/internal/api/handlers_server_portable.go:41-49`
- writer는 이 order에 있는 엔티티만 archive에 기록한다. `backend/internal/api/handlers_server_portable.go:143-148`

영향:

- portable migration이 multipart/staging upload 관련 추적 데이터를 완전히 보존하지 못할 수 있다.
- import 경로는 파일을 기대하지만 export archive에는 없을 수 있어 dry-run 또는 restore 단계에서 불일치가 발생할 수 있다.

권장 조치:

- `portableEntityOrder`에 `upload_objects`를 추가한다.
- portable backup/restore round-trip 테스트에 upload session, multipart upload, upload object fixture를 포함한다.

### P0. full backup이 평문 rclone credential 파일을 포함할 수 있음

full backup은 `logs`를 포함한다. `backend/internal/api/handlers_server_backup.go:44-49`

rclone job은 `DATA_DIR/logs/jobs/<job>.rclone.conf`에 임시 설정 파일을 쓰며, 이 파일에는 provider credential이 평문으로 들어간다.

- rclone config 파일 위치: `backend/internal/jobs/manager_rclone_config.go:11-17`
- S3 credential write: `backend/internal/rcloneconfig/config.go:69-79`
- Azure key write: `backend/internal/rcloneconfig/config.go:94-98`

정상 job 종료 시 cleanup과 orphan cleanup이 있더라도, 실행 중 또는 비정상 종료 직후 full backup이 생성되면 credential 파일이 archive에 들어갈 수 있다.

영향:

- 운영자가 "전체 백업"을 안전한 운영 자료로 취급할 경우 provider credential이 외부로 유출될 수 있다.

권장 조치:

- full backup에서 `*.rclone.conf`를 명시적으로 제외한다.
- 임시 rclone config를 `logs`가 아닌 별도 `runtime/secrets` 디렉터리에 두고 backup 대상에서 제외한다.
- backup manifest에 secret-bearing file exclusion 정책을 테스트로 고정한다.

### P1. 만료된 direct/presigned multipart upload cleanup이 cloud/DB 상태를 남길 수 있음

maintenance cleanup은 만료 session을 삭제하고 staging dir만 제거한다. `backend/internal/jobs/manager_maintenance.go:36-55`

반면 사용자가 upload session을 명시 삭제하는 API 경로는 multipart upload abort, multipart DB row 삭제, upload object 삭제를 수행한다.

- `backend/internal/api/handlers_uploads_session_http.go:158-177`

DB schema도 `upload_objects`는 `upload_sessions`에 cascade되어 있지만, `upload_multipart_uploads`는 `profile_id` FK만 있다.

- `backend/internal/db/db.go:169-184`
- `backend/internal/db/db.go:186-198`

영향:

- 만료 cleanup 경로에서는 cloud multipart upload가 abort되지 않을 수 있다.
- `upload_multipart_uploads` row가 orphan으로 남을 수 있다.
- object storage 비용과 추적 데이터 불일치가 누적될 수 있다.

권장 조치:

- maintenance cleanup도 명시 삭제 API와 같은 abort/delete 경로를 공유하게 만든다.
- `upload_multipart_uploads.upload_id`에 session FK cascade를 추가하거나 store cleanup을 보강한다.
- 만료 direct upload fixture를 만든 뒤 cloud abort mock과 DB row 삭제를 검증한다.

### P1. job state transition이 compare-and-swap 없이 id 기준으로만 업데이트됨

job status update는 `WHERE id = ?`만 사용한다. `backend/internal/store/store_jobs.go:242-271`

finalize와 restart recovery는 현재 status 조건 없이 상태를 덮어쓸 수 있다.

- finalize path: `backend/internal/jobs/manager_runtime.go:167-187`
- recovery path: `backend/internal/jobs/manager_state_transitions.go:13-65`

또한 data directory lock은 같은 `DATA_DIR` 동시 사용을 막지만, shared Postgres를 사용하는 다중 인스턴스 실행을 DB lease로 막지는 않는다.

- `backend/internal/app/app.go:89-95`

영향:

- 중복 worker, 재시작, recovery, enqueue가 겹치면 final state나 WebSocket event가 뒤집힐 수 있다.
- Postgres 기반 scale-out 또는 accidental duplicate pod 환경에서 job ownership이 불명확하다.

권장 조치:

- `queued -> running -> terminal` 전이에 expected status 조건을 포함한다.
- update 결과 row count가 0이면 stale transition으로 처리한다.
- Postgres 사용 시 job lease/owner heartbeat 또는 advisory lock을 도입한다.
- multi-instance 동작을 지원하지 않을 계획이면 chart와 docs에서 replica=1 제약을 명시하고 admission/template guard를 둔다.

### P1. GitLab CI가 현재 compose 경로와 맞지 않는 파일명을 참조함

repository에는 `compose/test/e2e.yml`, `compose/remote/compose.yml`이 존재하지만 GitLab CI 일부 job은 루트의 과거 파일명을 참조한다.

- `docker-compose.e2e.yml`: `.gitlab-ci.yml:1050`, `.gitlab-ci.yml:1060`, `.gitlab-ci.yml:1062`
- `docker-compose.postgres.yml`: `.gitlab-ci.yml:1101`, `.gitlab-ci.yml:1579`
- Docker Hub publish는 release smoke job에 의존한다. `.gitlab-ci.yml:1355-1358`

change detection도 `docker-compose*.yml`은 보지만 `compose/**/*`를 직접 보지 않는다.

- `.gitlab-ci.yml:13-24`
- `.gitlab-ci.yml:383-395`
- `.gitlab-ci.yml:415-428`

영향:

- GitLab release/API smoke job이 파일 없음으로 실패할 수 있다.
- compose 변경이 필요한 audit/smoke pipeline을 트리거하지 않을 수 있다.

권장 조치:

- GitLab CI의 compose 참조를 현재 `compose/...` 경로로 정렬한다.
- workflow/rules/change paths에 `compose/**/*`를 추가한다.
- GitHub release gate와 GitLab release gate가 동일한 smoke 범위를 갖는지 비교 검사를 추가한다.

### P1. 문서/차트의 placeholder token 일부가 서버 검증을 통과할 수 있음

서버가 거부하는 placeholder token 목록은 제한적이다.

- `backend/internal/app/app.go:470-472`

반면 배포 문서와 예제에는 `replace-me`, `replace-with-a-long-random-token` 같은 값이 등장한다. 이 값들은 현재 서버 placeholder 목록에 없으면 실제 token으로 받아들여질 수 있다.

영향:

- 사용자가 예제 값을 그대로 둔 원격 배포를 만들 수 있다.
- remote 모드의 강한 인증 의도가 약해진다.

권장 조치:

- 서버 placeholder denylist에 문서 예제 token을 모두 추가한다.
- chart helper도 서버와 동일한 placeholder 목록을 사용하게 맞춘다.
- 문서 예시는 실제 값처럼 보이는 문자열 대신 command substitution 중심으로 작성한다.

### P1. 프론트엔드 storage key에 API token 원문이 포함됨

API token 자체는 session storage에 저장된다.

- `frontend/src/auth/AuthProvider.tsx:6-17`

하지만 profile/server scoped localStorage key를 만들 때 `apiToken` 원문을 scope 값으로 사용한다.

- `frontend/src/lib/profileScopedStorage.ts:23-40`
- localStorage write path: `frontend/src/lib/useLocalStorageState.ts:79-87`

영향:

- token 값이 localStorage key 이름에 남는다.
- logout 후 value를 지워도 localStorage key metadata에 token 흔적이 남을 수 있다.
- 브라우저 extension, crash report, support bundle에서 key 이름이 노출될 수 있다.

권장 조치:

- token 원문 대신 server fingerprint를 사용한다.
- fingerprint는 token 전체가 아니라 server identity와 token hash 일부를 조합하되, 재식별 위험을 낮춘다.
- logout 시 현재 token scope의 localStorage key cleanup을 수행한다.

### P2. React Query key 전략이 일부만 중앙화되어 있고 objects query는 positional contract에 의존함

중앙 query key factory는 server/profiles/buckets/jobs만 포함한다. `frontend/src/api/queryKeys.ts:1-19`

objects query는 inline array를 사용한다. `frontend/src/pages/objects/useObjectsPageQueries.ts:116-118`
cache relevance 판단은 positional slot에 의존한다. `frontend/src/pages/objects/objectsQueryCache.ts:72-82`

영향:

- query key shape 변경 시 invalidate/refetch 로직이 조용히 깨질 수 있다.
- 현재 `BucketsPage` 테스트 실패처럼 query/controller 경계 문제가 생겼을 때 원인 추적 비용이 커진다.

권장 조치:

- objects/upload/search/favorites까지 query key factory에 편입한다.
- query key parser/helper를 함께 제공해 positional index 접근을 제거한다.
- 변경 이벤트와 cache invalidation 테스트를 query key factory 기준으로 작성한다.

### P2. Objects page orchestration 표면이 지나치게 넓음

`ObjectsPageScreen`은 data/actions/preview/viewport/refresh를 모아 큰 prop bundle로 composition hook에 넘긴다.

- `frontend/src/pages/ObjectsPageScreen.tsx:19-166`
- `frontend/src/pages/objects/useObjectsPageData.ts:26-201`
- `frontend/src/pages/objects/useObjectsScreenComposition.tsx:8-190`

영향:

- 작은 기능 추가도 큰 hook과 prop bundle을 통과해야 한다.
- 변경 영향 범위가 넓어져 테스트가 brittle해질 수 있다.
- bundle budget을 유지하려는 수동 chunking 부담이 커진다.

권장 조치:

- list/tree/details/toolbar/overlays를 기능별 controller contract로 분할한다.
- 각 controller에 query key, mutation, local storage scope를 명시한다.
- 큰 page-level integration test와 작은 controller unit test의 책임을 분리한다.

### P2. DB migration이 수동 SQL과 ad hoc column 보강에 의존함

schema는 `migrate()` 안의 SQL 문자열 목록과 `ensure*Column` 호출로 관리된다.

- `backend/internal/db/db.go:105-116`
- `backend/internal/db/db.go:240-268`

영향:

- schema 변경 순서, idempotency, downgrade/rollback 의도가 명확하지 않다.
- `upload_objects` 누락 같은 entity ordering 문제가 반복될 수 있다.

권장 조치:

- 최소한 schema version table과 ordered migration registry를 둔다.
- portable backup entity order와 DB schema table 목록을 비교하는 테스트를 추가한다.
- SQLite/Postgres 양쪽에서 migration fixture를 운영한다.

### P2. GitHub와 GitLab의 security/release gate 범위가 다름

GitLab에는 Trivy/Gitleaks job이 존재한다.

- Trivy: `.gitlab-ci.yml:378-399`
- Gitleaks: `.gitlab-ci.yml:401-428`

GitHub의 license audit은 pull request에서는 label이 붙어야 실행된다.

- `.github/workflows/license-audit.yml:14-17`

또한 Go 버전이 서로 다르다.

- `backend/go.mod:3`은 Go `1.24.0`
- `Containerfile:16`은 Go `1.24.11`
- `.github/workflows/release-gate.yml:35`는 Go `1.25.x`

영향:

- 어느 CI를 기준으로 릴리스 품질을 판단해야 하는지 흐려진다.
- 특정 toolchain에서만 통과/실패하는 문제가 늦게 발견될 수 있다.

권장 조치:

- Go 버전을 `go.mod`, Containerfile, GitHub, GitLab에서 하나로 정렬한다.
- PR 기본 gate와 release gate의 필수 보안 검사를 명시적으로 문서화한다.
- GitHub와 GitLab 중 하나를 canonical release gate로 지정하거나 parity check를 둔다.

### P3. Kubernetes production hardening 기본값이 느슨함

chart values는 production hardening을 가능하게 하지만 기본값은 비어 있는 항목이 많다.

- `server.encryptionKey: ""`: `charts/s3desk/values.yaml:103-104`
- `networkPolicy.enabled: false`: `charts/s3desk/values.yaml:49-50`
- resource/security context 계열 기본값도 운영자가 직접 채워야 한다.

backup HMAC도 encryption key가 비어 있으면 생성되지 않는다.

- `backend/internal/api/handlers_server_backup.go:873-877`

영향:

- chart를 기본값 중심으로 설치하면 secret-at-rest, network boundary, resource isolation이 production 기대치보다 약하다.

권장 조치:

- production profile values 파일을 제공한다.
- `allowRemote=true`와 production ingress가 켜진 경우 encryption key, network policy, resource limit, security context를 warning이 아니라 template validation 또는 release checklist로 격상한다.

## 5. 권장 개선 로드맵

### 즉시 처리

- `ALLOWED_LOCAL_DIRS`를 remote Compose/Helm에 반영하고 문서를 수정한다.
- Helm probe Host header 또는 health endpoint host 검증 정책을 수정한다.
- `npm run lint` 실패 2건과 `BucketsPage` unit 실패 10건을 복구한다.
- portable archive에 `upload_objects`를 포함하고 round-trip 테스트를 추가한다.
- full backup에서 `*.rclone.conf`를 제외하거나 runtime secret temp dir을 분리한다.

### 단기 처리

- 만료 upload session cleanup이 multipart abort와 DB row 삭제를 수행하게 한다.
- job status update에 expected state 조건과 stale transition 처리를 넣는다.
- GitLab CI compose path와 `compose/**/*` change rule을 수정한다.
- placeholder token denylist와 chart helper를 문서 예제와 동기화한다.
- API token 원문을 localStorage key scope로 쓰지 않게 바꾼다.

### 중기 처리

- objects query key를 중앙 factory로 옮기고 parser/helper를 제공한다.
- Objects page controller를 list/tree/details/toolbar/overlays 단위로 분리한다.
- DB migration registry와 schema/entity consistency test를 도입한다.
- Go toolchain과 GitHub/GitLab release gate 범위를 정렬한다.
- production Helm profile과 security hardening checklist를 제공한다.

## 6. 결론

현재 코드베이스는 기능과 품질 장치가 이미 많은 편이지만, 운영자가 실제로 배포하고 백업/복구/업로드/job을 장기간 운용할 때 드러나는 경계 조건이 가장 취약하다. 특히 remote deploy, Helm probe, portable migration, full backup secret handling은 릴리스 전에 먼저 닫아야 하는 결함이다.

테스트 관점에서는 백엔드와 typecheck는 통과하지만 프론트엔드 lint/unit gate가 깨져 있으므로, 현재 상태를 "릴리스 가능"으로 보기 어렵다. 우선 P0 항목을 닫고 나서 P1의 상태 전이/cleanup/CI parity를 보강하면, 프로젝트의 실제 운영 신뢰도가 크게 올라갈 것으로 판단한다.
