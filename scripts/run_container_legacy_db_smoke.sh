#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-}"
PODMAN_BIN="${PODMAN_BIN:-podman}"
PORT="${S3DESK_MIGRATION_SMOKE_PORT:-18082}"
CONTAINER_NAME="${S3DESK_MIGRATION_SMOKE_CONTAINER:-s3desk-legacy-migration-${CI_JOB_ID:-$$}}"
API_TOKEN="${S3DESK_MIGRATION_SMOKE_API_TOKEN:-s3desk-migration-smoke-token-0123456789abcdef012345}"
ENCRYPTION_KEY="${S3DESK_MIGRATION_SMOKE_ENCRYPTION_KEY:-QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=}"
EXPECTED_VERSION="${S3DESK_EXPECTED_VERSION:-}"

if [[ -z "${IMAGE}" ]]; then
	echo "usage: ${0##*/} <s3desk-image>" >&2
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
	echo "python3 is required to create and verify the legacy SQLite fixture" >&2
	exit 1
fi

data_dir="$(mktemp -d)"
db_path="${data_dir}/s3desk.db"
meta_path="${data_dir}/meta.json"
profiles_path="${data_dir}/profiles.json"
jobs_path="${data_dir}/jobs.json"

cleanup() {
	"${PODMAN_BIN}" rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
	if ! rm -rf "${data_dir}" 2>/dev/null && [[ "${PODMAN_BIN}" == "podman" ]]; then
		"${PODMAN_BIN}" unshare rm -rf "${data_dir}" >/dev/null 2>&1 || true
	fi
}
trap cleanup EXIT

python3 - "${db_path}" <<'PY'
import sqlite3
import sys

db_path = sys.argv[1]
connection = sqlite3.connect(db_path)
connection.executescript(
    """
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
    """
)
connection.execute(
    """
    INSERT INTO profiles (
        id, name, endpoint, region, force_path_style, tls_insecure_skip_verify,
        access_key_id, secret_access_key, session_token, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    (
        "legacy-profile",
        "Legacy container profile",
        "https://1.1.1.1",
        "us-east-1",
        1,
        0,
        "legacy-access",
        "legacy-secret",
        None,
        "2026-01-01T00:00:00Z",
        "2026-01-01T00:00:00Z",
    ),
)
connection.execute(
    """
    INSERT INTO jobs (
        id, profile_id, type, status, payload_json, progress_json, error,
        created_at, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    (
        "legacy-job",
        "legacy-profile",
        "s3_index_objects",
        "completed",
        "{}",
        None,
        None,
        "2026-01-01T00:00:00Z",
        None,
        "2026-01-01T00:01:00Z",
    ),
)
connection.execute(
    """
    INSERT INTO upload_sessions (
        id, profile_id, bucket, prefix, staging_dir, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """,
    (
        "legacy-upload",
        "legacy-profile",
        "legacy-bucket",
        "incoming/",
        "/data/staging/legacy-upload",
        "2099-01-01T00:00:00Z",
        "2026-01-01T00:00:00Z",
    ),
)
connection.commit()
connection.close()
PY

chmod 0777 "${data_dir}"
chmod 0666 "${db_path}"

echo "[container-legacy-migration] starting ${IMAGE} with a legacy DATA_DIR"
"${PODMAN_BIN}" run --rm -d \
	--name "${CONTAINER_NAME}" \
	-p "${PORT}:8080" \
	-e ADDR=0.0.0.0:8080 \
	-e ALLOW_REMOTE=true \
	-e ALLOWED_HOSTS=127.0.0.1,localhost \
	-e ALLOWED_LOCAL_DIRS=/data \
	-e API_TOKEN="${API_TOKEN}" \
	-e ENCRYPTION_KEY="${ENCRYPTION_KEY}" \
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
	"${PODMAN_BIN}" logs "${CONTAINER_NAME}" >&2 || true
	echo "container did not become ready" >&2
	exit 1
fi

curl -fsS -H "X-Api-Token: ${API_TOKEN}" "http://127.0.0.1:${PORT}/api/v1/meta" >"${meta_path}"
curl -fsS -H "X-Api-Token: ${API_TOKEN}" "http://127.0.0.1:${PORT}/api/v1/profiles" >"${profiles_path}"
jobs_status="$(curl -sS -o "${jobs_path}" -w '%{http_code}' -H "X-Api-Token: ${API_TOKEN}" -H "X-Profile-Id: legacy-profile" "http://127.0.0.1:${PORT}/api/v1/jobs")"
if [[ "${jobs_status}" != "200" ]]; then
	echo "jobs endpoint returned HTTP ${jobs_status}: $(<"${jobs_path}")" >&2
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
    raise SystemExit(f"container rclone is not compatible: {engine}")
if expected_version and meta.get("version") != expected_version:
    raise SystemExit(f"container version={meta.get('version')!r}, want {expected_version!r}")
if not any(item.get("id") == "legacy-profile" and item.get("name") == "Legacy container profile" for item in profiles):
    raise SystemExit(f"legacy profile missing after startup migration: {profiles}")
if not any(item.get("id") == "legacy-job" for item in jobs.get("items", [])):
    raise SystemExit(f"legacy job missing after startup migration: {jobs}")
PY

"${PODMAN_BIN}" stop --time 15 "${CONTAINER_NAME}" >/dev/null

python3 - "${db_path}" <<'PY'
import sqlite3
import sys

connection = sqlite3.connect(sys.argv[1])
migrations = [row[0] for row in connection.execute("SELECT id FROM schema_migrations ORDER BY id")]
expected = ["001_core_schema", "002_legacy_column_backfills"]
if migrations != expected:
    raise SystemExit(f"schema migrations={migrations}, want {expected}")

profile = connection.execute(
    "SELECT name, provider, config_json, secrets_json FROM profiles WHERE id = 'legacy-profile'"
).fetchone()
if profile is None or profile[0] != "Legacy container profile" or profile[1:] != ("s3_compatible", "{}", "{}"):
    raise SystemExit(f"legacy profile after container migration={profile!r}")

job_count = connection.execute("SELECT COUNT(*) FROM jobs WHERE id = 'legacy-job'").fetchone()[0]
session = connection.execute(
    "SELECT mode, bytes_tracked FROM upload_sessions WHERE id = 'legacy-upload'"
).fetchone()
if job_count != 1 or session != ("staging", 0):
    raise SystemExit(f"legacy records after container migration: jobs={job_count}, session={session!r}")
connection.close()
PY

echo "[container-legacy-migration] passed: legacy records, schema migrations, and bundled rclone survived startup"
