#!/usr/bin/env bash
set -euo pipefail

API_BASE=${API_BASE:-"https://upload.s3desk.k8s.homelabird.com/api/v1"}
PROFILE_ID=${PROFILE_ID:-""}
BUCKET=${BUCKET:-""}
PREFIX=${PREFIX:-"tuning"}
API_TOKEN=${API_TOKEN:-""}
FILE_PATH=${FILE_PATH:-""}
OUT_CSV=${OUT_CSV:-"/tmp/ingress_tune_results.csv"}

if [[ -z "$PROFILE_ID" || -z "$BUCKET" || -z "$API_TOKEN" || -z "$FILE_PATH" ]]; then
  echo "Missing required env: PROFILE_ID, BUCKET, API_TOKEN, FILE_PATH" >&2
  exit 1
fi

if [[ ! -f "$FILE_PATH" ]]; then
  echo "FILE_PATH not found: $FILE_PATH" >&2
  exit 1
fi

function apply_envoy_tuning() {
  local buffer_bytes=$1
  local stream_window=$2
  local conn_window=$3

  kubectl -n istio-system get envoyfilter s3desk-upload-gw-tuning -o json | \
    python -c 'import json,sys
buffer_bytes=int(sys.argv[1])
stream_window=int(sys.argv[2])
conn_window=int(sys.argv[3])
data=json.load(sys.stdin)
patches=data.get("spec", {}).get("configPatches", [])
for patch in patches:
    if patch.get("applyTo")=="LISTENER":
        patch.setdefault("patch", {}).setdefault("value", {})["per_connection_buffer_limit_bytes"]=buffer_bytes
    if patch.get("applyTo")=="NETWORK_FILTER":
        cfg=patch.setdefault("patch", {}).setdefault("value", {}).setdefault("typed_config", {})
        h2=cfg.setdefault("http2_protocol_options", {})
        h2["initial_stream_window_size"]=stream_window
        h2["initial_connection_window_size"]=conn_window
print(json.dumps(data))' "$buffer_bytes" "$stream_window" "$conn_window" | \
    kubectl apply -f -
}

function apply_concurrency() {
  local concurrency=$1
  if [[ -z "$concurrency" ]]; then
    kubectl -n istio-system patch deployment istio-ingressgateway-s3desk \
      --type merge -p '{"spec":{"template":{"metadata":{"annotations":{"proxy.istio.io/config":null}}}}}'
  else
    kubectl -n istio-system patch deployment istio-ingressgateway-s3desk \
      --type merge -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"proxy.istio.io/config\":\"{\\\"concurrency\\\":$concurrency}\"}}}}}"
  fi
  kubectl -n istio-system rollout status deployment/istio-ingressgateway-s3desk --timeout=60s
}

function create_upload() {
  curl -sS -k -X POST "$API_BASE/uploads" \
    -H 'content-type: application/json' \
    -H "X-Api-Token: $API_TOKEN" \
    -H "X-Profile-Id: $PROFILE_ID" \
    -d "{\"bucket\":\"$BUCKET\",\"prefix\":\"$PREFIX\"}" | \
    python -c 'import json,sys; print(json.load(sys.stdin)["uploadId"])'
}

function upload_file() {
  local upload_id=$1
  curl -sS -k -o /dev/null -w '%{speed_upload}' \
    -H "X-Api-Token: $API_TOKEN" \
    -H "X-Profile-Id: $PROFILE_ID" \
    -F "files=@${FILE_PATH}" \
    "$API_BASE/uploads/${upload_id}/files"
}

function delete_upload() {
  local upload_id=$1
  curl -sS -k -X DELETE \
    -H "X-Api-Token: $API_TOKEN" \
    -H "X-Profile-Id: $PROFILE_ID" \
    "$API_BASE/uploads/${upload_id}"
}

echo "name,buffer_bytes,stream_window,conn_window,concurrency,speed_bps,speed_mbps" | tee "$OUT_CSV"

configs=(
  "auto-64-16-256 67108864 16777216 268435456"
  "auto-128-32-512 134217728 33554432 536870912"
  "conc4-128-32-512 134217728 33554432 536870912 4"
)

for entry in "${configs[@]}"; do
  name=$(echo "$entry" | awk '{print $1}')
  buffer=$(echo "$entry" | awk '{print $2}')
  stream=$(echo "$entry" | awk '{print $3}')
  conn=$(echo "$entry" | awk '{print $4}')
  conc=$(echo "$entry" | awk '{print $5}')

  echo "==> Applying $name (buffer=$buffer stream=$stream conn=$conn concurrency=${conc:-auto})" >&2
  apply_envoy_tuning "$buffer" "$stream" "$conn"
  apply_concurrency "${conc:-}"
  sleep 5

  upload_id=$(create_upload)
  speed_bps=$(upload_file "$upload_id")
  delete_upload "$upload_id" >/dev/null || true

  speed_mbps=$(python - <<PY
bps=float($speed_bps)
print(round(bps/1024/1024, 2))
PY
)

  echo "$name,$buffer,$stream,$conn,${conc:-auto},$speed_bps,$speed_mbps" | tee -a "$OUT_CSV"
  echo "==> $name speed: ${speed_mbps} MiB/s" >&2
  sleep 3

done

echo "Results written to $OUT_CSV" >&2
