#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MINIO_CONTAINER="${MINIO_CONTAINER:-s3desk-minio-e2e-local}"
MINIO_IMAGE="${MINIO_IMAGE:-quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"

API_TOKEN="${API_TOKEN:-change-me}"
BACKEND_ADDR="${BACKEND_ADDR:-127.0.0.1:8080}"
BACKEND_HOST="${BACKEND_ADDR%:*}"
BACKEND_PORT="${BACKEND_ADDR##*:}"

PLAYWRIGHT_PROJECT="${PLAYWRIGHT_PROJECT:-chromium}"

E2E_BASE_URL="${E2E_BASE_URL:-http://${BACKEND_ADDR}}"
E2E_S3_ENDPOINT="${E2E_S3_ENDPOINT:-http://127.0.0.1:${MINIO_PORT}}"
E2E_S3_ACCESS_KEY="${E2E_S3_ACCESS_KEY:-${MINIO_ROOT_USER}}"
E2E_S3_SECRET_KEY="${E2E_S3_SECRET_KEY:-${MINIO_ROOT_PASSWORD}}"
E2E_S3_REGION="${E2E_S3_REGION:-us-east-1}"
E2E_S3_FORCE_PATH_STYLE="${E2E_S3_FORCE_PATH_STYLE:-true}"
E2E_S3_TLS_SKIP_VERIFY="${E2E_S3_TLS_SKIP_VERIFY:-true}"

BACKEND_LOG="${BACKEND_LOG:-/tmp/s3desk_backend_live.log}"

if ! command -v podman >/dev/null 2>&1; then
	echo "podman is required" >&2
	exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
	echo "curl is required" >&2
	exit 1
fi
if ! command -v go >/dev/null 2>&1; then
	echo "go is required" >&2
	exit 1
fi
if ! command -v npx >/dev/null 2>&1; then
	echo "npx is required" >&2
	exit 1
fi

if [ "$#" -gt 0 ]; then
	TEST_FILES=("$@")
else
	TEST_FILES=(
		"tests/api-crud.spec.ts"
		"tests/jobs-live-flow.spec.ts"
		"tests/objects-live-flow.spec.ts"
		"tests/transfers-live-fallback.spec.ts"
		"tests/bucket-policy-live.spec.ts"
		"tests/docs-smoke.spec.ts"
	)
fi

echo "[live-e2e] starting MinIO (${MINIO_IMAGE}) on :${MINIO_PORT}"
podman rm -f "${MINIO_CONTAINER}" >/dev/null 2>&1 || true
podman run -d \
	--name "${MINIO_CONTAINER}" \
	-p "${MINIO_PORT}:9000" \
	-e "MINIO_ROOT_USER=${MINIO_ROOT_USER}" \
	-e "MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}" \
	"${MINIO_IMAGE}" \
	server /data >/dev/null

cleanup() {
	if [ -n "${BACK_PID:-}" ]; then
		kill "${BACK_PID}" >/dev/null 2>&1 || true
		wait "${BACK_PID}" >/dev/null 2>&1 || true
	fi
	podman rm -f "${MINIO_CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 40); do
	if curl -fsS "http://127.0.0.1:${MINIO_PORT}/minio/health/live" >/dev/null 2>&1; then
		break
	fi
	sleep 1
done

echo "[live-e2e] starting backend on ${BACKEND_ADDR}"
(
	cd "${ROOT_DIR}/backend"
	API_TOKEN="${API_TOKEN}" ADDR="${BACKEND_ADDR}" go run ./cmd/server >"${BACKEND_LOG}" 2>&1
) &
BACK_PID=$!

for _ in $(seq 1 40); do
	if curl -fsS "http://${BACKEND_HOST}:${BACKEND_PORT}/healthz" >/dev/null 2>&1; then
		break
	fi
	sleep 1
done

echo "[live-e2e] running Playwright (${PLAYWRIGHT_PROJECT})"
(
	cd "${ROOT_DIR}/frontend"
	E2E_LIVE=1 \
	PLAYWRIGHT_BASE_URL="${E2E_BASE_URL}" \
	DOCS_BASE_URL="${E2E_BASE_URL}" \
	E2E_API_TOKEN="${API_TOKEN}" \
	E2E_S3_ENDPOINT="${E2E_S3_ENDPOINT}" \
	E2E_S3_ACCESS_KEY="${E2E_S3_ACCESS_KEY}" \
	E2E_S3_SECRET_KEY="${E2E_S3_SECRET_KEY}" \
	E2E_S3_REGION="${E2E_S3_REGION}" \
	E2E_S3_FORCE_PATH_STYLE="${E2E_S3_FORCE_PATH_STYLE}" \
	E2E_S3_TLS_SKIP_VERIFY="${E2E_S3_TLS_SKIP_VERIFY}" \
		npx playwright test "${TEST_FILES[@]}" --project="${PLAYWRIGHT_PROJECT}"
)

echo "[live-e2e] done"
