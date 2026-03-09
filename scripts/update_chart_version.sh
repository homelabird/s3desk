#!/usr/bin/env bash
set -euo pipefail

CHART_PATH="${CHART_PATH:-charts/s3desk/Chart.yaml}"
CHART_VALUES_PATH="${CHART_VALUES_PATH:-charts/s3desk/values.yaml}"
TAG="${1:-${CI_COMMIT_TAG:-}}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-}"

if [[ -z "${TAG}" ]]; then
  echo "usage: ${0##*/} <tag> (or set CI_COMMIT_TAG)" >&2
  exit 1
fi

bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/validate_release_tag.sh" "${TAG}" >/dev/null

BASE_TAG="${TAG}"
CHART_VERSION="${BASE_TAG#v}"
if [[ -z "${CHART_VERSION}" ]]; then
  echo "invalid tag '${TAG}' (empty chart version)" >&2
  exit 1
fi

tmp="$(mktemp)"
awk -v ver="${CHART_VERSION}" -v app="${BASE_TAG}" '
  /^version:/ { $0 = "version: " ver }
  /^appVersion:/ { $0 = "appVersion: \"" app "\"" }
  { print }
' "${CHART_PATH}" > "${tmp}"
mv "${tmp}" "${CHART_PATH}"

tmp="$(mktemp)"
awk -v repo="${IMAGE_REPOSITORY}" -v tag="${BASE_TAG}" '
  BEGIN { in_image = 0 }
  /^image:/ { in_image = 1; print; next }
  in_image && /^  repository:/ {
    if (repo != "") {
      $0 = "  repository: \"" repo "\""
    }
    print
    next
  }
  in_image && /^  tag:/ {
    $0 = "  tag: \"" tag "\""
    print
    next
  }
  in_image && /^[^ ]/ { in_image = 0 }
  { print }
' "${CHART_VALUES_PATH}" > "${tmp}"
mv "${tmp}" "${CHART_VALUES_PATH}"
