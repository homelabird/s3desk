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

is_placeholder_secret() {
  local value="${1:-}"
  local normalized
  normalized="$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "${normalized}" in
    ""|change-me|changeme|default|token|api-token|s3desk|s3desk-local|replace-me|replace-with-a-long-random-token|replace-with-a-strong-db-password|replace-me-with-a-strong-token)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

env_or_dotenv_value() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" && -f "${ROOT_DIR}/.env" ]]; then
    value="$(
      awk -F= -v key="${name}" '
        $0 !~ /^[[:space:]]*#/ && $1 == key {
          value = substr($0, index($0, "=") + 1)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
          gsub(/^["'\'']|["'\'']$/, "", value)
          print value
          exit
        }
      ' "${ROOT_DIR}/.env"
    )"
  fi
  printf '%s' "${value}"
}

require_non_placeholder_secret() {
  local name="$1"
  local value
  value="$(env_or_dotenv_value "${name}")"
  if is_placeholder_secret "${value}"; then
    echo "${name} must be set to a non-placeholder value for ${STACK}" >&2
    exit 1
  fi
}

require_strong_api_token() {
  local value
  value="$(env_or_dotenv_value API_TOKEN)"
  require_non_placeholder_secret API_TOKEN
  if ((${#value} < 32)); then
    echo "API_TOKEN must be at least 32 characters for ${STACK}" >&2
    exit 1
  fi
}

is_placeholder_public_host() {
  local value="${1:-}"
  local normalized
  normalized="$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  normalized="${normalized#http://}"
  normalized="${normalized#https://}"
  normalized="${normalized%%/*}"
  normalized="${normalized%%:*}"
  case "${normalized}" in
    ""|s3desk.example.com|example.com|replace-me|changeme|change-me)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

require_non_placeholder_public_host() {
  local name="$1"
  local value
  value="$(env_or_dotenv_value "${name}")"
  if is_placeholder_public_host "${value}"; then
    echo "${name} must be set to a real hostname for ${STACK}; replace s3desk.example.com before starting remote stacks" >&2
    exit 1
  fi
}

require_non_empty_setting() {
  local name="$1"
  local value
  value="$(env_or_dotenv_value "${name}")"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    echo "${name} must be set for ${STACK}" >&2
    exit 1
  fi
}

declare -a COMPOSE_FILES=()
case "${STACK}" in
  remote|prod)
    COMPOSE_FILES=("compose/remote/compose.yml")
    require_strong_api_token
    require_non_placeholder_secret ENCRYPTION_KEY
    require_non_placeholder_secret POSTGRES_PASSWORD
    require_non_empty_setting ALLOWED_LOCAL_DIRS
    require_non_placeholder_public_host ALLOWED_HOSTS
    if [[ -n "$(env_or_dotenv_value EXTERNAL_BASE_URL)" ]]; then
      require_non_placeholder_public_host EXTERNAL_BASE_URL
    fi
    ;;
  caddy|remote-caddy)
    COMPOSE_FILES=("compose/remote/caddy.yml")
    require_strong_api_token
    require_non_placeholder_secret ENCRYPTION_KEY
    require_non_placeholder_secret POSTGRES_PASSWORD
    require_non_empty_setting ALLOWED_LOCAL_DIRS
    require_non_placeholder_public_host ALLOWED_HOSTS
    require_non_placeholder_public_host EXTERNAL_BASE_URL
    require_non_placeholder_public_host S3DESK_DOMAIN
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
