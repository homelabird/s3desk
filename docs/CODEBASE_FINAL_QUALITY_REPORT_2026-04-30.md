# Codebase Final Quality Report - 2026-04-30

## 1. 범위

- 대상: `/home/homelab/Downloads/project/s3desk` 현재 로컬 작업트리
- 방식: 서브에이전트 3개 독립 감사 + 릴리스 차단 게이트 로컬 재확인
- 서브에이전트:
  - Darwin: 아키텍처, 유지보수성, 의존성 경계
  - Anscombe: UX, 접근성, 키보드, 반응형 품질
  - Noether: 빌드, 테스트, 릴리스 게이트, 번들, 보안
- 주의: 이 리포트는 dirty worktree 스냅샷 기준이다. clean tag 비교나 clean CI runner 결과가 아니다.

## 2. 최종 요약

프론트엔드 품질은 최근 순차 개선 이후 상당히 안정된 상태다. 로컬 기준으로 typecheck, lint, 전체 unit test, bundle budget, bundle report 검증, production npm audit, mocked Playwright smoke/core/mobile-responsive, overlay accessibility, visual regression 계열이 통과했다.

후속 작업으로 backend 릴리스 차단 게이트와 상위 frontend 접근성/구조 리스크 일부를 수정했다. 추가로 API client consumer contract를 concrete class에서 `APIClientShape` 중심으로 전환했다. `./scripts/check.sh full`도 로컬에서 openapi, release gate, workflow, helm, backend, frontend unit/build/smoke 단계까지 통과했다. 현재 코드베이스 전체 품질 판정은 여전히 **release-ready가 아니다**. 이유는 이제 아래 항목으로 좁혀졌다.

- 작업트리에 tracked/untracked 변경이 매우 많아 릴리스 범위를 신뢰하기 어렵다. 현재 release scope audit은 `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md`에 분리했다.
- dependency 갱신으로 생성된 `THIRD_PARTY_NOTICES.md`와 license snapshot 변경은 complete notice unit으로 확인됐지만, 실제 stage/commit 단계에서도 한 단위로 유지해야 한다.
- provider/reverse-proxy 관련 변경에 필요한 live smoke 증거가 아직 부족하다.
- `python3 scripts/check_clean_snapshot.py full`은 현재 non-ignored workspace snapshot 기준으로 통과했지만, 실제 release candidate staging 후에는 다시 실행해야 한다.

따라서 현재 상태는 “backend P0와 상위 frontend 구조/접근성 리스크 일부는 해결됐고 로컬 기능 게이트는 녹색이지만, 저장소 전체 릴리스는 보류”로 판단한다.

## 3. 최종 판정

**판정: Release Hold**

아래 조건을 만족하기 전에는 태그 생성, GitHub Release 생성, 최종 배포 후보 선언을 진행하면 안 된다.

1. intended/unintended 파일 범위 정리
2. dependency metadata, third-party notices, license snapshot 변경을 한 릴리스 단위로 유지
3. provider live validation 및 reverse-proxy smoke 증거 확보

## 4. 로컬 재확인 결과

