# S3Desk Sub-Agent Gap Report - 2026-05-21

대상: `/home/homelab/Downloads/project/s3desk`
기준: `main` branch, `a653cd0` 이후 로컬 작업트리
작성 방식: 4개 전문가 sub-agent 감사와 로컬 재검증 결과 종합

## 1. 분석 범위

이번 감사는 다음 역할로 분리했다.

- Frontend UX / accessibility / responsive quality
- Backend API / storage / security / data safety
- CI / testing / release engineering
- Project structure / documentation / maintainability

Sub-agent는 코드 수정 없이 정적 분석과 일부 검증을 수행했고, 최종 개선은 로컬에서 재확인 가능한 좁은 범위부터 적용했다.

## 2. 종합 판정

즉시 무인 원격 악용이 가능한 `P0` 코드 결함은 이번 감사에서 확인되지 않았다. 다만 GitHub repository 설정에서 `main` branch required status checks가 꺼져 있다는 외부 설정 리스크가 확인됐다. 이는 레포 코드만으로 고칠 수 없지만, 릴리스 정책과 CI 신뢰도 측면에서는 가장 먼저 조치해야 한다.

코드베이스 내부에서 바로 개선한 항목은 세 가지다.

- 프론트엔드 데이터 테이블과 메뉴 separator의 접근성 semantic 보강
- GitHub Actions의 오래된 Node 20 기반 action ref 재도입 방지
- structured logging의 secret-bearing field/value 기본 redaction

## 3. 주요 부족한 점

### P0. GitHub branch protection required checks 비활성화

CI sub-agent가 `gh api repos/homelabird/s3desk/branches/main/protection/required_status_checks`를 확인한 결과 `Required status checks not enabled` 상태였다.

영향:

- `release-gate`, `Core Mock E2E`, `Mobile Responsive E2E (Required)`, `license-audit` 실패가 merge를 막지 못한다.
- 문서와 release verifier는 required check를 전제로 하지만 실제 GitHub 설정이 그 전제를 보장하지 않는다.

권장 조치:

- GitHub branch protection 또는 ruleset에서 exact check names를 required로 켠다.
- required set은 `release-gate`, `Core Mock E2E`, `Mobile Responsive E2E (Required)`, `license-audit`로 맞춘다.
- `Bundle Budget`은 현재 문서 정책대로 advisory로 유지한다.

### P1. rclone 외부 프로세스의 endpoint DNS rebinding 잔여 위험

Go HTTP client 경로는 guarded dialer를 쓰지만, `rclone`은 검증된 hostname을 config로 받아 별도 DNS resolve와 연결을 수행한다. 검증 직후 DNS가 loopback, link-local, metadata IP로 바뀌면 remote endpoint 차단 정책에 TOCTOU가 남을 수 있다.

권장 조치:

- remote mode에서 custom endpoint allowlist를 두거나 provider 트래픽을 서버 내부 guarded proxy로 통과시킨다.
- 최소 조치로 rclone 실행 직전 endpoint 재해석 결과를 재검증하고, DNS rebinding residual risk를 운영 문서에 명시한다.

### P1. non-Unix local path transfer pinning 부재

Unix 계열은 fd 기반 pinned path를 `rclone`에 넘기지만, Windows 등 non-Unix 빌드는 검증 후 raw path를 사용한다. junction, reparse point, rename swap에 대한 TOCTOU 리스크가 남는다.

권장 조치:

- Windows handle 기반 pinning을 구현한다.
- secure pinning이 없는 OS에서는 local path transfer를 fail-closed 처리하는 옵션을 둔다.
- reparse point 거부 회귀 테스트를 추가한다.

### P1. full/cache restore의 unsigned payload 허용

Portable v1 restore는 checksum을 요구하지만, full/cache backup restore는 `payloadSha256`이 있으면 검증하고 없으면 통과한다.

권장 조치:

- 신규 full/cache backup restore에서는 `payloadFileCount`, `payloadBytes`, `payloadSha256`을 필수화한다.
- legacy unsigned restore는 명시적인 위험 플래그 또는 별도 경고 뒤에만 허용한다.

### P1. 프론트엔드 accessibility coverage 공백

테이블 caption/scope, shortcut dialog overlay 패턴, 폼 오버레이 초기 포커스, 페이지 단위 axe coverage에서 개선 여지가 확인됐다.

이번에 처리한 부분:

- Profiles, global object search, Azure stored access policy, GCS IAM binding 테이블에 숨김 caption과 `scope="col"` 추가
- 공통 `MenuPopover`와 Objects 전용 menu divider에 `role="separator"` 및 `aria-orientation="horizontal"` 추가

남은 권장 조치:

