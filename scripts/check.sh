#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-full}"
REPRO_FOCUS_SCRIPT="${ROOT}/scripts/repro_backend_focus.sh"
export GOTOOLCHAIN="${GOTOOLCHAIN:-auto}"

case "${MODE}" in
  fast|full) ;;
  *)
    echo "[check] unknown mode: ${MODE}" >&2
    echo "[check] usage: ./scripts/check.sh [fast|full]" >&2
    exit 1
    ;;
esac

echo "[check] mode: ${MODE}"
if [[ "${MODE}" == "full" ]]; then
  echo "[check] local scope: mirrors the Release Gate workflow and includes check-smoke, but not the separate Core Mock E2E or Mobile Responsive E2E (Required) lanes"
else
  echo "[check] local scope: fast non-browser verification path; not equivalent to release-gate or the required browser checks"
fi

GO_BIN="${GO_BIN:-}"
if [[ -z "${GO_BIN}" ]]; then
  if command -v go >/dev/null 2>&1; then
    GO_BIN="go"
  elif [[ -x "${ROOT}/.tools/go/bin/go" ]]; then
    GO_BIN="${ROOT}/.tools/go/bin/go"
  else
    echo "[check] go not found (install Go or add .tools/go)" >&2
    exit 1
  fi
fi

GOFMT_BIN="${GOFMT_BIN:-}"
if [[ -z "${GOFMT_BIN}" ]]; then
  if command -v gofmt >/dev/null 2>&1; then
    GOFMT_BIN="gofmt"
  elif [[ -x "$(dirname "${GO_BIN}")/gofmt" ]]; then
    GOFMT_BIN="$(dirname "${GO_BIN}")/gofmt"
  else
    echo "[check] gofmt not found (install Go or add .tools/go)" >&2
    exit 1
  fi
fi

resolve_go_helper_tool() {
  local var_name="$1"
  local tool_name="$2"
  local current_value="${!var_name:-}"
  if [[ -n "${current_value}" ]]; then
    return 0
  fi
  if command -v "${tool_name}" >/dev/null 2>&1; then
    printf -v "${var_name}" '%s' "${tool_name}"
    return 0
  fi
  if [[ -x "${ROOT}/.tools/go/bin/${tool_name}" ]]; then
    printf -v "${var_name}" '%s' "${ROOT}/.tools/go/bin/${tool_name}"
    return 0
  fi
  return 1
}

third_party_notice_snapshot() {
  (
    cd "${ROOT}"
    if [[ -f "THIRD_PARTY_NOTICES.md" ]]; then
      sed '/^Generated at /d' "THIRD_PARTY_NOTICES.md" | sha256sum | awk '{print $1 "  THIRD_PARTY_NOTICES.md"}'
    else
      printf 'MISSING  THIRD_PARTY_NOTICES.md\n'
    fi

    if [[ -d "third_party/licenses" ]]; then
      find "third_party/licenses" -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum
    else
      printf 'MISSING_DIR  third_party/licenses\n'
    fi
  )
}

echo "[check] openapi"
bash "${ROOT}/scripts/validate_openapi.sh"

echo "[check] release gate"
bash "${ROOT}/scripts/check_release_gate.sh"

echo "[check] github workflows"
bash "${ROOT}/scripts/check_github_workflows.sh"

if command -v helm >/dev/null 2>&1; then
  echo "[check] helm chart"
  bash "${ROOT}/scripts/check_helm_chart.sh"
else
  if [[ "${MODE}" == "full" ]]; then
    echo "[check] helm not found; full mode requires helm chart validation" >&2
    exit 1
  fi
  echo "[check] helm not found; skipping helm chart validation in fast mode" >&2
fi

echo "[check] gofmt"
backend_go_files=()
while IFS= read -r -d '' path; do
  backend_go_files+=("${path}")
done < <(find "${ROOT}/backend" -name '*.go' -type f -print0)

