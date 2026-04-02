#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

GO_BIN="${GO_BIN:-go}"
NPM_BIN="${NPM_BIN:-npm}"

if ! command -v "${GO_BIN}" >/dev/null 2>&1; then
  echo "[check-ci-pair] go not found" >&2
  exit 1
fi

if ! command -v "${NPM_BIN}" >/dev/null 2>&1; then
  echo "[check-ci-pair] npm not found" >&2
  exit 1
fi

echo "[check-ci-pair] frontend build"
(
  cd "${ROOT}/frontend"
  "${NPM_BIN}" run build
)

echo "[check-ci-pair] backend test"
(
  cd "${ROOT}/backend"
  "${GO_BIN}" test ./...
)

echo "[check-ci-pair] ok"
