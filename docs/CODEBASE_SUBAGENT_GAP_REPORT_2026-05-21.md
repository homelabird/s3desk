# S3Desk Sub-Agent Gap Report - 2026-05-21

대상: `/home/homelab/Downloads/project/s3desk`
기준: `main` branch 로컬 작업트리
작성 방식: 4개 전문가 sub-agent 감사와 로컬 구현/검증 결과 종합

## 1. 분석 범위

이번 감사는 다음 역할로 분리했다.

- Backend architecture, API, storage, backup/import
- Frontend UX, accessibility, state, performance
- CI, testing, release engineering
- Security, deployment, supply chain

Sub-agent는 코드 수정 없이 부족한 점을 식별했고, 개선은 로컬에서 재현 가능한 고우선순위 항목부터 적용했다.

## 2. 종합 판정

즉시 무인 원격 악용이 가능한 `P0` 코드 결함은 확인되지 않았다. 다만 GitHub repository 설정에서 `main` branch required status checks가 꺼져 있는 외부 설정 리스크가 확인됐다. 레포 코드만으로 강제할 수 없는 항목이지만, 릴리스 신뢰도 관점에서는 별도 GitHub 설정 변경이 필요하다.

이번에 코드로 닫은 핵심 항목은 다음이다.

- portable backup/import 누락 엔티티 `object_index_replacements` 포함
- rclone 기반 job type 전체에 API create/retry 사전검사 적용
- portable asset copy의 파일 descriptor 누수 가능성 제거
- legacy unsigned full/cache restore에 명시 경고 추가
- `g` navigation chord timeout 회귀 수정
- logout 시 React Query cache clear
- 브라우저 영향 backend 변경에 대한 `Frontend E2E` path filter 확장
- backend architecture, CODEOWNERS, code ownership 문서 추가

## 3. 주요 부족한 점

### P0. GitHub branch protection required checks 비활성화

`gh api repos/homelabird/s3desk/branches/main/protection` 확인 결과 `required_status_checks`가 `null`이다.

영향:

- release gate, required Playwright lane, license audit 실패가 merge를 막지 못할 수 있다.
- 문서와 workflow verifier가 전제하는 보호 정책이 GitHub 서버 설정에서는 보장되지 않는다.

권장 조치:

- GitHub branch protection 또는 ruleset에서 required check names를 실제 check-run 이름 기준으로 켠다.
- 코드 변경이 아니라 repository setting 변경이므로 이번 커밋 범위에서는 수정하지 않았다.

### P1. portable backup/import 엔티티 누락

`object_index_replacements`는 DB schema에 존재하지만 portable export/import table order와 payload 처리에서 빠져 있었다. object indexing 교체 작업 중 backup/import를 수행하면 staged replacement rows가 유실될 수 있었다.

이번 개선:

- `object_index_replacements`를 portable DB table list, entity order, export/import parser, replace delete/import flow에 추가했다.
- legacy bundle 호환을 위해 해당 엔티티가 없는 기존 portable bundle은 optional entity로 허용한다.
- archive entry와 legacy missing-entity 검증 테스트를 추가했다.

### P1. rclone job API preflight 범위 부족

기존 API preflight는 `transfer_*`만 검사해 `s3_zip_*`, `s3_delete_objects`, `s3_index_objects` 같은 rclone 실행 job type이 create/retry 단계에서 빠질 수 있었다.

이번 개선:

- `internal/jobs.RequiresRclone`을 추가해 manager dispatch와 API preflight가 같은 job type 목록을 쓰도록 했다.
- job type 회귀 테스트와 API 테스트 fixture를 정리했다.

### P1. frontend keyboard chord timeout 회귀

`useKeyboardShortcuts`의 `g` navigation chord timer가 effect-local 변수에 묶여 timeout 뒤에도 chord가 무기한 armed 상태로 남을 수 있었다.

이번 개선:

- `useRef` 기반 timer/pending state로 변경해 timeout과 cleanup을 안정화했다.
- fake timer 단위 테스트로 expiry와 정상 chord를 고정했다.

### P1. CI browser-facing path filter 공백

`Frontend E2E`의 `browser_facing` filter가 일부 backend package만 포함해 `models`, `bucketgov`, `config`, provider/client 계층 변경이 browser lane을 건너뛸 수 있었다.

이번 개선:

- `.github/workflows/frontend-e2e.yml`에서 `backend/internal/**`, `backend/go.mod`, `backend/go.sum`을 browser-facing 범위에 포함했다.
- workflow validator가 이 범위를 강제하도록 테스트를 추가했다.

### P1. security/deployment hardening 잔여

남은 리스크:

