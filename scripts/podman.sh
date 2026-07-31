#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

IMAGE="${IMAGE:-s3desk:local}"
QUICK_IMAGE="${QUICK_IMAGE:-localhost/s3desk-deploy:quick}"
QUICK_CONTAINER="${QUICK_CONTAINER:-s3desk-quick}"
QUICK_DATA_DIR="${QUICK_DATA_DIR:-${ROOT}/.deploy-data/quick}"
QUICK_API_TOKEN="${QUICK_API_TOKEN:-s3desk-demo-token-0123456789abcdef012345}"
QUICK_ENCRYPTION_KEY="${QUICK_ENCRYPTION_KEY:-QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=}"
QUICK_ALLOWED_LOCAL_DIRS="${QUICK_ALLOWED_LOCAL_DIRS:-/tmp}"
QUICK_BIND_HOST="${QUICK_BIND_HOST:-192.168.0.227}"
QUICK_EXTERNAL_BASE_URL="${QUICK_EXTERNAL_BASE_URL:-http://${QUICK_BIND_HOST}:8080}"
QUICK_ALLOWED_HOSTS="${QUICK_ALLOWED_HOSTS:-127.0.0.1,localhost,::1,${QUICK_BIND_HOST}}"
DATA_VOLUME="${DATA_VOLUME:-s3desk-data}"
JOB_QUEUE_CAPACITY="${JOB_QUEUE_CAPACITY:-256}"
JOB_LOG_MAX_LINE_BYTES="${JOB_LOG_MAX_LINE_BYTES:-262144}"
ALLOWED_HOSTS="${ALLOWED_HOSTS:-127.0.0.1,localhost}"
RCLONE_VERIFY_MODE="${RCLONE_VERIFY_MODE:-checksum}"
RUN_PORT_BIND="${RUN_PORT_BIND:-127.0.0.1:8080:8080}"

QUICK_BUILD_CTX="${QUICK_BUILD_CTX:-}"

usage() {
  cat <<EOF
Usage: $(basename "$0") <build|run|run-port|quick-build|quick-run|quick-restart>

Env:
  IMAGE        Image tag (default: ${IMAGE})
  DATA_VOLUME  Podman named volume for DATA_DIR (default: ${DATA_VOLUME})
  JOB_QUEUE_CAPACITY      Max queued jobs before backpressure (default: ${JOB_QUEUE_CAPACITY})
  JOB_LOG_MAX_LINE_BYTES  Max bytes per log line before truncation (default: ${JOB_LOG_MAX_LINE_BYTES})
  ALLOWED_HOSTS           Comma-separated hostnames allowed for Host/Origin checks
  RUN_PORT_BIND           Port binding for run-port (default: ${RUN_PORT_BIND})
  API_TOKEN    Required for run-port
  QUICK_IMAGE            Image tag for deploy preview (default: ${QUICK_IMAGE})
  QUICK_CONTAINER        Container name for deploy preview (default: ${QUICK_CONTAINER})
  QUICK_DATA_DIR         Bind-mounted data dir for deploy preview (default: ${QUICK_DATA_DIR})
  QUICK_BIND_HOST        Browser-facing host/IP added to ALLOWED_HOSTS (default: ${QUICK_BIND_HOST})
  QUICK_EXTERNAL_BASE_URL External base URL for preview (default: ${QUICK_EXTERNAL_BASE_URL})
  QUICK_BUILD_CTX        Optional staging dir to reuse for quick-build

Notes:
  This app is local-only by default, so 'run' uses '--network host'.
  quick-build stages a clean build context via .containerignore to avoid copying local caches/runtime data.
EOF
}

quick_build() {
  local ctx
  if [[ -n "${QUICK_BUILD_CTX}" ]]; then
    ctx="${QUICK_BUILD_CTX}"
    mkdir -p "${ctx}"
  else
    ctx="$(mktemp -d "${TMPDIR:-/tmp}/s3desk-quick-build.XXXXXX")"
    trap 'rm -rf "${ctx}"' RETURN
  fi

  rsync -a --delete --exclude-from="${ROOT}/.containerignore" "${ROOT}/" "${ctx}/"
  podman build -f "${ctx}/Containerfile.deploy" -t "${QUICK_IMAGE}" "${ctx}"
}

quick_run() {
  mkdir -p "${QUICK_DATA_DIR}"
  podman rm -f "${QUICK_CONTAINER}" >/dev/null 2>&1 || true
  podman run -d \
    --name "${QUICK_CONTAINER}" \
    --network host \
    --security-opt label=disable \
    -v "${QUICK_DATA_DIR}:/data" \
    -e ADDR=0.0.0.0:8080 \
    -e ALLOW_REMOTE=true \
    -e ALLOWED_HOSTS="${QUICK_ALLOWED_HOSTS}" \
    -e ALLOWED_LOCAL_DIRS="${QUICK_ALLOWED_LOCAL_DIRS}" \
    -e EXTERNAL_BASE_URL="${QUICK_EXTERNAL_BASE_URL}" \
    -e API_TOKEN="${QUICK_API_TOKEN}" \
    -e ENCRYPTION_KEY="${QUICK_ENCRYPTION_KEY}" \
    "${QUICK_IMAGE}"
}

cmd="${1:-}"
case "${cmd}" in
  build)
    podman build -f "${ROOT}/Containerfile" -t "${IMAGE}" "${ROOT}"
    ;;
  run)
    podman run --rm --network host \
      -e JOB_QUEUE_CAPACITY="${JOB_QUEUE_CAPACITY}" \
      -e JOB_LOG_MAX_LINE_BYTES="${JOB_LOG_MAX_LINE_BYTES}" \
      -e ALLOWED_HOSTS="${ALLOWED_HOSTS}" \
      -e RCLONE_VERIFY_MODE="${RCLONE_VERIFY_MODE}" \
      -v "${DATA_VOLUME}:/data" \
      "${IMAGE}"
    ;;
  run-port)
    if [[ -z "${API_TOKEN:-}" ]]; then
      echo "[podman] API_TOKEN is required for run-port" >&2
      exit 1
    fi
    podman run --rm -p "${RUN_PORT_BIND}" \
      -e ADDR=0.0.0.0:8080 \
      -e ALLOW_REMOTE=true \
      -e API_TOKEN="${API_TOKEN}" \
      -e JOB_QUEUE_CAPACITY="${JOB_QUEUE_CAPACITY}" \
      -e JOB_LOG_MAX_LINE_BYTES="${JOB_LOG_MAX_LINE_BYTES}" \
      -e ALLOWED_HOSTS="${ALLOWED_HOSTS}" \
      -e RCLONE_VERIFY_MODE="${RCLONE_VERIFY_MODE}" \
      -v "${DATA_VOLUME}:/data" \
      "${IMAGE}"
    ;;
  quick-build)
    quick_build
    ;;
  quick-run)
    quick_run
    ;;
  quick-restart)
    quick_build
    quick_run
    ;;
  *)
    usage
    exit 2
    ;;
esac
