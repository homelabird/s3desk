#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/compose.sh setup              Create .env.local (no containers started)
  ./scripts/compose.sh up                 Validate, pull, and start your deployment
  ./scripts/compose.sh status             Show deployment containers
  ./scripts/compose.sh logs               Follow deployment logs
  ./scripts/compose.sh stop               Stop containers; keep data and configuration
  ./scripts/compose.sh <stack> <compose-args...>

First deployment (run on the server):
  1. Install Docker or Podman with Compose, and OpenSSL for setup.
  2. Run ./scripts/compose.sh setup and choose local, LAN, or public HTTPS access.
  3. Run ./scripts/compose.sh up, then open the configured URL.
  Find the login API_TOKEN in .env.local; secrets are never printed by setup.

Configuration:
  Remote/Caddy commands automatically use .env.local when present.
  Exported variables override file values. Keep .env.local backed up with your data.
  Setup never overwrites an existing .env.local or changes existing data.
  S3DESK_COMPOSE_PROVIDER=auto|docker|podman selects the engine (auto prefers Podman).
  Use the explicit stack commands below for extra Compose options or IPv6 settings.

Stacks:
  remote           Remote/Postgres stack
  remote-syslog    Remote/Postgres stack with Docker syslog forwarding
  caddy            Remote/Postgres stack with Caddy
  caddy-syslog     Remote/Postgres/Caddy stack with Docker syslog forwarding
  dev              Local build stack
  demo             SeaweedFS-backed seeded demo stack
  e2e              API/provider E2E stack
  portable-smoke   Portable backup/import smoke stack

Examples:
  ./scripts/compose.sh remote up -d
  SYSLOG_ADDRESS=tcp+tls://logs.example.com:6514 ./scripts/compose.sh remote-syslog up -d
  ./scripts/compose.sh caddy logs -f caddy s3desk
  ./scripts/compose.sh dev up --build -d
  DEMO_PUBLIC_HOST=127.0.0.1 ./scripts/compose.sh demo up --build -d
  ./scripts/compose.sh e2e run --rm runner
EOF
}

STACK="${1:-}"
if [[ -z "${STACK}" || "${STACK}" == "-h" || "${STACK}" == "--help" ]]; then
  usage
  exit 0
fi
shift || true

ENV_FILE="${ROOT_DIR}/.env"
USE_LOCAL_ENV=false
case "${STACK}" in
  setup|up|status|logs|stop|remote|prod|remote-syslog|prod-syslog|caddy|remote-caddy|caddy-syslog|remote-caddy-syslog)
    if [[ -f "${ROOT_DIR}/.env.local" ]]; then
      ENV_FILE="${ROOT_DIR}/.env.local"
      USE_LOCAL_ENV=true
    fi
    ;;
esac

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
  if [[ ! -v "${name}" && -f "${ENV_FILE}" ]]; then
    value="$(
      awk -F= -v key="${name}" '
        $0 !~ /^[[:space:]]*#/ && $1 == key {
          value = substr($0, index($0, "=") + 1)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
          gsub(/^["'\'']|["'\'']$/, "", value)
          print value
          exit
        }
      ' "${ENV_FILE}"
    )"
  fi
  printf '%s' "${value}"
}

