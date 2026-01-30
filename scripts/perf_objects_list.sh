#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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
APPEND_PERF_NOTES=${APPEND_PERF_NOTES:-1}
PERF_NOTES_PATH=${PERF_NOTES_PATH:-$ROOT_DIR/docs/PERF_NOTES.md}

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required" >&2
  exit 1
fi

if ! podman inspect "$S3DESK_CONTAINER" >/dev/null 2>&1; then
  echo "container not found: $S3DESK_CONTAINER" >&2
  exit 1
fi

PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN=python
fi

find_profile_id() {
  if [ -n "$PROFILE_ID" ]; then
    echo "$PROFILE_ID"
    return 0
  fi

  if [ -z "$PYTHON_BIN" ]; then
    echo "PROFILE_ID not set and python not found to auto-select" >&2
    exit 1
  fi

  "$PYTHON_BIN" - <<PY
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

SERVER_VERSION=""
SERVER_ADDR=""
TRANSFER_VERSION=""
TRANSFER_PATH=""
if [ -n "$PYTHON_BIN" ]; then
  meta_raw=$(API_BASE="$API_BASE" API_TOKEN="$API_TOKEN" "$PYTHON_BIN" - <<'PY'
import json, os, urllib.request, sys
base=os.environ.get('API_BASE') or ''
token=os.environ.get('API_TOKEN') or ''
if not base:
  print("\t\t\t")
  sys.exit(0)
req=urllib.request.Request(base + '/api/v1/meta', headers={'X-Api-Token': token})
try:
  with urllib.request.urlopen(req, timeout=10) as resp:
    data=json.loads(resp.read().decode('utf-8'))
except Exception:
  print("\t\t\t")
  sys.exit(0)
te=data.get('transferEngine') or {}
print(data.get('version',''), data.get('serverAddr',''), te.get('version',''), te.get('path',''), sep='\t')
PY
)
  IFS=$'\t' read -r SERVER_VERSION SERVER_ADDR TRANSFER_VERSION TRANSFER_PATH <<<"$meta_raw"
fi

HOST_NAME=""
if command -v hostname >/dev/null 2>&1; then
  HOST_NAME=$(hostname 2>/dev/null || true)
fi

NETWORKS_RAW=$(podman inspect "$S3DESK_CONTAINER" --format '{{ range $name, $_ := .NetworkSettings.Networks }}{{$name}} {{end}}' 2>/dev/null || true)
read -r -a CONTAINER_NETWORKS <<<"$NETWORKS_RAW"

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
for size in $(echo "$SIZES" | sed "s/,/ /g"); do
  dir="/tmp/perfdata/n${size}"
  mkdir -p "$dir"
  width=${#size}
  i=1
  while [ "$i" -le "$size" ]; do
    fname=$(printf "file_%0${width}d.txt" "$i")
    printf "data-%0${width}d" "$i" > "$dir/$fname"
    i=$((i + 1))
  done
  echo "generated $size objects in $dir" >&2
  rclone copy "$dir" remote:${BUCKET}/n${size} --config /tmp/rclone.conf --transfers 16 --checkers 16
  rm -rf "$dir"
done
' 1>&2

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
  MEASURE_AVG="$avg"
  MEASURE_MIN="$min"
  MEASURE_MAX="$max"
}

json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  printf "%s" "$s"
}

IFS="," read -r -a sizes <<< "$SIZES_CSV"
declare -a result_sizes result_avg result_min result_max
for size in "${sizes[@]}"; do
  echo "measuring prefix n${size}/" >&2
  measure_prefix "n${size}/"
  result_sizes+=("$size")
  result_avg+=("$MEASURE_AVG")
  result_min+=("$MEASURE_MIN")
  result_max+=("$MEASURE_MAX")
done

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

