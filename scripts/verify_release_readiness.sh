#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-${CI_COMMIT_TAG:-}}"

if [[ -z "${TAG}" ]]; then
  echo "usage: ${0##*/} <release-tag>" >&2
  exit 1
fi

REPO="${GITHUB_REPOSITORY:-homelabird/s3desk}"
API_URL="${GITHUB_API_URL:-https://api.github.com}"
REQUIRED_CHECKS="${DEPLOY_REQUIRED_CHECKS:-release-gate,Core Mock E2E,Mobile Responsive E2E (Required),license-audit}"
READINESS_HEAD="${DEPLOY_RELEASE_HEAD:-${TAG}}"
READINESS_BASE="${DEPLOY_RELEASE_BASE:-}"

if [[ -z "${READINESS_BASE}" ]]; then
  READINESS_BASE="$(git -C "${ROOT}" describe --tags --abbrev=0 "${TAG}^{commit}^" 2>/dev/null || true)"
fi
if [[ -z "${READINESS_BASE}" ]]; then
  echo "DEPLOY_RELEASE_BASE is required when the previous tag cannot be derived for '${TAG}'." >&2
  exit 1
fi

readiness_output="$(
  python3 "${ROOT}/scripts/check_release_readiness.py" \
    --candidate-id "${TAG}" \
    --base "${READINESS_BASE}" \
    --head "${READINESS_HEAD}" \
    --skip-release-gate 2>&1
)" || {
  readiness_status=$?
  if [[ -n "${readiness_output}" ]]; then
    printf '%s\n' "${readiness_output}" >&2
  else
    echo "Release readiness preflight failed before GitHub Release/check verification." >&2
  fi
  exit "${readiness_status}"
}

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to verify GitHub Release/check state before publication." >&2
  exit 1
fi
if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GH_TOKEN or GITHUB_TOKEN is required to verify GitHub Release/check state before publication." >&2
  exit 1
fi

curl_args=(
  -fsSL
  -H "Accept: application/vnd.github+json"
  -H "X-GitHub-Api-Version: 2022-11-28"
)
if [[ -n "${GH_TOKEN:-}" ]]; then
  curl_args+=(-H "Authorization: Bearer ${GH_TOKEN}")
elif [[ -n "${GITHUB_TOKEN:-}" ]]; then
  curl_args+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

release_json="$(
  curl "${curl_args[@]}" \
    "${API_URL}/repos/${REPO}/releases/tags/${TAG}"
)"

printf '%s' "${release_json}" | python3 "${ROOT}/scripts/verify_github_release_metadata.py" \
  --tag "${TAG}" \
  --base "${READINESS_BASE}"

commit_sha="$(git -C "${ROOT}" rev-parse "${TAG}^{commit}" 2>/dev/null || true)"
if [[ -z "${commit_sha}" ]]; then
  tag_ref_json="$(
    curl "${curl_args[@]}" \
      "${API_URL}/repos/${REPO}/git/ref/tags/${TAG}"
  )"
  commit_sha="$(
    TAG_REF_JSON="${tag_ref_json}" API_URL="${API_URL}" REPO="${REPO}" python3 - <<'PY'
import json
import os
import sys
import urllib.request

tag_ref = json.loads(os.environ["TAG_REF_JSON"])
obj = tag_ref.get("object") or {}
obj_type = obj.get("type")
obj_sha = obj.get("sha", "")
if not obj_sha:
    sys.exit(1)
if obj_type == "commit":
    print(obj_sha)
    sys.exit(0)
if obj_type != "tag":
    sys.exit(1)

request = urllib.request.Request(
    f"{os.environ['API_URL']}/repos/{os.environ['REPO']}/git/tags/{obj_sha}",
    headers={
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        **(
            {"Authorization": f"Bearer {os.environ['GH_TOKEN']}"}
            if os.environ.get("GH_TOKEN")
            else (
                {"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"}
                if os.environ.get("GITHUB_TOKEN")
                else {}
            )
        ),
    },
)
with urllib.request.urlopen(request) as response:
    payload = json.load(response)
print((payload.get("object") or {}).get("sha", ""))
PY
)"
fi

if [[ -z "${commit_sha}" ]]; then
  echo "Failed to resolve commit for tag '${TAG}'." >&2
  exit 1
fi

check_runs_json="$(
  curl "${curl_args[@]}" \
    "${API_URL}/repos/${REPO}/commits/${commit_sha}/check-runs?per_page=100"
)"

printf '%s' "${check_runs_json}" | python3 "${ROOT}/scripts/verify_release_readiness_checks.py" --required-checks "${REQUIRED_CHECKS}"
