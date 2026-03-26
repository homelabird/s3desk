#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-${CI_COMMIT_TAG:-}}"

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

: "${DEPLOY_SSH_HOST:?DEPLOY_SSH_HOST is required}"
: "${DEPLOY_SSH_USER:?DEPLOY_SSH_USER is required}"
: "${DEPLOY_COMPOSE_PATH:?DEPLOY_COMPOSE_PATH is required}"

DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-compose/remote/compose.yml}"
DEPLOY_COMPOSE_SERVICE="${DEPLOY_COMPOSE_SERVICE:-s3desk}"
DEPLOY_HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-}"
DEPLOY_BASE_URL="${DEPLOY_BASE_URL:-}"
DEPLOY_API_TOKEN="${DEPLOY_API_TOKEN:-}"
DEPLOY_REMOTE_DOCKER_BIN="${DEPLOY_REMOTE_DOCKER_BIN:-docker}"

if [[ -z "${DEPLOY_BASE_URL}" && -n "${DEPLOY_HEALTHCHECK_URL}" ]]; then
  DEPLOY_BASE_URL="${DEPLOY_HEALTHCHECK_URL%/healthz}"
fi

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
EOF

bash "${ROOT}/scripts/deploy_smoke.sh"
