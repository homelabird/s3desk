#!/usr/bin/env bash
set -euo pipefail

COMPOSE_POD_NAME="${COMPOSE_POD_NAME:-s3desk-ci}"
COMPOSE_NETWORK="${COMPOSE_NETWORK:-slirp4netns}"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp}"

mkdir -p "${XDG_CONFIG_HOME}/containers"
cat > "${XDG_CONFIG_HOME}/containers/containers.conf" <<'EOF'
[network]
default_rootless_network_cmd = "slirp4netns"
EOF

if ! command -v slirp4netns >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then
    dnf -y install slirp4netns
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache slirp4netns
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y --no-install-recommends slirp4netns
  fi
fi

if ! command -v curl >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then
    dnf -y install curl
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache curl
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y --no-install-recommends curl
  fi
fi

if ! command -v podman-compose >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then
    dnf -y install python3-pip
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache python3 py3-pip
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y --no-install-recommends python3 python3-pip
  fi
  python3 -m pip install --no-cache-dir podman-compose
fi

COMPOSE_CMD="podman-compose"
COMPOSE_ARGS="--in-pod ${COMPOSE_POD_NAME} --pod-args=--network=${COMPOSE_NETWORK}"
COMPOSE_PULL_ARGS=""

echo "$COMPOSE_CMD" > /tmp/compose_cmd
echo "$COMPOSE_ARGS" > /tmp/compose_args
echo "$COMPOSE_PULL_ARGS" > /tmp/compose_pull_args
echo "logs" > /tmp/compose_logs_cmd