| Gate | 결과 | 메모 |
|---|---:|---|
| `staticcheck ./...` in `backend/` | Pass | unused helper/fields 제거 및 upload helper 반환 순서 정리 후 통과. |
| `govulncheck ./...` in `backend/` | Pass | `golang.org/x/image`를 `v0.39.0`으로 업그레이드 후 reachable vulnerability 0개. |
| `go test ./...` in `backend/` | Pass | backend 전체 패키지 통과. |
| `go vet ./...` in `backend/` | Pass | backend vet 통과. |
| `gosec -quiet -exclude=G117,G702,G703,G704,G705 ./...` | Pass | backend security analysis 통과. |
| `./scripts/check.sh full` | Pass | evidence template gate hardening 이후 최신 작업트리에서 재실행. openapi, release gate, workflow/actionlint, helm, gofmt, backend vet/test/security with reachable vulnerabilities 0, bundle report, frontend openapi/geometry/lint/unit 239 files / 903 tests/build/browser smoke 2 tests, third-party notice reproducibility까지 통과. |
| `git diff --check` | Pass | 현재 diff 기준 whitespace/error marker 문제 없음. |
| Worktree status | Risk | strict file-level scope 기준 `tracked changes=495` including `deleted=18`, `untracked=365`, `total status entries=860`. |
| `python3 scripts/report_release_scope.py` | Pass | release scope inventory 생성. dependency notice unit은 `complete`, root artifact candidates는 0개, release unit candidates는 22개. `--unit`, `--format paths --null`, `--format stage-command`, `--format checklist`, `--format manifest`, `--format json`, `--untracked-files all`, `--fail-on-untracked-directories`, `--fail-on-other-unit`로 단위별 실제 파일 목록, staging command, JSON command fields, 검토 manifest 출력 가능. |
| `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all` | Pass | root-local evidence artifact ignore 정책, dependency/license scope complete 판정, untracked directory 파일 단위 검토 및 catch-all `other` 유닛 부재 강제까지 반영 후 strict release-scope check 통과. |
| release-scope stage-command dry-run | Pass | `--format json --untracked-files all`이 22개 release unit과 모든 `stage_command`를 출력. `dependency-notices`, `release-gate-ci-deploy`, `frontend-objects` stage-command와 핵심 unit path-list count를 spot-check. 실제 staging은 수행하지 않음. |
| release-scope manifest dry-run | Pass | `python3 scripts/report_release_scope.py --format manifest --untracked-files all`로 1108-line 전체 수동 검토 manifest를 생성했고, `dependency-notices`, `backend-api-provider-surface`, `frontend-objects` unit manifest를 spot-check. 실제 staging이나 파일 변경은 수행하지 않음. |
| `python3 scripts/report_release_scope_test.py` | Pass | release unit mapping, dependency notice unit, split dependency warnings, root artifact candidates, strict failure aggregation, checklist/manifest output, unit stage-command generation, JSON command fields, untracked directory file-level review guidance/strict failure: 12 tests. |
| `python3 scripts/check_release_scope_audit_test.py` | Pass | audit status count, untracked group table, release unit table, outside-git skip, and clean-worktree skip behavior: 6 tests. |
| `python3 scripts/check_release_readiness_test.py` | Pass | candidate readiness report composition, evidence blocker summaries, live env scope expansion, Markdown output, and blocked exit status behavior: 6 tests. |
| `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id rc1` | Blocked | 현재 diff가 provider-live 및 reverse-proxy evidence를 요구하지만 템플릿 외 실제 evidence 파일은 아직 없음. `rc1` 기준 provider targets와 reverse-proxy smoke target을 출력하며, evidence가 기록되기 전까지 release-ready가 아님. |
| provider live test command without env | Pass/Skipped | `go test ./internal/api -run '^(TestLiveValidationAwsS3|TestLiveValidationGcpGcs|TestLiveValidationAzureBlob|TestLiveValidationOciObjectStorage|TestLiveValidationMinioS3Compatible|TestLiveValidationCephS3Compatible)$' -count=1 -v`는 로컬 provider env가 없어 6개 live tests를 모두 skip. release evidence는 아님. |
| release-evidence JSON checklist | Pass | `python3 scripts/check_release_evidence.py --format json --candidate-id rc1`이 2개 unsatisfied requirement, provider evidence targets 6개, reverse-proxy target 1개, metadata/status expectations, final gate commands를 구조화해 출력. |
| release-evidence operator checklist alignment | Pass | `python3 scripts/check_release_evidence.py --format checklist --require-candidate-id --candidate-id rc1` 출력과 `LIVE_EVIDENCE_CHECKLIST_2026-05-02.md`의 provider targets, reverse-proxy target, `rc1` smoke command, strict final gate command가 일치. |
| `python3 scripts/check_live_evidence_env_test.py` | Pass | default/all scope expansion, reverse-proxy URL alternative, missing required env, secret value redaction/status-only, blank/placeholder env rejection, blank env-template cases: 7 tests. |
| `python3 scripts/check_release_evidence_test.py` | Pass | provider/reverse-proxy trigger detection, provider scope suggestion, per-scope provider evidence coverage, indented Markdown evidence field parsing, provider/reverse-proxy pass-outcome semantics, template ignore, missing evidence, satisfied evidence, provider identity/metadata rejection including provider-native confirmation metadata, reverse-proxy smoke metadata/status/signed-root rejection, expected-status-reference-only rejection, candidate identifier rejection/mismatch, placeholder evidence filename rejection, secret/signed URL evidence rejection including authorization headers, cookie tokens, and access key ID assignments, final candidate-id enforcement, structured remediation/final-gate JSON fields, rejected-evidence ready blocking, remediation output, unrelated change, checklist/default output command and required metadata cases: 29 tests. |
| `python3 scripts/check_release_evidence_checklist_test.py` | Pass | README current checklist discovery, explicit checklist override, latest-checklist fallback, provider/reverse-proxy target matching, and non-git snapshot skip behavior: 6 tests. |
| `bash -n scripts/deploy_smoke.sh` | Pass | 최신 재실행 기준 reverse-proxy smoke evidence actual checks와 route-level expected status reference 출력 shell syntax 통과. |
| `python3 scripts/check_clean_snapshot.py fast` | Pass | 2026-05-02 release-readiness preflight 추가 전 마지막 fast 재실행에서 1817 non-ignored tracked/untracked paths를 `.git` 없는 임시 snapshot으로 복사한 뒤 openapi, release gate, workflow fallback validator, helm, gofmt, backend tests, bundle report, frontend openapi/geometry/lint/unit 239 files / 903 tests/build, third-party notice reproducibility까지 통과. |
| `python3 scripts/check_clean_snapshot.py full` | Pass | 2026-05-02 browser lane 재검증 리포트 반영 이후 1819 non-ignored tracked/untracked paths를 `.git` 없는 임시 snapshot으로 복사한 뒤 release gate, workflow fallback validator, helm, gofmt, backend tests/security analysis with reachable vulnerabilities 0, bundle report, frontend openapi/geometry/lint/unit 239 files / 903 tests in 131.57s/build/browser smoke 2 tests, third-party notice reproducibility까지 통과. |
| `npm --prefix frontend run typecheck` | Pass | 최근 로컬 검증 통과. |
| `npm --prefix frontend run lint` | Pass | CSS token check 포함. |
| `npm --prefix frontend run check:import-cycles` | Pass | `frontend/src` value import/export graph: 550 files, 1132 runtime edges, cycles 0개. |
| `npm --prefix frontend run test:unit` | Pass | 최신 작업트리 full gate에서 239 files / 903 tests, 97.75s 통과. 최신 clean snapshot fast에서도 239 files / 903 tests, 98.53s로 통과했고, 최신 clean snapshot full에서도 239 files / 903 tests, 97.95s로 통과. |
| `APIClientShape` contract focused unit tests | Pass | `useFullAppController`, `ServerSettingsSection`, `SidebarBackupAction`, `useObjectsTransferModals`, transfer queue/job event tests: 6 files / 34 tests, plus `pageApiScopes` type contract 1 file / 5 tests. |
| `npm --prefix frontend run bundle:budget` | Pass | 최신 재실행 기준 analyze build 통과, budget review candidates/action hints/warnings 없음. |
| `npm --prefix frontend run check:bundle-report` | Pass | 최신 재실행 기준 bundle report contract 2 tests 통과. action-hint report와 missing budgeted chunk warning/failure 회귀를 검증. |
| `npm --prefix frontend audit --omit=dev` | Pass | 최신 재실행 기준 production npm 취약점 0개. |
| `npm --prefix frontend run test:e2e:smoke` | Pass | 최근 mocked Playwright smoke 2 tests 통과. |
| `npm --prefix frontend run test:e2e:core` | Pass | 2026-05-02 순차 재실행 기준 mocked core 124 passed, 15 skipped. 최초 병렬 시도는 Playwright webServer port 18080 경합으로 재시도했다. |
| `npm --prefix frontend run test:e2e:mobile-responsive` | Pass | 2026-05-02 최신 재실행 기준 mobile-responsive 66 passed. |
| `tests/accessibility-overlays.spec.ts` | Pass | 서브에이전트 감사에서 Chromium axe 27 tests 통과. |
| `npm --prefix frontend run test:e2e:visual` | Pass | 2026-05-02 순차 재실행 기준 dedicated visual regression lane Chromium 18 passed. 최초 병렬 시도는 Playwright webServer port 18080 경합으로 재시도했다. |
| Dark theme axe/visual focused lane | Pass | `tests/dark-theme-accessibility.spec.ts`, `tests/dark-theme-visual-regression.spec.ts`: Chromium 5 tests 통과. |
| `bash ./scripts/check_release_gate.sh` | Pass | release scope/scope-audit/live evidence env/evidence/checklist-sync/readiness unittest 66개, current release-scope audit sync, current `rc1` live-evidence checklist sync, release metadata/doc gate 통과. signed proxy URL root mismatch, expected-status-only evidence rejection, JSON `check_status_expectations`/`check_result_expectations`, provider evidence template pass/placeholder guidance, reverse-proxy evidence template HTTP 200/201 guidance, release-readiness blocker summary command/scope warning 문서 고정도 gate에 포함됨. |
| `bash ./scripts/check_github_workflows.sh` | Pass | 최신 재실행 기준 `actionlint` 경로로 3 workflows 통과. |
| `bash ./scripts/check_helm_chart.sh` | Pass | 최신 재실행 기준 Helm chart lint 3 variants 통과. 단, 참조 values 파일 중 하나는 현재 untracked 상태. |

