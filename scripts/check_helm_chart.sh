#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CHART_PATH="${CHART_PATH:-${ROOT}/charts/s3desk}"
RELEASE_NAME="${HELM_RELEASE_NAME:-s3desk}"

helm lint "${CHART_PATH}"
helm lint "${CHART_PATH}" --values "${CHART_PATH}/ci-values.yaml"

helm template "${RELEASE_NAME}" "${CHART_PATH}" >/dev/null
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --values "${CHART_PATH}/ci-values.yaml" >/dev/null
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set db.backend=postgres \
  --set-string db.databaseUrl='postgres://s3desk:password@postgres:5432/s3desk?sslmode=disable' \
  --set-string server.apiToken='helm-test-token' >/dev/null
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --values "${CHART_PATH}/values-istio.yaml" \
  --set-string server.apiToken='helm-test-token' \
  --set-string server.externalBaseURL='https://s3desk.example.com' >/dev/null
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set networkPolicy.enabled=true \
  --set networkPolicy.policyTypes[0]=Ingress \
  --set networkPolicy.policyTypes[1]=Egress >/dev/null
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set monitoring.serviceMonitor.enabled=true \
  --set monitoring.podMonitor.enabled=true >/dev/null
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set backup.restoreMaxBytes=123 >/dev/null
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set-string backup.restoreMaxBytes=123 >/dev/null

test "$(bash "${ROOT}/scripts/chart_version_from_tag.sh" 0.21v)" = "0.21.0"
test "$(bash "${ROOT}/scripts/chart_version_from_tag.sh" 0.21v-rc2)" = "0.21.0-rc.2"