- remote API token strength가 코드로 강제되지 않는다.
- remote deployment에서 `ENCRYPTION_KEY` 누락 시 provider credential이 plaintext로 저장될 수 있다.
- rclone endpoint DNS rebinding/TOCTOU 리스크가 남아 있다.
- remote Compose hardening과 immutable supply-chain pinning이 더 필요하다.

권장 조치:

- remote mode에서 weak token과 missing encryption key를 fail-closed 또는 startup blocker로 처리한다.
- rclone endpoint는 실행 직전 재해석 검증, allowlist, 또는 guarded proxy 설계를 검토한다.
- Compose에는 read-only filesystem, dropped capabilities, no-new-privileges, healthcheck를 기본화한다.

### P2. performance/UX 잔여

남은 리스크:

- Objects grid와 mobile Jobs list가 large result set에서 DOM을 과도하게 늘릴 수 있다.
- page-level accessibility smoke가 아직 일부 화면에만 보강됐다.
- grid/sidebar visual drift는 design token 정리 여지가 있다.

이번 개선:

- Profiles, Buckets, Uploads, Jobs page-level desktop axe smoke를 추가했다.
- logout/token switch 시 query cache가 남지 않도록 clear 처리했다.

### P2. test/release lane 잔여

남은 리스크:

- release publish가 backend coverage/golangci lane에 직접 의존하지 않는다.
- GitHub Playwright의 다수 lane이 production bundle 대신 Vite dev server 기준으로 돈다.
- Go race lane과 live E2E dependency readiness gate가 더 필요하다.

권장 조치:

- release publish dependency에 backend coverage/golangci를 명시한다.
- 핵심 browser lane 중 하나는 production build preview 기준으로 고정한다.
- `go test -race` smoke와 live E2E readiness waiter를 CI에 추가한다.

### P2. maintainability/ownership

Backend boundary 문서와 CODEOWNERS가 없어 새 job/provider/API 변경의 리뷰 기준이 약했다.

이번 개선:

- `.github/CODEOWNERS` 추가
- `docs/BACKEND_ARCHITECTURE.md` 추가
- `docs/CODE_OWNERSHIP.md` 추가
- `docs/README.md`에 새 contributor-facing 문서 링크 추가

## 4. 이번 개선 파일

- `.github/CODEOWNERS`
- `.github/workflows/frontend-e2e.yml`
- `backend/internal/api/handlers_jobs*.go`
- `backend/internal/api/handlers_server_backup*.go`
- `backend/internal/api/handlers_server_portable*.go`
- `backend/internal/db/db.go`
- `backend/internal/jobs/manager_job_types*.go`
- `backend/internal/store/store_portable.go`
- `docs/BACKEND_ARCHITECTURE.md`
- `docs/CODE_OWNERSHIP.md`
- `docs/PORTABLE_BACKUP.md`
- `docs/README.md`
- `frontend/src/lib/useKeyboardShortcuts.ts`
- `frontend/src/lib/__tests__/useKeyboardShortcuts.test.tsx`
- `frontend/src/useFullAppShellState.ts`
- `frontend/tests/accessibility-overlays.spec.ts`
- `scripts/check_github_workflows.py`
- `scripts/check_github_workflows_test.py`

## 5. 검증 상태

현재까지 통과한 검증:

- `cd backend && go test ./internal/api -count=1`
- `cd backend && go test ./internal/jobs ./internal/api ./internal/store ./internal/db`
- `python3 scripts/check_github_workflows_test.py`
- `bash scripts/check_github_workflows.sh`
- `bash scripts/check_release_gate.sh`
- `npm --prefix frontend run test:unit -- src/components/__tests__/PageSection.test.tsx src/lib/__tests__/useKeyboardShortcuts.test.tsx`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `cd frontend && npx playwright test tests/accessibility-overlays.spec.ts --project=chromium --grep "Profiles page has no whole-page|Buckets page has no whole-page|Uploads page has no whole-page|Jobs page has no whole-page"`
- `git diff --check`

Playwright 최초 실행에서 Profiles locator strict-mode 오류와 Uploads/Jobs heading-order 위반을 확인했고, locator와 `PageSection` heading level을 함께 수정한 뒤 재실행해 통과했다.

## 6. 다음 작업 우선순위

1. GitHub branch protection/ruleset에서 required status checks를 켠다.
2. remote token strength와 `ENCRYPTION_KEY` startup blocker를 적용한다.
3. rclone endpoint DNS rebinding 방어 설계를 진행한다.
4. Objects grid와 mobile Jobs list virtualization을 별도 성능 작업으로 진행한다.
5. release publish gate, production Playwright lane, Go race lane을 CI 후속 작업으로 진행한다.