## 5. 릴리스 차단 이슈

### Resolved: `govulncheck` reachable 취약점

- 조치:
  - `backend/go.mod`의 `golang.org/x/image`를 `v0.30.0`에서 `v0.39.0`으로 업그레이드했다.
  - `go mod tidy`로 `go.sum`을 정리했고, 관련 indirect `golang.org/x/sync`, `golang.org/x/text`도 함께 갱신되었다.
  - third-party notice generation 결과 `golang.org/x/mod`, `golang.org/x/tools`, `yaml` license snapshot도 현재 dependency graph에 맞게 갱신 대상으로 드러났다.
- 검증:
  - `govulncheck ./...` 통과.
  - 결과: reachable vulnerability 0개.

### Resolved: `staticcheck` 실패

- 조치:
  - unused `governanceRequestContext`와 unused `uploadWriteError`를 제거했다.
  - portable import test stub의 `importCounts`, `importErr`가 실제 반환값으로 쓰이도록 정리했다.
  - upload commit/presign/session/multipart helper 반환 순서를 `error`가 마지막에 오도록 정리했다.
- 검증:
  - `staticcheck ./...` 통과.
  - `go test ./...`, `go vet ./...`, `gosec`도 통과.

### P0: 작업트리 범위가 릴리스 감사에 부적합

- 증거:
  - 현재 상태: strict file-level scope 기준 `tracked changes=495` including `deleted=18`, `untracked=365`, `total status entries=860`
  - 반복 가능한 범위 점검 도구: `python3 scripts/report_release_scope.py`
  - `scripts/report_release_scope_test.py`를 추가하고 `scripts/check_release_gate.sh`에 연결해 release unit mapping, dependency notice unit, root artifact candidate, strict failure aggregation, staging checklist/manifest output, unit stage-command generation, JSON command fields, untracked directory file-level review guidance/strict failure 회귀를 자동 검증한다.
  - `scripts/check_release_scope_audit.py`와 `scripts/check_release_scope_audit_test.py`를 추가하고 `scripts/check_release_gate.sh`에 연결해 `RELEASE_SCOPE_AUDIT`의 current status snapshot, untracked group table, release unit candidate table이 실제 `report_release_scope.py --format json --untracked-files all` 결과와 동기화되어 있는지 자동 검증한다.
  - `scripts/report_release_scope.py --fail-on-untracked-directories`는 untracked snapshot/baseline 디렉터리가 접힌 상태로 남으면 실패하며, `--fail-on-other-unit`은 catch-all `other` 유닛이 남으면 실패한다. `--untracked-files all`을 함께 사용하면 파일 단위 manifest/strict review가 가능하다.
  - release unit candidate 22개를 출력하므로 feature 단위 staging/review 기준으로 사용할 수 있다.
  - root-local screenshot/exploratory Playwright note patterns are ignored; intentional evidence should live under `docs/release/evidence/`.
  - root local/generated directories인 `.codex`, `.playwright-mcp/`, `node_modules/`, `test-results/`, `playwright-report/`는 `.gitignore`에 추가했다.
  - release scope audit: `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md`.
  - `docs/RELEASE_GATE.md`는 릴리스 준비 조건으로 clean worktree를 요구한다.
  - `scripts/check_helm_chart.sh`가 참조하는 `charts/s3desk/values-production.yaml`이 현재 untracked 상태로 보고되었다.
- 영향:
  - 로컬에서는 통과하지만 CI 또는 태그에는 포함되지 않는 파일이 생길 수 있다.
  - 최종 릴리스 diff의 의미가 불명확해진다.
- 필요한 조치:
  - untracked 파일을 source/test/docs, generated artifact, disposable output으로 분류한다.
  - 필요한 파일은 stage/commit하고, 불필요한 파일은 제거하거나 `.gitignore` 정책에 맞춘다.
  - staged release candidate가 바뀌면 clean snapshot 또는 clean CI runner에서 release gate를 다시 실행한다.

### Resolved: third-party notices/license snapshot 릴리스 범위 완전성

- 증거:
  - `./scripts/check.sh full`은 third-party notice 재현성 검사까지 통과했다.
  - `scripts/check.sh`의 third-party 검사 방식은 HEAD 기준 diff가 아니라 generator 실행 전/후의 `THIRD_PARTY_NOTICES.md`와 `third_party/licenses/` file tree hash 비교로 보강했다.
  - `python3 scripts/report_release_scope.py`는 dependency notice unit을 `complete`로 판정한다.
  - `THIRD_PARTY_NOTICES.md`는 `golang.org/x/image@v0.39.0`, `golang.org/x/mod@v0.34.0`, `golang.org/x/sync@v0.20.0`, `golang.org/x/text@v0.36.0`, `golang.org/x/tools@v0.43.0`, `yaml@2.8.3`로 갱신되었다.
  - old license snapshot은 삭제되고 같은 dependency의 새 버전 license snapshot이 untracked로 생성되었다.
  - `python3 scripts/generate_third_party_notices.py` 재실행은 성공했고 현재 snapshot set은 dependency graph 기준으로 재생성 가능한 상태다.
