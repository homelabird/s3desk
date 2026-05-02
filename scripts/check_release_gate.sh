#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CHANGELOG="${ROOT}/CHANGELOG.md"
RELEASE_GATE="${ROOT}/docs/RELEASE_GATE.md"
LIVE_VALIDATION="${ROOT}/docs/BUCKET_GOVERNANCE.md"
PROVIDER_LIVE_ENV="${ROOT}/docs/ci/provider_live_validation.env.example"
TESTING_DOC="${ROOT}/docs/TESTING.md"
MOBILE_RESPONSIVE_DOC="${ROOT}/frontend/docs/MOBILE_RESPONSIVE_E2E.md"
PR_TEMPLATE="${ROOT}/.github/pull_request_template.md"
RELEASE_PR_BODY="${ROOT}/docs/release/PR_BODY.md"
RELEASE_PR_BODY_ARCHIVE="${ROOT}/docs/release/PR_BODY_2026-04-02.md"
DEPLOYMENT_CHECKLIST="${ROOT}/docs/release/DEPLOYMENT_CHECKLIST.md"
RELEASE_EVIDENCE_README="${ROOT}/docs/release/evidence/README.md"
PROVIDER_LIVE_EVIDENCE_TEMPLATE="${ROOT}/docs/release/evidence/PROVIDER_LIVE_VALIDATION_TEMPLATE.md"
REVERSE_PROXY_EVIDENCE_TEMPLATE="${ROOT}/docs/release/evidence/REVERSE_PROXY_SMOKE_TEMPLATE.md"
FRONTEND_E2E_WORKFLOW="${ROOT}/.github/workflows/frontend-e2e.yml"
RELEASE_GATE_WORKFLOW="${ROOT}/.github/workflows/release-gate.yml"
GITLAB_CI="${ROOT}/.gitlab-ci.yml"
CHECK_SH="${ROOT}/scripts/check.sh"
DEPLOY_SMOKE_SCRIPT="${ROOT}/scripts/deploy_smoke.sh"
GO_TOOLCHAIN_CHECK="${ROOT}/scripts/check_go_toolchain.py"
RELEASE_SCOPE_CHECK="${ROOT}/scripts/report_release_scope.py"
RELEASE_SCOPE_CHECK_TEST="${ROOT}/scripts/report_release_scope_test.py"
RELEASE_SCOPE_AUDIT_CHECK="${ROOT}/scripts/check_release_scope_audit.py"
RELEASE_SCOPE_AUDIT_CHECK_TEST="${ROOT}/scripts/check_release_scope_audit_test.py"
LIVE_ENV_CHECK="${ROOT}/scripts/check_live_evidence_env.py"
LIVE_ENV_CHECK_TEST="${ROOT}/scripts/check_live_evidence_env_test.py"
RELEASE_EVIDENCE_CHECK="${ROOT}/scripts/check_release_evidence.py"
RELEASE_EVIDENCE_CHECK_TEST="${ROOT}/scripts/check_release_evidence_test.py"
RELEASE_EVIDENCE_CHECKLIST_CHECK="${ROOT}/scripts/check_release_evidence_checklist.py"
RELEASE_EVIDENCE_CHECKLIST_CHECK_TEST="${ROOT}/scripts/check_release_evidence_checklist_test.py"
RELEASE_READINESS_CHECK="${ROOT}/scripts/check_release_readiness.py"
RELEASE_READINESS_CHECK_TEST="${ROOT}/scripts/check_release_readiness_test.py"

require_text() {
  local file="$1"
  local needle="$2"
  local description="$3"
  if ! grep -Fq -- "${needle}" "${file}"; then
    echo "[release-gate] missing ${description}: ${needle}" >&2
    exit 1
  fi
}

if [[ ! -f "${CHANGELOG}" ]]; then
  echo "[release-gate] CHANGELOG.md not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_GATE}" ]]; then
  echo "[release-gate] docs/RELEASE_GATE.md not found" >&2
  exit 1
fi
if [[ ! -f "${LIVE_VALIDATION}" ]]; then
  echo "[release-gate] docs/BUCKET_GOVERNANCE.md not found" >&2
  exit 1
fi
if [[ ! -f "${PROVIDER_LIVE_ENV}" ]]; then
  echo "[release-gate] docs/ci/provider_live_validation.env.example not found" >&2
  exit 1
fi
if [[ ! -f "${TESTING_DOC}" ]]; then
  echo "[release-gate] docs/TESTING.md not found" >&2
  exit 1
fi
if [[ ! -f "${MOBILE_RESPONSIVE_DOC}" ]]; then
  echo "[release-gate] frontend/docs/MOBILE_RESPONSIVE_E2E.md not found" >&2
  exit 1
fi
if [[ ! -f "${PR_TEMPLATE}" ]]; then
  echo "[release-gate] .github/pull_request_template.md not found" >&2
  exit 1
fi
if [[ ! -f "${GITLAB_CI}" ]]; then
  echo "[release-gate] .gitlab-ci.yml not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_PR_BODY}" ]]; then
  echo "[release-gate] docs/release/PR_BODY.md not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_PR_BODY_ARCHIVE}" ]]; then
  echo "[release-gate] docs/release/PR_BODY_2026-04-02.md not found" >&2
  exit 1
fi
if [[ ! -f "${DEPLOYMENT_CHECKLIST}" ]]; then
  echo "[release-gate] docs/release/DEPLOYMENT_CHECKLIST.md not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_EVIDENCE_README}" ]]; then
  echo "[release-gate] docs/release/evidence/README.md not found" >&2
  exit 1
fi
if [[ ! -f "${PROVIDER_LIVE_EVIDENCE_TEMPLATE}" ]]; then
  echo "[release-gate] docs/release/evidence/PROVIDER_LIVE_VALIDATION_TEMPLATE.md not found" >&2
  exit 1
