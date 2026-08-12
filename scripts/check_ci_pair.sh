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

echo "[check-ci-pair] scope: workflow lint + frontend OpenAPI drift + frontend build + backend test"
echo "[check-ci-pair] excludes: bundle budget and Playwright lanes"
echo "[check-ci-pair] note: green output is not the GitHub required-check set (release-gate, Core Mock E2E, Mobile Responsive E2E (Required), license-audit)"

echo "[check-ci-pair] workflow lint"
bash "${ROOT}/scripts/check_github_workflows.sh"

echo "[check-ci-pair] frontend build"
(
  cd "${ROOT}/frontend"
  "${NPM_BIN}" ci --no-audit --no-fund
  "${NPM_BIN}" run check:openapi
  "${NPM_BIN}" run build
)

echo "[check-ci-pair] backend test"
(
  cd "${ROOT}/backend"
  "${GO_BIN}" test ./...
)

echo "[check-ci-pair] ok"