- 영향:
  - dependency 보안 수정, generated notice 재현성, release-scope 완전성 판정은 해결됐다.
  - 실제 commit/stage 단계에서는 이 set을 계속 한 단위로 유지해야 한다.
- 필요한 조치:
  - `THIRD_PARTY_NOTICES.md` 변경과 `third_party/licenses/**` 삭제/추가 파일을 dependency metadata와 같은 릴리스 범위에 포함한다.
  - `frontend/package.json`, `frontend/package-lock.json`, `backend/go.mod`, `backend/go.sum` dependency 변경과 notice 변경을 한 세트로 검토한다.
  - 정리 후 clean checkout에서 `./scripts/check.sh full`을 다시 실행한다.

### P0: provider/reverse-proxy live evidence 부족

- 증거:
  - 현재 diff는 bucket governance, realtime, `download_proxy`, middleware, remote compose/chart, allowed-host/proxy 계열을 건드린다.
  - `docs/RELEASE_GATE.md`는 provider-facing 변경과 WS/SSE auth, download proxy, `ALLOWED_HOSTS` 변경에 대해 live validation 및 reverse-proxy smoke를 요구한다.
  - `scripts/deploy_smoke.sh`는 `DEPLOY_SMOKE_EVIDENCE_FILE` 지정 시 reverse-proxy smoke Markdown evidence를 남기며 actual `## Checks`와 route-level `## Expected Statuses` reference를 함께 출력한다.
  - `docs/release/evidence/`에 provider live validation 및 reverse-proxy smoke evidence 템플릿을 추가했고, reverse-proxy 템플릿과 operator checklist는 route-level expected statuses를 명시한다.
  - `scripts/check_live_evidence_env.py`를 추가해 live smoke 실행 전에 필수 환경변수 누락 여부를 비밀값 없이 확인할 수 있다.
  - `scripts/check_release_evidence.py`는 현재 diff가 provider-live 및 reverse-proxy evidence를 요구하고, 실제 evidence 파일이 아직 없어 `blocked`로 보고한다. 기본/strict Markdown과 `--format checklist`는 현재 변경 기준의 suggested provider scopes, missing provider scopes, preflight/env-template, provider live test, evidence target 명령, reverse-proxy route-level expected statuses, non-status check expectations를 출력하며, `--format json`은 `preflight_command`, `env_template_command`, `evidence_targets`/`evidence_target`, `required_metadata`, `required_metadata_fields`, reverse-proxy `required_check_fields`/`check_status_expectations`/`check_result_expectations`, provider test 또는 reverse-proxy smoke command, `final_gate_commands`를 구조화해 제공한다. 또한 `--candidate-id <tag-or-sha>`가 주어지면 `S3Desk commit SHA or release tag`가 해당 후보와 정확히 일치해야 하고 remediation evidence target 및 reverse-proxy smoke command도 해당 후보명을 사용한다. `Provider name`이 없거나 지원 provider scope로 해석되지 않는 provider evidence, provider `Bucket or container name`/`Profile identifier`/`Exact feature tested`/`Command or manual workflow used`/`Provider-native console or CLI confirmation on success`가 없거나 placeholder인 evidence, reverse-proxy smoke metadata/check result가 빠졌거나 기대 HTTP status와 다른 evidence, signed proxy URL root가 `Expected external base URL`과 맞지 않는 evidence, `## Checks` 실제 결과 없이 `## Expected Statuses` 예시만 남긴 reverse-proxy evidence, `S3Desk commit SHA or release tag`가 비어 있거나 placeholder/mismatch인 evidence, placeholder filename evidence, API token, authorization header, cookie token, provider credential assignment, access key identifier or assignment, account key, service account JSON, private key, signed URL signature가 의심되는 evidence 파일은 release evidence로 인정하지 않고, matching pass evidence가 있어도 rejected evidence가 남아 있으면 전체 release readiness를 blocked로 둔다.
  - `docs/release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-04-30.md`를 추가해 현재 release-candidate workspace의 provider/reverse-proxy evidence target, preflight, env-template, final gate 명령을 operator checklist로 고정했다.
  - `docs/release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-02.md`에는 현재 `rc1` 후보 기준 provider evidence target, reverse-proxy smoke target, smoke command, final evidence gate command를 구체적으로 기록해 `<tag-or-sha>` 수동 치환 없이 운영자가 그대로 실행할 수 있게 했다.
  - `scripts/check_live_evidence_env_test.py`를 추가하고 `scripts/check_release_gate.sh`에 연결해 scope expansion, any-of requirement, missing env, secret redaction/status-only, blank/placeholder env rejection, blank env-template 회귀를 release gate에서 자동 검증한다.
  - `scripts/check_release_evidence_test.py`를 추가하고 `scripts/check_release_gate.sh`에 연결해 trigger/evidence 판정, provider scope suggestion, per-scope provider evidence coverage, support checklist ignore, provider/reverse-proxy pass-outcome semantics, provider identity/metadata/provider-native confirmation rejection, reverse-proxy smoke metadata/status/signed-root rejection, expected-status-reference-only rejection, candidate identifier rejection/mismatch, candidate-specific remediation targets, placeholder evidence filename rejection, secret/signed URL evidence rejection, structured remediation/final-gate/check-status/check-result JSON fields, rejected-evidence ready blocking, remediation output, provider/reverse-proxy checklist/default output command, route-level expected status, non-status expectation 및 required metadata 회귀를 release gate에서 자동 검증한다.
  - `scripts/check_release_evidence_checklist.py`와 `scripts/check_release_evidence_checklist_test.py`를 추가하고 `scripts/check_release_gate.sh`에 연결해 README가 가리키는 current `rc1` operator checklist가 `check_release_evidence.py --format json`의 provider evidence targets, reverse-proxy target/smoke command, expected reverse-proxy outcomes, final gate commands와 동기화되어 있는지 자동 검증한다.
  - `scripts/check_release_readiness.py`와 `scripts/check_release_readiness_test.py`를 추가하고 `scripts/check_release_gate.sh`에 테스트를 연결해 release scope/evidence/live-env blocker를 후보 ID 기준으로 한 번에 요약할 수 있게 했다. 실제 readiness 명령은 provider/reverse-proxy evidence가 없으면 실패하므로 full gate나 browser evidence를 대체하지 않는다.
  - 현재 세션에는 `DEPLOY_BASE_URL`, `DEPLOY_API_TOKEN`, `DEPLOY_PROFILE_ID`, `DEPLOY_SMOKE_BUCKET`, `DEPLOY_SMOKE_OBJECT_KEY`와 `S3DESK_LIVE_*` provider 변수들이 설정되어 있지 않아 live smoke를 실행하지 않았다.
