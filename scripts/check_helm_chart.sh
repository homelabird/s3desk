#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CHART_PATH="${CHART_PATH:-${ROOT}/charts/s3desk}"
RELEASE_NAME="${HELM_RELEASE_NAME:-s3desk}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

assert_secret_optional() {
  local rendered="$1"
  local env_name="$2"
  local expected="$3"
  if ! awk -v env_name="${env_name}" -v expected="${expected}" '
    $0 ~ "^[[:space:]]*- name: " env_name "$" { in_env = 1; found = 1; next }
    in_env && $0 ~ "^[[:space:]]*- name: " { in_env = 0 }
    in_env && $0 ~ "^[[:space:]]*optional: " expected "$" { ok = 1 }
    END { exit (found && ok) ? 0 : 1 }
  ' "${rendered}"; then
    echo "[helm-check] expected ${env_name} secretKeyRef optional: ${expected}" >&2
    exit 1
  fi
}

assert_env_value() {
  local rendered="$1"
  local env_name="$2"
  local expected="$3"
  if ! awk -v env_name="${env_name}" -v expected="${expected}" '
    $0 ~ "^[[:space:]]*- name: " env_name "$" { in_env = 1; next }
    in_env && $0 ~ "^[[:space:]]*- name: " { exit 1 }
    in_env && $0 ~ "^[[:space:]]*value: \"" expected "\"$" { found = 1; exit 0 }
    END { exit found ? 0 : 1 }
  ' "${rendered}"; then
    echo "[helm-check] expected ${env_name}=${expected}" >&2
    exit 1
  fi
}

assert_no_latest_image() {
  local rendered="$1"
  local label="$2"
  if grep -Eq 'image:[[:space:]]+"?[^"[:space:]]+:latest"?[[:space:]]*$' "${rendered}"; then
    echo "[helm-check] expected ${label} to render without an image tag of latest" >&2
    exit 1
  fi
}

assert_no_source_tree_image() {
  local rendered="$1"
  local label="$2"
  if grep -Eq 'image:[[:space:]]+"?[^"[:space:]]+:0\.0\.0"?[[:space:]]*$' "${rendered}"; then
    echo "[helm-check] expected ${label} to render without the source-tree appVersion image tag 0.0.0" >&2
    exit 1
  fi
}

helm lint "${CHART_PATH}"
helm lint "${CHART_PATH}" --values "${CHART_PATH}/ci-values.yaml"
helm lint "${CHART_PATH}" --values "${CHART_PATH}/values-production.yaml"
helm lint "${CHART_PATH}" --values "${CHART_PATH}/values-istio.yaml"

helm template "${RELEASE_NAME}" "${CHART_PATH}" >/dev/null
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --values "${CHART_PATH}/ci-values.yaml" >/dev/null
if helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set replicaCount=2 >"${TMP_DIR}/multiple-replicas-negative.out" 2>&1; then
  echo "[helm-check] expected unsupported multi-replica chart render to fail" >&2
  exit 1
fi
grep -Eq "replicaCount|single-writer|maximum" "${TMP_DIR}/multiple-replicas-negative.out" >/dev/null
if helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set server.allowRemote=true \
  --set secrets.autoGenerateApiToken=false \
  --set-string server.apiToken= >"${TMP_DIR}/missing-api-token-negative.out" 2>&1; then
  echo "[helm-check] expected remote chart render without API token or generated secret to fail" >&2
  exit 1
fi
grep -E "Missing configuration|apiToken" "${TMP_DIR}/missing-api-token-negative.out" >/dev/null
if helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set server.allowRemote=false \
  --set istio.virtualService.enabled=true >"${TMP_DIR}/missing-istio-hosts-gateways-negative.out" 2>&1; then
  echo "[helm-check] expected Istio VirtualService render without hosts/gateways to fail" >&2
  exit 1
