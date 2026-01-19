#!/usr/bin/env bash
set -euo pipefail
set -E

MODE="${1:-}"
if [[ -z "${MODE}" ]]; then
  echo "usage: ${0##*/} <sqlite|postgres|upgrade|pvc>" >&2
  exit 1
fi

CHART_PATH="${HELM_CHART_PATH:-charts/s3desk}"
VALUES_FILE="${HELM_VALUES_FILE:-charts/s3desk/ci-values.yaml}"
API_TOKEN="${S3DESK_API_TOKEN:-ci-token}"
HELM_TIMEOUT="${HELM_TIMEOUT:-180s}"

HARBOR_REGISTRY="${HARBOR_REGISTRY:-harbor.k8s.homelabird.com}"
IMAGE_REPO="${S3DESK_IMAGE_REPOSITORY:-${HARBOR_REGISTRY}/library/s3desk}"
FALLBACK_TAG="${S3DESK_FALLBACK_TAG:-dev}"

log() {
  printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

sanitize_name() {
  local name="$1"
  name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | sed 's/^-*//;s/-*$//')"
  printf '%s' "${name:0:63}"
}

default_ns="s3desk-ci-${CI_PIPELINE_ID:-local}-${CI_JOB_ID:-$(date +%s)}"
default_release="s3desk-${CI_JOB_ID:-$(date +%s)}"
if [[ -n "${K8S_NAMESPACE:-}" ]]; then
  NAMESPACE="${K8S_NAMESPACE}"
else
  NAMESPACE="$(sanitize_name "${default_ns}")"
fi
RELEASE="$(sanitize_name "${HELM_RELEASE:-$default_release}")"
POSTGRES_NAME="$(sanitize_name "${RELEASE}-postgres")"

KUBECONFIG_PATH=""
IMAGE_PULL_SECRET=""
IMAGE_TAG=""
CREATED_NAMESPACE=0

setup_kubeconfig() {
  if [[ -n "${KUBECONFIG:-}" && -f "${KUBECONFIG}" ]]; then
    return
  fi
  if [[ ! -f /var/run/secrets/kubernetes.io/serviceaccount/token ]]; then
    echo "No kubeconfig found and not running in a Kubernetes pod." >&2
    exit 1
  fi
  local server="${KUBE_SERVER:-}"
  if [[ -z "${server}" ]]; then
    if [[ -z "${KUBERNETES_SERVICE_HOST:-}" ]]; then
      echo "KUBE_SERVER or KUBERNETES_SERVICE_HOST is required." >&2
      exit 1
    fi
    server="https://${KUBERNETES_SERVICE_HOST}:${KUBERNETES_SERVICE_PORT:-443}"
  fi
  KUBECONFIG_PATH="$(mktemp)"
  export KUBECONFIG="${KUBECONFIG_PATH}"
  kubectl config set-cluster in-cluster \
    --server="${server}" \
    --certificate-authority=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
    --embed-certs=true >/dev/null
  kubectl config set-credentials ci \
    --token="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" >/dev/null
  kubectl config set-context ci \
    --cluster=in-cluster \
    --user=ci \
    --namespace="${NAMESPACE}" >/dev/null
  kubectl config use-context ci >/dev/null
}

cleanup() {
  if [[ -n "${KUBECONFIG_PATH}" ]]; then
    rm -f "${KUBECONFIG_PATH}"
  fi
  if [[ "${KEEP_NAMESPACE:-0}" == "1" ]]; then
    return
  fi
  helm -n "${NAMESPACE}" uninstall "${RELEASE}" >/dev/null 2>&1 || true
  if [[ "${CREATED_NAMESPACE}" == "1" ]]; then
    kubectl delete namespace "${NAMESPACE}" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  fi
}

on_error() {
  local exit_code=$?
  log "collecting diagnostics before exit"
  kubectl -n "${NAMESPACE}" get pods -o wide || true
  kubectl -n "${NAMESPACE}" get svc -o wide || true
  kubectl -n "${NAMESPACE}" describe deployment "${RELEASE}" || true
  kubectl -n "${NAMESPACE}" logs deployment/"${RELEASE}" --tail=200 || true
  kubectl -n "${NAMESPACE}" describe deployment "${POSTGRES_NAME}" || true
  kubectl -n "${NAMESPACE}" logs deployment/"${POSTGRES_NAME}" --tail=200 || true
  exit "${exit_code}"
}