- 영향:
  - mocked Playwright 통과만으로는 실제 provider/proxy 동작을 보장할 수 없다.
- 필요한 조치:
  - 영향을 받는 provider별 live validation을 실행한다.
  - 실행 전 `python3 scripts/check_live_evidence_env.py --scope <provider>`와 `python3 scripts/check_live_evidence_env.py --scope reverse-proxy`로 환경변수 준비 상태를 확인한다.
  - 현재 `rc1` 후보는 `docs/release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-02.md`의 concrete target/command를 따른다.
  - WS/SSE auth, download proxy, allowed-host 동작에 대한 reverse-proxy smoke를 `DEPLOY_RELEASE_CANDIDATE=<tag-or-sha> DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md bash ./scripts/deploy_smoke.sh`로 실행한다.
  - evidence 파일을 추가한 뒤 `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>`를 통과시킨다.
  - 결과를 release readiness 증거에 남긴다.

## 6. 아키텍처 및 유지보수성 이슈

### Resolved: Objects lazy registry 순환 의존

- 조치:
  - `ObjectsPageHeader`가 사용하는 toolbar lazy entry를 `objectsToolbarLazy.ts`로 분리했다.
  - `ObjectsPageOverlays`가 사용하는 modal/drawer lazy entry를 `objectsOverlayLazy.ts`로 분리했다.
  - `objectsPageLazy.ts -> Header/Overlays -> objectsPageLazy.ts` runtime cycle을 제거했다.
- 회귀 방지:
  - `frontend/scripts/check-import-cycles.mjs`를 추가했다.
  - `npm run lint`가 CSS token guard 뒤에 `npm run check:import-cycles`를 실행하도록 연결했다.
  - `docs/TESTING.md`에 focused import graph check 사용법을 추가했다.
- 검증:
  - `npm --prefix frontend run check:import-cycles` 통과, 549 files / 1132 runtime edges / cycles 0개.
  - `npm --prefix frontend run lint` 통과.
  - `npm --prefix frontend run typecheck` 통과.

### Resolved: pre-auth/light boundary 불명확

- 조치:
  - `/setup` route를 `LightApp` lazy boundary에 연결했다.
  - root route는 현재 server-scoped active profile이 있으면 `/objects`, 없으면 `/setup`으로 이동한다.
  - `/profiles?create=1`, 직접 dashboard URL, unknown URL은 기존 `FullApp` shell 경로를 유지해 full profile workflow와 충돌하지 않게 했다.
- 검증:
  - `npm --prefix frontend run typecheck` 통과.
  - `npm --prefix frontend run test:unit -- src/__tests__/App.routing.test.tsx src/__tests__/LightApp.auth.test.tsx` 통과, 14 tests.
  - `npm --prefix frontend run lint` 통과.
  - `npm --prefix frontend run bundle:budget` 통과. `LightApp`은 별도 lazy chunk로 생성됨, gzip 4.72 kB.
  - `npm --prefix frontend run test:e2e -- tests/webview-routing.spec.ts --project=chromium` 통과, 3 tests.

### Resolved: backup/restore drawer shell 초기 번들 결합

- 조치:
  - `SidebarBackupAction.tsx`를 trigger와 lazy fallback만 소유하는 얇은 shell component로 줄였다.
  - backup/restore 섹션, staged restore inventory, export/restore/import 상태 훅을 `SidebarBackupDrawer.tsx`로 분리했다.
  - backup capability subtitle 계산은 순수 helper `backupCapabilitySummary.ts`로 분리해 trigger가 drawer body를 import하지 않아도 동일한 문구를 유지한다.
- 검증:
  - `npm --prefix frontend run typecheck` 통과.
  - `npm --prefix frontend run test:unit -- src/components/__tests__/SidebarBackupAction.test.tsx` 통과, 13 tests.
  - `npm --prefix frontend run lint` 통과.
  - `npm --prefix frontend run bundle:budget` 통과. `SidebarBackupDrawer`는 별도 lazy chunk로 생성됨, gzip 6.20 kB.

### Resolved: profile/meta/capability ownership 중복

- 조치:
  - `frontend/src/lib/profileCapabilityContext.ts`를 추가해 selected profile, provider capability matrix, bucket/object/upload support, disabled reason 계산을 한 contract로 묶었다.
  - `useObjectsPageQueries`, `useBucketsPageQueriesState`, `useJobsPageQueries`, `useUploadsPageQueriesState`가 동일 selector를 소비하도록 바꿨다.
  - `useFullAppProfileState`의 `uploadCapabilityByProfileId` 계산도 같은 helper를 사용하도록 정리했다.
  - bucket/object capability가 확정되기 전에는 Buckets/Uploads/Jobs/Objects의 bucket list query를 시작하지 않도록 맞췄고, object CRUD가 비활성인 Objects profile에서는 object list와 favorites query도 시작하지 않도록 했다.
  - object CRUD가 비활성인 Objects profile에서는 stale UI event가 favorites mutation을 직접 호출하지 않도록 `useObjectsFavorites` toggle을 no-op으로 방어하고, list/grid favorite buttons도 capability 기준으로 disabled 처리했다.