fi
grep -Eq "istio\.virtualService|hosts|gateways" "${TMP_DIR}/missing-istio-hosts-gateways-negative.out" >/dev/null
if helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set server.allowRemote=false \
  --set istio.virtualService.enabled=true \
  --set "istio.virtualService.hosts[0]=s3desk.example.com" >"${TMP_DIR}/missing-istio-gateways-negative.out" 2>&1; then
  echo "[helm-check] expected Istio VirtualService render without gateways to fail" >&2
  exit 1
fi
grep -Eq "istio\.virtualService|gateways" "${TMP_DIR}/missing-istio-gateways-negative.out" >/dev/null
PRODUCTION_RENDERED="${TMP_DIR}/production-rendered.yaml"
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --values "${CHART_PATH}/values-production.yaml" >"${PRODUCTION_RENDERED}"
assert_no_latest_image "${PRODUCTION_RENDERED}" "values-production.yaml"
assert_no_source_tree_image "${PRODUCTION_RENDERED}" "values-production.yaml"
assert_secret_optional "${PRODUCTION_RENDERED}" API_TOKEN false
assert_secret_optional "${PRODUCTION_RENDERED}" ENCRYPTION_KEY false
assert_secret_optional "${PRODUCTION_RENDERED}" DATABASE_URL true
assert_env_value "${PRODUCTION_RENDERED}" JOB_LOG_MAX_BYTES 104857600
assert_env_value "${PRODUCTION_RENDERED}" JOB_LOG_RETENTION 720h
DIGEST_RENDERED="${TMP_DIR}/production-digest-rendered.yaml"
IMAGE_DIGEST="sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --values "${CHART_PATH}/values-production.yaml" \
  --set-string "image.digests.sqlite=${IMAGE_DIGEST}" >"${DIGEST_RENDERED}"
if ! grep -q "image: \"registry.example.com/s3desk@${IMAGE_DIGEST}\"" "${DIGEST_RENDERED}"; then
  echo "[helm-check] expected sqlite image digest to render as an immutable image reference" >&2
  exit 1
fi
if helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --values "${CHART_PATH}/values-production.yaml" \
  --set-string image.tag=latest >"${TMP_DIR}/production-latest-negative.out" 2>&1; then
  echo "[helm-check] expected browser-facing production chart render with image.tag=latest to fail" >&2
  exit 1
fi
grep -q "image.tag to be pinned" "${TMP_DIR}/production-latest-negative.out"
if helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set service.type=LoadBalancer \
  --set-string server.apiToken=helm-test-token \
  --set-string image.tag=latest >"${TMP_DIR}/loadbalancer-latest-negative.out" 2>&1; then
  echo "[helm-check] expected LoadBalancer remote chart render with image.tag=latest to fail" >&2
  exit 1
fi
grep -q "image.tag to be pinned" "${TMP_DIR}/loadbalancer-latest-negative.out"
LOADBALANCER_RENDERED="${TMP_DIR}/loadbalancer-rendered.yaml"
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --values "${CHART_PATH}/values-production.yaml" \
  --set ingress.enabled=false \
  --set service.type=LoadBalancer \
  --set-string server.externalBaseURL='https://lb.s3desk.example.com:8443' >"${LOADBALANCER_RENDERED}"
if ! grep -q 'ALLOWED_HOSTS' "${LOADBALANCER_RENDERED}" || ! grep -q 'lb.s3desk.example.com' "${LOADBALANCER_RENDERED}"; then
  echo "[helm-check] expected LoadBalancer externalBaseURL host to be included in ALLOWED_HOSTS" >&2
  exit 1
fi
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set db.backend=postgres \
  --set-string db.databaseUrl='postgres://s3desk:password@postgres:5432/s3desk?sslmode=disable' \
  --set-string server.apiToken='helm-test-token' >/dev/null
POSTGRES_EXISTING_SECRET_RENDERED="${TMP_DIR}/postgres-existing-secret-rendered.yaml"
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set db.backend=postgres \
  --set secrets.existingSecret=s3desk-secrets \
  --set secrets.autoGenerateApiToken=false >"${POSTGRES_EXISTING_SECRET_RENDERED}"
