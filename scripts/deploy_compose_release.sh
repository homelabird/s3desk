#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-${CI_COMMIT_TAG:-}}"

bash "${ROOT}/scripts/validate_release_tag.sh" "${TAG}" >/dev/null

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

: "${DEPLOY_SSH_HOST:?DEPLOY_SSH_HOST is required}"
: "${DEPLOY_SSH_USER:?DEPLOY_SSH_USER is required}"
: "${DEPLOY_COMPOSE_PATH:?DEPLOY_COMPOSE_PATH is required}"

DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-compose/remote/compose.yml}"
DEPLOY_COMPOSE_SERVICE="${DEPLOY_COMPOSE_SERVICE:-s3desk}"
DEPLOY_HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-}"
DEPLOY_API_TOKEN="${DEPLOY_API_TOKEN:-}"
DEPLOY_REMOTE_DOCKER_BIN="${DEPLOY_REMOTE_DOCKER_BIN:-docker}"

ssh_args=(-p "${DEPLOY_SSH_PORT}")
if [[ -n "${DEPLOY_SSH_EXTRA_ARGS:-}" ]]; then
  # shellcheck disable=SC2206
  extra_args=( ${DEPLOY_SSH_EXTRA_ARGS} )
  ssh_args+=("${extra_args[@]}")
fi

ssh_target="${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}"

ssh "${ssh_args[@]}" "${ssh_target}" 'bash -se' <<EOF
set -euo pipefail

export S3DESK_IMAGE=$(printf '%q' "${DOCKERHUB_REPO}")
export S3DESK_TAG=$(printf '%q' "${TAG}")
export DEPLOY_COMPOSE_PATH=$(printf '%q' "${DEPLOY_COMPOSE_PATH}")
export DEPLOY_COMPOSE_FILE=$(printf '%q' "${DEPLOY_COMPOSE_FILE}")
export DEPLOY_COMPOSE_SERVICE=$(printf '%q' "${DEPLOY_COMPOSE_SERVICE}")
export DEPLOY_HEALTHCHECK_URL=$(printf '%q' "${DEPLOY_HEALTHCHECK_URL}")
export DEPLOY_API_TOKEN=$(printf '%q' "${DEPLOY_API_TOKEN}")
export DEPLOY_REMOTE_DOCKER_BIN=$(printf '%q' "${DEPLOY_REMOTE_DOCKER_BIN}")
export DOCKERHUB_USERNAME=$(printf '%q' "${DOCKERHUB_USERNAME:-}")
export DOCKERHUB_TOKEN=$(printf '%q' "${DOCKERHUB_TOKEN:-}")

cd "\${DEPLOY_COMPOSE_PATH}"

if [[ -n "\${DOCKERHUB_USERNAME}" && -n "\${DOCKERHUB_TOKEN}" ]]; then
  printf '%s' "\${DOCKERHUB_TOKEN}" | "\${DEPLOY_REMOTE_DOCKER_BIN}" login -u "\${DOCKERHUB_USERNAME}" --password-stdin docker.io
fi

S3DESK_IMAGE="\${S3DESK_IMAGE}" S3DESK_TAG="\${S3DESK_TAG}" "\${DEPLOY_REMOTE_DOCKER_BIN}" compose -f "\${DEPLOY_COMPOSE_FILE}" pull "\${DEPLOY_COMPOSE_SERVICE}"
S3DESK_IMAGE="\${S3DESK_IMAGE}" S3DESK_TAG="\${S3DESK_TAG}" "\${DEPLOY_REMOTE_DOCKER_BIN}" compose -f "\${DEPLOY_COMPOSE_FILE}" up -d "\${DEPLOY_COMPOSE_SERVICE}"
S3DESK_IMAGE="\${S3DESK_IMAGE}" S3DESK_TAG="\${S3DESK_TAG}" "\${DEPLOY_REMOTE_DOCKER_BIN}" compose -f "\${DEPLOY_COMPOSE_FILE}" ps

if [[ -n "\${DEPLOY_HEALTHCHECK_URL}" ]]; then
  for _ in \$(seq 1 30); do
    if command -v curl >/dev/null 2>&1; then
      if [[ -n "\${DEPLOY_API_TOKEN}" ]]; then
        if curl -fsS -H "X-Api-Token: \${DEPLOY_API_TOKEN}" "\${DEPLOY_HEALTHCHECK_URL}" >/dev/null; then
          exit 0
        fi
      elif curl -fsS "\${DEPLOY_HEALTHCHECK_URL}" >/dev/null; then
        exit 0
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget -qO- "\${DEPLOY_HEALTHCHECK_URL}" >/dev/null; then
        exit 0
      fi
    else
      echo "Neither curl nor wget is available for remote health checks." >&2
      exit 1
    fi
    sleep 2
  done
  echo "Remote health check failed: \${DEPLOY_HEALTHCHECK_URL}" >&2
  exit 1
fi
EOF
