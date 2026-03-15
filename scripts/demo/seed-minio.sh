#!/bin/sh
set -eu

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
MINIO_PUBLIC_ENDPOINT="${MINIO_PUBLIC_ENDPOINT:-http://127.0.0.1:9000}"
DEMO_BUCKET="${DEMO_BUCKET:-demo-bucket}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"

until mc alias set demo "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1; do
  sleep 1
done

mc mb --ignore-existing "demo/${DEMO_BUCKET}" >/dev/null

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

cat >"${tmp_dir}/welcome.txt" <<EOF
s3desk demo bucket

- This bucket was created automatically by the demo compose stack
- The MinIO profile is already registered in s3desk
- Endpoint inside the stack: ${MINIO_ENDPOINT}
- Public endpoint for the browser: ${MINIO_PUBLIC_ENDPOINT}
EOF

cat >"${tmp_dir}/about.json" <<EOF
{
  "name": "s3desk demo",
  "bucket": "${DEMO_BUCKET}",
  "seededBy": "compose-demo-stack",
  "storage": "minio"
}
EOF

mkdir -p "${tmp_dir}/notes"
cat >"${tmp_dir}/notes/readme.md" <<EOF
# Demo objects

This stack preloads a MinIO profile and a demo bucket so the first login shows a working object storage target.
EOF

mc cp "${tmp_dir}/welcome.txt" "demo/${DEMO_BUCKET}/welcome.txt" >/dev/null
mc cp "${tmp_dir}/about.json" "demo/${DEMO_BUCKET}/about.json" >/dev/null
mc cp "${tmp_dir}/notes/readme.md" "demo/${DEMO_BUCKET}/notes/readme.md" >/dev/null
