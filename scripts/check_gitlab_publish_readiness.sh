#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-${CI_COMMIT_TAG:-}}"

if [[ -z "${TAG}" ]]; then
  echo "usage: ${0##*/} <release-tag> (or set CI_COMMIT_TAG)" >&2
  exit 1
fi

bash "${ROOT}/scripts/validate_release_tag.sh" "${TAG}" >/dev/null

if [[ -z "${DEPLOY_RELEASE_BASE:-}" ]]; then
  git -C "${ROOT}" fetch --tags --force >/dev/null 2>&1 || true
fi

bash "${ROOT}/scripts/verify_release_readiness.sh" "${TAG}"
