#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-}"
PODMAN_BIN="${PODMAN_BIN:-podman}"
POSTGRES_IMAGE="${S3DESK_POSTGRES_IMAGE:-docker.io/library/postgres:15-alpine}"
PORT="${S3DESK_MIGRATION_POSTGRES_PORT:-18084}"
NETWORK_NAME="${S3DESK_MIGRATION_POSTGRES_NETWORK:-s3desk-legacy-postgres-${CI_JOB_ID:-$$}}"
POSTGRES_CONTAINER="${S3DESK_MIGRATION_POSTGRES_CONTAINER:-s3desk-legacy-postgres-${CI_JOB_ID:-$$}}"
APP_CONTAINER="${S3DESK_MIGRATION_POSTGRES_APP_CONTAINER:-s3desk-legacy-postgres-app-${CI_JOB_ID:-$$}}"
POSTGRES_PASSWORD="${S3DESK_MIGRATION_POSTGRES_PASSWORD:-s3desk-migration-password}"
API_TOKEN="${S3DESK_MIGRATION_SMOKE_API_TOKEN:-s3desk-migration-smoke-token-0123456789abcdef012345}"
ENCRYPTION_KEY="${S3DESK_MIGRATION_SMOKE_ENCRYPTION_KEY:-QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=}"
EXPECTED_VERSION="${S3DESK_EXPECTED_VERSION:-}"

if [[ -z "${IMAGE}" ]]; then
	echo "usage: ${0##*/} <s3desk-postgres-image>" >&2
	exit 1
fi
if ! command -v "${PODMAN_BIN}" >/dev/null 2>&1; then
	echo "${PODMAN_BIN} is required" >&2
	exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
	echo "curl is required" >&2
	exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
	echo "python3 is required to verify the legacy Postgres API responses" >&2
	exit 1
fi

data_dir="$(mktemp -d)"
meta_path="${data_dir}/meta.json"
profiles_path="${data_dir}/profiles.json"
jobs_path="${data_dir}/jobs.json"

cleanup() {
	"${PODMAN_BIN}" rm -f "${APP_CONTAINER}" "${POSTGRES_CONTAINER}" >/dev/null 2>&1 || true
	"${PODMAN_BIN}" network rm "${NETWORK_NAME}" >/dev/null 2>&1 || true
	if ! rm -rf "${data_dir}" 2>/dev/null && [[ "${PODMAN_BIN}" == "podman" ]]; then
		"${PODMAN_BIN}" unshare rm -rf "${data_dir}" >/dev/null 2>&1 || true
	fi
}
trap cleanup EXIT

"${PODMAN_BIN}" network create "${NETWORK_NAME}" >/dev/null
"${PODMAN_BIN}" run --rm -d \
	--name "${POSTGRES_CONTAINER}" \
	--network "${NETWORK_NAME}" \
	--network-alias legacy-postgres \
	-e POSTGRES_DB=s3desk \
	-e POSTGRES_USER=s3desk \
	-e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
	"${POSTGRES_IMAGE}" >/dev/null

postgres_ready=0
for _ in $(seq 1 90); do
	if "${PODMAN_BIN}" exec "${POSTGRES_CONTAINER}" pg_isready -U s3desk -d s3desk >/dev/null 2>&1 \
		&& "${PODMAN_BIN}" exec --env "PGPASSWORD=${POSTGRES_PASSWORD}" "${POSTGRES_CONTAINER}" \
		psql --quiet --username s3desk --dbname s3desk --command 'SELECT 1' >/dev/null 2>&1; then
		postgres_ready=1
		break
	fi
	sleep 1
done
if [[ "${postgres_ready}" != "1" ]]; then
	"${PODMAN_BIN}" logs "${POSTGRES_CONTAINER}" >&2 || true
	echo "legacy Postgres fixture did not become ready" >&2
	exit 1
fi

"${PODMAN_BIN}" exec -i --env "PGPASSWORD=${POSTGRES_PASSWORD}" "${POSTGRES_CONTAINER}" \
	psql --quiet --username s3desk --dbname s3desk --set=ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    region TEXT NOT NULL,
    force_path_style INTEGER NOT NULL,
    tls_insecure_skip_verify INTEGER NOT NULL,
    access_key_id TEXT NOT NULL,
    secret_access_key TEXT NOT NULL,
    session_token TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    progress_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
);
CREATE TABLE upload_sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    bucket TEXT NOT NULL,
    prefix TEXT NOT NULL,
    staging_dir TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
INSERT INTO profiles (
    id, name, endpoint, region, force_path_style, tls_insecure_skip_verify,
    access_key_id, secret_access_key, session_token, created_at, updated_at
) VALUES (
    'legacy-profile', 'Legacy Postgres profile', 'https://1.1.1.1', 'us-east-1', 1, 0,
    'legacy-access', 'legacy-secret', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
);
INSERT INTO jobs (
    id, profile_id, type, status, payload_json, progress_json, error,
    created_at, started_at, finished_at
) VALUES (
    'legacy-job', 'legacy-profile', 's3_index_objects', 'completed', '{}', NULL, NULL,
    '2026-01-01T00:00:00Z', NULL, '2026-01-01T00:01:00Z'
);
INSERT INTO upload_sessions (
    id, profile_id, bucket, prefix, staging_dir, expires_at, created_at
) VALUES (
    'legacy-upload', 'legacy-profile', 'legacy-bucket', 'incoming/',
    '/data/staging/legacy-upload', '2099-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
);
SQL