UNFORMATTED=""
if [[ ${#backend_go_files[@]} -gt 0 ]]; then
  UNFORMATTED=$("${GOFMT_BIN}" -l "${backend_go_files[@]}")
fi
if [[ -n "${UNFORMATTED}" ]]; then
  echo "[check] gofmt needed:" >&2
  echo "${UNFORMATTED}" >&2
  exit 1
fi

echo "[check] backend"
(
  cd "${ROOT}/backend"
  "${GO_BIN}" vet ./...
  if [[ "${MODE}" == "fast" ]]; then
    if ! "${GO_BIN}" test ./...; then
      if [[ -x "${REPRO_FOCUS_SCRIPT}" ]]; then
        echo "[check] backend tests failed; running focused backend repro" >&2
        bash "${REPRO_FOCUS_SCRIPT}" all || true
      fi
      exit 1
    fi
  else
    "${GO_BIN}" test ./...
  fi
  if [[ "${MODE}" == "full" ]]; then
    echo "[check] backend security analysis"

    STATICCHECK_BIN="${STATICCHECK_BIN:-}"
    GOSEC_BIN="${GOSEC_BIN:-}"
    GOVULNCHECK_BIN="${GOVULNCHECK_BIN:-}"

    if ! resolve_go_helper_tool STATICCHECK_BIN staticcheck; then
      echo "[check] staticcheck not found" >&2
      echo "[check] install with: go install honnef.co/go/tools/cmd/staticcheck@v0.6.1" >&2
      exit 1
    fi
    if ! resolve_go_helper_tool GOSEC_BIN gosec; then
      echo "[check] gosec not found" >&2
      echo "[check] install with: go install github.com/securego/gosec/v2/cmd/gosec@v2.23.0" >&2
      exit 1
    fi
    if ! resolve_go_helper_tool GOVULNCHECK_BIN govulncheck; then
      echo "[check] govulncheck not found" >&2
      echo "[check] install with: go install golang.org/x/vuln/cmd/govulncheck@v1.1.4" >&2
      exit 1
    fi

    # G117 and the taint-analysis rules G702-G705 currently generate
    # high-volume false positives for intentional secret models,
    # validated subprocess paths, server-managed filesystem paths, and
    # provider-configured endpoints that are already covered by dedicated
    # validators and tests. Keep deterministic rules enabled in the gate.
    GOSEC_EXCLUDES="${GOSEC_EXCLUDES:-G117,G702,G703,G704,G705}"

    "${STATICCHECK_BIN}" ./...
    "${GOSEC_BIN}" -quiet -exclude="${GOSEC_EXCLUDES}" ./...
    "${GOVULNCHECK_BIN}" ./...
  fi
)

REQUIRED_NODE_MAJOR="${REQUIRED_NODE_MAJOR:-22}"
REQUIRED_NODE_MAJOR="$(echo "${REQUIRED_NODE_MAJOR}" | sed -E 's/^([0-9]+).*/\1/')"
if [[ -z "${REQUIRED_NODE_MAJOR}" ]]; then
  REQUIRED_NODE_MAJOR="22"
fi
REQUIRED_NPM_VERSION="${REQUIRED_NPM_VERSION:-10.9.4}"

if ! command -v node >/dev/null 2>&1; then
  echo "[check] node not found (expected Node ${REQUIRED_NODE_MAJOR}.x)" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[check] npm not found (expected npm ${REQUIRED_NPM_VERSION})" >&2
  exit 1
fi

node_version="$(node --version)"
node_major="$(echo "${node_version}" | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "${node_major}" != "${REQUIRED_NODE_MAJOR}" ]]; then
  echo "[check] node ${node_version} found; expected Node ${REQUIRED_NODE_MAJOR}.x" >&2
  exit 1
fi

npm_version="$(npm --version)"
npm_major="$(echo "${npm_version}" | sed -E 's/^([0-9]+).*/\1/')"
required_npm_major="$(echo "${REQUIRED_NPM_VERSION}" | sed -E 's/^([0-9]+).*/\1/')"
if [[ -z "${required_npm_major}" ]]; then
  required_npm_major="10"
fi
if [[ "${npm_major}" != "${required_npm_major}" ]]; then
  echo "[check] npm ${npm_version} found; expected npm ${REQUIRED_NPM_VERSION} (major ${required_npm_major}.x)" >&2
  exit 1
fi
if [[ "${npm_version}" != "${REQUIRED_NPM_VERSION}" ]]; then
  echo "[check] npm ${npm_version} found; recommended npm ${REQUIRED_NPM_VERSION}" >&2
fi

echo "[check] bundle report"
(
  cd "${ROOT}/frontend"
  npm run check:bundle-report
)

echo "[check] frontend"
(
  cd "${ROOT}/frontend"
  npm ci --no-audit --no-fund
  npm run check:openapi
  npm run check:e2e:geometry
  npm run lint
  npm run test:unit
  npm run build
  if [[ "${MODE}" == "full" ]]; then
    echo "[check] frontend browser smoke"
    if ! npm run test:e2e:smoke; then
      echo "[check] browser smoke failed" >&2
      echo "[check] if Playwright Chromium is missing, run: cd frontend && npx playwright install --with-deps chromium" >&2
      exit 1
    fi
  fi
)

echo "[check] third-party notices"
third_party_notice_before="$(mktemp)"
third_party_notice_after="$(mktemp)"
cleanup_third_party_notice_snapshots() {
  rm -f "${third_party_notice_before}" "${third_party_notice_after}"
}
trap cleanup_third_party_notice_snapshots EXIT

third_party_notice_snapshot >"${third_party_notice_before}"
python3 "${ROOT}/scripts/generate_third_party_notices.py"
third_party_notice_snapshot >"${third_party_notice_after}"
if ! diff -u "${third_party_notice_before}" "${third_party_notice_after}"; then
  echo "[check] third-party notices are not reproducible; rerun scripts/generate_third_party_notices.py and include the generated files" >&2
  exit 1
fi

echo "[check] ok"
