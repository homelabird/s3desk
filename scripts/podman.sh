#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

IMAGE="${IMAGE:-s3desk:local}"
DATA_VOLUME="${DATA_VOLUME:-s3desk-data}"
JOB_QUEUE_CAPACITY="${JOB_QUEUE_CAPACITY:-256}"
JOB_LOG_MAX_LINE_BYTES="${JOB_LOG_MAX_LINE_BYTES:-262144}"
ALLOWED_HOSTS="${ALLOWED_HOSTS:-}"
RCLONE_VERIFY_MODE="${RCLONE_VERIFY_MODE:-checksum}"

usage() {
  cat <<EOF
Usage: $(basename "$0") <build|run|run-port>

Env:
  IMAGE        Image tag (default: ${IMAGE})
  DATA_VOLUME  Podman named volume for DATA_DIR (default: ${DATA_VOLUME})
  JOB_QUEUE_CAPACITY      Max queued jobs before backpressure (default: ${JOB_QUEUE_CAPACITY})
  JOB_LOG_MAX_LINE_BYTES  Max bytes per log line before truncation (default: ${JOB_LOG_MAX_LINE_BYTES})
  ALLOWED_HOSTS           Comma-separated hostnames allowed for Host/Origin checks
  API_TOKEN    Required for run-port

Notes:
  This app is local-only by default, so 'run' uses '--network host'.
EOF
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
    podman run --rm -p 8080:8080 \
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
  *)
    usage
    exit 2
    ;;
esac
