#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ACTIONLINT_BIN="${ACTIONLINT_BIN:-}"

resolve_actionlint() {
  if [[ -n "${ACTIONLINT_BIN}" ]]; then
    return 0
  fi
  if command -v actionlint >/dev/null 2>&1; then
    ACTIONLINT_BIN="actionlint"
    return 0
  fi
  if [[ -x "${ROOT}/.tools/go/bin/actionlint" ]]; then
    ACTIONLINT_BIN="${ROOT}/.tools/go/bin/actionlint"
    return 0
  fi
  return 1
}

if resolve_actionlint; then
  echo "[workflow-check] actionlint"
  "${ACTIONLINT_BIN}" "${ROOT}/.github/workflows/"*.yml
else
  echo "[workflow-check] actionlint not found; falling back to built-in YAML workflow validator" >&2
  echo "[workflow-check] optional install: bash ./scripts/install_actionlint.sh" >&2
fi

python3 "${ROOT}/scripts/check_github_workflows.py"
