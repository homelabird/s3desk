#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MINIO_CONTAINER="${MINIO_CONTAINER:-s3desk-minio-e2e-local}"
MINIO_IMAGE="${MINIO_IMAGE:-quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
RCLONE_IMAGE="${RCLONE_IMAGE:-docker.io/rclone/rclone:1.72.0}"

API_TOKEN="${API_TOKEN:-change-me}"
BACKEND_ADDR="${BACKEND_ADDR:-127.0.0.1:8080}"
BACKEND_HOST="${BACKEND_ADDR%:*}"
BACKEND_PORT="${BACKEND_ADDR##*:}"
RCLONE_PATH="${RCLONE_PATH:-}"

PLAYWRIGHT_PROJECT="${PLAYWRIGHT_PROJECT:-chromium}"

E2E_BASE_URL="${E2E_BASE_URL:-http://${BACKEND_ADDR}}"
E2E_S3_ENDPOINT="${E2E_S3_ENDPOINT:-http://127.0.0.1:${MINIO_PORT}}"
E2E_S3_ACCESS_KEY="${E2E_S3_ACCESS_KEY:-${MINIO_ROOT_USER}}"
E2E_S3_SECRET_KEY="${E2E_S3_SECRET_KEY:-${MINIO_ROOT_PASSWORD}}"
E2E_S3_REGION="${E2E_S3_REGION:-us-east-1}"
E2E_S3_FORCE_PATH_STYLE="${E2E_S3_FORCE_PATH_STYLE:-true}"
E2E_S3_TLS_SKIP_VERIFY="${E2E_S3_TLS_SKIP_VERIFY:-true}"

BACKEND_LOG="${BACKEND_LOG:-/tmp/s3desk_backend_live.log}"
RCLONE_CACHE_DIR="${RCLONE_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/s3desk/live-e2e}"
BACKEND_TEMP_DIR=""
BACKEND_BIN=""
RCLONE_TEMP_DIR=""
RCLONE_CONTAINER=""

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

ensure_rclone() {
	if [ -n "${RCLONE_PATH}" ]; then
		return
	fi
	if command -v rclone >/dev/null 2>&1; then
		RCLONE_PATH="$(command -v rclone)"
		return
	fi

	echo "[live-e2e] extracting rclone from ${RCLONE_IMAGE}"
	mkdir -p "${RCLONE_CACHE_DIR}"
	RCLONE_TEMP_DIR="$(mktemp -d /tmp/s3desk-rclone-e2e.XXXXXX)"
	RCLONE_CONTAINER="s3desk-rclone-e2e-$$"
	local cached_path="${RCLONE_CACHE_DIR}/rclone"
	local extracted_path="${RCLONE_TEMP_DIR}/rclone"
	podman rm -f "${RCLONE_CONTAINER}" >/dev/null 2>&1 || true
	podman create --name "${RCLONE_CONTAINER}" "${RCLONE_IMAGE}" >/dev/null
	podman cp "${RCLONE_CONTAINER}:/usr/local/bin/rclone" "${extracted_path}" >/dev/null
	chmod +x "${extracted_path}"
	mv "${extracted_path}" "${cached_path}"
	RCLONE_PATH="${cached_path}"
}

find_listener_pid() {
	local addr="${1}"
	ss -ltnp 2>/dev/null | awk -v addr="${addr}" '
		$4 == addr {
			if (match($0, /pid=[0-9]+/)) {
				print substr($0, RSTART + 4, RLENGTH - 4)
				exit
			}
		}
	'
}

stop_stale_backend() {
	local pid
	pid="$(find_listener_pid "${BACKEND_ADDR}" || true)"
	if [ -z "${pid}" ]; then
		return
	fi

	local cmd
	cmd="$(ps -p "${pid}" -o args= 2>/dev/null || true)"
	case "${cmd}" in
		*"go-build/"*"/server"*|*"s3desk"*"/server"*|*"go run ./cmd/server"*)
			echo "[live-e2e] stopping stale backend on ${BACKEND_ADDR} (pid ${pid})"
			kill "${pid}" >/dev/null 2>&1 || true
			sleep 1
			;;
		*)
			echo "backend address ${BACKEND_ADDR} already in use by: ${cmd}" >&2
			exit 1
			;;
	esac
}

build_backend() {
	BACKEND_TEMP_DIR="$(mktemp -d /tmp/s3desk-backend-live.XXXXXX)"
	BACKEND_BIN="${BACKEND_TEMP_DIR}/server"
	(
		cd "${ROOT_DIR}/backend"
		go build -o "${BACKEND_BIN}" ./cmd/server
	)
}

if [ "$#" -gt 0 ]; then
	TEST_FILES=("$@")
else
	LIVE_E2E_SUITE="${LIVE_E2E_SUITE:-extended}"
	CRITICAL_TEST_FILES=(
		"tests/api-crud.spec.ts"
		"tests/objects-live-flow.spec.ts"
		"tests/jobs-live-flow.spec.ts"
		"tests/transfers-live-fallback.spec.ts"
		"tests/bucket-policy-live.spec.ts"
		"tests/docs-smoke.spec.ts"
		"tests/server-migration-live.spec.ts"
		"tests/uploads-folder-live.spec.ts"
		"tests/objects-image-preview-live.spec.ts"
	)
	EXTENDED_TEST_FILES=(
		"${CRITICAL_TEST_FILES[@]}"
	)
	case "${LIVE_E2E_SUITE}" in
		critical)
			TEST_FILES=("${CRITICAL_TEST_FILES[@]}")
			;;
		extended)
			TEST_FILES=("${EXTENDED_TEST_FILES[@]}")
			;;
		*)
			echo "unsupported LIVE_E2E_SUITE: ${LIVE_E2E_SUITE}" >&2
			exit 1
			;;
	esac
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
	if [ -n "${BACKEND_TEMP_DIR}" ]; then
		rm -rf "${BACKEND_TEMP_DIR}" >/dev/null 2>&1 || true
	fi
	if [ -n "${RCLONE_CONTAINER}" ]; then
		podman rm -f "${RCLONE_CONTAINER}" >/dev/null 2>&1 || true
	fi
	if [ -n "${RCLONE_TEMP_DIR}" ]; then
		rm -rf "${RCLONE_TEMP_DIR}" >/dev/null 2>&1 || true
	fi
}
trap cleanup EXIT

ensure_rclone
stop_stale_backend
build_backend

for _ in $(seq 1 40); do
	if curl -fsS "http://127.0.0.1:${MINIO_PORT}/minio/health/live" >/dev/null 2>&1; then
		break
	fi
	sleep 1
done

echo "[live-e2e] starting backend on ${BACKEND_ADDR}"
(
	cd "${ROOT_DIR}/backend"
	API_TOKEN="${API_TOKEN}" ADDR="${BACKEND_ADDR}" RCLONE_PATH="${RCLONE_PATH}" exec "${BACKEND_BIN}" >"${BACKEND_LOG}" 2>&1
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