chmod 0777 "${data_dir}"
echo "[container-legacy-postgres-migration] starting ${IMAGE} against a legacy Postgres schema"
"${PODMAN_BIN}" run --rm -d \
	--name "${APP_CONTAINER}" \
	--network "${NETWORK_NAME}" \
	-p "${PORT}:8080" \
	-e ADDR=0.0.0.0:8080 \
	-e ALLOW_REMOTE=true \
	-e ALLOWED_HOSTS=127.0.0.1,localhost \
	-e ALLOWED_LOCAL_DIRS=/data \
	-e API_TOKEN="${API_TOKEN}" \
	-e ENCRYPTION_KEY="${ENCRYPTION_KEY}" \
	-e DB_BACKEND=postgres \
	-e DATABASE_URL="postgres://s3desk:${POSTGRES_PASSWORD}@legacy-postgres:5432/s3desk?sslmode=disable" \
	-e DATA_DIR=/data \
	-v "${data_dir}:/data:Z" \
	"${IMAGE}" >/dev/null

ready=0
for _ in $(seq 1 90); do
	if curl -fsS "http://127.0.0.1:${PORT}/readyz" >/dev/null 2>&1; then
		ready=1
		break
	fi
	sleep 1
done
if [[ "${ready}" != "1" ]]; then
	"${PODMAN_BIN}" logs "${APP_CONTAINER}" >&2 || true
	echo "Postgres-backed container did not become ready" >&2
	exit 1
fi

curl -fsS -H "X-Api-Token: ${API_TOKEN}" "http://127.0.0.1:${PORT}/api/v1/meta" >"${meta_path}"
curl -fsS -H "X-Api-Token: ${API_TOKEN}" "http://127.0.0.1:${PORT}/api/v1/profiles" >"${profiles_path}"
jobs_status="$(curl -sS -o "${jobs_path}" -w '%{http_code}' \
	-H "X-Api-Token: ${API_TOKEN}" -H "X-Profile-Id: legacy-profile" \
	"http://127.0.0.1:${PORT}/api/v1/jobs")"
if [[ "${jobs_status}" != "200" ]]; then
	echo "Postgres jobs endpoint returned HTTP ${jobs_status}: $(<"${jobs_path}")" >&2
	exit 1
fi

python3 - "${meta_path}" "${profiles_path}" "${jobs_path}" "${EXPECTED_VERSION}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    meta = json.load(handle)
with open(sys.argv[2], encoding="utf-8") as handle:
    profiles = json.load(handle)
with open(sys.argv[3], encoding="utf-8") as handle:
    jobs = json.load(handle)
expected_version = sys.argv[4]

engine = meta.get("transferEngine") or {}
if not engine.get("available") or not engine.get("compatible"):
    raise SystemExit(f"Postgres container rclone is not compatible: {engine}")
if expected_version and meta.get("version") != expected_version:
    raise SystemExit(f"Postgres container version={meta.get('version')!r}, want {expected_version!r}")
if not any(item.get("id") == "legacy-profile" and item.get("name") == "Legacy Postgres profile" for item in profiles):
    raise SystemExit(f"legacy Postgres profile missing after startup migration: {profiles}")
if not any(item.get("id") == "legacy-job" for item in jobs.get("items", [])):
    raise SystemExit(f"legacy Postgres job missing after startup migration: {jobs}")
PY

"${PODMAN_BIN}" stop --time 15 "${APP_CONTAINER}" >/dev/null

psql_exec() {
	"${PODMAN_BIN}" exec --env "PGPASSWORD=${POSTGRES_PASSWORD}" "${POSTGRES_CONTAINER}" \
		psql --username s3desk --dbname s3desk --tuples-only --no-align --command "$1"
}

migrations="$(psql_exec "SELECT string_agg(id, ',' ORDER BY id) FROM schema_migrations;")"
if [[ "${migrations}" != "001_core_schema,002_legacy_column_backfills" ]]; then
	echo "Postgres schema migrations=${migrations}, want 001_core_schema,002_legacy_column_backfills" >&2
	exit 1
fi

profile="$(psql_exec "SELECT name || '|' || provider || '|' || config_json || '|' || secrets_json FROM profiles WHERE id = 'legacy-profile';")"
if [[ "${profile}" != "Legacy Postgres profile|s3_compatible|{}|{}" ]]; then
	echo "legacy Postgres profile was not preserved with defaults" >&2
	exit 1
fi

job_count="$(psql_exec "SELECT COUNT(*) FROM jobs WHERE id = 'legacy-job';")"
session="$(psql_exec "SELECT mode || '|' || bytes_tracked FROM upload_sessions WHERE id = 'legacy-upload';")"
if [[ "${job_count}" != "1" || "${session}" != "staging|0" ]]; then
	echo "legacy Postgres records after migration: jobs=${job_count}, session=${session}" >&2
	exit 1
fi

echo "[container-legacy-postgres-migration] passed: legacy records, schema migrations, and bundled rclone survived startup"
