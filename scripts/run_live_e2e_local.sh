#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SEAWEEDFS_CONTAINER="${SEAWEEDFS_CONTAINER:-s3desk-seaweedfs-e2e-local-$$}"
SEAWEEDFS_IMAGE="${SEAWEEDFS_IMAGE:-docker.io/chrislusf/seaweedfs:4.47}"
SEAWEEDFS_API_PORT="${SEAWEEDFS_API_PORT:-8333}"
SEAWEEDFS_ACCESS_KEY="${SEAWEEDFS_ACCESS_KEY:-demo-seaweedfs}"
SEAWEEDFS_SECRET_KEY="${SEAWEEDFS_SECRET_KEY:-demo-seaweedfs-secret}"
RCLONE_IMAGE="${RCLONE_IMAGE:-docker.io/rclone/rclone:1.75.1}"

API_TOKEN="${API_TOKEN:-change-me}"
BACKEND_ADDR="${BACKEND_ADDR:-127.0.0.1:8080}"
BACKEND_HOST="${BACKEND_ADDR%:*}"
BACKEND_PORT="${BACKEND_ADDR##*:}"
RCLONE_PATH="${RCLONE_PATH:-}"

PLAYWRIGHT_PROJECT="${PLAYWRIGHT_PROJECT:-chromium}"

E2E_BASE_URL="${E2E_BASE_URL:-http://${BACKEND_ADDR}}"
E2E_S3_ENDPOINT="${E2E_S3_ENDPOINT:-http://127.0.0.1:${SEAWEEDFS_API_PORT}}"
E2E_S3_PUBLIC_ENDPOINT="${E2E_S3_PUBLIC_ENDPOINT:-${E2E_S3_ENDPOINT}}"
E2E_S3_ACCESS_KEY="${E2E_S3_ACCESS_KEY:-${SEAWEEDFS_ACCESS_KEY}}"
E2E_S3_SECRET_KEY="${E2E_S3_SECRET_KEY:-${SEAWEEDFS_SECRET_KEY}}"
E2E_S3_REGION="${E2E_S3_REGION:-us-east-1}"
E2E_S3_FORCE_PATH_STYLE="${E2E_S3_FORCE_PATH_STYLE:-true}"
E2E_S3_TLS_SKIP_VERIFY="${E2E_S3_TLS_SKIP_VERIFY:-false}"
E2E_GCS_ENDPOINT="${E2E_GCS_ENDPOINT:-http://127.0.0.1:${SEAWEEDFS_API_PORT}}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-${E2E_ENCRYPTION_KEY:-QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=}}"
UPLOAD_DIRECT_STREAM="${UPLOAD_DIRECT_STREAM:-true}"

