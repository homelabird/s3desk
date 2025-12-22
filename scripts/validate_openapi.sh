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
    echo "[openapi] go not found (install Go or add .tools/go)" >&2
    exit 1
  fi
fi

echo "[openapi] validating ${ROOT}/openapi.yml"
(cd "${ROOT}/backend" && "${GO_BIN}" run ./cmd/openapi-validate --spec "${ROOT}/openapi.yml")