fi
if [[ ! -f "${REVERSE_PROXY_EVIDENCE_TEMPLATE}" ]]; then
  echo "[release-gate] docs/release/evidence/REVERSE_PROXY_SMOKE_TEMPLATE.md not found" >&2
  exit 1
fi
if [[ ! -f "${FRONTEND_E2E_WORKFLOW}" ]]; then
  echo "[release-gate] .github/workflows/frontend-e2e.yml not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_GATE_WORKFLOW}" ]]; then
  echo "[release-gate] .github/workflows/release-gate.yml not found" >&2
  exit 1
fi
if [[ ! -f "${CHECK_SH}" ]]; then
  echo "[release-gate] scripts/check.sh not found" >&2
  exit 1
fi
if [[ ! -f "${DEPLOY_SMOKE_SCRIPT}" ]]; then
  echo "[release-gate] scripts/deploy_smoke.sh not found" >&2
  exit 1
fi
if [[ ! -f "${GO_TOOLCHAIN_CHECK}" ]]; then
  echo "[release-gate] scripts/check_go_toolchain.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_SCOPE_CHECK}" ]]; then
  echo "[release-gate] scripts/report_release_scope.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_SCOPE_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/report_release_scope_test.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_SCOPE_AUDIT_CHECK}" ]]; then
  echo "[release-gate] scripts/check_release_scope_audit.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_SCOPE_AUDIT_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/check_release_scope_audit_test.py not found" >&2
  exit 1
fi
if [[ ! -f "${LIVE_ENV_CHECK}" ]]; then
  echo "[release-gate] scripts/check_live_evidence_env.py not found" >&2
  exit 1
fi
if [[ ! -f "${LIVE_ENV_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/check_live_evidence_env_test.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_EVIDENCE_CHECK}" ]]; then
  echo "[release-gate] scripts/check_release_evidence.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_EVIDENCE_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/check_release_evidence_test.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_EVIDENCE_CHECKLIST_CHECK}" ]]; then
  echo "[release-gate] scripts/check_release_evidence_checklist.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_EVIDENCE_CHECKLIST_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/check_release_evidence_checklist_test.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_READINESS_CHECK}" ]]; then
  echo "[release-gate] scripts/check_release_readiness.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_READINESS_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/check_release_readiness_test.py not found" >&2
  exit 1
fi

python3 "${RELEASE_SCOPE_CHECK_TEST}"
python3 "${RELEASE_SCOPE_AUDIT_CHECK_TEST}"
if git -C "${ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  python3 "${RELEASE_SCOPE_CHECK}" --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all >/dev/null
else
  echo "[release-gate] skipping release-scope status check outside a git worktree"
fi
python3 "${RELEASE_SCOPE_AUDIT_CHECK}"
python3 "${LIVE_ENV_CHECK_TEST}"
python3 "${RELEASE_EVIDENCE_CHECK_TEST}"
python3 "${RELEASE_EVIDENCE_CHECKLIST_CHECK_TEST}"
python3 "${RELEASE_READINESS_CHECK_TEST}"
python3 "${RELEASE_EVIDENCE_CHECKLIST_CHECK}" --candidate-id rc1
bash -n "${DEPLOY_SMOKE_SCRIPT}"

require_text "${CHANGELOG}" "## Unreleased" "Unreleased changelog section"
require_text "${CHANGELOG}" "### Known Limitations" "Known Limitations changelog section"
require_text "${CHANGELOG}" "Azure legal hold remains read-only in S3Desk." "Azure legal hold known limitation"
require_text "${CHANGELOG}" "Azure immutability editing requires ARM credentials in addition to storage credentials." "Azure immutability known limitation"
require_text "${CHANGELOG}" "OCI PAR edits are delete-and-recreate rather than in-place mutation" "OCI PAR mutation known limitation"
require_text "${CHANGELOG}" "AWS typed bucket governance still does not cover Object Lock." "AWS Object Lock known limitation"
require_text "${CHANGELOG}" "In-product backup and staged restore target sqlite \`DATA_DIR\` workflows and do not replace Postgres disaster recovery." "sqlite backup known limitation"

require_text "${LIVE_VALIDATION}" "- Provider name" "provider evidence field"
require_text "${LIVE_VALIDATION}" "- Bucket or container name" "bucket/container evidence field"
require_text "${LIVE_VALIDATION}" "- Profile identifier" "profile evidence field"
require_text "${LIVE_VALIDATION}" "- S3Desk commit SHA or release tag" "commit/tag evidence field"
require_text "${LIVE_VALIDATION}" "- Exact feature tested" "feature evidence field"
require_text "${LIVE_VALIDATION}" "- API response body on failure" "API failure evidence field"
require_text "${LIVE_VALIDATION}" "- Provider-native console or CLI confirmation on success" "provider confirmation evidence field"
require_text "${LIVE_VALIDATION}" "## Exit Criteria" "live validation exit criteria section"
require_text "${LIVE_VALIDATION}" "PROVIDER_LIVE_VALIDATION_TEMPLATE.md" "provider live evidence template link"
require_text "${PROVIDER_LIVE_ENV}" "python3 scripts/check_live_evidence_env.py --scope all --format env-template" "live evidence env-template preflight example"
require_text "${PROVIDER_LIVE_ENV}" "Blank and placeholder values are treated as missing." "live evidence env placeholder preflight behavior"
require_text "${PROVIDER_LIVE_ENV}" "DEPLOY_BASE_URL" "reverse-proxy base URL env example"
require_text "${PROVIDER_LIVE_ENV}" "DEPLOY_API_TOKEN" "reverse-proxy API token env example"
require_text "${PROVIDER_LIVE_ENV}" "DEPLOY_SMOKE_EVIDENCE_FILE" "reverse-proxy evidence file env example"
require_text "${PROVIDER_LIVE_ENV}" "S3DESK_LIVE_AWS_BUCKET" "AWS live env example"
require_text "${PROVIDER_LIVE_ENV}" "S3DESK_LIVE_GCS_SERVICE_ACCOUNT_JSON" "GCS live env example"
require_text "${PROVIDER_LIVE_ENV}" "S3DESK_LIVE_AZURE_ACCOUNT_KEY" "Azure live env example"
require_text "${PROVIDER_LIVE_ENV}" "S3DESK_LIVE_OCI_COMPARTMENT" "OCI live env example"
require_text "${PROVIDER_LIVE_ENV}" "S3DESK_LIVE_MINIO_SECRET_ACCESS_KEY" "MinIO live env example"
require_text "${PROVIDER_LIVE_ENV}" "S3DESK_LIVE_CEPH_SECRET_ACCESS_KEY" "Ceph live env example"

