#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/compose.sh <stack> <compose-args...>

Stacks:
  remote           Remote/Postgres stack
  caddy            Remote/Postgres stack with Caddy
  dev              Local build stack
  demo             Seeded demo stack
  e2e              API/provider E2E stack
  portable-smoke   Portable backup/import smoke stack

Examples:
  ./scripts/compose.sh remote up -d
  ./scripts/compose.sh caddy logs -f caddy s3desk
  ./scripts/compose.sh dev up --build -d
  ./scripts/compose.sh demo up --build -d
  ./scripts/compose.sh e2e run --rm runner
EOF
}

STACK="${1:-}"
if [[ -z "${STACK}" || "${STACK}" == "-h" || "${STACK}" == "--help" ]]; then
  usage
  exit 0
fi
shift || true

declare -a COMPOSE_FILES=()
case "${STACK}" in
  remote|prod)
    COMPOSE_FILES=("compose/remote/compose.yml")
    ;;
  caddy|remote-caddy)
    COMPOSE_FILES=("compose/remote/compose.yml" "compose/remote/caddy.yml")
    ;;
  dev|local)
    COMPOSE_FILES=("compose/dev/compose.yml")
    ;;
  demo)
    COMPOSE_FILES=("compose/demo/compose.yml")
    ;;
  e2e|test-e2e)
    COMPOSE_FILES=("compose/test/e2e.yml")
    ;;
  portable-smoke|portable)
    COMPOSE_FILES=("compose/test/portable-smoke.yml")
    ;;
  *)
    echo "unknown compose stack: ${STACK}" >&2
    usage >&2
    exit 1
    ;;
esac

preferred_provider="${S3DESK_COMPOSE_PROVIDER:-auto}"

select_compose_cmd() {
  case "${preferred_provider}" in
    auto)
      if podman compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(podman compose)
        return 0
      fi
      if docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(docker compose)
        return 0
      fi
      ;;
    podman)
      if podman compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(podman compose)
        return 0
      fi
      echo "S3DESK_COMPOSE_PROVIDER=podman requested, but 'podman compose' is unavailable" >&2
      return 1
      ;;
    docker)
      if docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(docker compose)
        return 0
      fi
      echo "S3DESK_COMPOSE_PROVIDER=docker requested, but 'docker compose' is unavailable" >&2
      return 1
      ;;
    *)
      echo "unsupported S3DESK_COMPOSE_PROVIDER: ${preferred_provider}" >&2
      echo "expected one of: auto, podman, docker" >&2
      return 1
      ;;
  esac

  echo "podman compose or docker compose is required" >&2
  return 1
}

declare -a COMPOSE_CMD=()
select_compose_cmd || exit 1

if [[ "${STACK}" == "dev" || "${STACK}" == "local" ]]; then
  export OCI_CONFIG_MOUNT_DIR="${OCI_CONFIG_MOUNT_DIR:-${ROOT_DIR}/data/oci-runtime}"
fi

cd "${ROOT_DIR}"

declare -a FILE_ARGS=()
for compose_file in "${COMPOSE_FILES[@]}"; do
  FILE_ARGS+=(-f "${ROOT_DIR}/${compose_file}")
done

exec "${COMPOSE_CMD[@]}" "${FILE_ARGS[@]}" "$@"