assert_secret_optional "${POSTGRES_EXISTING_SECRET_RENDERED}" API_TOKEN false
assert_secret_optional "${POSTGRES_EXISTING_SECRET_RENDERED}" ENCRYPTION_KEY true
assert_secret_optional "${POSTGRES_EXISTING_SECRET_RENDERED}" DATABASE_URL false
ISTIO_RENDERED="${TMP_DIR}/istio-rendered.yaml"
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --values "${CHART_PATH}/values-istio.yaml" \
  --set-string server.externalBaseURL='https://s3desk.example.com' >"${ISTIO_RENDERED}"
assert_no_latest_image "${ISTIO_RENDERED}" "values-istio.yaml"
assert_no_source_tree_image "${ISTIO_RENDERED}" "values-istio.yaml"
assert_secret_optional "${ISTIO_RENDERED}" API_TOKEN false
assert_secret_optional "${ISTIO_RENDERED}" ENCRYPTION_KEY false
assert_secret_optional "${ISTIO_RENDERED}" DATABASE_URL true
if ! grep -q 'timeout: "0s"' "${ISTIO_RENDERED}"; then
  echo "[helm-check] expected Istio VirtualService upload route timeout to render as 0s" >&2
  exit 1
fi
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set networkPolicy.enabled=true \
  --set networkPolicy.policyTypes[0]=Ingress \
  --set networkPolicy.policyTypes[1]=Egress >/dev/null
NETWORK_POLICY_CONTROLLER_VALUES="${TMP_DIR}/network-policy-controller-values.yaml"
NETWORK_POLICY_CONTROLLER_RENDERED="${TMP_DIR}/network-policy-controller-rendered.yaml"
cat >"${NETWORK_POLICY_CONTROLLER_VALUES}" <<'YAML'
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress
  ingress:
    allowSameNamespace: false
    extra:
      - from:
          - namespaceSelector:
              matchLabels:
                kubernetes.io/metadata.name: ingress-nginx
            podSelector:
              matchLabels:
                app.kubernetes.io/name: ingress-nginx
                app.kubernetes.io/component: controller
        ports:
          - protocol: TCP
            port: 8080
      - from:
          - namespaceSelector:
              matchLabels:
                kubernetes.io/metadata.name: istio-system
            podSelector:
              matchLabels:
                istio: ingressgateway
        ports:
          - protocol: TCP
            port: 8080
  egress:
    allowDns: false
    extra:
      - to:
          - namespaceSelector:
              matchLabels:
                kubernetes.io/metadata.name: database
            podSelector:
              matchLabels:
                app.kubernetes.io/name: postgres
        ports:
          - protocol: TCP
            port: 5432
YAML
helm lint "${CHART_PATH}" --values "${NETWORK_POLICY_CONTROLLER_VALUES}"
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --values "${NETWORK_POLICY_CONTROLLER_VALUES}" >"${NETWORK_POLICY_CONTROLLER_RENDERED}"
if ! grep -q '^    - from:$' "${NETWORK_POLICY_CONTROLLER_RENDERED}"; then
  echo "[helm-check] expected networkPolicy.ingress.extra to render as a YAML list item" >&2
  exit 1
fi
if ! grep -q '^      to:$' "${NETWORK_POLICY_CONTROLLER_RENDERED}"; then
  echo "[helm-check] expected networkPolicy.egress.extra to render a to selector" >&2
  exit 1
fi
if grep -Eq '^[[:space:]]*-(from|to):' "${NETWORK_POLICY_CONTROLLER_RENDERED}"; then
  echo "[helm-check] networkPolicy extra rules rendered with collapsed list markers" >&2
  exit 1
fi
if ! grep -q 'kubernetes.io/metadata.name: ingress-nginx' "${NETWORK_POLICY_CONTROLLER_RENDERED}"; then
  echo "[helm-check] expected NetworkPolicy to preserve the NGINX controller namespace selector" >&2
  exit 1
