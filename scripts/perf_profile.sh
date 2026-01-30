#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8080}"
API_TOKEN="${API_TOKEN:-}"
PROFILE_ID="${PROFILE_ID:-}"
BUCKET="${BUCKET:-}"
PREFIX="${PREFIX:-}"
RUNS="${RUNS:-5}"
MAX_KEYS="${MAX_KEYS:-200}"
OUT_JSON="${OUT_JSON:-}"

if [ -z "${PROFILE_ID}" ]; then
  echo "PROFILE_ID is required" >&2
  exit 1
fi

headers=()
if [ -n "${API_TOKEN}" ]; then
  headers+=(-H "X-Api-Token: ${API_TOKEN}")
fi

tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "${tmp_dir}"; }
trap cleanup EXIT

if [ -z "${BUCKET}" ]; then
  buckets_json="$(curl -sS "${headers[@]}" -H "X-Profile-Id: ${PROFILE_ID}" "${API_BASE}/api/v1/buckets")"
  BUCKET="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
name=""
if isinstance(data, list) and data:
    name=str(data[0].get("name",""))
print(name)
PY
  <<<"${buckets_json}")"
  if [ -z "${BUCKET}" ]; then
    echo "BUCKET not provided and no buckets found" >&2
    exit 1
  fi
fi

PREFIX_ENC="$(python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ.get("PREFIX",""), safe=""))
PY
)"

measure() {
  local name="$1"
  local url="$2"
  local with_profile="$3"
  local out="${tmp_dir}/${name}.txt"
  : > "${out}"
  local i
  for i in $(seq 1 "${RUNS}"); do
    if [ "${with_profile}" = "1" ]; then
      curl -sS -o /dev/null -w "%{time_total}\n" "${headers[@]}" -H "X-Profile-Id: ${PROFILE_ID}" "$url" >> "${out}"
    else
      curl -sS -o /dev/null -w "%{time_total}\n" "${headers[@]}" "$url" >> "${out}"
    fi
  done
}

measure "meta" "${API_BASE}/api/v1/meta" "0"
measure "buckets" "${API_BASE}/api/v1/buckets" "1"
measure "objects" "${API_BASE}/api/v1/buckets/${BUCKET}/objects?prefix=${PREFIX_ENC}&maxKeys=${MAX_KEYS}" "1"
measure "index_summary" "${API_BASE}/api/v1/buckets/${BUCKET}/objects/index-summary?prefix=${PREFIX_ENC}" "1"
measure "jobs" "${API_BASE}/api/v1/jobs?limit=50" "1"

TMP_DIR="${tmp_dir}" API_BASE="${API_BASE}" PROFILE_ID="${PROFILE_ID}" BUCKET="${BUCKET}" PREFIX="${PREFIX}" RUNS="${RUNS}" MAX_KEYS="${MAX_KEYS}" OUT_JSON="${OUT_JSON}" python3 - <<'PY'
import json
import os
from statistics import mean

tmp_dir = os.environ["TMP_DIR"]
api_base = os.environ["API_BASE"]
profile_id = os.environ["PROFILE_ID"]
bucket = os.environ["BUCKET"]
prefix = os.environ.get("PREFIX","")
runs = int(os.environ.get("RUNS","5"))
max_keys = int(os.environ.get("MAX_KEYS","200"))

def read_times(name):
    path = os.path.join(tmp_dir, f"{name}.txt")
    with open(path, "r") as f:
        vals = [float(line.strip()) for line in f if line.strip()]
    vals_ms = [v * 1000.0 for v in vals]
    vals_ms.sort()
    def pct(p):
        if not vals_ms:
            return 0.0
        k = int(round((p / 100.0) * (len(vals_ms) - 1)))
        return vals_ms[k]
    return {
        "count": len(vals_ms),
        "min_ms": vals_ms[0] if vals_ms else 0.0,
        "max_ms": vals_ms[-1] if vals_ms else 0.0,
        "avg_ms": mean(vals_ms) if vals_ms else 0.0,
        "p50_ms": pct(50),
        "p95_ms": pct(95),
        "p99_ms": pct(99),
        "samples_ms": vals_ms,
    }

result = {
    "meta": {
        "api_base": api_base,
        "profile_id": profile_id,
        "bucket": bucket,
        "prefix": prefix,
        "runs": runs,
        "max_keys": max_keys,
    },
    "results": {
        "meta": read_times("meta"),
        "buckets": read_times("buckets"),
        "objects": read_times("objects"),
        "index_summary": read_times("index_summary"),
        "jobs": read_times("jobs"),
    },
}
print(json.dumps(result, indent=2, sort_keys=True))
out = os.environ.get("OUT_JSON", "")
if out:
    with open(out, "w") as f:
        json.dump(result, f, indent=2, sort_keys=True)
PY
