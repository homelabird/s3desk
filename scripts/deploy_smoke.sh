#!/usr/bin/env bash
set -euo pipefail

healthcheck_url="${DEPLOY_HEALTHCHECK_URL:-}"
DEPLOY_BASE_URL="${DEPLOY_BASE_URL:-${healthcheck_url%/healthz}}"
: "${DEPLOY_BASE_URL:?DEPLOY_BASE_URL is required}"
: "${DEPLOY_API_TOKEN:?DEPLOY_API_TOKEN is required}"
: "${DEPLOY_PROFILE_ID:?DEPLOY_PROFILE_ID is required}"
: "${DEPLOY_SMOKE_BUCKET:?DEPLOY_SMOKE_BUCKET is required}"
: "${DEPLOY_SMOKE_OBJECT_KEY:?DEPLOY_SMOKE_OBJECT_KEY is required}"

DEPLOY_EXPECTED_EXTERNAL_BASE_URL="${DEPLOY_EXPECTED_EXTERNAL_BASE_URL:-${DEPLOY_BASE_URL}}"
DEPLOY_SMOKE_RETRIES="${DEPLOY_SMOKE_RETRIES:-30}"
DEPLOY_SMOKE_DELAY_SECONDS="${DEPLOY_SMOKE_DELAY_SECONDS:-2}"
DEPLOY_CURL_INSECURE="${DEPLOY_CURL_INSECURE:-false}"

base_url="${DEPLOY_BASE_URL%/}"
expected_base="${DEPLOY_EXPECTED_EXTERNAL_BASE_URL%/}"

curl_args=(-sS)
if [[ "${DEPLOY_CURL_INSECURE}" == "true" ]]; then
  curl_args+=(-k)
fi

request_status() {
  local method="$1"
  shift
  local body_file http_code
  body_file="$(mktemp)"
  http_code="$(
    curl "${curl_args[@]}" \
      -X "${method}" \
      -o "${body_file}" \
      -w '%{http_code}' \
      "$@"
  )"
  printf '%s\n' "${body_file}:${http_code}"
}

assert_status() {
  local expected="$1"
  local status="$2"
  local body_file="$3"
  local label="$4"
  if [[ "${status}" != "${expected}" ]]; then
    echo "${label} returned HTTP ${status}, expected ${expected}." >&2
    cat "${body_file}" >&2 || true
    rm -f "${body_file}"
    exit 1
  fi
}

wait_for_healthz() {
  local result body_file status
  for _ in $(seq 1 "${DEPLOY_SMOKE_RETRIES}"); do
    result="$(request_status GET "${base_url}/healthz")"
    body_file="${result%%:*}"
    status="${result##*:}"
    if [[ "${status}" == "200" ]]; then
      rm -f "${body_file}"
      return 0
    fi
    rm -f "${body_file}"
    sleep "${DEPLOY_SMOKE_DELAY_SECONDS}"
  done
  echo "healthz did not return 200 within the smoke timeout." >&2
  exit 1
}

wait_for_healthz

result="$(request_status GET -H "X-Api-Token: ${DEPLOY_API_TOKEN}" "${base_url}/api/v1/meta")"
body_file="${result%%:*}"
status="${result##*:}"
assert_status "200" "${status}" "${body_file}" "/api/v1/meta"
rm -f "${body_file}"

result="$(request_status POST -H "X-Api-Token: ${DEPLOY_API_TOKEN}" "${base_url}/api/v1/realtime-ticket?transport=ws")"
body_file="${result%%:*}"
status="${result##*:}"
assert_status "201" "${status}" "${body_file}" "/api/v1/realtime-ticket"
rm -f "${body_file}"

download_response_file="$(mktemp)"
download_status="$(
  curl "${curl_args[@]}" \
    --get \
    -H "X-Api-Token: ${DEPLOY_API_TOKEN}" \
    -H "X-Profile-Id: ${DEPLOY_PROFILE_ID}" \
    --data-urlencode "key=${DEPLOY_SMOKE_OBJECT_KEY}" \
    --data "proxy=true" \
    -o "${download_response_file}" \
    -w '%{http_code}' \
    "${base_url}/api/v1/buckets/${DEPLOY_SMOKE_BUCKET}/objects/download-url"
)"
assert_status "200" "${download_status}" "${download_response_file}" "/objects/download-url"

download_url="$(
  DOWNLOAD_RESPONSE_FILE="${download_response_file}" python3 - <<'PY'
import json
import os

with open(os.environ["DOWNLOAD_RESPONSE_FILE"], "r", encoding="utf-8") as fh:
    payload = json.load(fh)

print(payload.get("url", ""))
PY
)"
rm -f "${download_response_file}"

if [[ -z "${download_url}" ]]; then
  echo "download-url response did not include a signed URL." >&2
  exit 1
fi

if [[ "${download_url}" != "${expected_base}"* ]]; then
  echo "Signed proxy URL is not rooted at the expected external base URL." >&2
  echo "expected prefix: ${expected_base}" >&2
  echo "actual url: ${download_url}" >&2
  exit 1
fi

result="$(request_status HEAD "${download_url}")"
body_file="${result%%:*}"
status="${result##*:}"
assert_status "200" "${status}" "${body_file}" "signed download proxy URL"
rm -f "${body_file}"
