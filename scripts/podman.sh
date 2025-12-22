#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

IMAGE="${IMAGE:-object-storage:local}"
DATA_VOLUME="${DATA_VOLUME:-object-storage-data}"

usage() {
  cat <<EOF
Usage: $(basename "$0") <build|run|run-port>

Env:
  IMAGE        Image tag (default: ${IMAGE})
  DATA_VOLUME  Podman named volume for DATA_DIR (default: ${DATA_VOLUME})
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
    podman run --rm --network host -v "${DATA_VOLUME}:/data" "${IMAGE}"
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
      -v "${DATA_VOLUME}:/data" \
      "${IMAGE}"
    ;;
  *)
    usage
    exit 2
    ;;
esac
