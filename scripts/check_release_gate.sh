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
BACKUP_PORTABLE_EVIDENCE_TEMPLATE="${ROOT}/docs/release/evidence/BACKUP_PORTABLE_SMOKE_TEMPLATE.md"
FRONTEND_E2E_WORKFLOW="${ROOT}/.github/workflows/frontend-e2e.yml"
RELEASE_GATE_WORKFLOW="${ROOT}/.github/workflows/release-gate.yml"
LICENSE_AUDIT_WORKFLOW="${ROOT}/.github/workflows/license-audit.yml"
GITLAB_CI="${ROOT}/.gitlab-ci.yml"
CHECK_SH="${ROOT}/scripts/check.sh"
DEPLOY_SMOKE_SCRIPT="${ROOT}/scripts/deploy_smoke.sh"
ENV_DEFAULTS="${ROOT}/.env"
ENV_EXAMPLE="${ROOT}/.env.example"
DEMO_COMPOSE="${ROOT}/compose/demo/compose.yml"
PORTABLE_SMOKE_COMPOSE="${ROOT}/compose/test/portable-smoke.yml"
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
GO_LICENSE_REPORT_CHECK="${ROOT}/scripts/check_go_license_report.py"
GO_LICENSE_REPORT_CHECK_TEST="${ROOT}/scripts/check_go_license_report_test.py"
RUNTIME_IMAGE_LICENSE_CHECK="${ROOT}/scripts/check_runtime_image_licenses.py"
RUNTIME_IMAGE_LICENSE_CHECK_TEST="${ROOT}/scripts/check_runtime_image_licenses_test.py"
RELEASE_METADATA_CHECK="${ROOT}/scripts/verify_github_release_metadata.py"
RELEASE_METADATA_CHECK_TEST="${ROOT}/scripts/verify_github_release_metadata_test.py"
RELEASE_READINESS_CHECK_RUNS="${ROOT}/scripts/verify_release_readiness_checks.py"
RELEASE_READINESS_CHECK_RUNS_TEST="${ROOT}/scripts/verify_release_readiness_checks_test.py"
GITLAB_PUBLISH_DAG_CHECK="${ROOT}/scripts/check_gitlab_publish_dag.py"
GITLAB_PUBLISH_DAG_CHECK_TEST="${ROOT}/scripts/check_gitlab_publish_dag_test.py"
GITHUB_WORKFLOW_CHECK_TEST="${ROOT}/scripts/check_github_workflows_test.py"
GITLAB_PUBLISH_READINESS_CHECK="${ROOT}/scripts/check_gitlab_publish_readiness.sh"
RELEASE_CANDIDATE_HELPER="${ROOT}/scripts/release_candidate.py"
RELEASE_CANDIDATE_HELPER_TEST="${ROOT}/scripts/release_candidate_test.py"

require_text() {
  local file="$1"
  local needle="$2"
  local description="$3"
  if ! grep -Fq -- "${needle}" "${file}"; then
    echo "[release-gate] missing ${description}: ${needle}" >&2
    exit 1
  fi
}

require_no_text() {
  local file="$1"
  local needle="$2"
  local description="$3"
  if grep -Fq -- "${needle}" "${file}"; then
    echo "[release-gate] disallowed ${description}: ${needle}" >&2
    exit 1
  fi
}

check_shell_script_syntax() {
  local script
  while IFS= read -r -d '' script; do
    bash -n "${script}"
  done < <(find "${ROOT}/scripts" -type f -name '*.sh' -print0 | sort -z)
}

LATEST_CHANGELOG_SECTION="$(mktemp)"
cleanup() {
  rm -f "${LATEST_CHANGELOG_SECTION}"
}
trap cleanup EXIT

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
if [[ ! -f "${BACKUP_PORTABLE_EVIDENCE_TEMPLATE}" ]]; then
  echo "[release-gate] docs/release/evidence/BACKUP_PORTABLE_SMOKE_TEMPLATE.md not found" >&2
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
if [[ ! -f "${ENV_DEFAULTS}" ]]; then
  echo "[release-gate] .env not found" >&2
  exit 1
fi
if [[ ! -f "${ENV_EXAMPLE}" ]]; then
  echo "[release-gate] .env.example not found" >&2
  exit 1
