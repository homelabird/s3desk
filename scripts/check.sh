#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

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

echo "[check] openapi"
bash "${ROOT}/scripts/validate_openapi.sh"

echo "[check] gofmt"
UNFORMATTED=$(find "${ROOT}/backend" -name '*.go' -type f -print0 | xargs -0 "${GOFMT_BIN}" -l)
if [[ -n "${UNFORMATTED}" ]]; then
  echo "[check] gofmt needed:" >&2
  echo "${UNFORMATTED}" >&2
  exit 1
fi

echo "[check] backend"
(
  cd "${ROOT}/backend"
  "${GO_BIN}" vet ./...
  "${GO_BIN}" test ./...
)

REQUIRED_NODE_MAJOR="${REQUIRED_NODE_MAJOR:-22}"
REQUIRED_NODE_MAJOR="${REQUIRED_NODE_MAJOR%%.x}"
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
node_major="$(echo "${node_version}" | sed -E 's/^v([0-9]+).*/\\1/')"
if [[ "${node_major}" != "${REQUIRED_NODE_MAJOR}" ]]; then
  echo "[check] node ${node_version} found; expected Node ${REQUIRED_NODE_MAJOR}.x" >&2
  exit 1
fi

npm_version="$(npm --version)"
if [[ "${npm_version}" != "${REQUIRED_NPM_VERSION}" ]]; then
  echo "[check] npm ${npm_version} found; expected npm ${REQUIRED_NPM_VERSION}" >&2
  exit 1
fi

echo "[check] frontend"
(
  cd "${ROOT}/frontend"
  npm ci --no-audit --no-fund
  npm run gen:openapi
  npm run lint
  npm run build
)

echo "[check] third-party notices"
python3 "${ROOT}/scripts/generate_third_party_notices.py"
if command -v git >/dev/null 2>&1; then
  git -C "${ROOT}" diff --exit-code -I '^Generated at ' -- THIRD_PARTY_NOTICES.md third_party/licenses
else
  echo "[check] git not found; skipping third-party notices diff check" >&2
fi

echo "[check] ok"
