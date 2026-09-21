#!/bin/sh
# Seed through the same S3 API used by S3Desk; no vendor-specific client dependency.
set -eu

SEAWEEDFS_INTERNAL_ENDPOINT="${SEAWEEDFS_INTERNAL_ENDPOINT:-http://seaweedfs:8333}"
DEMO_BUCKET="${DEMO_BUCKET:-demo-bucket}"
DEMO_SEED_ATTEMPTS="${DEMO_SEED_ATTEMPTS:-30}"

# Restrict to ordinary DNS-style demo bucket names (also keeps generated JSON safe).
case "$DEMO_BUCKET" in
  *[!a-z0-9-]*|-*|*-|"")
    echo "[seaweedfs-seed] DEMO_BUCKET must contain lowercase letters, digits or interior hyphens" >&2
    exit 1 ;;
esac
if [ "${#DEMO_BUCKET}" -lt 3 ] || [ "${#DEMO_BUCKET}" -gt 63 ]; then
  echo "[seaweedfs-seed] DEMO_BUCKET must be 3-63 characters" >&2
  exit 1
fi
case "$DEMO_SEED_ATTEMPTS" in
  *[!0-9]*|"") echo "[seaweedfs-seed] DEMO_SEED_ATTEMPTS must be a positive integer" >&2; exit 1 ;;
esac
if [ "$DEMO_SEED_ATTEMPTS" -lt 1 ] || [ "$DEMO_SEED_ATTEMPTS" -gt 120 ]; then
  echo "[seaweedfs-seed] DEMO_SEED_ATTEMPTS must be between 1 and 120" >&2
  exit 1
fi

# No plaintext credential file, credentials on argv, or environment dump.
export RCLONE_CONFIG=/dev/null
export RCLONE_CONFIG_DEMO_TYPE=s3
# Match S3Desk's generic s3_compatible backend rather than relying on a custom API.
export RCLONE_CONFIG_DEMO_PROVIDER=Other
export RCLONE_CONFIG_DEMO_ENV_AUTH=false
export RCLONE_CONFIG_DEMO_ENDPOINT="$SEAWEEDFS_INTERNAL_ENDPOINT"
export RCLONE_CONFIG_DEMO_REGION="${SEAWEEDFS_REGION:-us-east-1}"
export RCLONE_CONFIG_DEMO_ACCESS_KEY_ID="${SEAWEEDFS_ACCESS_KEY:-demo-seaweedfs}"
export RCLONE_CONFIG_DEMO_SECRET_ACCESS_KEY="${SEAWEEDFS_SECRET_KEY:-demo-seaweedfs-secret}"
export RCLONE_CONFIG_DEMO_FORCE_PATH_STYLE=true

run_rclone() {
  rclone --contimeout 3s --timeout 10s --max-duration 15s \
    --retries 1 --low-level-retries 1 "$@"
}

retry_rclone() {
  operation="$1"
  shift
  attempt=1
  while ! run_rclone "$@" >/dev/null 2>&1; do
    if [ "$attempt" -ge "$DEMO_SEED_ATTEMPTS" ]; then
      # Avoid echoing signed URLs or provider credentials in diagnostics.
      echo "[seaweedfs-seed] $operation failed after $attempt attempts; check storage health and credentials" >&2
      return 1
    fi
    echo "[seaweedfs-seed] waiting for $operation ($attempt/$DEMO_SEED_ATTEMPTS)" >&2
    attempt=$((attempt + 1))
    sleep 2
  done
}

# A listening HTTP port (or an unsigned 403) is not a signed S3 readiness check.
retry_rclone "authenticated S3 access" lsd demo:
retry_rclone "demo bucket creation" mkdir "demo:$DEMO_BUCKET"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
trap 'exit 1' HUP INT TERM
mkdir -p "$tmp_dir/notes"

cat >"$tmp_dir/welcome.txt" <<EOF
S3Desk SeaweedFS demo bucket

- This bucket was created automatically by the demo Compose stack.
- Select the seeded SeaweedFS profile in S3Desk.
- Storage: SeaweedFS, accessed through its S3-compatible API.
EOF
cat >"$tmp_dir/about.json" <<EOF
{
  "name": "s3desk demo",
  "bucket": "$DEMO_BUCKET",
  "seededBy": "compose-demo-stack",
  "storage": "seaweedfs"
}
EOF
cat >"$tmp_dir/notes/readme.md" <<'EOF'
# Demo objects

This stack preloads a SeaweedFS profile and a demo bucket. Existing sample
objects are not overwritten when the seed is run again. Uploaded objects,
buckets, and S3Desk application data survive a normal Compose down/up.
EOF

# Unlike sync, copy never deletes unrelated objects. --ignore-existing preserves
# edits to sample objects across repeated runs (missing samples are restored).
retry_rclone "sample object upload" copy "$tmp_dir" "demo:$DEMO_BUCKET" --ignore-existing
printf '[seaweedfs-seed] ready: bucket=%s, storage=seaweedfs\n' "$DEMO_BUCKET"