require_non_placeholder_secret() {
  local name="$1"
  local value
  value="$(env_or_dotenv_value "${name}")"
  if is_placeholder_secret "${value}"; then
    echo "${name} must be set to a non-placeholder value for ${STACK}. Edit ${ENV_FILE}, or run ./scripts/compose.sh setup for a new deployment." >&2
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

require_explicit_demo_public_host() {
  export DEMO_PUBLIC_HOST="${DEMO_PUBLIC_HOST:-0.0.0.0}"
  if [[ "${DEMO_PUBLIC_HOST}" == *://* || "${DEMO_PUBLIC_HOST}" == */* || "${DEMO_PUBLIC_HOST}" == *:* || ! "${DEMO_PUBLIC_HOST}" =~ ^[[:alnum:]]([[:alnum:].-]*[[:alnum:]])?$ ]]; then
    echo "DEMO_PUBLIC_HOST must be an IP address or hostname without a scheme, port, or path" >&2
    exit 1
  fi
  if [[ -z "${S3DESK_BIND_HOST:-}" ]]; then
    case "${DEMO_PUBLIC_HOST,,}" in
      localhost|*.localhost|127.*) export S3DESK_BIND_HOST=127.0.0.1 ;;
      *) export S3DESK_BIND_HOST=0.0.0.0 ;;
    esac
  fi
}

setup_deployment() {
  if [[ -e "${ROOT_DIR}/.env.local" || -L "${ROOT_DIR}/.env.local" ]]; then
    echo ".env.local already exists; keeping its secrets and configuration. Edit it if needed, then run ./scripts/compose.sh up." >&2
    exit 1
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    echo "OpenSSL is required to generate deployment secrets. Install openssl, then rerun ./scripts/compose.sh setup." >&2
    exit 1
  fi

  local mode host port image tag bind stack url api_token encryption_key db_password
  echo "New deployment: choose how you will open S3Desk."
  echo "  1) This server only / SSH tunnel (HTTP, safest default)"
  echo "  2) Trusted LAN (HTTP, binds all interfaces)"
  echo "  3) Public domain (HTTPS via Caddy; DNS and ports 80/443 required)"
  read -r -p "Access [1]: " mode || setup_input_required
  mode="${mode:-1}"
  host=127.0.0.1
  port=8080
  bind=127.0.0.1
  stack=remote
  case "${mode}" in
    1) ;;
    2|3)
      read -r -p "Browser-facing hostname or IPv4 address: " host || setup_input_required
      # shortcut: setup accepts IPv4/hostnames; use explicit stack settings for IPv6.
      if [[ ! "${host}" =~ ^([[:alnum:]]([[:alnum:]-]*[[:alnum:]])?\.)*[[:alnum:]]([[:alnum:]-]*[[:alnum:]])?$ ]] || is_placeholder_public_host "${host}" || [[ "${host}" == "0.0.0.0" ]]; then
        echo "Enter a real hostname or IPv4 address, without a scheme, port, or path." >&2
        exit 2
      fi
      if [[ "${mode}" == 3 ]]; then
        if [[ "${host}" != *.* || "${host}" =~ ^[0-9.]+$ ]]; then
          echo "Public HTTPS requires a DNS domain, such as s3desk.your-domain.tld." >&2
          exit 2
        fi
        stack=caddy
      else
        bind=0.0.0.0
      fi
      ;;
    *) echo "Choose 1, 2, or 3; rerun ./scripts/compose.sh setup." >&2; exit 2 ;;
  esac
  if [[ "${stack}" == remote ]]; then
    read -r -p "Web port [8080]: " port || setup_input_required
    port="${port:-8080}"
    if [[ ! "${port}" =~ ^[0-9]{1,5}$ ]] || ((10#${port} < 1 || 10#${port} > 65535)); then
      echo "Web port must be a number from 1 to 65535." >&2
      exit 2
    fi
    port=$((10#${port}))
  fi
  image="$(awk -F= '$1 == "S3DESK_IMAGE" { print $2; exit }' "${ROOT_DIR}/.env.example")"
  tag="$(awk -F= '$1 == "S3DESK_TAG" { print $2; exit }' "${ROOT_DIR}/.env.example")"
  read -r -p "Container image [${image}]: " REPLY || setup_input_required
  image="${REPLY:-${image}}"
  read -r -p "Image tag [${tag}]: " REPLY || setup_input_required
  tag="${REPLY:-${tag}}"
  if [[ ! "${image}" =~ ^[a-z0-9]([a-z0-9._/:-]*[a-z0-9])?$ || "${image##*/}" == *:* || ! "${tag}" =~ ^[[:alnum:]_][[:alnum:]_.-]{0,127}$ ]]; then
    echo "Use a container repository without a tag, and a separate valid image tag." >&2
    exit 2
  fi
  url="http://${host}:${port}"
  [[ "${stack}" != caddy ]] || url="https://${host}"
  api_token="$(openssl rand -hex 32)"
  encryption_key="$(openssl rand -base64 32)"
  db_password="$(openssl rand -hex 32)"
  (
    umask 077
    set -o noclobber
    cat > "${ROOT_DIR}/.env.local" <<EOF
# Generated by ./scripts/compose.sh setup. Keep this file private and backed up.
# Preserve ENCRYPTION_KEY and POSTGRES_PASSWORD when reusing existing data.
S3DESK_DEPLOY_STACK=${stack}
S3DESK_IMAGE=${image}
S3DESK_TAG=${tag}
API_TOKEN=${api_token}
ENCRYPTION_KEY=${encryption_key}
POSTGRES_PASSWORD=${db_password}
S3DESK_BIND_ADDRESS=${bind}
S3DESK_PORT=${port}
ALLOWED_HOSTS=${host},localhost,127.0.0.1
ALLOWED_LOCAL_DIRS=/data
EXTERNAL_BASE_URL=${url}
S3DESK_DOMAIN=${host}
EOF
  )
  echo "Saved private configuration to ${ROOT_DIR}/.env.local (permissions 600)."
  echo "Next: ./scripts/compose.sh up"
  echo "Then open ${url} and use API_TOKEN from .env.local to log in."
  [[ "${mode}" != 1 ]] || echo "From another machine: ssh -L ${port}:127.0.0.1:${port} user@server, then open ${url}."
}

setup_input_required() {
  echo "Setup needs answers on standard input. Run ./scripts/compose.sh setup in a terminal; see --help." >&2
  exit 2
}

DEPLOY_ACTION=""
case "${STACK}" in
  setup|up|status|logs|stop)
    if (($# > 0)); then
      echo "${STACK} does not accept extra arguments. Use an explicit stack for Compose options; see --help." >&2
      exit 2
    fi
    if [[ "${STACK}" == setup ]]; then
      setup_deployment
      exit 0
    fi
    if [[ "${USE_LOCAL_ENV}" != true ]]; then
      echo "No .env.local found. First run ./scripts/compose.sh setup, then ./scripts/compose.sh up." >&2
      exit 2
    fi
    DEPLOY_ACTION="${STACK}"
    STACK="$(env_or_dotenv_value S3DESK_DEPLOY_STACK)"
    STACK="${STACK:-remote}"
    case "${STACK}" in
      remote|caddy) ;;
      *) echo "S3DESK_DEPLOY_STACK must be remote or caddy in .env.local." >&2; exit 2 ;;
    esac
    case "${DEPLOY_ACTION}" in
      up) set -- up -d ;;
      status) set -- ps ;;
      logs) set -- logs -f ;;
      stop) set -- stop ;;
    esac
    ;;