BACKEND_LOG="${BACKEND_LOG:-/tmp/s3desk_backend_live.log}"
RCLONE_CACHE_DIR="${RCLONE_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/s3desk/live-e2e}"
BACKEND_TEMP_DIR=""
BACKEND_BIN=""
RCLONE_TEMP_DIR=""
RCLONE_CONTAINER=""
SEAWEEDFS_STARTED=false
SEAWEEDFS_TEMP_DIR=""

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
	local port="${addr##*:}"
	ss -ltnp 2>/dev/null | awk -v port=":${port}" '
		NR > 1 && $4 ~ (port "$") {
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

cleanup() {
	if [ -n "${BACK_PID:-}" ]; then
		kill "${BACK_PID}" >/dev/null 2>&1 || true
		wait "${BACK_PID}" >/dev/null 2>&1 || true
	fi
	if [ "${SEAWEEDFS_STARTED}" = true ]; then
		podman rm -f "${SEAWEEDFS_CONTAINER}" >/dev/null 2>&1 || true
	fi
	if [ -n "${SEAWEEDFS_TEMP_DIR}" ]; then
		if ! rm -rf "${SEAWEEDFS_TEMP_DIR}"; then
			podman unshare rm -rf "${SEAWEEDFS_TEMP_DIR}"
		fi
	fi
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
# Unique container and data directory per run: never remove a user's storage.
SEAWEEDFS_TEMP_DIR="$(mktemp -d /tmp/s3desk-seaweedfs-e2e.XXXXXX)"
echo "[live-e2e] starting SeaweedFS (${SEAWEEDFS_IMAGE}) on 127.0.0.1:${SEAWEEDFS_API_PORT}"
podman run -d \
	--name "${SEAWEEDFS_CONTAINER}" \
	-p "127.0.0.1:${SEAWEEDFS_API_PORT}:8333" \
	-e "AWS_ACCESS_KEY_ID=${E2E_S3_ACCESS_KEY}" \
	-e "AWS_SECRET_ACCESS_KEY=${E2E_S3_SECRET_KEY}" \
	-v "${SEAWEEDFS_TEMP_DIR}:/data:Z" \
	-v "${ROOT_DIR}/compose/demo/filer.toml:/etc/seaweedfs/filer.toml:ro,z" \
	"${SEAWEEDFS_IMAGE}" server \
	-dir=/data -ip=127.0.0.1 -ip.bind=127.0.0.1 \
	-master.port=9333 -master.volumeSizeLimitMB=256 -master.telemetry=false \
	-volume.port=9340 -volume.max=0 -filer -filer.port=8888 \
	-s3 -s3.ip.bind=0.0.0.0 -s3.port=8333 \
	-s3.port.iceberg=0 -s3.port.lance=0 -s3.iam=false \
	-s3.allowDeleteBucketNotEmpty=false -s3.autoCreateBucket=false \
	"-s3.allowedOrigins=${E2E_BASE_URL}" >/dev/null
SEAWEEDFS_STARTED=true

# Master/filer health alone is not S3 readiness. Verify signed requests through
# the same S3 API used by the backend, with bounded attempts and I/O deadlines.
storage_ready=false
for _ in $(seq 1 40); do
	if RCLONE_CONFIG=/dev/null RCLONE_CONFIG_E2E_TYPE=s3 \
		RCLONE_CONFIG_E2E_PROVIDER=Other RCLONE_CONFIG_E2E_ENV_AUTH=false \
		RCLONE_CONFIG_E2E_ENDPOINT="${E2E_S3_ENDPOINT}" \
		RCLONE_CONFIG_E2E_REGION="${E2E_S3_REGION}" \
		RCLONE_CONFIG_E2E_FORCE_PATH_STYLE=true \
		RCLONE_CONFIG_E2E_ACCESS_KEY_ID="${E2E_S3_ACCESS_KEY}" \
		RCLONE_CONFIG_E2E_SECRET_ACCESS_KEY="${E2E_S3_SECRET_KEY}" \
		"${RCLONE_PATH}" --contimeout 3s --timeout 5s --max-duration 8s \
		--retries 1 --low-level-retries 1 lsd e2e: >/dev/null 2>&1; then
		storage_ready=true
		break
	fi
	sleep 1
done
if [ "${storage_ready}" != true ]; then
	echo "SeaweedFS did not become ready for authenticated S3 requests" >&2
	exit 1
fi
stop_stale_backend

echo "[live-e2e] building frontend"
(
	cd "${ROOT_DIR}/frontend"
	npm run build
)

build_backend

echo "[live-e2e] starting backend on ${BACKEND_ADDR}"
(
	cd "${ROOT_DIR}/backend"
	S3DESK_ALLOWED_LOOPBACK_PUBLIC_ENDPOINT="${E2E_S3_PUBLIC_ENDPOINT}" API_TOKEN="${API_TOKEN}" ENCRYPTION_KEY="${ENCRYPTION_KEY}" UPLOAD_DIRECT_STREAM="${UPLOAD_DIRECT_STREAM}" ADDR="${BACKEND_ADDR}" RCLONE_PATH="${RCLONE_PATH}" exec "${BACKEND_BIN}" >"${BACKEND_LOG}" 2>&1
) &
BACK_PID=$!

backend_ready=false
for _ in $(seq 1 40); do
	if curl --connect-timeout 2 --max-time 3 -fsS "http://${BACKEND_HOST}:${BACKEND_PORT}/healthz" >/dev/null 2>&1; then
		backend_ready=true
		break
	fi
	if ! kill -0 "${BACK_PID}" 2>/dev/null; then
		break
	fi
	sleep 1
done
if [ "${backend_ready}" != true ]; then
	echo "Backend did not become ready; inspect ${BACKEND_LOG}" >&2
	exit 1
fi

echo "[live-e2e] running Playwright (${PLAYWRIGHT_PROJECT})"
(
	cd "${ROOT_DIR}/frontend"
	E2E_LIVE=1 \
	PLAYWRIGHT_BASE_URL="${E2E_BASE_URL}" \
	DOCS_BASE_URL="${E2E_BASE_URL}" \
	E2E_API_TOKEN="${API_TOKEN}" \
	E2E_S3_ENDPOINT="${E2E_S3_ENDPOINT}" \
	E2E_S3_PUBLIC_ENDPOINT="${E2E_S3_PUBLIC_ENDPOINT}" \
	E2E_S3_ACCESS_KEY="${E2E_S3_ACCESS_KEY}" \
	E2E_S3_SECRET_KEY="${E2E_S3_SECRET_KEY}" \
	E2E_S3_REGION="${E2E_S3_REGION}" \
	E2E_S3_FORCE_PATH_STYLE="${E2E_S3_FORCE_PATH_STYLE}" \
	E2E_S3_TLS_SKIP_VERIFY="${E2E_S3_TLS_SKIP_VERIFY}" \
	E2E_GCS_ENDPOINT="${E2E_GCS_ENDPOINT}" \
		npx playwright test "${TEST_FILES[@]}" --project="${PLAYWRIGHT_PROJECT}"
)

echo "[live-e2e] done"
