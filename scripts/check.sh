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

echo "[check] ok"