fi
if [[ ! -f "${DEMO_COMPOSE}" ]]; then
  echo "[release-gate] compose/demo/compose.yml not found" >&2
  exit 1
fi
if [[ ! -f "${PORTABLE_SMOKE_COMPOSE}" ]]; then
  echo "[release-gate] compose/test/portable-smoke.yml not found" >&2
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
if [[ ! -f "${GO_LICENSE_REPORT_CHECK}" ]]; then
  echo "[release-gate] scripts/check_go_license_report.py not found" >&2
  exit 1
fi
if [[ ! -f "${GO_LICENSE_REPORT_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/check_go_license_report_test.py not found" >&2
  exit 1
fi
if [[ ! -f "${RUNTIME_IMAGE_LICENSE_CHECK}" ]]; then
  echo "[release-gate] scripts/check_runtime_image_licenses.py not found" >&2
  exit 1
fi
if [[ ! -f "${RUNTIME_IMAGE_LICENSE_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/check_runtime_image_licenses_test.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_METADATA_CHECK}" ]]; then
  echo "[release-gate] scripts/verify_github_release_metadata.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_METADATA_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/verify_github_release_metadata_test.py not found" >&2
  exit 1
fi
if [[ ! -f "${GITLAB_PUBLISH_DAG_CHECK}" ]]; then
  echo "[release-gate] scripts/check_gitlab_publish_dag.py not found" >&2
  exit 1
fi
if [[ ! -f "${GITLAB_PUBLISH_DAG_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/check_gitlab_publish_dag_test.py not found" >&2
  exit 1
fi
if [[ ! -f "${GITHUB_WORKFLOW_CHECK_TEST}" ]]; then
  echo "[release-gate] scripts/check_github_workflows_test.py not found" >&2
  exit 1
fi
if [[ ! -f "${GITLAB_PUBLISH_READINESS_CHECK}" ]]; then
  echo "[release-gate] scripts/check_gitlab_publish_readiness.sh not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_CANDIDATE_HELPER}" ]]; then
  echo "[release-gate] scripts/release_candidate.py not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_CANDIDATE_HELPER_TEST}" ]]; then
  echo "[release-gate] scripts/release_candidate_test.py not found" >&2
  exit 1
fi

awk '
  /^##[[:space:]]+/ {
    heading = $0
    sub(/^##[[:space:]]+/, "", heading)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", heading)
    if (tolower(heading) == "unreleased") {
      next
    }
    if (found) {
      exit
    }
    found = 1
  }
  found {
    print
  }
' "${CHANGELOG}" >"${LATEST_CHANGELOG_SECTION}"
if [[ ! -s "${LATEST_CHANGELOG_SECTION}" ]]; then
  echo "[release-gate] latest versioned changelog section not found" >&2
  exit 1
fi
LATEST_RELEASE_CANDIDATE="$(python3 "${RELEASE_CANDIDATE_HELPER}")"
if [[ -z "${LATEST_RELEASE_CANDIDATE}" ]]; then
  echo "[release-gate] latest release candidate could not be derived from CHANGELOG.md" >&2
  exit 1
fi

python3 "${RELEASE_CANDIDATE_HELPER_TEST}"
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
python3 "${GO_LICENSE_REPORT_CHECK_TEST}"
python3 "${RUNTIME_IMAGE_LICENSE_CHECK_TEST}"
python3 "${RELEASE_METADATA_CHECK_TEST}"
python3 "${GITLAB_PUBLISH_DAG_CHECK_TEST}"
python3 "${GITHUB_WORKFLOW_CHECK_TEST}"
python3 "${GITLAB_PUBLISH_DAG_CHECK}"
python3 "${RELEASE_EVIDENCE_CHECKLIST_CHECK}" --candidate-id "${LATEST_RELEASE_CANDIDATE}"
check_shell_script_syntax