- 검증:
  - `npm --prefix frontend run typecheck` 통과.
  - `npm --prefix frontend run lint -- --max-warnings=0` 통과. import-cycle guard: 550 files / 1132 runtime edges / cycles 0개.
  - `npm --prefix frontend run test:unit -- src/lib/__tests__/profileCapabilityContext.test.ts src/pages/buckets/__tests__/useBucketsPageQueriesState.test.tsx src/pages/jobs/__tests__/useJobsPageQueries.test.tsx src/pages/uploads/__tests__/useUploadsPageQueriesState.test.tsx src/pages/objects/__tests__/useObjectsPageQueries.test.ts` 통과, 5 files / 15 tests.
  - `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsFavorites.test.tsx src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx src/pages/objects/__tests__/useObjectsScreenListInteractions.test.tsx` 통과, 3 files / 7 tests.

### Resolved: API client contract가 concrete class에 묶임

- 조치:
  - `api/client.ts`에서 `APIClientShape`를 type re-export해 기존 import 경로를 유지하면서 concrete class 의존을 줄였다.
  - `useAPIClient` context와 반환 타입을 concrete `APIClient`에서 `APIClientShape`로 전환했다.
  - shell, settings, jobs, objects, buckets, uploads, transfers 계열 page hooks와 component prop contract의 `api` 타입을 `APIClientShape`로 정리했다.
  - `createMockApiClient`가 concrete class 대신 `APIClientShape`를 반환하도록 바꾸고, 불필요한 `unknown` 경유 cast를 제거했다.
  - `frontend/src/lib/pageApiScopes.ts`를 추가해 Objects/Buckets/Jobs/Uploads query hook의 API contract를 실제 사용하는 domain method로 좁혔다.
  - `useObjectsFavorites`는 objects favorites method만 요구하고, page query hook들은 `getMeta`, `listProfiles`, `listBuckets`, page-specific list method만 요구하도록 세분화했다.
  - `frontend/src/lib/__tests__/pageApiScopes.test.ts`를 추가해 ProfileCapability/BucketList/ObjectsFavorites/ObjectsPage/JobsPage scope가 허용한 domain root와 method만 노출하는지 타입 계약으로 고정했다.
- 검증:
  - `npm --prefix frontend run typecheck` 통과.
  - `npm --prefix frontend run lint -- --max-warnings=0` 통과.
  - `npm --prefix frontend run test:unit -- src/__tests__/useFullAppController.test.tsx src/pages/settings/__tests__/ServerSettingsSection.test.tsx src/components/__tests__/SidebarBackupAction.test.tsx src/pages/objects/__tests__/useObjectsTransferModals.test.tsx src/components/transfers/__tests__/useTransfersDownloadQueue.test.tsx src/components/transfers/__tests__/useTransfersUploadJobEvents.test.tsx` 통과, 6 files / 34 tests.
  - `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsFavorites.test.tsx src/pages/objects/__tests__/useObjectsPageQueries.test.ts src/pages/buckets/__tests__/useBucketsPageQueriesState.test.tsx src/pages/jobs/__tests__/useJobsPageQueries.test.tsx src/pages/uploads/__tests__/useUploadsPageQueriesState.test.tsx` 통과, 5 files / 15 tests.
  - `npm --prefix frontend run test:unit -- src/lib/__tests__/pageApiScopes.test.ts` 통과, 1 file / 5 tests.
  - `npm --prefix frontend run bundle:budget` 통과.

## 7. UX, 접근성, 반응형 이슈

### Resolved: Objects command palette 선택 의미론 부족

- 조치:
  - command input에 `role="combobox"`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete`, `aria-expanded`를 추가했다.
  - 결과 컨테이너는 `role="listbox"`를 사용하고, 각 명령은 `role="option"`, `aria-selected`, `aria-disabled`를 노출한다.
  - disabled 명령은 pointer activation으로 실행되지 않도록 막았다.
- 검증:
  - `ObjectsCommandPaletteModal.test.tsx`를 추가해 active option 관계와 disabled click 방지를 고정했다.

### Resolved: Keyboard shortcut guide가 shared overlay stack 밖에 있음

- 조치:
  - `KeyboardShortcutGuide`를 `useOverlayLayer`에 등록해 Escape, focus trap, body scroll lock을 공유 overlay stack에서 처리하도록 했다.
  - guide z-index를 dialog보다 높은 계층으로 올렸다.
  - 열린 overlay layer가 있고 guide가 아직 열려 있지 않으면 `?` 전역 단축키가 guide를 새로 열지 않도록 gate했다.
- 검증:
  - `useKeyboardShortcuts.test.tsx`에 existing overlay layer 위에서 guide가 열리지 않는 회귀 테스트를 추가했다.

### Resolved: `SimpleTree` tree semantics mismatch

- 조치:
  - 실제 동작과 맞지 않던 `role="tree"`, `role="treeitem"`, `role="group"`을 제거했다.
  - 확장 제어는 `aria-expanded`가 있는 버튼으로 유지하고, 선택된 label 버튼은 `aria-current`를 노출하도록 했다.
- 검증:
  - `SimpleTree.test.tsx`를 갱신했고, `LocalPathBrowseModal` 및 `ObjectsTreePanel` 관련 단위 테스트도 통과했다.

### Resolved: 일부 모바일 touch target이 작음

- 조치:
  - Objects 모바일 row action, selection bar, sort button 최소 높이/너비를 올렸다.
  - image viewer 모바일 toolbar button 최소 높이를 `40px`로 올렸다.
- 검증:
  - `npm --prefix frontend run lint`, `check:css-tokens`, `check:e2e:geometry`, `bundle:budget` 통과.

### Resolved: Popover Tab 흐름 정책/검증 부족

- 조치:
  - `PopoverSurface.tsx`가 panel 내부 `Tab` 입력을 받으면 popover를 닫고 overlay focus restore 경로로 trigger에 포커스를 돌리도록 했다.
  - `MenuPopover.test.tsx`에 Tab close, focus restoration, `onOpenChange` close source 회귀 테스트를 추가했다.
- 검증:
  - `npm --prefix frontend run typecheck` 통과.
  - `npm --prefix frontend run test:unit -- src/components/__tests__/MenuPopover.test.tsx src/components/__tests__/PopoverSurface.test.tsx` 통과, 14 tests.

### Resolved: dark theme axe/visual coverage 부족

- 조치:
  - `tests/dark-theme-accessibility.spec.ts`를 추가해 dark mode에서 Objects app chrome/navigation/global search drawer, mobile bucket governance sheet, mobile settings drawer, transfers drawer를 axe로 검사한다.
  - `tests/dark-theme-visual-regression.spec.ts`를 추가해 Objects global search drawer dark-mode screenshot baseline을 고정했다.
  - dark-mode axe 실행 중 발견된 AntD primary button contrast 문제를 수정했다. dark theme의 AntD primary token을 `#1765cc` 계열로 낮춰 white button text 대비를 WCAG AA 이상으로 맞췄고, link/text용 custom primary token은 밝은 값을 유지했다.
  - `docs/TESTING.md`에 dark-theme focused Playwright command와 리뷰 기준을 추가했다.