json="{"
json+="\"timestamp\":\"$(json_escape "$ts")\","
json+="\"bucket\":\"$(json_escape "$BUCKET")\","
json+="\"api_base\":\"$(json_escape "$API_BASE")\","
json+="\"profile_id\":\"$(json_escape "$PROFILE_ID")\","
json+="\"rclone_endpoint\":\"$(json_escape "$RCLONE_ENDPOINT")\","
json+="\"server_version\":\"$(json_escape "$SERVER_VERSION")\","
json+="\"server_addr\":\"$(json_escape "$SERVER_ADDR")\","
json+="\"transfer_engine_version\":\"$(json_escape "$TRANSFER_VERSION")\","
json+="\"transfer_engine_path\":\"$(json_escape "$TRANSFER_PATH")\","
json+="\"container\":\"$(json_escape "$S3DESK_CONTAINER")\","
json+="\"host\":\"$(json_escape "$HOST_NAME")\","
json+="\"container_networks\":["
for i in "${!CONTAINER_NETWORKS[@]}"; do
  if [ "$i" -gt 0 ]; then json+=","; fi
  json+="\"$(json_escape "${CONTAINER_NETWORKS[$i]}")\""
done
json+="],"
json+="\"requests\":$REQUESTS,"
json+="\"sizes\":["
for i in "${!result_sizes[@]}"; do
  if [ "$i" -gt 0 ]; then json+=","; fi
  json+="${result_sizes[$i]}"
done
json+="],"
json+="\"results\":["
for i in "${!result_sizes[@]}"; do
  if [ "$i" -gt 0 ]; then json+=","; fi
  json+="{\"prefix\":\"n${result_sizes[$i]}/\",\"objects\":${result_sizes[$i]},\"avg_seconds\":${result_avg[$i]},\"min_seconds\":${result_min[$i]},\"max_seconds\":${result_max[$i]}}"
done
json+="]}"
printf "%s\n" "$json"

if [ "$APPEND_PERF_NOTES" = "1" ]; then
  ts_human=$(date -u +"%Y-%m-%d %H:%M UTC")
  {
    echo ""
    echo "## Measurement (${ts_human})"
    echo ""
    echo "Environment:"
    echo "- API base: ${API_BASE}"
    echo "- Profile ID: ${PROFILE_ID}"
    if [ -n "$SERVER_VERSION" ]; then
      echo "- Server version: ${SERVER_VERSION}"
    fi
    if [ -n "$SERVER_ADDR" ]; then
      echo "- Server addr: ${SERVER_ADDR}"
    fi
    if [ -n "$TRANSFER_VERSION" ]; then
      echo "- Transfer engine version: ${TRANSFER_VERSION}"
    fi
    if [ -n "$TRANSFER_PATH" ]; then
      echo "- Transfer engine path: ${TRANSFER_PATH}"
    fi
    if [ -n "$S3DESK_CONTAINER" ]; then
      echo "- Container: ${S3DESK_CONTAINER}"
    fi
    if [ "${#CONTAINER_NETWORKS[@]}" -gt 0 ]; then
      echo "- Container networks: ${CONTAINER_NETWORKS[*]}"
    fi
    if [ -n "$HOST_NAME" ]; then
      echo "- Host: ${HOST_NAME}"
    fi
    echo "- Endpoint: ${RCLONE_ENDPOINT}"
    echo "- Requests per prefix: ${REQUESTS}"
    echo "- Bucket: ${BUCKET}"
    echo ""
    echo "| Objects | Avg (s) | Min (s) | Max (s) |"
    echo "| ---: | ---: | ---: | ---: |"
    for i in "${!result_sizes[@]}"; do
      echo "| ${result_sizes[$i]} | ${result_avg[$i]} | ${result_min[$i]} | ${result_max[$i]} |"
    done
  } >> "$PERF_NOTES_PATH"
fi

if [ "$KEEP_BUCKET" = "1" ]; then
  echo "keeping bucket: $BUCKET" >&2
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
' 1>&2