fi
if ! grep -q 'app.kubernetes.io/component: controller' "${NETWORK_POLICY_CONTROLLER_RENDERED}"; then
  echo "[helm-check] expected NetworkPolicy to preserve the NGINX controller pod selector" >&2
  exit 1
fi
if ! grep -q 'kubernetes.io/metadata.name: istio-system' "${NETWORK_POLICY_CONTROLLER_RENDERED}"; then
  echo "[helm-check] expected NetworkPolicy to preserve the Istio gateway namespace selector" >&2
  exit 1
fi
if ! grep -q 'istio: ingressgateway' "${NETWORK_POLICY_CONTROLLER_RENDERED}"; then
  echo "[helm-check] expected NetworkPolicy to preserve the Istio gateway pod selector" >&2
  exit 1
fi
NETWORK_POLICY_ESCAPE_VALUES="${TMP_DIR}/network-policy-escape-values.yaml"
NETWORK_POLICY_ESCAPE_RENDERED="${TMP_DIR}/network-policy-escape-rendered.yaml"
cat >"${NETWORK_POLICY_ESCAPE_VALUES}" <<'YAML'
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress
  ingress:
    allowSameNamespace: false
    extra:
      - {}
  egress:
    allowDns: false
    extra:
      - {}
YAML
helm lint "${CHART_PATH}" --values "${NETWORK_POLICY_ESCAPE_VALUES}"
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --values "${NETWORK_POLICY_ESCAPE_VALUES}" >"${NETWORK_POLICY_ESCAPE_RENDERED}"
if [ "$(grep -c '^    - {}$' "${NETWORK_POLICY_ESCAPE_RENDERED}" || true)" -ne 2 ]; then
  echo "[helm-check] expected documented NetworkPolicy allow-all escape hatches to render" >&2
  exit 1
fi
NETWORK_POLICY_INVALID_VALUES="${TMP_DIR}/network-policy-invalid-values.yaml"
cat >"${NETWORK_POLICY_INVALID_VALUES}" <<'YAML'
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress
  ingress:
    extra:
      - to: []
  egress:
    extra:
      - from: []
YAML
if helm lint "${CHART_PATH}" --values "${NETWORK_POLICY_INVALID_VALUES}" >"${TMP_DIR}/network-policy-invalid.out" 2>&1; then
  echo "[helm-check] expected invalid NetworkPolicy ingress/egress rule keys to fail schema validation" >&2
  exit 1
fi
grep -Eq "networkPolicy|Additional property|from|to" "${TMP_DIR}/network-policy-invalid.out" >/dev/null
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set monitoring.serviceMonitor.enabled=true \
  --set monitoring.podMonitor.enabled=true >/dev/null
MONITORING_EXISTING_SECRET_RENDERED="${TMP_DIR}/monitoring-existing-secret-rendered.yaml"
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set server.allowRemote=false \
  --set monitoring.serviceMonitor.enabled=true \
  --set secrets.existingSecret=s3desk-secrets \
  --set secrets.autoGenerateApiToken=false >"${MONITORING_EXISTING_SECRET_RENDERED}"
assert_secret_optional "${MONITORING_EXISTING_SECRET_RENDERED}" API_TOKEN false
assert_secret_optional "${MONITORING_EXISTING_SECRET_RENDERED}" ENCRYPTION_KEY true
assert_secret_optional "${MONITORING_EXISTING_SECRET_RENDERED}" DATABASE_URL true
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set backup.restoreMaxBytes=123 >/dev/null
helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set-string backup.restoreMaxBytes=123 >/dev/null
if helm template "${RELEASE_NAME}" "${CHART_PATH}" \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=s3desk.example.com >/tmp/s3desk-helm-production-hardening-negative.out 2>&1; then
  echo "[helm-check] expected browser-facing remote chart render without production hardening to fail" >&2
  exit 1
fi

test "$(bash "${ROOT}/scripts/chart_version_from_tag.sh" 0.21v)" = "0.21.0"
test "$(bash "${ROOT}/scripts/chart_version_from_tag.sh" 0.21v-rc2)" = "0.21.0-rc.2"
