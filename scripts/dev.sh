#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

is_port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH "sport = :${port}" 2>/dev/null | grep -q .
    return $?
  fi
  # Fallback: best-effort check (may be noisy on some shells).
  (echo >/dev/tcp/127.0.0.1/"${port}") >/dev/null 2>&1
}

pick_free_port() {
  local start="$1"
  local max_tries="${2:-50}"
  local port="${start}"
  local i=0

  while [ "$i" -lt "$max_tries" ]; do
    if ! is_port_in_use "$port"; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
    i=$((i + 1))
  done

  echo "[dev] failed to find a free port starting at ${start}" >&2
  return 1
}

parse_host_port() {
  local addr="$1"
  local host port

  # Accept "[::1]:8080" for IPv6. For non-bracketed IPv6, users should bracket it.
  if [[ "$addr" == \[*\]:* ]]; then
    host="${addr%%]*}"
    host="${host#[}"
    port="${addr##*:}"
  else
    host="${addr%:*}"
    port="${addr##*:}"
    if [[ "$host" == "$port" ]]; then
      host="$addr"
      port=""
    fi
  fi

  echo "${host}|${port}"
}

format_addr() {
  local host="$1"
  local port="$2"

  if [[ "$host" == *:* ]]; then
    echo "[${host}]:${port}"
    return 0
  fi
  if [[ -z "$host" ]]; then
    echo ":${port}"
    return 0
  fi
  echo "${host}:${port}"
}

GO_BIN="${GO_BIN:-}"
if [[ -z "${GO_BIN}" ]]; then
  if command -v go >/dev/null 2>&1; then
    GO_BIN="go"
  elif [[ -x "${ROOT}/.tools/go/bin/go" ]]; then
    GO_BIN="${ROOT}/.tools/go/bin/go"
  else
    echo "[dev] go not found (install Go or add .tools/go)" >&2
    exit 1
  fi
fi

BACKEND_ADDR="${S3DESK_BACKEND_ADDR:-127.0.0.1:8080}"
IFS='|' read -r backend_host backend_port <<<"$(parse_host_port "${BACKEND_ADDR}")"
backend_port="${backend_port:-8080}"

backend_port_free="$(pick_free_port "${backend_port}")"
if [[ "${backend_port_free}" != "${backend_port}" ]]; then
  echo "[dev] backend port ${backend_port} is in use; using ${backend_port_free}" >&2
fi

BACKEND_ADDR="$(format_addr "${backend_host}" "${backend_port_free}")"

# If the dev server is exposed to the LAN (e.g. --host 0.0.0.0), the UI origin
# becomes a private IP and the backend must allow it.
if [[ -z "${ALLOW_REMOTE:-}" && -n "${S3DESK_FRONTEND_HOST:-}" && "${S3DESK_FRONTEND_HOST}" != "127.0.0.1" && "${S3DESK_FRONTEND_HOST}" != "localhost" ]]; then
  export ALLOW_REMOTE="true"
fi

echo "[dev] starting backend on ${BACKEND_ADDR}"
(cd "${ROOT}/backend" && ADDR="${BACKEND_ADDR}" setsid "${GO_BIN}" run ./cmd/server "$@") &
BACK_PID=$!

cleanup() {
  # go run spawns a child binary; kill the whole process group to avoid orphans.
  kill -- "-${BACK_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

FRONTEND_HOST="${S3DESK_FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${S3DESK_FRONTEND_PORT:-5173}"
FRONTEND_PORT_FREE="$(pick_free_port "${FRONTEND_PORT}")"
if [[ "${FRONTEND_PORT_FREE}" != "${FRONTEND_PORT}" ]]; then
  echo "[dev] frontend port ${FRONTEND_PORT} is in use; using ${FRONTEND_PORT_FREE}" >&2
fi

proxy_host="${backend_host}"
if [[ -z "${proxy_host}" || "${proxy_host}" == "0.0.0.0" || "${proxy_host}" == "::" ]]; then
  proxy_host="127.0.0.1"
fi
if [[ "${proxy_host}" == *:* ]]; then
  proxy_host="[${proxy_host}]"
fi
export S3DESK_DEV_PROXY_TARGET="http://${proxy_host}:${backend_port_free}"

echo "[dev] starting frontend on ${FRONTEND_HOST}:${FRONTEND_PORT_FREE}"
echo "[dev] vite proxy target: ${S3DESK_DEV_PROXY_TARGET}"
(cd "${ROOT}/frontend" && npm run dev -- --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT_FREE}")
