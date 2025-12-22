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
    echo "[dev] go not found (install Go or add .tools/go)" >&2
    exit 1
  fi
fi

echo "[dev] starting backend on 127.0.0.1:8080"
(cd "${ROOT}/backend" && setsid "${GO_BIN}" run ./cmd/server "$@") &
BACK_PID=$!

cleanup() {
  # go run spawns a child binary; kill the whole process group to avoid orphans.
  kill -- "-${BACK_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[dev] starting frontend on 127.0.0.1:5173"
(cd "${ROOT}/frontend" && npm run dev)