- `/profiles`, `/buckets`, `/uploads`, `/jobs`, `/settings`에 desktop/mobile page-level axe smoke를 추가한다.
- `KeyboardShortcutGuide`를 공통 dialog/overlay 패턴으로 이관한다.
- 생성/편집 폼 오버레이는 첫 입력 또는 주요 컨트롤로 초기 포커스를 명시한다.

### P1. CI/release 정책과 실제 보호 장치의 간극

최근 workflow는 Node 24 기반 action major로 이동했지만, moving major tag와 `ubuntu-latest` runner를 쓰고 있다. 또한 기존 validator는 오래된 action ref 재도입을 막지 못했다.

이번에 처리한 부분:

- `scripts/check_github_workflows.py`에 deprecated action ref 검사 추가
- `scripts/check_github_workflows_test.py` 추가
- release gate가 새 workflow validator test를 실행하도록 연결
- `docs/RELEASE_GATE.md`와 `frontend/docs/MOBILE_RESPONSIVE_E2E.md`의 required check 이름을 실제 check-run name 기준으로 정리

남은 권장 조치:

- release-critical workflow는 full semver 또는 SHA pinning 정책을 검토한다.
- runner는 `ubuntu-24.04`처럼 고정하고 정기 bump PR로 관리한다.
- mock core E2E에서 live-only spec을 `@live` 또는 file ignore 정책으로 명시적으로 제외한다.

### P1. 문서/운영 참조와 과거 감사 스냅샷 혼재

`docs/`는 작게 유지하라는 정책이 있지만, 운영 문서와 dated audit snapshot이 함께 커지고 있다. 최신 판단 기준이 무엇인지 새 기여자가 빠르게 파악하기 어렵다.

권장 조치:

- `docs/`에는 운영, 릴리스, contributor-facing 최신 문서만 남긴다.
- dated audit/report는 `docs/archive/` 또는 `notes/archive/`로 이동한다.
- `docs/README.md`를 current, archive, generated evidence 섹션으로 재정리한다.

### P2. backend architecture와 code ownership 문서 부재

프론트엔드 state boundary 문서는 있지만, backend handler/service/store/jobs/provider 경계와 새 endpoint/provider 추가 절차를 설명하는 문서가 없다. CODEOWNERS도 없다.

권장 조치:

- `docs/BACKEND_ARCHITECTURE.md` 또는 `backend/README.md` 추가
- `.github/CODEOWNERS`와 `docs/CODE_OWNERSHIP.md` 추가
- release unit 기준으로 backend API, jobs, store, frontend pages, workflow, chart, release docs 소유 경계를 정리

### P2. structured logging 기본 redaction 부재

`rclone`/job log 일부는 별도 redaction을 적용하지만, structured logger field 자체는 secret-bearing key/value를 그대로 출력할 수 있었다.

이번에 처리한 부분:

- `logging.InfoFields`, `WarnFields`, `ErrorFields`, JSON logger, text logger, `WriteJSONLineStdout` 경로에서 field key/value와 message를 `redact` 정책으로 정리
- JSON/text/stdout helper 회귀 테스트 추가

## 4. 이번 개선 내역

수정 파일:

- `frontend/src/pages/profiles/ProfilesTable.tsx`
- `frontend/src/pages/objects/ObjectsGlobalSearchResults.tsx`
- `frontend/src/pages/buckets/policy/azure-structured.tsx`
- `frontend/src/pages/buckets/policy/gcs-structured.tsx`
- `frontend/src/components/MenuPopover.tsx`
- `frontend/src/pages/objects/ObjectsMenuPopover.tsx`
- `backend/internal/logging/logging.go`
- `backend/internal/logging/logging_test.go`
- `scripts/check_github_workflows.py`
- `scripts/check_github_workflows_test.py`
- `scripts/check_release_gate.sh`
- `docs/RELEASE_GATE.md`
- `frontend/docs/MOBILE_RESPONSIVE_E2E.md`

## 5. 로컬 검증

현재까지 통과한 검증:

- `python3 scripts/check_github_workflows_test.py`
- `bash scripts/check_github_workflows.sh`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `cd backend && go test ./internal/logging ./internal/redact ./internal/api ./internal/jobs ./internal/localpath`
- `bash scripts/check_release_gate.sh`
- `git diff --check`

## 6. 다음 작업 우선순위

1. GitHub branch protection/ruleset에서 required status checks를 실제로 켠다.
2. rclone endpoint DNS rebinding과 Windows local path pinning은 별도 보안 설계 작업으로 분리한다.
3. full/cache restore checksum 필수화와 legacy unsigned restore 정책을 정한다.
4. page-level axe smoke와 shortcut dialog 정리를 frontend accessibility follow-up으로 진행한다.
5. docs archive 정책, backend architecture 문서, CODEOWNERS를 유지보수성 follow-up으로 진행한다.