- 검증:
  - `npm --prefix frontend run test:e2e -- tests/dark-theme-accessibility.spec.ts tests/dark-theme-visual-regression.spec.ts --project=chromium --update-snapshots` 통과, 5 tests.
  - `npm --prefix frontend run test:e2e -- tests/dark-theme-accessibility.spec.ts tests/dark-theme-visual-regression.spec.ts --project=chromium` 통과, 5 tests.
  - `npm --prefix frontend run lint` 통과.
  - `npm --prefix frontend run typecheck` 통과.
  - `npm --prefix frontend run check:e2e:geometry` 통과.

## 8. 빌드, 번들, 테스트 이슈

### Medium: bundle headroom이 좁음

현재 `frontend/dist/bundle-report.md`는 warning이 없지만 일부 budget 사용률이 높다.

| Budget | Actual | Limit | Headroom | Usage |
|---|---:|---:|---:|---:|
| `vendor-ui` gzip | 162.1 kB | 170.0 kB | 7.9 kB | 95.3% |
| initial JS gzip | 86.0 kB | 92.0 kB | 6.0 kB | 93.4% |
| `ObjectsPage` gzip | 59.8 kB | 63.0 kB | 3.2 kB | 95.0% |
| `UploadsPage` gzip | 0.9 kB | 1.2 kB | 0.3 kB | 78.3% |
| `UploadsPageExperience` gzip | 4.1 kB | 4.4 kB | 0.3 kB | 93.2% |
| `Transfers` gzip | 12.5 kB | 14.5 kB | 2.0 kB | 86.3% |

권장 조치:

- Objects, Uploads, Transfers, backup/restore, provider-specific UI는 계속 lazy boundary 뒤에 둔다.
- `LightApp` `/setup` boundary를 유지해 setup/profile-picker flow가 full shell을 불필요하게 당기지 않도록 한다.
- `SidebarBackupDrawer`처럼 shell trigger와 heavy drawer body의 lazy boundary를 유지한다.
- `UploadsPage`는 headroom이 0.3 kB로 좁아 다음 변경에서 우선 감시한다.
- `UploadsPageExperience`는 headroom이 0.3 kB로 여전히 좁지만 이번 구조 정리 후 budget warning은 없다.
- budget 대상 chunk가 사라지는 경우도 warning으로 보고하고 `npm run bundle:budget`의 `--fail` 경로에서 실패하도록 보강했다.

### Resolved: visual regression lane ownership 결정 필요

- 조치:
  - screenshot baseline을 가진 테스트를 `@visual` 태그로 분리했다.
  - `npm run test:e2e:core`는 `@visual`을 제외하도록 변경했다.
  - `npm run test:e2e:visual`을 추가해 Chromium visual regression lane을 별도로 실행하도록 했다.
  - `.github/workflows/frontend-e2e.yml`에 `Visual Regression E2E` job을 추가하고, 별도 HTML/raw artifact와 summary를 남기도록 했다.
  - `docs/TESTING.md`, `docs/RELEASE_GATE.md`, `.github/pull_request_template.md`에 visual lane ownership과 evidence 기준을 반영했다.
  - `SimpleTree` 의미론 변경 이후 남아 있던 Playwright `role="tree"` 셀렉터를 `objectsTreeRow(...)`/정확한 label button 셀렉터로 갱신했다.
- 검증:
  - `npm --prefix frontend run test:e2e:visual` 통과, 18 tests.
  - `npm --prefix frontend run test:e2e -- tests/objects-bucket-picker.spec.ts tests/objects-global-search.spec.ts --project=chromium` 통과, 7 tests. mock profile provider 보정 후 재확인했다.
  - `npm --prefix frontend run test:e2e:core` 통과, 124 passed / 15 skipped. `objects-bucket-picker`/`objects-global-search` mock profile provider 보정 후 재확인했고, 2026-05-02에는 mobile-responsive 완료 후 순차 재실행으로 다시 확인했다.
  - `npm --prefix frontend run test:e2e -- tests/objects-favorites-tree-details.spec.ts tests/objects-layout-density.spec.ts tests/objects-mobile-responsive.spec.ts --project=chromium` 통과, 18 tests.
  - `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7` 통과, 26 tests.
  - `npm --prefix frontend run test:e2e:mobile-responsive` 통과, 66 passed. 2026-05-02 최신 작업트리에서 재확인했다.
  - `npm --prefix frontend run test:e2e:visual` 통과, 18 passed. 2026-05-02에는 core 완료 후 순차 재실행으로 다시 확인했다.
  - 병렬로 `core`/`mobile-responsive`/`visual`을 동시에 시작한 최초 시도에서는 `core`와 `visual`이 동일 Playwright webServer port 18080 경합으로 실패했으며, 이는 테스트 본문 실패가 아니라 실행 방식 문제로 분류했다.
  - `bash ./scripts/check_github_workflows.sh` 통과.
  - `bash ./scripts/check_release_gate.sh` 통과.
  - `npm --prefix frontend run lint` 통과.

