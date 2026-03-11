#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-${CI_COMMIT_TAG:-}}"

if [[ -z "${TAG}" ]]; then
  echo "usage: ${0##*/} <tag> (or set CI_COMMIT_TAG)" >&2
  exit 1
fi

bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/validate_release_tag.sh" "${TAG}" >/dev/null

if [[ "${TAG}" =~ ^([0-9]+)\.([0-9]+)v$ ]]; then
  printf '%s.%s.0\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
  exit 0
fi

if [[ "${TAG}" =~ ^([0-9]+)\.([0-9]+)v-rc([0-9]+)$ ]]; then
  printf '%s.%s.0-rc.%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
  exit 0
fi

echo "failed to convert tag '${TAG}' into a Helm chart semver" >&2
exit 1
