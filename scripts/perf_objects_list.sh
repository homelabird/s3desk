#!/usr/bin/env bash
set -euo pipefail

S3DESK_CONTAINER=${S3DESK_CONTAINER:-s3desk_local}
API_BASE=${API_BASE:-http://127.0.0.1:8080}
API_TOKEN=${API_TOKEN:-change-me}
PROFILE_ID=${PROFILE_ID:-}
RCLONE_ENDPOINT=${RCLONE_ENDPOINT:-http://minio:9000}
RCLONE_ACCESS_KEY=${RCLONE_ACCESS_KEY:-minioadmin}
RCLONE_SECRET_KEY=${RCLONE_SECRET_KEY:-minioadmin}
RCLONE_REGION=${RCLONE_REGION:-us-east-1}
PREFIX_SIZES=${PREFIX_SIZES:-10000,50000}
REQUESTS=${REQUESTS:-5}
KEEP_BUCKET=${KEEP_BUCKET:-0}

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required" >&2
  exit 1
fi

if ! podman inspect "$S3DESK_CONTAINER" >/dev/null 2>&1; then
  echo "container not found: $S3DESK_CONTAINER" >&2
  exit 1
fi

find_profile_id() {
  if [ -n "$PROFILE_ID" ]; then
    echo "$PROFILE_ID"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    PY=python3
  elif command -v python >/dev/null 2>&1; then
    PY=python
  else
    echo "PROFILE_ID not set and python not found to auto-select" >&2
    exit 1
  fi

  "$PY" - <<PY
import json, os, sys, urllib.request
base=os.environ.get('API_BASE')
token=os.environ.get('API_TOKEN')
endpoint=os.environ.get('RCLONE_ENDPOINT')
req=urllib.request.Request(base + '/api/v1/profiles', headers={'X-Api-Token': token})
with urllib.request.urlopen(req, timeout=10) as resp:
  data=json.loads(resp.read().decode('utf-8'))
for p in data:
  if p.get('endpoint') == endpoint:
    print(p.get('id'))
    sys.exit(0)
print('')
PY
}

PROFILE_ID=$(API_BASE="$API_BASE" API_TOKEN="$API_TOKEN" RCLONE_ENDPOINT="$RCLONE_ENDPOINT" find_profile_id)
if [ -z "$PROFILE_ID" ]; then
  echo "PROFILE_ID not found for endpoint=$RCLONE_ENDPOINT; set PROFILE_ID explicitly" >&2
  exit 1
fi

BUCKET="perf-objects-$(date +%s)"
SIZES_CSV="$PREFIX_SIZES"

podman exec -e BUCKET="$BUCKET" -e SIZES="$SIZES_CSV" \
  -e RCLONE_ENDPOINT="$RCLONE_ENDPOINT" -e RCLONE_ACCESS_KEY="$RCLONE_ACCESS_KEY" \
  -e RCLONE_SECRET_KEY="$RCLONE_SECRET_KEY" -e RCLONE_REGION="$RCLONE_REGION" \
  "$S3DESK_CONTAINER" sh -c '
set -e
cat > /tmp/rclone.conf <<CONF
[remote]
type = s3
provider = Other
endpoint = $RCLONE_ENDPOINT
region = $RCLONE_REGION
access_key_id = $RCLONE_ACCESS_KEY
secret_access_key = $RCLONE_SECRET_KEY
force_path_style = true
CONF
rclone mkdir remote:${BUCKET} --config /tmp/rclone.conf

rm -rf /tmp/perfdata
mkdir -p /tmp/perfdata
IFS="," read -r -a sizes <<< "$SIZES"
for size in "${sizes[@]}"; do
  dir="/tmp/perfdata/n${size}"
  mkdir -p "$dir"
  width=${#size}
  i=1
  while [ "$i" -le "$size" ]; do
    fname=$(printf "file_%0${width}d.txt" "$i")
    printf "data-%0${width}d" "$i" > "$dir/$fname"
    i=$((i + 1))
  done
  echo "generated $size objects in $dir"
  rclone copy "$dir" remote:${BUCKET}/n${size} --config /tmp/rclone.conf --transfers 16 --checkers 16
  rm -rf "$dir"
done
'

measure_prefix() {
  local prefix="$1"
  local tmpfile
  tmpfile=$(mktemp)
  local i
  for i in $(seq 1 "$REQUESTS"); do
    local out
    out=$(curl -s --max-time 30 -o /dev/null -w "%{http_code} %{time_total}" \
      -H "X-Api-Token: $API_TOKEN" -H "X-Profile-Id: $PROFILE_ID" \
      "$API_BASE/api/v1/buckets/${BUCKET}/objects?prefix=${prefix}&delimiter=/")
    local code
    local t
    code=$(echo "$out" | awk '{print $1}')
    t=$(echo "$out" | awk '{print $2}')
    if [ "$code" != "200" ]; then
      echo "request failed: prefix=$prefix status=$code" >&2
      rm -f "$tmpfile"
      exit 1
    fi
    echo "$t" >> "$tmpfile"
  done
  local avg min max
  avg=$(awk '{s+=$1} END {printf "%.3f", s/NR}' "$tmpfile")
  min=$(awk 'NR==1{m=$1} $1<m{m=$1} END{printf "%.3f", m}' "$tmpfile")
  max=$(awk 'NR==1{m=$1} $1>m{m=$1} END{printf "%.3f", m}' "$tmpfile")
  rm -f "$tmpfile"
  echo "prefix=${prefix} avg=${avg}s min=${min}s max=${max}s"
}

IFS="," read -r -a sizes <<< "$SIZES_CSV"
for size in "${sizes[@]}"; do
  measure_prefix "n${size}/"
done

if [ "$KEEP_BUCKET" = "1" ]; then
  echo "keeping bucket: $BUCKET"
  exit 0
fi

podman exec -e BUCKET="$BUCKET" -e RCLONE_ENDPOINT="$RCLONE_ENDPOINT" \
  -e RCLONE_ACCESS_KEY="$RCLONE_ACCESS_KEY" -e RCLONE_SECRET_KEY="$RCLONE_SECRET_KEY" \
  -e RCLONE_REGION="$RCLONE_REGION" "$S3DESK_CONTAINER" sh -c '
cat > /tmp/rclone.conf <<CONF
[remote]
type = s3
provider = Other
endpoint = $RCLONE_ENDPOINT
region = $RCLONE_REGION
access_key_id = $RCLONE_ACCESS_KEY
secret_access_key = $RCLONE_SECRET_KEY
force_path_style = true
CONF
rclone purge remote:${BUCKET} --config /tmp/rclone.conf
'