harbor_manifest_exists() {
  local tag="$1"
  if [[ -z "${HARBOR_USERNAME:-}" || -z "${HARBOR_PASSWORD:-}" ]]; then
    return 1
  fi
  local repo_path="${IMAGE_REPO#${HARBOR_REGISTRY}/}"
  if [[ "${repo_path}" == "${IMAGE_REPO}" ]]; then
    return 1
  fi
  local auth
  auth="$(printf '%s' "${HARBOR_USERNAME}:${HARBOR_PASSWORD}" | base64 | tr -d '\n')"
  curl -fsS -H "Authorization: Basic ${auth}" \
    "https://${HARBOR_REGISTRY}/v2/${repo_path}/manifests/${tag}" >/dev/null
}

resolve_image_tag() {
  if [[ -n "${S3DESK_IMAGE_TAG:-}" ]]; then
    printf '%s' "${S3DESK_IMAGE_TAG}"
    return 0
  fi
  if [[ -n "${CI_COMMIT_SHA:-}" ]] && harbor_manifest_exists "${CI_COMMIT_SHA}"; then
    printf '%s' "${CI_COMMIT_SHA}"
    return 0
  fi
  printf '%s' "${FALLBACK_TAG}"
}

setup_namespace() {
  if [[ -n "${K8S_NAMESPACE:-}" ]]; then
    if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
      echo "K8S_NAMESPACE '${NAMESPACE}' does not exist." >&2
      exit 1
    fi
  else
    if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
      kubectl create namespace "${NAMESPACE}" >/dev/null
      CREATED_NAMESPACE=1
    fi
  fi
  kubectl config set-context ci --namespace="${NAMESPACE}" >/dev/null
}

setup_pull_secret() {
  if [[ -z "${HARBOR_USERNAME:-}" || -z "${HARBOR_PASSWORD:-}" ]]; then
    return
  fi
  local registry_host=""
  if [[ "${IMAGE_REPO}" == *.*/* || "${IMAGE_REPO}" == *:*/* ]]; then
    registry_host="${IMAGE_REPO%%/*}"
  fi
  if [[ -z "${registry_host}" ]]; then
    return
  fi
  IMAGE_PULL_SECRET="${IMAGE_PULL_SECRET_NAME:-harbor-registry}"
  kubectl -n "${NAMESPACE}" create secret docker-registry "${IMAGE_PULL_SECRET}" \
    --docker-server="${registry_host}" \
    --docker-username="${HARBOR_USERNAME}" \
    --docker-password="${HARBOR_PASSWORD}" \
    --docker-email="${HARBOR_EMAIL:-ci@example.com}" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
}

wait_rollout() {
  kubectl -n "${NAMESPACE}" rollout status deployment/"${RELEASE}" --timeout="${HELM_TIMEOUT}"
}

smoke_http() {
  local port="${1:-18080}"
  local log_file pf_pid ready=0 health=0
  log_file="$(mktemp)"
  kubectl -n "${NAMESPACE}" port-forward "svc/${RELEASE}" "${port}:8080" >"${log_file}" 2>&1 &
  pf_pid=$!

  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${port}/healthz" >/dev/null; then
      health=1
      break
    fi
    if ! kill -0 "${pf_pid}" >/dev/null 2>&1; then
      log "port-forward failed"
      cat "${log_file}" >&2 || true
      exit 1
    fi
    sleep 2
  done
  if [[ "${health}" != "1" ]]; then
    log "healthz did not become ready"
    cat "${log_file}" >&2 || true
    exit 1
  fi

  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${port}/readyz" >/dev/null; then
      ready=1
      break
    fi
    sleep 2
  done
  if [[ "${ready}" != "1" ]]; then
    log "readyz did not become ready"
    exit 1
  fi

  curl -fsS -H "X-Api-Token: ${API_TOKEN}" \
    "http://127.0.0.1:${port}/api/v1/meta" >/dev/null

  kill "${pf_pid}" >/dev/null 2>&1 || true
  wait "${pf_pid}" >/dev/null 2>&1 || true
  rm -f "${log_file}"
}