require_text "${RELEASE_GATE}" "## Minimum Release Checklist" "release gate checklist"
require_text "${RELEASE_GATE}" "## Required Evidence" "release gate evidence section"
require_text "${RELEASE_GATE}" "## Automated Enforcement" "release gate automation section"
require_text "${RELEASE_GATE}" "## Provider Change Gate" "provider change gate section"
require_text "${RELEASE_GATE}" "## Deployment Smoke Gate" "deployment smoke gate section"
require_text "${RELEASE_GATE}" "DEPLOY_SMOKE_EVIDENCE_FILE" "reverse-proxy smoke evidence command"
require_text "${RELEASE_GATE}" "REVERSE_PROXY_SMOKE_TEMPLATE.md" "reverse-proxy smoke evidence template link"
require_text "${RELEASE_GATE}" "python3 scripts/check_live_evidence_env.py --scope reverse-proxy" "reverse-proxy smoke env preflight command"
require_text "${RELEASE_GATE}" "python3 scripts/check_live_evidence_env.py --scope <provider>" "provider live env preflight command"
require_text "${RELEASE_GATE}" "sanitized base URL, expected external base URL, profile, bucket, object key, and each smoke check result" "reverse-proxy evidence metadata release gate documentation"
require_text "${RELEASE_GATE}" "HTTP 201" "reverse-proxy expected status release gate documentation"
require_text "${RELEASE_GATE}" "\`Signed proxy URL root\` must match \`Expected external base URL\`" "reverse-proxy signed root release gate documentation"
require_text "${RELEASE_GATE}" "expected-status reference lines alone do not satisfy the smoke evidence requirement" "reverse-proxy expected-status-only release gate documentation"
require_text "${RELEASE_GATE}" "python3 scripts/check_release_evidence.py --strict" "release evidence strict audit command"
require_text "${RELEASE_GATE}" "--require-candidate-id" "release evidence require-candidate-id audit command"
require_text "${RELEASE_GATE}" "--candidate-id <tag-or-sha>" "release evidence candidate-id audit command"
require_text "${RELEASE_GATE}" "python3 scripts/check_release_readiness.py --candidate-id <tag-or-sha>" "release readiness blocker summary command"
require_text "${RELEASE_GATE}" "exits non-zero until required provider/reverse-proxy evidence is present" "release readiness evidence-blocker warning"
require_text "${RELEASE_GATE}" "does not replace \`./scripts/check.sh full\`, clean-snapshot verification, or the browser lanes" "release readiness scope warning"
require_text "${RELEASE_GATE}" "--fail-on-other-unit" "release scope uncategorized-unit guard documentation"
require_text "${RELEASE_GATE}" "## Release Notes Requirements" "release notes requirements section"
require_text "${RELEASE_GATE}" "## Blockers" "release blockers section"
require_text "${RELEASE_GATE}" "## Browser Test Policy" "browser test policy section"
require_text "${RELEASE_GATE}" "npm run check:e2e:geometry" "browser geometry guard documentation"
require_text "${RELEASE_GATE}" "@check-smoke" "check-smoke lane documentation"
require_text "${RELEASE_GATE}" "bash ./scripts/check_github_workflows.sh" "workflow lint release documentation"
require_text "${RELEASE_GATE}" "bash ./scripts/install_actionlint.sh" "actionlint install release documentation"
require_text "${RELEASE_GATE}" "bash ./scripts/check_ci_pair.sh" "minimal CI pair release documentation"
require_text "${RELEASE_GATE}" "not a replacement for required browser checks or release approval evidence" "minimal CI pair release warning"
require_text "${RELEASE_GATE}" "canonical release verdict: GitHub \`Release Gate\`" "canonical release gate documentation"
require_text "${RELEASE_GATE}" "Go \`1.25.9\`" "Go toolchain release documentation"
require_text "${RELEASE_GATE}" "python3 scripts/check_go_toolchain.py" "Go toolchain parity command"
require_text "${RELEASE_GATE}" "\`staticcheck\`, \`gosec\`, and \`govulncheck\`" "backend security gate documentation"
require_text "${RELEASE_GATE}" "\`security_fs_scan\` runs Trivy" "GitLab Trivy additive gate documentation"
require_text "${RELEASE_GATE}" "\`gitleaks_scan\` runs Gitleaks" "GitLab Gitleaks additive gate documentation"
require_text "${RELEASE_GATE}" "\`shellcheck\` runs \`shellcheck -x\`" "GitLab shellcheck quality gate documentation"
require_text "${RELEASE_GATE}" "\`GO_COVERAGE_MIN_TOTAL\`" "GitLab Go coverage quality gate documentation"
require_text "${RELEASE_GATE}" "\`.golangci.yml\` named by \`GOLANGCI_LINT_CONFIG\`" "GitLab golangci config documentation"
require_text "${RELEASE_GATE}" "Bundle Budget" "bundle-budget release documentation"
require_text "${RELEASE_GATE}" "npm run bundle:budget" "bundle-budget release command"
require_text "${RELEASE_GATE}" "npm run check:bundle-report" "bundle-budget release contract-test command"
require_text "${RELEASE_GATE}" "frontend/scripts/bundle-budgets.json" "bundle-budget manifest release documentation"
require_text "${RELEASE_GATE}" "shrink first" "bundle-budget release action-hint documentation"
require_text "${RELEASE_GATE}" "rebaseline if stable" "bundle-budget release rebaseline-hint documentation"
require_text "${RELEASE_GATE}" "No budget warnings" "bundle-budget release evidence wording"
require_text "${RELEASE_GATE}" "No budget review candidates" "bundle-budget release review wording"
require_text "${RELEASE_GATE}" "missing budgeted chunks are warnings" "bundle-budget missing chunk release gate wording"
require_text "${RELEASE_GATE}" "Warnings:" "bundle-budget release summary warning wording"
require_text "${RELEASE_GATE}" "Review targets:" "bundle-budget release summary target wording"
require_text "${RELEASE_GATE}" "Action hints:" "bundle-budget release summary action-hint wording"
require_text "${RELEASE_GATE}" "Workflow Lint:" "release summary workflow-lint label documentation"
require_text "${RELEASE_GATE}" "Bundle Budget Contract:" "release summary bundle-budget contract label documentation"
require_text "${RELEASE_GATE}" "Browser Lanes:" "release summary browser-lane label documentation"
require_text "${TESTING_DOC}" "./scripts/check_release_gate.sh" "release gate testing command"
require_text "${TESTING_DOC}" "Release Gate" "release gate testing documentation"
require_text "${TESTING_DOC}" "### Browser E2E Lanes" "browser lane section"
require_text "${TESTING_DOC}" "npm run test:e2e:smoke" "check-smoke testing command"
require_text "${TESTING_DOC}" "npm run check:e2e:geometry" "geometry guard testing command"
require_text "${TESTING_DOC}" "e2e-geometry-allow" "geometry guard escape hatch documentation"
require_text "${TESTING_DOC}" "### Reviewer Quick Check" "reviewer quick-check section"
require_text "${TESTING_DOC}" "bash ./scripts/check_github_workflows.sh" "workflow lint testing command"
require_text "${TESTING_DOC}" "bash ./scripts/install_actionlint.sh" "actionlint install testing command"
require_text "${TESTING_DOC}" "Workflow Lint" "workflow lint testing job documentation"
require_text "${TESTING_DOC}" "### Frontend Bundle Budget" "bundle-budget testing section"
require_text "${TESTING_DOC}" "npm run bundle:budget" "bundle-budget testing command"
require_text "${TESTING_DOC}" "npm run check:bundle-report" "bundle-budget testing contract-test command"
require_text "${TESTING_DOC}" "frontend-bundle-report" "bundle-budget testing artifact"
require_text "${TESTING_DOC}" "frontend/scripts/bundle-budgets.json" "bundle-budget manifest testing documentation"
require_text "${TESTING_DOC}" "shrink first" "bundle-budget testing action-hint documentation"
require_text "${TESTING_DOC}" "rebaseline if stable" "bundle-budget testing rebaseline-hint documentation"
require_text "${TESTING_DOC}" "No budget warnings" "bundle-budget testing evidence wording"
require_text "${TESTING_DOC}" "No budget review candidates" "bundle-budget testing review wording"
require_text "${TESTING_DOC}" "missing budgeted chunks are treated as budget warnings" "bundle-budget missing chunk testing wording"
require_text "${TESTING_DOC}" "Warnings:" "bundle-budget testing summary warning wording"
require_text "${TESTING_DOC}" "Review targets:" "bundle-budget testing summary target wording"
require_text "${TESTING_DOC}" "Action hints:" "bundle-budget testing summary action-hint wording"
require_text "${TESTING_DOC}" "Workflow Lint:" "testing summary workflow-lint label documentation"
require_text "${TESTING_DOC}" "Bundle Budget Contract:" "testing summary bundle-budget contract label documentation"
require_text "${TESTING_DOC}" "Browser Lanes:" "testing summary browser-lane label documentation"
require_text "${TESTING_DOC}" "It intentionally does not cover:" "minimal CI pair exclusion section"
require_text "${TESTING_DOC}" "bundle-budget checks" "minimal CI pair bundle-budget exclusion"
require_text "${TESTING_DOC}" "Playwright lanes such as" "minimal CI pair Playwright exclusion"
require_text "${TESTING_DOC}" "Do not treat \`./scripts/check_ci_pair.sh\` as a release-ready verdict." "minimal CI pair testing warning"
require_text "${TESTING_DOC}" "not “all required checks for release are satisfied”" "minimal CI pair testing interpretation warning"
require_text "${TESTING_DOC}" "python3 scripts/check_go_toolchain.py" "Go toolchain testing documentation"
require_text "${TESTING_DOC}" "\`shellcheck\` runs \`shellcheck -x\`" "GitLab shellcheck testing documentation"
require_text "${TESTING_DOC}" "\`GO_COVERAGE_MIN_TOTAL\`" "GitLab coverage testing documentation"
require_text "${TESTING_DOC}" "\`GOLANGCI_LINT_CONFIG\`" "GitLab golangci config testing documentation"
require_text "${TESTING_DOC}" "python3 scripts/check_live_evidence_env.py --scope reverse-proxy" "reverse-proxy env preflight testing command"
require_text "${TESTING_DOC}" "blank or placeholder environment values as missing" "live evidence env placeholder testing documentation"
require_text "${TESTING_DOC}" "python3 scripts/check_release_evidence.py --strict" "release evidence strict testing command"
require_text "${TESTING_DOC}" "--require-candidate-id" "release evidence require-candidate-id testing command"
require_text "${TESTING_DOC}" "--candidate-id <tag-or-sha>" "release evidence candidate-id testing command"
require_text "${TESTING_DOC}" "python3 scripts/check_release_readiness.py --candidate-id <tag-or-sha>" "release readiness testing command"
require_text "${TESTING_DOC}" "It exits non-zero while live evidence is still missing" "release readiness testing blocker warning"
require_text "${TESTING_DOC}" "does not replace \`./scripts/check.sh full\`, clean-snapshot verification, or browser-lane evidence" "release readiness testing scope warning"
require_text "${TESTING_DOC}" "\`Signed proxy URL root\` that matches \`Expected external base URL\`" "release evidence signed root testing documentation"
require_text "${TESTING_DOC}" "\`check_status_expectations\` and \`check_result_expectations\` fields" "release evidence JSON expectation testing documentation"
require_text "${TESTING_DOC}" "--fail-on-other-unit" "release scope uncategorized-unit testing documentation"
require_text "${TESTING_DOC}" "--format stage-command" "release scope stage-command testing documentation"
require_text "${TESTING_DOC}" "git add --pathspec-from-file=- --pathspec-file-nul" "release scope stage-command pathspec documentation"
require_text "${TESTING_DOC}" "release-unit \`path_list_command\`/\`stage_command\` fields" "release scope JSON command fields documentation"
require_text "${MOBILE_RESPONSIVE_DOC}" "## Authoring Rules" "mobile responsive authoring section"
require_text "${MOBILE_RESPONSIVE_DOC}" "npm run test:e2e:smoke" "mobile doc smoke command"
require_text "${MOBILE_RESPONSIVE_DOC}" "npm run check:e2e:geometry" "mobile doc geometry guard command"
require_text "${MOBILE_RESPONSIVE_DOC}" "e2e-geometry-allow" "mobile doc geometry escape hatch"
require_text "${MOBILE_RESPONSIVE_DOC}" "Workflow Lint" "mobile doc workflow lint section"
require_text "${MOBILE_RESPONSIVE_DOC}" "browser surface is in scope" "mobile doc browser-surface scope wording"
require_text "${PR_TEMPLATE}" '`npm run test:e2e:smoke` executed' "PR template smoke verification"
require_text "${PR_TEMPLATE}" '`npm run check:e2e:geometry` executed' "PR template geometry verification"
require_text "${PR_TEMPLATE}" '`bash ./scripts/check_github_workflows.sh` executed' "PR template workflow lint verification"
require_text "${PR_TEMPLATE}" '`npm run check:bundle-report` executed' "PR template bundle-report contract verification"
require_text "${PR_TEMPLATE}" "Bundle Budget Contract: not applicable" "PR template bundle-budget contract not-applicable example"
require_text "${PR_TEMPLATE}" '`npm run bundle:budget` executed' "PR template bundle-budget verification"
require_text "${PR_TEMPLATE}" "Bundle Budget: executed" "PR template bundle-budget summary example"
require_text "${PR_TEMPLATE}" "Bundle Budget: not applicable" "PR template bundle-budget not-applicable example"
require_text "${PR_TEMPLATE}" "Bundle Budget Contract: executed" "PR template bundle-budget contract summary example"
require_text "${PR_TEMPLATE}" "Warnings: none" "PR template bundle-budget warnings example"
require_text "${PR_TEMPLATE}" "Review targets: none" "PR template bundle-budget targets example"
require_text "${PR_TEMPLATE}" "Action hints: none" "PR template bundle-budget action-hints example"
require_text "${PR_TEMPLATE}" "Browser Lanes: smoke + core executed" "PR template browser-lane summary example"
require_text "${PR_TEMPLATE}" "browser-surface layout" "PR template browser-surface wording"
require_text "${PR_TEMPLATE}" "New browser tests prove task completion or stable UI state, not raw geometry" "PR template task-completion guidance"
require_text "${PR_TEMPLATE}" "e2e-geometry-allow" "PR template geometry escape hatch guidance"
require_text "${RELEASE_PR_BODY}" "bash ./scripts/check_github_workflows.sh" "release PR body workflow lint evidence"
require_text "${RELEASE_PR_BODY}" "npm run check:bundle-report" "release PR body bundle-report contract evidence"
require_text "${RELEASE_PR_BODY}" "npm run bundle:budget" "release PR body bundle-budget evidence"
require_text "${RELEASE_PR_BODY}" "Bundle Budget: executed" "release PR body bundle-budget status wording"
require_text "${RELEASE_PR_BODY}" "Bundle Budget: not applicable" "release PR body bundle-budget not-applicable wording"
require_text "${RELEASE_PR_BODY}" "Bundle Budget Contract: not applicable" "release PR body bundle-budget contract wording"
require_text "${RELEASE_PR_BODY}" "Warnings: none" "release PR body bundle-budget warnings wording"
require_text "${RELEASE_PR_BODY}" "Review targets: none" "release PR body bundle-budget review wording"
require_text "${RELEASE_PR_BODY}" "Action hints: none" "release PR body bundle-budget action-hints wording"
require_text "${RELEASE_PR_BODY}" "npm run test:e2e:smoke" "release PR body smoke evidence"
require_text "${RELEASE_PR_BODY}" "npm run test:e2e:core" "release PR body core evidence"
require_text "${RELEASE_PR_BODY}" "npm run test:e2e:mobile-responsive" "release PR body mobile evidence"
require_text "${RELEASE_PR_BODY}" "Browser-surface test evidence" "release PR body browser-surface wording"
require_text "${RELEASE_PR_BODY}" "not applicable" "release PR body not-applicable wording"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "bash ./scripts/check_github_workflows.sh" "archived release PR body workflow lint evidence"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "npm run check:bundle-report" "archived release PR body bundle-report contract evidence"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "npm run bundle:budget" "archived release PR body bundle-budget evidence"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "Bundle Budget: executed" "archived release PR body bundle-budget status wording"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "Bundle Budget: not applicable" "archived release PR body bundle-budget not-applicable wording"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "Bundle Budget Contract: not applicable" "archived release PR body bundle-budget contract wording"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "Warnings: none" "archived release PR body bundle-budget warnings wording"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "Review targets: none" "archived release PR body bundle-budget review wording"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "Action hints: none" "archived release PR body bundle-budget action-hints wording"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "npm run test:e2e:smoke" "archived release PR body smoke evidence"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "npm run test:e2e:core" "archived release PR body core evidence"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "npm run test:e2e:mobile-responsive" "archived release PR body mobile evidence"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "Browser-surface test evidence" "archived release PR body browser-surface wording"
require_text "${RELEASE_PR_BODY_ARCHIVE}" "not applicable" "archived release PR body not-applicable wording"
require_text "${DEPLOYMENT_CHECKLIST}" "bash ./scripts/check_github_workflows.sh" "deployment checklist workflow lint verification"
require_text "${DEPLOYMENT_CHECKLIST}" "npm run check:bundle-report" "deployment checklist bundle-report contract verification"
require_text "${DEPLOYMENT_CHECKLIST}" "Bundle Budget Contract: not applicable" "deployment checklist bundle-report contract not-applicable wording"
require_text "${DEPLOYMENT_CHECKLIST}" "npm run bundle:budget" "deployment checklist bundle-budget verification"
require_text "${DEPLOYMENT_CHECKLIST}" "Bundle Budget: not applicable" "deployment checklist bundle-budget not-applicable wording"
require_text "${DEPLOYMENT_CHECKLIST}" "No budget warnings" "deployment checklist bundle-budget status wording"
require_text "${DEPLOYMENT_CHECKLIST}" "No budget review candidates" "deployment checklist bundle-budget review wording"
require_text "${DEPLOYMENT_CHECKLIST}" "npm run check:e2e:geometry" "deployment checklist geometry verification"
require_text "${DEPLOYMENT_CHECKLIST}" "npm run test:e2e:smoke" "deployment checklist smoke verification"
require_text "${DEPLOYMENT_CHECKLIST}" "npm run test:e2e:core" "deployment checklist core verification"
require_text "${DEPLOYMENT_CHECKLIST}" "npm run test:e2e:mobile-responsive" "deployment checklist mobile verification"
require_text "${DEPLOYMENT_CHECKLIST}" "not applicable" "deployment checklist not-applicable wording"
require_text "${DEPLOYMENT_CHECKLIST}" "DEPLOY_SMOKE_EVIDENCE_FILE" "deployment checklist reverse-proxy evidence command"
require_text "${DEPLOYMENT_CHECKLIST}" "\`Signed proxy URL root\`는 \`Expected external base URL\`과 일치해야" "deployment checklist signed root evidence requirement"
require_text "${DEPLOYMENT_CHECKLIST}" "python3 scripts/check_live_evidence_env.py --scope reverse-proxy" "deployment checklist reverse-proxy env preflight"
require_text "${DEPLOYMENT_CHECKLIST}" "python3 scripts/check_live_evidence_env.py --scope <provider>" "deployment checklist provider env preflight"
require_text "${DEPLOYMENT_CHECKLIST}" "python3 scripts/check_release_evidence.py --strict" "deployment checklist strict release evidence audit"
require_text "${DEPLOYMENT_CHECKLIST}" "--require-candidate-id" "deployment checklist require-candidate-id release evidence audit"
require_text "${DEPLOYMENT_CHECKLIST}" "--candidate-id <tag-or-sha>" "deployment checklist candidate-id release evidence audit"
require_text "${DEPLOYMENT_CHECKLIST}" "python3 scripts/check_release_readiness.py --candidate-id <tag-or-sha>" "deployment checklist release readiness command"
require_text "${DEPLOYMENT_CHECKLIST}" "provider/reverse-proxy evidence가 없으면 실패한다" "deployment checklist release readiness blocker warning"
require_text "${DEPLOYMENT_CHECKLIST}" "clean-snapshot 검증, browser lane evidence를 대체하면 안 된다" "deployment checklist release readiness scope warning"
require_text "${DEPLOYMENT_CHECKLIST}" "PROVIDER_LIVE_VALIDATION_TEMPLATE.md" "deployment checklist provider evidence template"
require_text "${DEPLOYMENT_CHECKLIST}" "bundle-budget과 Playwright lane은 포함하지 않으므로" "deployment checklist pair-wrapper exclusion note"
require_text "${DEPLOYMENT_CHECKLIST}" "required check가 충족되거나 release-ready라고 판단하면 안 된다" "deployment checklist pair-wrapper release warning"
require_text "${RELEASE_EVIDENCE_README}" "DEPLOY_SMOKE_EVIDENCE_FILE" "release evidence reverse-proxy command"
require_text "${RELEASE_EVIDENCE_README}" "python3 scripts/check_live_evidence_env.py --scope reverse-proxy" "release evidence reverse-proxy env preflight"
require_text "${RELEASE_EVIDENCE_README}" "python3 scripts/check_live_evidence_env.py --scope aws" "release evidence provider env preflight"
require_text "${RELEASE_EVIDENCE_README}" "Blank and placeholder values are treated as missing." "release evidence env placeholder preflight behavior"
require_text "${RELEASE_EVIDENCE_README}" "placeholder evidence filenames" "release evidence filename placeholder rejection"
require_text "${RELEASE_EVIDENCE_README}" "all smoke check result lines" "release evidence reverse-proxy metadata requirement"
require_text "${RELEASE_EVIDENCE_README}" "other recorded HTTP statuses are rejected" "release evidence reverse-proxy status rejection"
require_text "${RELEASE_EVIDENCE_README}" "\`Signed proxy URL root\` must match \`Expected external base URL\`" "release evidence signed proxy root match requirement"
require_text "${RELEASE_EVIDENCE_README}" "python3 scripts/check_release_evidence.py --strict" "release evidence strict audit"
require_text "${RELEASE_EVIDENCE_README}" "--require-candidate-id" "release evidence require-candidate-id audit"
require_text "${RELEASE_EVIDENCE_README}" "--candidate-id <tag-or-sha>" "release evidence candidate-id audit"
require_text "${RELEASE_EVIDENCE_README}" "reverse-proxy route-level expected statuses" "release evidence checklist expected statuses"
require_text "${RELEASE_EVIDENCE_README}" "non-status check expectations" "release evidence checklist non-status expectations"
require_text "${RELEASE_EVIDENCE_README}" "\`preflight_command\`" "release evidence JSON preflight field"
require_text "${RELEASE_EVIDENCE_README}" "\`evidence_targets\`" "release evidence JSON provider targets field"
require_text "${RELEASE_EVIDENCE_README}" "\`required_metadata\`" "release evidence JSON metadata field"
require_text "${RELEASE_EVIDENCE_README}" "\`required_metadata_fields\`" "release evidence JSON metadata fields"
require_text "${RELEASE_EVIDENCE_README}" "\`required_check_fields\`" "release evidence JSON reverse-proxy check fields"
require_text "${RELEASE_EVIDENCE_README}" "\`check_status_expectations\`" "release evidence JSON reverse-proxy status expectations"
require_text "${RELEASE_EVIDENCE_README}" "\`check_result_expectations\`" "release evidence JSON reverse-proxy non-status expectations"
require_text "${RELEASE_EVIDENCE_README}" "use that concrete candidate identifier" "release evidence candidate-specific remediation targets"
require_text "${RELEASE_EVIDENCE_README}" "\`final_gate_commands\`" "release evidence JSON final gate commands field"
require_text "${RELEASE_EVIDENCE_README}" "supported \`Provider name\`" "release evidence provider identity requirement"
require_text "${RELEASE_EVIDENCE_README}" "provider-native console or CLI confirmation on success" "release evidence provider-native confirmation requirement"
require_text "${RELEASE_EVIDENCE_README}" "Provider Live Validation" "release evidence provider section"
require_text "${RELEASE_EVIDENCE_README}" "LIVE_EVIDENCE_CHECKLIST_" "current live evidence checklist link"
require_text "${RELEASE_EVIDENCE_README}" "scripts/check_release_evidence_checklist.py --candidate-id rc1" "release evidence checklist sync command"
require_text "${PROVIDER_LIVE_EVIDENCE_TEMPLATE}" "Provider name:" "provider evidence template provider field"
require_text "${PROVIDER_LIVE_EVIDENCE_TEMPLATE}" "Provider-native console or CLI confirmation on success:" "provider evidence template provider confirmation field"
require_text "${PROVIDER_LIVE_EVIDENCE_TEMPLATE}" "Use one of the supported provider names" "provider evidence template supported provider guidance"
require_text "${PROVIDER_LIVE_EVIDENCE_TEMPLATE}" "blank or placeholder values are rejected" "provider evidence template placeholder rejection guidance"
require_text "${PROVIDER_LIVE_EVIDENCE_TEMPLATE}" "Use \`pass\`, \`passed\`, \`success\`, \`succeeded\`, \`ok\`, or a \`pass ...\` phrase" "provider evidence template pass outcome guidance"
require_text "${REVERSE_PROXY_EVIDENCE_TEMPLATE}" "GET \`/healthz\`" "reverse-proxy evidence template health check"
require_text "${REVERSE_PROXY_EVIDENCE_TEMPLATE}" "## Expected Statuses" "reverse-proxy evidence template expected statuses"
require_text "${REVERSE_PROXY_EVIDENCE_TEMPLATE}" "POST \`/api/v1/realtime-ticket?transport=ws\`: \`201\`" "reverse-proxy evidence template realtime expected status"
require_text "${REVERSE_PROXY_EVIDENCE_TEMPLATE}" "does not satisfy evidence requirements by itself" "reverse-proxy expected statuses reference warning"
require_text "${REVERSE_PROXY_EVIDENCE_TEMPLATE}" "HEAD signed proxy URL" "reverse-proxy evidence template signed URL check"
require_text "${REVERSE_PROXY_EVIDENCE_TEMPLATE}" "Record \`HTTP 200\` for healthz, meta, download-url, and HEAD checks, and \`HTTP 201\` for realtime-ticket creation." "reverse-proxy evidence template status guidance"
require_text "${REVERSE_PROXY_EVIDENCE_TEMPLATE}" "Use \`pass\`, \`passed\`, \`success\`, \`succeeded\`, \`ok\`, or a \`pass ...\` phrase" "reverse-proxy evidence template pass outcome guidance"
require_text "${DEPLOY_SMOKE_SCRIPT}" "## Expected Statuses" "deploy smoke generated evidence expected statuses"
require_text "${DEPLOY_SMOKE_SCRIPT}" "Signed proxy URL root matches expected external base URL" "deploy smoke generated evidence signed root status reference"
require_text "${FRONTEND_E2E_WORKFLOW}" "name: Workflow Lint" "frontend e2e workflow lint job"
require_text "${FRONTEND_E2E_WORKFLOW}" "name: Bundle Budget" "frontend e2e bundle-budget job"
require_text "${FRONTEND_E2E_WORKFLOW}" "Write bundle budget summary" "frontend e2e bundle-budget summary step"
require_text "${FRONTEND_E2E_WORKFLOW}" "Write workflow lint summary" "frontend e2e workflow lint summary step"
require_text "${FRONTEND_E2E_WORKFLOW}" "Write core mock summary" "frontend e2e core summary step"
require_text "${FRONTEND_E2E_WORKFLOW}" "Write mobile responsive summary" "frontend e2e mobile summary step"
require_text "${FRONTEND_E2E_WORKFLOW}" "Workflow Lint:" "frontend e2e workflow-lint summary wording"
require_text "${FRONTEND_E2E_WORKFLOW}" "Bundle Budget:" "frontend e2e bundle-budget summary wording"
require_text "${FRONTEND_E2E_WORKFLOW}" "Bundle Budget Contract:" "frontend e2e bundle-budget contract wording"
require_text "${FRONTEND_E2E_WORKFLOW}" "no bundle-affecting runtime change" "frontend e2e bundle-budget not-applicable wording"
require_text "${FRONTEND_E2E_WORKFLOW}" "Warnings:" "frontend e2e bundle-budget warning wording"
require_text "${FRONTEND_E2E_WORKFLOW}" "Browser Lanes:" "frontend e2e browser-lane summary wording"
require_text "${FRONTEND_E2E_WORKFLOW}" "Review targets:" "frontend e2e bundle-budget target wording"
require_text "${FRONTEND_E2E_WORKFLOW}" "Action hints:" "frontend e2e bundle-budget action-hint wording"
require_text "${FRONTEND_E2E_WORKFLOW}" "Install repo-local actionlint" "frontend e2e actionlint install step"
require_text "${FRONTEND_E2E_WORKFLOW}" "bash ./scripts/install_actionlint.sh" "frontend e2e actionlint install command"
require_text "${FRONTEND_E2E_WORKFLOW}" "Run workflow lint" "frontend e2e workflow lint step"
require_text "${FRONTEND_E2E_WORKFLOW}" "bash ./scripts/check_github_workflows.sh" "frontend e2e workflow lint command"
require_text "${FRONTEND_E2E_WORKFLOW}" "workflow-lint" "frontend e2e workflow lint dependency"
require_text "${FRONTEND_E2E_WORKFLOW}" "frontend-bundle-report" "frontend e2e bundle-budget artifact"
require_text "${FRONTEND_E2E_WORKFLOW}" "npm run bundle:budget" "frontend e2e bundle-budget command"
require_text "${FRONTEND_E2E_WORKFLOW}" "npm run check:bundle-report" "frontend e2e bundle-report contract-test command"
require_text "${FRONTEND_E2E_WORKFLOW}" "frontend_bundle_contract" "frontend e2e bundle-budget contract scope output"
require_text "${FRONTEND_E2E_WORKFLOW}" "frontend_bundle_runtime" "frontend e2e bundle-budget runtime scope output"
require_text "${FRONTEND_E2E_WORKFLOW}" "workflow_lint_scope" "frontend e2e workflow-lint scope output"
require_text "${FRONTEND_E2E_WORKFLOW}" "no bundle manifest/report/summary wiring change" "frontend e2e bundle-budget contract not-applicable wording"
require_text "${FRONTEND_E2E_WORKFLOW}" "no workflow or browser-surface changes were detected" "frontend e2e workflow-lint not-applicable wording"
require_text "${FRONTEND_E2E_WORKFLOW}" "npm run check:e2e:geometry" "frontend e2e geometry guard command"
require_text "${FRONTEND_E2E_WORKFLOW}" "npm run test:e2e:smoke" "frontend e2e smoke command"
require_text "${FRONTEND_E2E_WORKFLOW}" "npm run test:e2e:core" "frontend e2e core command"
require_text "${FRONTEND_E2E_WORKFLOW}" "npm run test:e2e:mobile-responsive" "frontend e2e mobile command"
require_text "${FRONTEND_E2E_WORKFLOW}" "\$GITHUB_STEP_SUMMARY" "frontend e2e summary output"
require_text "${RELEASE_GATE_WORKFLOW}" "Write release gate summary" "release gate summary step"
require_text "${RELEASE_GATE_WORKFLOW}" "Install repo-local actionlint" "release gate actionlint install step"
require_text "${RELEASE_GATE_WORKFLOW}" "bash ./scripts/install_actionlint.sh" "release gate actionlint install command"
require_text "${RELEASE_GATE_WORKFLOW}" "./scripts/check.sh" "release gate main command"
require_text "${RELEASE_GATE_WORKFLOW}" "npm run check:e2e:geometry" "release gate browser geometry command"
require_text "${RELEASE_GATE_WORKFLOW}" "npm run test:e2e:smoke" "release gate browser smoke command"
require_text "${RELEASE_GATE_WORKFLOW}" "Bundle Budget" "release gate bundle-budget summary"
require_text "${RELEASE_GATE_WORKFLOW}" "npm run bundle:budget" "release gate bundle-budget local command"
require_text "${RELEASE_GATE_WORKFLOW}" "Workflow Lint:" "release gate workflow-lint summary wording"
require_text "${RELEASE_GATE_WORKFLOW}" "Bundle Budget:" "release gate bundle-budget summary wording"
require_text "${RELEASE_GATE_WORKFLOW}" "Bundle Budget Contract:" "release gate bundle-budget contract summary wording"
require_text "${RELEASE_GATE_WORKFLOW}" "Browser Lanes:" "release gate browser-lane summary wording"
require_text "${RELEASE_GATE_WORKFLOW}" "npm run check:bundle-report" "release gate bundle-budget contract local command"
require_text "${RELEASE_GATE_WORKFLOW}" "\$GITHUB_STEP_SUMMARY" "release gate summary output"
require_text "${GITLAB_CI}" "shellcheck:" "GitLab shellcheck job"
require_text "${GITLAB_CI}" "shellcheck -x" "GitLab shellcheck command"
require_text "${GITLAB_CI}" "GO_COVERAGE_MIN_TOTAL" "GitLab Go coverage threshold"
require_text "${GITLAB_CI}" "coverage-summary.txt" "GitLab coverage summary artifact"
require_text "${GITLAB_CI}" "GOLANGCI_LINT_CONFIG" "GitLab golangci config variable"
require_text "${GITLAB_CI}" "--config \"../\${GOLANGCI_LINT_CONFIG}\"" "GitLab golangci config argument"
require_text "${CHECK_SH}" 'npm run check:bundle-report' "full check bundle-report contract test"

python3 "${ROOT}/scripts/check_go_toolchain.py"
echo "[release-gate] ok"