require_text "${CHANGELOG}" "## Unreleased" "Unreleased changelog section"
require_text "${LATEST_CHANGELOG_SECTION}" "### Known Limitations" "Known Limitations changelog section"
require_text "${LATEST_CHANGELOG_SECTION}" "Azure legal hold remains read-only in S3Desk." "Azure legal hold known limitation"
require_text "${LATEST_CHANGELOG_SECTION}" "Azure immutability editing requires ARM credentials in addition to storage credentials." "Azure immutability known limitation"
require_text "${LATEST_CHANGELOG_SECTION}" "OCI PAR edits are delete-and-recreate rather than in-place mutation" "OCI PAR mutation known limitation"
require_text "${LATEST_CHANGELOG_SECTION}" "AWS typed bucket governance still does not cover Object Lock." "AWS Object Lock known limitation"
require_text "${LATEST_CHANGELOG_SECTION}" "In-product backup and staged restore target sqlite \`DATA_DIR\` workflows and do not replace Postgres disaster recovery." "sqlite backup known limitation"

require_no_text "${ENV_DEFAULTS}" "docker.io/minio/minio:latest" "floating MinIO server image in .env"
require_no_text "${ENV_DEFAULTS}" "docker.io/minio/mc:latest" "floating MinIO client image in .env"
require_no_text "${ENV_EXAMPLE}" "docker.io/minio/minio:latest" "floating MinIO server image in .env.example"
require_no_text "${ENV_EXAMPLE}" "docker.io/minio/mc:latest" "floating MinIO client image in .env.example"
require_no_text "${DEMO_COMPOSE}" "docker.io/minio/minio:latest" "floating MinIO server image in demo compose"
require_no_text "${DEMO_COMPOSE}" "docker.io/minio/mc:latest" "floating MinIO client image in demo compose"
require_no_text "${PORTABLE_SMOKE_COMPOSE}" "docker.io/minio/minio:latest" "floating MinIO server image in portable smoke compose"
require_no_text "${PORTABLE_SMOKE_COMPOSE}" "docker.io/minio/mc:latest" "floating MinIO client image in portable smoke compose"
require_no_text "${GITLAB_CI}" "quay.io/podman/stable:latest" "floating GitLab Podman release image"
require_no_text "${GITLAB_CI}" 'PODMAN_IMAGE: "quay.io/podman/stable:latest"' "floating GitLab Podman release image variable"

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
require_text "${RELEASE_GATE}" "reports a candidate identity blocker when an existing tag candidate does not resolve to the checked \`--head\`" "release readiness candidate identity documentation"
require_text "${RELEASE_GATE}" "provider-live, reverse-proxy, or backup-portable evidence" "release evidence backup-portable scope documentation"
require_text "${RELEASE_GATE}" "Backup Portable Smoke Gate" "backup-portable release gate section"
require_text "${RELEASE_GATE}" "BACKUP_PORTABLE_SMOKE_TEMPLATE.md" "backup-portable release gate template documentation"
require_text "${RELEASE_GATE}" "each portable smoke script in \`## Smoke Results\` records a pass/success result" "backup-portable release gate per-script evidence documentation"
require_text "${RELEASE_GATE}" "exits non-zero until required provider/reverse-proxy/backup-portable evidence is present" "release readiness evidence-blocker warning"
require_text "${RELEASE_GATE}" "does not replace \`./scripts/check.sh full\`, clean-snapshot verification, or the browser lanes" "release readiness scope warning"
require_text "${RELEASE_GATE}" "GitLab tag publish safeguard" "GitLab publish readiness gate documentation"
require_text "${RELEASE_GATE}" "bash scripts/check_gitlab_publish_readiness.sh \"\$CI_COMMIT_TAG\"" "GitLab publish readiness command documentation"
require_text "${RELEASE_GATE}" "scripts/verify_release_readiness.sh" "GitLab publish readiness GitHub release verification documentation"
require_text "${RELEASE_GATE}" "GitHub Release tag/title, body, \`Full Changelog\` compare link, prerelease flag, and required check state" "GitLab publish readiness GitHub release-state documentation"
require_text "${RELEASE_GATE}" "masked \`GH_TOKEN\` or \`GITHUB_TOKEN\` are required in GitLab CI" "GitLab publish readiness token requirement documentation"
require_text "${RELEASE_GATE}" "Default required GitHub checks are \`release-gate\`, \`Core Mock E2E\`, \`Mobile Responsive E2E (Required)\`, and \`license-audit\`" "GitLab publish readiness default check documentation"
require_text "${RELEASE_GATE}" "python3 scripts/check_gitlab_publish_dag.py" "GitLab publish DAG checker documentation"
require_text "${RELEASE_GATE}" "\`publish_dockerhub\` -> \`release_image_smoke\` -> \`publish_helm_chart\` -> \`deploy_release_helm\`" "GitLab Helm publish ordering documentation"
require_text "${RELEASE_GATE}" "Runtime license audit is a release-publish blocker" "release gate runtime license audit blocker documentation"
require_text "${RELEASE_GATE}" "GitHub \`License Audit\` workflow is intentionally not path-scoped" "release gate license audit non-path-scoped documentation"
require_text "${RELEASE_GATE}" "DEPLOY_RELEASE_BASE" "GitLab publish readiness base override documentation"
require_text "${RELEASE_GATE}" "Deploy scripts run \`python3 scripts/check_live_evidence_env.py --scope reverse-proxy\` before compose or Helm target mutation" "deploy pre-mutation env preflight documentation"
require_text "${RELEASE_GATE}" "helm upgrade --install --dry-run=client" "Helm deploy dry-run documentation"
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
require_text "${RELEASE_GATE}" "Go \`1.25.10\`" "Go toolchain release documentation"
require_text "${RELEASE_GATE}" "python3 scripts/check_go_toolchain.py" "Go toolchain parity command"
require_text "${RELEASE_GATE}" "\`staticcheck\`, \`gosec\`, and \`govulncheck\`" "backend security gate documentation"
require_text "${RELEASE_GATE}" "\`security_fs_scan\` runs Trivy" "GitLab Trivy additive gate documentation"
require_text "${RELEASE_GATE}" "\`gitleaks_scan\` runs Gitleaks" "GitLab Gitleaks additive gate documentation"
require_text "${RELEASE_GATE}" "\`PODMAN_IMAGE\` uses a digest reference" "GitLab Podman image pin release documentation"
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
require_text "${TESTING_DOC}" "checks that an existing tag candidate resolves to the requested \`--head\`" "release readiness candidate identity testing documentation"
require_text "${TESTING_DOC}" "provider-live, reverse-proxy, or backup-portable evidence" "release evidence backup-portable testing scope"
require_text "${TESTING_DOC}" "backup-portable-smoke-<tag-or-sha>.md" "backup-portable evidence target testing documentation"
require_text "${TESTING_DOC}" "all four portable smoke scripts in \`## Smoke Results\`" "backup-portable testing per-script evidence documentation"
require_text "${TESTING_DOC}" "It exits non-zero while live evidence is still missing" "release readiness testing blocker warning"
require_text "${TESTING_DOC}" "does not replace \`./scripts/check.sh full\`, clean-snapshot verification, or browser-lane evidence" "release readiness testing scope warning"
require_text "${TESTING_DOC}" "bash scripts/check_gitlab_publish_readiness.sh <tag>" "GitLab publish readiness testing command"
require_text "${TESTING_DOC}" "scripts/verify_release_readiness.sh" "GitLab publish readiness testing release verification delegation"
require_text "${TESTING_DOC}" "GitHub Release tag/title, body, \`Full Changelog\` compare link, prerelease flag, and required check state" "GitLab publish readiness testing GitHub release-state documentation"
require_text "${TESTING_DOC}" "\`curl\` and \`GH_TOKEN\` or \`GITHUB_TOKEN\` are required in GitLab CI" "GitLab publish readiness testing token requirement"
require_text "${TESTING_DOC}" "By default it requires the exact GitHub check names \`release-gate\`, \`Core Mock E2E\`, \`Mobile Responsive E2E (Required)\`, and \`license-audit\`" "GitLab publish readiness testing default check documentation"
require_text "${TESTING_DOC}" "GitLab tag pipelines run \`license_audit_runtime\` with \`bash scripts/license-audit.sh runtime-only\`" "testing runtime license audit release guidance"
require_text "${TESTING_DOC}" "GitHub \`License Audit\` workflow is intentionally not path-scoped" "testing license audit non-path-scoped guidance"
require_text "${TESTING_DOC}" "\`PODMAN_IMAGE\` must not point at \`quay.io/podman/stable:latest\`" "GitLab Podman image pin testing documentation"
require_text "${TESTING_DOC}" "before Docker Hub or Helm publication" "GitLab publish readiness testing scope"
require_text "${TESTING_DOC}" "python3 scripts/check_gitlab_publish_dag.py" "GitLab publish DAG testing command"
require_text "${TESTING_DOC}" "publish_dockerhub\` -> \`release_image_smoke\` -> \`publish_helm_chart\` -> \`deploy_release_helm" "GitLab Helm publish ordering testing documentation"
require_text "${TESTING_DOC}" "bash scripts/run_portable_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_smoke.sh && bash scripts/run_portable_sqlite_to_postgres_smoke.sh" "canonical backup-portable smoke testing command"
require_text "${TESTING_DOC}" "Evidence \`## Smoke Results\` must use the exact \`bash scripts/...\` labels" "canonical backup-portable smoke result labels"
require_no_text "${TESTING_DOC}" "./scripts/run_portable_" "non-canonical portable smoke script invocation in testing docs"
require_text "${TESTING_DOC}" "fail before remote mutation when reverse-proxy smoke inputs are missing" "deploy pre-mutation env preflight testing documentation"
require_text "${TESTING_DOC}" "helm upgrade --install --dry-run=client" "Helm deploy dry-run testing documentation"
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
require_text "${DEPLOYMENT_CHECKLIST}" "provider/reverse-proxy/backup-portable evidence가 없으면 실패한다" "deployment checklist release readiness blocker warning"
require_text "${DEPLOYMENT_CHECKLIST}" "clean-snapshot 검증, browser lane evidence를 대체하면 안 된다" "deployment checklist release readiness scope warning"
require_text "${DEPLOYMENT_CHECKLIST}" "bash scripts/check_gitlab_publish_readiness.sh <tag>" "deployment checklist GitLab publish readiness command"
require_text "${DEPLOYMENT_CHECKLIST}" "scripts/verify_release_readiness.sh" "deployment checklist GitLab publish release verification delegation"
require_text "${DEPLOYMENT_CHECKLIST}" "GitHub Release tag/title/body/check 상태" "deployment checklist GitLab publish GitHub release/check-state documentation"
require_text "${DEPLOYMENT_CHECKLIST}" "\`curl\`과 \`GH_TOKEN\` 또는 \`GITHUB_TOKEN\`이 필요하다" "deployment checklist GitLab publish token requirement"
require_text "${DEPLOYMENT_CHECKLIST}" "DEPLOY_RELEASE_BASE" "deployment checklist GitLab publish readiness base override"
require_text "${DEPLOYMENT_CHECKLIST}" "python3 scripts/check_gitlab_publish_dag.py" "deployment checklist GitLab publish DAG command"
require_text "${DEPLOYMENT_CHECKLIST}" "publish_dockerhub\` -> \`release_image_smoke\` -> \`publish_helm_chart\` -> \`deploy_release_helm" "deployment checklist Helm publish ordering"
require_text "${DEPLOYMENT_CHECKLIST}" "원격 대상 변경 전에 \`python3 scripts/check_live_evidence_env.py --scope reverse-proxy\`" "deployment checklist pre-mutation env preflight"
require_text "${DEPLOYMENT_CHECKLIST}" "client dry-run render" "deployment checklist Helm dry-run"
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
require_text "${RELEASE_EVIDENCE_README}" "Backup-portable requirements include \`required_check_fields\`" "backup-portable JSON check fields"
require_text "${RELEASE_EVIDENCE_README}" "\`check_status_expectations\`" "release evidence JSON reverse-proxy status expectations"
require_text "${RELEASE_EVIDENCE_README}" "\`check_result_expectations\`" "release evidence JSON reverse-proxy non-status expectations"
require_text "${RELEASE_EVIDENCE_README}" "use that concrete candidate identifier" "release evidence candidate-specific remediation targets"
require_text "${RELEASE_EVIDENCE_README}" "\`final_gate_commands\`" "release evidence JSON final gate commands field"
require_text "${RELEASE_EVIDENCE_README}" "backup-portable evidence requirements" "release evidence backup-portable requirement"
require_text "${RELEASE_EVIDENCE_README}" "all four portable smoke scripts in \`## Smoke Results\`" "backup-portable per-script result requirement"
require_text "${RELEASE_EVIDENCE_README}" "BACKUP_PORTABLE_SMOKE_TEMPLATE.md" "backup-portable evidence template documentation"
require_text "${RELEASE_EVIDENCE_README}" "backup-portable-smoke-<tag-or-sha>.md" "backup-portable evidence target documentation"
require_text "${RELEASE_EVIDENCE_README}" "supported \`Provider name\`" "release evidence provider identity requirement"
require_text "${RELEASE_EVIDENCE_README}" "provider-native console or CLI confirmation on success" "release evidence provider-native confirmation requirement"
require_text "${RELEASE_EVIDENCE_README}" "Provider Live Validation" "release evidence provider section"
require_text "${RELEASE_EVIDENCE_README}" "LIVE_EVIDENCE_CHECKLIST_" "current live evidence checklist link"
require_text "${RELEASE_EVIDENCE_README}" "scripts/check_release_evidence_checklist.py" "release evidence checklist sync command"
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
require_no_text "${REVERSE_PROXY_EVIDENCE_TEMPLATE}" "Command used:" "reverse-proxy template-only command metadata"
require_no_text "${REVERSE_PROXY_EVIDENCE_TEMPLATE}" "Evidence generated by \`DEPLOY_SMOKE_EVIDENCE_FILE\`" "reverse-proxy template-only evidence-file metadata"
require_text "${BACKUP_PORTABLE_EVIDENCE_TEMPLATE}" "Backup portable smoke:" "backup-portable evidence template result field"
require_text "${BACKUP_PORTABLE_EVIDENCE_TEMPLATE}" "## Smoke Results" "backup-portable evidence template smoke results section"
require_text "${BACKUP_PORTABLE_EVIDENCE_TEMPLATE}" "bash scripts/run_portable_sqlite_to_postgres_smoke.sh" "backup-portable evidence template sqlite-to-postgres smoke command"
require_text "${BACKUP_PORTABLE_EVIDENCE_TEMPLATE}" "Each smoke result line must use" "backup-portable evidence template per-script result guidance"
require_text "${BACKUP_PORTABLE_EVIDENCE_TEMPLATE}" "Do not include API tokens" "backup-portable evidence template secret guidance"
require_text "${DEPLOY_SMOKE_SCRIPT}" "## Expected Statuses" "deploy smoke generated evidence expected statuses"
require_text "${DEPLOY_SMOKE_SCRIPT}" "Signed proxy URL root matches expected external base URL" "deploy smoke generated evidence signed root status reference"
require_text "${ROOT}/scripts/deploy_compose_release.sh" "python3 \"\${ROOT}/scripts/check_live_evidence_env.py\" --scope reverse-proxy" "compose deploy pre-mutation env preflight"
require_text "${ROOT}/scripts/deploy_compose_release.sh" 'compose -f "\${DEPLOY_COMPOSE_FILE}" config >/dev/null' "compose deploy config preflight"
require_text "${ROOT}/scripts/deploy_compose_release.sh" "StrictHostKeyChecking=yes" "compose deploy strict SSH host-key checking"
require_text "${ROOT}/scripts/deploy_compose_release.sh" "DEPLOY_SSH_KNOWN_HOSTS" "compose deploy known_hosts requirement"
require_text "${ROOT}/scripts/deploy_helm_release.sh" "python3 \"\${ROOT}/scripts/check_live_evidence_env.py\" --scope reverse-proxy" "Helm deploy pre-mutation env preflight"
require_text "${ROOT}/scripts/deploy_helm_release.sh" "helm \"\${helm_args[@]}\" --dry-run=client >/dev/null" "Helm deploy dry-run preflight"
require_text "${GITLAB_CI}" "apk add --no-cache bash openssh-client curl git python3" "GitLab compose deploy readiness toolchain"
require_text "${GITLAB_CI}" "DEPLOY_SSH_KNOWN_HOSTS is required for compose deployments" "GitLab compose deploy known_hosts requirement"
require_no_text "${GITLAB_CI}" "ssh-keyscan" "GitLab compose deploy live known_hosts bootstrap"
require_text "${GITLAB_CI}" "apk add --no-cache curl tar ca-certificates bash coreutils git python3" "GitLab Helm deploy readiness toolchain"
require_text "${GITLAB_CI}" "release_readiness_preflight" "GitLab release readiness preflight job"
require_text "${GITLAB_CI}" "  - chart-publish" "GitLab chart publish stage after published-image smoke"
require_text "${GITLAB_CI}" "apk add --no-cache bash curl git python3" "GitLab release readiness preflight installs curl"
require_text "${GITLAB_CI}" "bash scripts/check_gitlab_publish_readiness.sh \"\$CI_COMMIT_TAG\"" "GitLab release readiness preflight command"
require_text "${GITLAB_CI}" 'GOVULNCHECK_VERSION: "v1.1.4"' "GitLab govulncheck pinned version"
require_text "${GITLAB_CI}" 'PODMAN_COMPOSE_VERSION: "1.5.0"' "GitLab podman-compose pinned version"
require_text "${GITLAB_CI}" 'podman-compose==${PODMAN_COMPOSE_VERSION}' "GitLab release image smoke pinned podman-compose install"
require_no_text "${GITLAB_CI}" 'GOVULNCHECK_VERSION: "latest"' "GitLab govulncheck mutable latest version"
require_text "${ROOT}/scripts/ci_podman_compose.sh" 'podman-compose==${PODMAN_COMPOSE_VERSION}' "CI podman compose helper pinned install"
require_text "${ROOT}/scripts/license-audit.sh" "GO_LICENSES_VERSION" "license audit go-licenses pinned version variable"
require_text "${ROOT}/scripts/license-audit.sh" 'github.com/google/go-licenses@${GO_LICENSES_VERSION}' "license audit pinned go-licenses install"
require_no_text "${ROOT}/scripts/license-audit.sh" "go-licenses@latest" "license audit mutable latest install"
require_text "${ROOT}/scripts/license-audit.sh" "GO_ALLOWED_LICENSES" "license audit Go license allow-list"
require_text "${ROOT}/scripts/license-audit.sh" "GO_LICENSE_IGNORE_PREFIXES" "license audit ignores first-party Go packages"
require_text "${ROOT}/scripts/license-audit.sh" "GO_LICENSE_OVERRIDES" "license audit Go license override list"
require_text "${ROOT}/scripts/license-audit.sh" "check_go_license_report.py" "license audit delegates Go report allow-list parsing"
require_text "${ROOT}/scripts/license-audit.sh" "IMAGE_ALLOWED_LICENSES" "license audit runtime image APK license allow-list"
require_text "${ROOT}/scripts/license-audit.sh" "LICENSE_AUDIT_IMAGE_TARS" "license audit runtime image tar input override"
require_text "${ROOT}/scripts/license-audit.sh" "check_runtime_image_licenses.py" "license audit delegates runtime image package parsing"
require_text "${ROOT}/scripts/license-audit.sh" "copied runtime rclone binary notice" "license audit checks copied runtime binary notice"
require_text "${GO_LICENSE_REPORT_CHECK}" "csv.reader" "Go license report parser handles CSV output"
require_text "${GO_LICENSE_REPORT_CHECK_TEST}" "test_unknown_is_case_insensitive" "Go license report unknown regression test"
require_text "${RUNTIME_IMAGE_LICENSE_CHECK}" "lib/apk/db/installed" "runtime image license parser reads Alpine APK database"
require_text "${RUNTIME_IMAGE_LICENSE_CHECK_TEST}" "test_reads_docker_archive_apk_db" "runtime image license Docker archive regression test"
require_text "${GITLAB_PUBLISH_READINESS_CHECK}" "scripts/verify_release_readiness.sh" "GitLab publish readiness verifies GitHub release readiness"
require_text "${ROOT}/scripts/verify_release_readiness.sh" "GH_TOKEN or GITHUB_TOKEN is required" "release readiness verifier requires GitHub token"
require_text "${ROOT}/scripts/verify_release_readiness.sh" "curl is required to verify GitHub Release/check state" "release readiness verifier requires curl"
require_text "${ROOT}/scripts/verify_release_readiness.sh" "verify_github_release_metadata.py" "release readiness verifier delegates GitHub release metadata validation"
require_text "${RELEASE_METADATA_CHECK}" "Full Changelog" "release metadata verifier requires GitHub release changelog"
require_text "${RELEASE_METADATA_CHECK}" "expected_compare" "release metadata verifier requires exact GitHub release compare link"
require_text "${RELEASE_METADATA_CHECK}" "prerelease" "release metadata verifier validates GitHub prerelease flag"
require_text "${RELEASE_METADATA_CHECK}" "tag_name" "release metadata verifier validates GitHub release tag name"
require_text "${RELEASE_METADATA_CHECK}" "title is" "release metadata verifier validates GitHub release title"
require_text "${RELEASE_METADATA_CHECK_TEST}" "test_rejects_mismatched_tag_name_and_title" "release metadata tag/title regression test"
require_text "${GITLAB_CI}" "license_audit_runtime:" "GitLab runtime license audit job"
require_text "${GITLAB_CI}" "optional: true" "GitLab runtime license audit optionally consumes release image artifacts"
require_text "${GITLAB_CI}" "bash scripts/license-audit.sh runtime-only" "GitLab runtime license audit command"
require_text "${GITLAB_CI}" "- license_audit_runtime" "DockerHub publish depends on runtime license audit"
require_text "${GITLAB_CI}" "publish_helm_chart:" "GitLab Helm chart publish job"
require_text "${GITLAB_CI}" "stage: chart-publish" "GitLab Helm chart publish runs after published-image smoke stage"
require_text "${GITLAB_CI}" "- release_image_smoke" "GitLab Helm chart publish waits for published-image smoke"
require_text "${GITLAB_PUBLISH_DAG_CHECK}" "publish_helm_chart" "GitLab publish DAG structural checker covers Helm chart publish"
require_text "${ROOT}/scripts/verify_release_readiness.sh" "release-gate,Core Mock E2E,Mobile Responsive E2E (Required),license-audit" "release readiness verifier default required checks"
require_text "${ROOT}/scripts/verify_release_readiness.sh" "DEPLOY_REQUIRED_CHECKS" "release readiness verifier required checks override"
require_text "${ROOT}/scripts/verify_release_readiness.sh" "verify_release_readiness_checks.py" "release readiness verifier delegates check-run reduction"
require_text "${RELEASE_READINESS_CHECK_RUNS}" "latest_check_states" "release readiness check-run helper deduplicates check names"
require_text "${RELEASE_READINESS_CHECK_RUNS_TEST}" "test_latest_success_wins_over_stale_failure" "release readiness stale check-run regression test"
require_text "${RELEASE_GATE_WORKFLOW}" "release-gate:" "release gate workflow check name"
require_text "${FRONTEND_E2E_WORKFLOW}" "name: Core Mock E2E" "frontend e2e core check name"
require_text "${FRONTEND_E2E_WORKFLOW}" "name: Mobile Responsive E2E (Required)" "frontend e2e mobile check name"
require_text "${LICENSE_AUDIT_WORKFLOW}" "name: License Audit" "license audit workflow check name"
require_text "${LICENSE_AUDIT_WORKFLOW}" "license-audit:" "license audit workflow job"
require_no_text "${LICENSE_AUDIT_WORKFLOW}" "paths:" "license audit workflow path-scoped trigger"
require_text "${GITLAB_CI}" "- release_readiness_preflight" "DockerHub publish depends on GitLab release readiness preflight"
require_text "${GITLAB_CI}" "- security_fs_scan" "DockerHub publish depends on GitLab filesystem security scan"
require_text "${GITLAB_CI}" "- gitleaks_scan" "DockerHub publish depends on GitLab secret scan"
require_text "${GITLAB_CI}" "tests/server-migration-live.spec.ts" "GitLab live E2E server migration parity"
require_text "${GITLAB_CI}" "tests/uploads-folder-live.spec.ts" "GitLab live E2E uploads folder parity"
require_text "${GITLAB_CI}" "tests/objects-image-preview-live.spec.ts" "GitLab live E2E image preview parity"
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
require_text "${FRONTEND_E2E_WORKFLOW}" ".github/workflows/frontend-e2e.yml" "frontend e2e workflow changes trigger browser lanes"
require_text "${FRONTEND_E2E_WORKFLOW}" "backend/internal/jobs/**" "frontend e2e jobs browser-surface scope"
require_text "${FRONTEND_E2E_WORKFLOW}" "backend/internal/store/**" "frontend e2e store browser-surface scope"
require_text "${FRONTEND_E2E_WORKFLOW}" "backend/internal/localpath/**" "frontend e2e localpath browser-surface scope"
require_text "${FRONTEND_E2E_WORKFLOW}" "backend/internal/redact/**" "frontend e2e redaction browser-surface scope"
require_text "${FRONTEND_E2E_WORKFLOW}" "backend/internal/ws/**" "frontend e2e realtime browser-surface scope"
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
