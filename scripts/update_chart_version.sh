#!/usr/bin/env bash
set -euo pipefail

CHART_PATH="${CHART_PATH:-charts/s3desk/Chart.yaml}"
TAG="${1:-${CI_COMMIT_TAG:-}}"

if [[ -z "${TAG}" ]]; then
  echo "usage: ${0##*/} <tag> (or set CI_COMMIT_TAG)" >&2
  exit 1
fi

BASE_TAG="${TAG}"
case "${BASE_TAG}" in
  *-postgres) BASE_TAG="${BASE_TAG%-postgres}" ;;
  *-sqlite) BASE_TAG="${BASE_TAG%-sqlite}" ;;
esac

CHART_VERSION="${BASE_TAG#v}"
if [[ -z "${CHART_VERSION}" ]]; then
  echo "invalid tag '${TAG}' (empty chart version)" >&2
  exit 1
fi
if [[ ! "${CHART_VERSION}" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+ ]]; then
  echo "invalid chart version '${CHART_VERSION}' (expected semver)" >&2
  exit 1
fi

tmp="$(mktemp)"
awk -v ver="${CHART_VERSION}" -v app="${BASE_TAG}" '
  /^version:/ { $0 = "version: " ver }
  /^appVersion:/ { $0 = "appVersion: \"" app "\"" }
  { print }
' "${CHART_PATH}" > "${tmp}"
mv "${tmp}" "${CHART_PATH}"
