#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 ]]; then
  printf '%s\n' 'Expected one release tag. Run bash scripts/deploy_helm_release.sh --help.' >&2
  exit 2
fi
case "${1:-}" in
  -h|--help)
    printf '%s\n' \
      'Usage: bash scripts/deploy_helm_release.sh [TAG]' \
      '' \
      'Deploy an approved release to Kubernetes (CI/release automation).' \
      'For first server setup with Docker Compose, run on that server:' \
      '  ./scripts/compose.sh setup' \
      '  ./scripts/compose.sh up' \
      '' \
      'Required release settings:' \
      '  TAG or CI_COMMIT_TAG     Release tag: MAJOR.MINORv or MAJOR.MINORv-rcN' \
      '  DOCKERHUB_REPO           Published image repository: namespace/repo' \
      '  GH_TOKEN or GITHUB_TOKEN GitHub access for release readiness checks' \
      '' \
      'Required Kubernetes settings:' \
      '  DEPLOY_HELM_RELEASE      Helm release name' \
      '  DEPLOY_K8S_NAMESPACE     Target namespace' \
      '  DEPLOY_API_TOKEN         API token configured in the chart or Secret' \
      '  A working kubectl context or DEPLOY_KUBECONFIG_B64 is required.' \
      '' \
      'Required post-deployment smoke settings:' \
      '  DEPLOY_BASE_URL or DEPLOY_HEALTHCHECK_URL' \
      '  DEPLOY_PROFILE_ID, DEPLOY_SMOKE_BUCKET, DEPLOY_SMOKE_OBJECT_KEY' \
      '  Use an existing profile and object that the API token can access.' \
      '' \
      'Optional: DEPLOY_HELM_CHART_REF (OCI chart), DEPLOY_HELM_VALUES_FILES' \
      '          (comma-separated paths), HELM_TIMEOUT (300s),' \
      '          DEPLOY_SMOKE_EVIDENCE_FILE.' \
      'The default chart registry is harbor.k8s.homelabird.com; override for your registry.' \
      'Requires bash, git, curl, python3, helm and kubectl.' \
      'Release readiness, smoke configuration and a Helm dry-run precede deployment.'
    exit 0
    ;;
  -*)
    printf 'Unknown option: %s. Run bash scripts/deploy_helm_release.sh --help.\n' "$1" >&2
    exit 2
    ;;
esac
TAG="${1:-${CI_COMMIT_TAG:-}}"
if [[ -z "${TAG}" ]]; then
  printf '%s\n' 'Missing release tag. Pass TAG or set CI_COMMIT_TAG; run bash scripts/deploy_helm_release.sh --help for setup instructions.' >&2
  exit 2
fi
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

bash "${ROOT}/scripts/validate_release_tag.sh" "${TAG}" >/dev/null
bash "${ROOT}/scripts/verify_release_readiness.sh" "${TAG}" >/dev/null

DOCKERHUB_REPO="$(printf '%s' "${DOCKERHUB_REPO:-}" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
DOCKERHUB_REPO="${DOCKERHUB_REPO#https://}"
DOCKERHUB_REPO="${DOCKERHUB_REPO#http://}"
DOCKERHUB_REPO="${DOCKERHUB_REPO#docker.io/}"
DOCKERHUB_REPO="${DOCKERHUB_REPO#index.docker.io/}"
DOCKERHUB_REPO="${DOCKERHUB_REPO#registry-1.docker.io/}"
if [[ -z "${DOCKERHUB_REPO}" ]]; then
  echo "DOCKERHUB_REPO is empty after normalization." >&2
  exit 1
fi
if ! printf '%s' "${DOCKERHUB_REPO}" | grep -Eq '^[a-z0-9]+([._-][a-z0-9]+)*/[a-z0-9]+([._-][a-z0-9]+)*$'; then
  echo "DOCKERHUB_REPO must be in the form 'namespace/repo' (lowercase, no scheme)." >&2
  exit 1
fi

: "${DEPLOY_HELM_RELEASE:?DEPLOY_HELM_RELEASE is required}"
: "${DEPLOY_K8S_NAMESPACE:?DEPLOY_K8S_NAMESPACE is required}"