deploy_postgres() {
  kubectl -n "${NAMESPACE}" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Service
metadata:
  name: ${POSTGRES_NAME}
spec:
  ports:
    - port: 5432
      targetPort: 5432
  selector:
    app: ${POSTGRES_NAME}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${POSTGRES_NAME}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${POSTGRES_NAME}
  template:
    metadata:
      labels:
        app: ${POSTGRES_NAME}
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          env:
            - name: POSTGRES_DB
              value: s3desk
            - name: POSTGRES_USER
              value: s3desk
            - name: POSTGRES_PASSWORD
              value: s3desk
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: pgdata
              mountPath: /var/lib/postgresql/data
      volumes:
        - name: pgdata
          emptyDir: {}
EOF
  kubectl -n "${NAMESPACE}" rollout status deployment/"${POSTGRES_NAME}" --timeout="${HELM_TIMEOUT}"
}

deploy_s3desk() {
  local extra_args=("$@")
  local helm_args=(
    --namespace "${NAMESPACE}"
    --values "${VALUES_FILE}"
    --set "server.apiToken=${API_TOKEN}"
    --set "image.repository=${IMAGE_REPO}"
    --set "image.tag=${IMAGE_TAG}"
    --set "image.pullPolicy=Always"
  )
  if [[ -n "${IMAGE_PULL_SECRET}" ]]; then
    helm_args+=(--set "imagePullSecrets[0].name=${IMAGE_PULL_SECRET}")
  fi
  helm upgrade --install "${RELEASE}" "${CHART_PATH}" \
    "${helm_args[@]}" \
    "${extra_args[@]}" \
    --wait --timeout "${HELM_TIMEOUT}"
  wait_rollout
}

persist_data_check() {
  local pod
  pod="$(kubectl -n "${NAMESPACE}" get pods \
    -l app.kubernetes.io/instance="${RELEASE}" \
    -o jsonpath='{.items[0].metadata.name}')"
  kubectl -n "${NAMESPACE}" exec "${pod}" -- sh -c 'echo "ci-persist" > /data/ci-persist.txt'
  kubectl -n "${NAMESPACE}" delete pod "${pod}" >/dev/null
  wait_rollout
  pod="$(kubectl -n "${NAMESPACE}" get pods \
    -l app.kubernetes.io/instance="${RELEASE}" \
    -o jsonpath='{.items[0].metadata.name}')"
  kubectl -n "${NAMESPACE}" exec "${pod}" -- cat /data/ci-persist.txt | grep -q "ci-persist"
}

setup_kubeconfig
trap cleanup EXIT
trap on_error ERR

setup_namespace
setup_pull_secret
IMAGE_TAG="$(resolve_image_tag)"

log "namespace=${NAMESPACE} release=${RELEASE} image=${IMAGE_REPO}:${IMAGE_TAG}"

case "${MODE}" in
  sqlite)
    deploy_s3desk
    smoke_http 18080
    ;;
  postgres)
    deploy_postgres
    deploy_s3desk \
      --set "db.backend=postgres" \
      --set-string "db.databaseUrl=postgres://s3desk:s3desk@${POSTGRES_NAME}:5432/s3desk?sslmode=disable"
    smoke_http 18080
    ;;
  upgrade)
    deploy_s3desk --set "jobs.queueCapacity=128"
    smoke_http 18080
    deploy_s3desk --set "jobs.queueCapacity=64"
    smoke_http 18080
    helm rollback "${RELEASE}" 1 --namespace "${NAMESPACE}" --wait --timeout "${HELM_TIMEOUT}"
    wait_rollout
    smoke_http 18080
    ;;
  pvc)
    deploy_s3desk \
      --set "persistence.enabled=true" \
      --set "persistence.size=${PERSISTENCE_SIZE:-1Gi}" \
      --set "persistence.storageClass=${PERSISTENCE_STORAGE_CLASS:-}"
    persist_data_check
    ;;
  *)
    echo "unknown mode '${MODE}'" >&2
    exit 1
    ;;
esac