### Resolved: stale test artifact 정리

- 증거:
  - Noether는 `test-results/.last-run.json`에 stale failed artifact가 있음을 지적했다.
  - 후속 작업에서 ignored generated artifact인 `test-results/.last-run.json`과 `frontend/test-results/.last-run.json`을 정리했다.
  - `find test-results frontend/test-results -maxdepth 2 -type f` 기준 남은 generated Playwright result file은 없다.
- 위험:
  - 릴리스 검토자가 오래된 실패 artifact를 현재 증거로 오해할 수 있다.
- 권장 조치:
  - 릴리스 증거를 만들기 전 generated Playwright/test artifact가 다시 생기면 정리한다.
  - 최종 증거는 CI log 또는 명시적 report file에 남긴다.

## 9. 긍정 신호

- frontend typecheck, lint, unit, bundle, smoke, core, mobile-responsive lane이 최근 로컬에서 통과했다.
- E2E profile fixtures가 실제 profile capability contract와 맞도록 보정되어 Objects preview/new-folder, folder upload, bucket picker, global search 경로의 false-negative disabled state가 제거됐다.
- overlay accessibility coverage가 Objects, Buckets, Jobs, Transfers, Uploads, Profiles, Settings 전반으로 넓어졌다.
- visual regression coverage가 dedicated `@visual` lane으로 분리되어 core regression noise와 screenshot baseline ownership이 분명해졌다.
- dark theme axe/visual coverage가 추가되었고, governance sheet primary action contrast 문제가 수정되었다.
- Playwright mocked lane은 기본 managed server `18080`을 사용하도록 정리되어 stale bundle 검증 위험이 줄었다.
- source import-cycle guard가 lint gate에 연결되어 lazy registry/runtime cycle 회귀를 자동으로 잡을 수 있게 되었다.
- Uploads route lazy loading은 blank fallback 대신 polite `status` region을 노출한다.
- backend `go test ./...`, `go vet ./...`, `gosec`는 Noether 감사에서 통과했다.
- backend `staticcheck ./...`와 `govulncheck ./...`도 후속 수정 후 통과했다.
- Objects lazy registry cycle, command palette semantics, shortcut guide overlay stack, `SimpleTree` semantics mismatch, 모바일 touch target 이슈가 후속 수정으로 해결되었다.
- `LightApp`이 `/setup` production route로 연결되어 setup/profile-picker 경로가 full shell과 분리되었다.
- backup/restore drawer body가 `SidebarBackupDrawer` lazy chunk로 분리되어 shell 초기 번들 결합이 줄었다.
- Popover Tab close/focus return 정책이 `PopoverSurface`와 `MenuPopover` 단위 테스트로 고정되었다.
- API client consumer contract가 `APIClientShape`와 page별 narrow API scope 중심으로 정리되어 page hook 테스트성과 대체 transport 주입성이 개선되었고, `pageApiScopes` 타입 계약 테스트로 새 API domain method 추가 시 경계 갱신을 강제할 수 있게 됐다.
- frontend 전체 unit suite는 후속 수정 후 239 files / 903 tests로 통과했다.
- Helm chart, GitHub workflow, release-gate metadata/scope/scope-audit/evidence preflight/checklist-sync/readiness unittest 66개는 로컬에서 통과했다.
- `./scripts/check.sh full`은 최신 작업트리에서 frontend unit 239 files / 903 tests, build, browser smoke 2 tests, third-party notice 재현성 검사까지 포함해 끝까지 통과했다.
- `python3 scripts/check_clean_snapshot.py fast`는 release-readiness preflight 추가 전 마지막 재실행 기준 1817 non-ignored paths를 복사한 `.git` 없는 snapshot에서 frontend unit 239 files / 903 tests와 build까지 통과했다.
- `python3 scripts/check_clean_snapshot.py full`은 최신 작업트리 기준 1819 non-ignored paths를 복사한 `.git` 없는 snapshot에서도 gofmt, backend security analysis, frontend unit 239 files / 903 tests in 131.57s, browser smoke 2 tests, third-party notice generation fatal 로그 없이 통과했다.

## 10. 다음 작업 순서

1. release scope 최종 선정
   - `dependency-notices` unit은 dependency metadata, `THIRD_PARTY_NOTICES.md`, `third_party/licenses/**` 변경을 한 단위로 유지한다.
   - source/test/docs/workflow/chart 변경은 [docs/RELEASE_SCOPE_AUDIT_2026-04-30.md](/home/homelab/Downloads/project/s3desk/docs/RELEASE_SCOPE_AUDIT_2026-04-30.md)의 release unit 후보 기준으로 review/stage한다.
   - 최종 scope 선정 후 `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`을 다시 실행한다.
2. live evidence 확보
   - 현재 `rc1` 후보는 [docs/release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-02.md](/home/homelab/Downloads/project/s3desk/docs/release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-02.md)의 target과 명령을 따른다.
   - `aws`, `gcs`, `azure`, `oci`, `minio`, `ceph` provider live evidence 6개와 `reverse-proxy-smoke-rc1.md`가 필요하다.
   - evidence 기록 후 `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id rc1`을 통과시킨다.
3. scope/evidence 확정 후 전체 품질 증거 재생성
   - `./scripts/check.sh full`
   - `python3 scripts/check_clean_snapshot.py full`
   - `npm --prefix frontend run test:e2e:core`
   - `npm --prefix frontend run test:e2e:mobile-responsive`
   - `npm --prefix frontend run test:e2e:visual`
4. 이후 frontend 변경 시 유지할 회귀 기준
   - provider capability policy 변경 시 `profileCapabilityContext`와 page query hook 테스트를 함께 갱신한다.
   - page hook이 새 API domain method를 쓰면 `pageApiScopes` contract를 먼저 갱신한다.
   - 시각 회귀 baseline 변경 시 `npm --prefix frontend run test:e2e:visual` 증거를 유지한다.
5. clean checkout 또는 clean CI runner에서 최종 확인 후에만 태그와 GitHub Release를 진행한다.