HARBOR_REGISTRY="${HARBOR_REGISTRY:-harbor.k8s.homelabird.com}"
HELM_TIMEOUT="${HELM_TIMEOUT:-300s}"
CHART_VERSION="$(bash "${ROOT}/scripts/chart_version_from_tag.sh" "${TAG}")"
DEPLOY_HELM_CHART_REF="${DEPLOY_HELM_CHART_REF:-oci://${HARBOR_REGISTRY}/library/charts/s3desk}"
DEPLOY_HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-}"
DEPLOY_BASE_URL="${DEPLOY_BASE_URL:-}"
if [[ -z "${DEPLOY_BASE_URL}" && -n "${DEPLOY_HEALTHCHECK_URL}" ]]; then
  DEPLOY_BASE_URL="${DEPLOY_HEALTHCHECK_URL%/healthz}"
fi
DEPLOY_RELEASE_CANDIDATE="${DEPLOY_RELEASE_CANDIDATE:-${TAG}}"
export DEPLOY_BASE_URL DEPLOY_API_TOKEN DEPLOY_RELEASE_CANDIDATE
python3 "${ROOT}/scripts/check_live_evidence_env.py" --scope reverse-proxy >/dev/null

KUBECONFIG_PATH=""
cleanup() {
  if [[ -n "${KUBECONFIG_PATH}" ]]; then
    rm -f "${KUBECONFIG_PATH}"
  fi
}
trap cleanup EXIT

if [[ -n "${DEPLOY_KUBECONFIG_B64:-}" ]]; then
  KUBECONFIG_PATH="$(mktemp)"
  printf '%s' "${DEPLOY_KUBECONFIG_B64}" | base64 -d > "${KUBECONFIG_PATH}"
  export KUBECONFIG="${KUBECONFIG_PATH}"
fi

if [[ -n "${HARBOR_USERNAME:-}" && -n "${HARBOR_PASSWORD:-}" ]]; then
  printf '%s' "${HARBOR_PASSWORD}" | helm registry login "${HARBOR_REGISTRY}" -u "${HARBOR_USERNAME}" --password-stdin
fi

helm_args=(
  upgrade --install "${DEPLOY_HELM_RELEASE}" "${DEPLOY_HELM_CHART_REF}"
  --version "${CHART_VERSION}"
  --namespace "${DEPLOY_K8S_NAMESPACE}"
  --create-namespace
  --wait
  --timeout "${HELM_TIMEOUT}"
  --set "image.repository=${DOCKERHUB_REPO}"
  --set "image.tag=${TAG}"
)

if [[ -n "${DEPLOY_HELM_VALUES_FILES:-}" ]]; then
  IFS=',' read -r -a values_files <<< "${DEPLOY_HELM_VALUES_FILES}"
  for values_file in "${values_files[@]}"; do
    values_file="$(printf '%s' "${values_file}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "${values_file}" ]] && continue
    helm_args+=(--values "${values_file}")
  done
fi

if [[ -n "${DEPLOY_HELM_EXTRA_ARGS:-}" ]]; then
  # shellcheck disable=SC2206
  extra_args=( ${DEPLOY_HELM_EXTRA_ARGS} )
  helm_args+=("${extra_args[@]}")
fi

helm "${helm_args[@]}" --dry-run=client >/dev/null
helm "${helm_args[@]}"

mapfile -t deployments < <(
  kubectl -n "${DEPLOY_K8S_NAMESPACE}" get deployment \
    -l "app.kubernetes.io/instance=${DEPLOY_HELM_RELEASE}" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}'
)

if [[ ${#deployments[@]} -eq 0 ]]; then
  echo "No deployments found for release '${DEPLOY_HELM_RELEASE}' in namespace '${DEPLOY_K8S_NAMESPACE}'." >&2
  exit 1
fi

for deployment in "${deployments[@]}"; do
  kubectl -n "${DEPLOY_K8S_NAMESPACE}" rollout status "deployment/${deployment}" --timeout="${HELM_TIMEOUT}"
done

kubectl -n "${DEPLOY_K8S_NAMESPACE}" get pods -l "app.kubernetes.io/instance=${DEPLOY_HELM_RELEASE}" -o wide

bash "${ROOT}/scripts/deploy_smoke.sh"