esac

declare -a COMPOSE_FILES=()
REQUIRED_PROVIDER=""
case "${STACK}" in
  remote|prod|remote-syslog|prod-syslog)
    COMPOSE_FILES=("compose/remote/compose.yml")
    if [[ "${STACK}" == *-syslog ]]; then
      COMPOSE_FILES+=("compose/remote/syslog.yml")
      REQUIRED_PROVIDER="docker"
    fi
    require_strong_api_token
    require_non_placeholder_secret ENCRYPTION_KEY
    require_non_placeholder_secret POSTGRES_PASSWORD
    require_non_empty_setting ALLOWED_LOCAL_DIRS
    require_non_placeholder_public_host ALLOWED_HOSTS
    require_non_empty_setting S3DESK_IMAGE
    require_non_empty_setting S3DESK_TAG
    if [[ -n "$(env_or_dotenv_value EXTERNAL_BASE_URL)" ]]; then
      require_non_placeholder_public_host EXTERNAL_BASE_URL
    fi
    ;;
  caddy|remote-caddy|caddy-syslog|remote-caddy-syslog)
    COMPOSE_FILES=("compose/remote/caddy.yml")
    if [[ "${STACK}" == *-syslog ]]; then
      COMPOSE_FILES+=("compose/remote/syslog.yml")
      REQUIRED_PROVIDER="docker"
    fi
    require_strong_api_token
    require_non_placeholder_secret ENCRYPTION_KEY
    require_non_placeholder_secret POSTGRES_PASSWORD
    require_non_empty_setting ALLOWED_LOCAL_DIRS
    require_non_placeholder_public_host ALLOWED_HOSTS
    require_non_placeholder_public_host EXTERNAL_BASE_URL
    require_non_placeholder_public_host S3DESK_DOMAIN
    require_non_empty_setting S3DESK_IMAGE
    require_non_empty_setting S3DESK_TAG
    ;;
  dev|local)
    COMPOSE_FILES=("compose/dev/compose.yml")
    ;;
  demo)
    require_explicit_demo_public_host
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
    exit 2
    ;;
esac

preferred_provider="${S3DESK_COMPOSE_PROVIDER:-auto}"
if [[ "${REQUIRED_PROVIDER}" == "docker" ]]; then
  if [[ "${preferred_provider}" != "auto" && "${preferred_provider}" != "docker" ]]; then
    echo "${STACK} requires Docker because Podman has no syslog logging driver" >&2
    exit 1
  fi
  preferred_provider="docker"
fi

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
if [[ "${USE_LOCAL_ENV}" == true ]]; then
  FILE_ARGS+=(--env-file "${ENV_FILE}")
fi
for compose_file in "${COMPOSE_FILES[@]}"; do
  FILE_ARGS+=(-f "${ROOT_DIR}/${compose_file}")
done

if [[ "${DEPLOY_ACTION}" == up ]]; then
  echo "[1/3] Validating deployment configuration..."
  "${COMPOSE_CMD[@]}" "${FILE_ARGS[@]}" config --quiet
  echo "[2/3] Pulling container images..."
  "${COMPOSE_CMD[@]}" "${FILE_ARGS[@]}" pull
  echo "[3/3] Starting deployment..."
  "${COMPOSE_CMD[@]}" "${FILE_ARGS[@]}" "$@"
  "${COMPOSE_CMD[@]}" "${FILE_ARGS[@]}" ps
  echo "Containers started. Check ./scripts/compose.sh status and ./scripts/compose.sh logs if the UI is not ready yet."
  echo "Open $(env_or_dotenv_value EXTERNAL_BASE_URL); use API_TOKEN from .env.local to log in."
else
  exec "${COMPOSE_CMD[@]}" "${FILE_ARGS[@]}" "$@"
fi
