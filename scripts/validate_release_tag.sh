#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-${CI_COMMIT_TAG:-}}"

if [[ -z "${TAG}" ]]; then
  echo "usage: ${0##*/} <tag> (or set CI_COMMIT_TAG)" >&2
  exit 1
fi

if [[ ! "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "invalid release tag '${TAG}' (expected format vMAJOR.MINOR.PATCH)" >&2
  exit 1
fi

printf '%s\n' "${TAG}"
