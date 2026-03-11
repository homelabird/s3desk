#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.portable-smoke.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-s3desk-portable-smoke}"
KEEP_UP="${KEEP_UP:-0}"

if podman compose version >/dev/null 2>&1; then
	COMPOSE_CMD=(podman compose)
elif docker compose version >/dev/null 2>&1; then
	COMPOSE_CMD=(docker compose)
else
	echo "podman compose or docker compose is required" >&2
	exit 1
fi

compose() {
	COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" "${COMPOSE_CMD[@]}" -f "${ROOT_DIR}/${COMPOSE_FILE}" "$@"
}

cleanup() {
	if [ "${KEEP_UP}" != "1" ]; then
		compose down -v --remove-orphans >/dev/null 2>&1 || true
	fi
}
trap cleanup EXIT

echo "[portable-smoke] preparing stack"
compose down -v --remove-orphans >/dev/null 2>&1 || true
compose up -d --build minio postgres source target

echo "[portable-smoke] seeding MinIO"
compose run --rm minio-seed

echo "[portable-smoke] seeding sqlite source fixture"
compose run --rm source-seed

echo "[portable-smoke] verifying sqlite -> postgres portable import"
compose run --rm portable-smoke

echo "[portable-smoke] success"
