#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

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
DEPLOY_SMOKE_EVIDENCE_FILE="${DEPLOY_SMOKE_EVIDENCE_FILE:-}"
DEPLOY_RELEASE_CANDIDATE="${DEPLOY_RELEASE_CANDIDATE:-}"

base_url="${DEPLOY_BASE_URL%/}"
expected_base="${DEPLOY_EXPECTED_EXTERNAL_BASE_URL%/}"
healthz_status=""
meta_status=""
realtime_ticket_status=""
download_url_status=""
download_proxy_head_status=""
download_url=""

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

normalize_url_root() {
  URL_TO_PARSE="$1" python3 - <<'PY'
from urllib.parse import urlsplit, urlunsplit
import os

parts = urlsplit(os.environ["URL_TO_PARSE"])
path = parts.path.rstrip("/")
print(urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, "", "")).rstrip("/"))
PY
}

download_proxy_url_root() {
  URL_TO_PARSE="$1" python3 - <<'PY'
from urllib.parse import urlsplit, urlunsplit
import os

parts = urlsplit(os.environ["URL_TO_PARSE"])
path = parts.path.rstrip("/")
marker = "/download-proxy"
if path == marker:
    root_path = ""
elif path.endswith(marker):
    root_path = path[:-len(marker)].rstrip("/")
else:
    root_path = path.rsplit("/", 1)[0].rstrip("/") if "/" in path else ""
print(urlunsplit((parts.scheme.lower(), parts.netloc.lower(), root_path, "", "")).rstrip("/"))
PY
}

redact_url_query() {
  URL_TO_PARSE="$1" python3 - <<'PY'
from urllib.parse import urlsplit, urlunsplit
import os

parts = urlsplit(os.environ["URL_TO_PARSE"])
query = "<redacted>" if parts.query else ""
print(urlunsplit((parts.scheme, parts.netloc, parts.path, query, "")))
PY
}

wait_for_healthz() {
  local result body_file status
  for _ in $(seq 1 "${DEPLOY_SMOKE_RETRIES}"); do
    result="$(request_status GET "${base_url}/healthz")"
    body_file="${result%%:*}"
    status="${result##*:}"
    if [[ "${status}" == "200" ]]; then
      healthz_status="${status}"
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
meta_status="${status}"
rm -f "${body_file}"

result="$(request_status POST -H "X-Api-Token: ${DEPLOY_API_TOKEN}" -H "Origin: ${base_url}" "${base_url}/api/v1/realtime-ticket?transport=ws")"
body_file="${result%%:*}"
status="${result##*:}"
assert_status "201" "${status}" "${body_file}" "/api/v1/realtime-ticket"
realtime_ticket_status="${status}"
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
download_url_status="${download_status}"

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

expected_root="$(normalize_url_root "${expected_base}")"
download_url_root="$(download_proxy_url_root "${download_url}")"

if [[ "${download_url_root}" != "${expected_root}" ]]; then
  echo "Signed proxy URL is not rooted at the expected external base URL." >&2
  echo "expected root: ${expected_root}" >&2
  echo "actual root: ${download_url_root}" >&2
  echo "actual url: $(redact_url_query "${download_url}")" >&2
  exit 1
fi

result="$(request_status HEAD "${download_url}")"
body_file="${result%%:*}"
status="${result##*:}"
assert_status "200" "${status}" "${body_file}" "signed download proxy URL"
download_proxy_head_status="${status}"
rm -f "${body_file}"

if [[ -n "${DEPLOY_SMOKE_EVIDENCE_FILE}" ]]; then
  mkdir -p "$(dirname "${DEPLOY_SMOKE_EVIDENCE_FILE}")"
  commit_sha="$(git -C "${ROOT}" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
  release_candidate="${DEPLOY_RELEASE_CANDIDATE:-${commit_sha}}"
  generated_at="$(date -u '+%Y-%m-%d %H:%M:%SZ')"
  {
    echo "# Reverse Proxy Smoke Evidence"
    echo
    echo "- Generated at: \`${generated_at}\`"
    echo "- Commit SHA: \`${commit_sha}\`"
    echo "- S3Desk commit SHA or release tag: \`${release_candidate}\`"
    echo "- Base URL: \`${base_url}\`"
    echo "- Expected external base URL: \`${expected_base}\`"
    echo "- Profile identifier: \`${DEPLOY_PROFILE_ID}\`"
    echo "- Bucket: \`${DEPLOY_SMOKE_BUCKET}\`"
    echo "- Object key: \`${DEPLOY_SMOKE_OBJECT_KEY}\`"
    echo
    echo "## Checks"
    echo
    echo "- GET \`/healthz\`: HTTP \`${healthz_status}\`"
    echo "- Authenticated GET \`/api/v1/meta\`: HTTP \`${meta_status}\`"
    echo "- POST \`/api/v1/realtime-ticket?transport=ws\`: HTTP \`${realtime_ticket_status}\`"
    echo "- GET \`/api/v1/buckets/{bucket}/objects/download-url?proxy=true\`: HTTP \`${download_url_status}\`"
    echo "- Signed proxy URL root: \`${download_url_root}\`"
    echo "- HEAD signed proxy URL: HTTP \`${download_proxy_head_status}\`"
    echo
    echo "## Expected Statuses"
    echo
    echo "- GET \`/healthz\`: \`200\`"
    echo "- Authenticated GET \`/api/v1/meta\`: \`200\`"
    echo "- POST \`/api/v1/realtime-ticket?transport=ws\`: \`201\`"
    echo "- GET \`/api/v1/buckets/{bucket}/objects/download-url?proxy=true\`: \`200\`"
    echo "- Signed proxy URL root matches expected external base URL: URL-root match, no HTTP status"
    echo "- HEAD signed proxy URL: \`200\`"
    echo
    echo "## Result"
    echo
    echo "- Reverse-proxy smoke: pass"
  } >"${DEPLOY_SMOKE_EVIDENCE_FILE}"
  echo "[deploy-smoke] wrote evidence: ${DEPLOY_SMOKE_EVIDENCE_FILE}"
fi
