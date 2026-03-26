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
REQUIRED_CHECKS="${DEPLOY_REQUIRED_CHECKS:-release-gate,Core Mock E2E,Mobile Responsive E2E (Required)}"

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

draft_state="$(
  RELEASE_JSON="${release_json}" python3 - <<'PY'
import json
import os

data = json.loads(os.environ["RELEASE_JSON"])
print("true" if data.get("draft") else "false")
PY
)"
if [[ "${draft_state}" == "true" ]]; then
  echo "GitHub release for tag '${TAG}' is still a draft." >&2
  exit 1
fi

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

CHECK_RUNS_JSON="${check_runs_json}" REQUIRED_CHECKS="${REQUIRED_CHECKS}" python3 - <<'PY'
import json
import os
import sys

allowed = {"success", "neutral", "skipped"}
required = [item.strip() for item in os.environ["REQUIRED_CHECKS"].split(",") if item.strip()]
check_runs = json.loads(os.environ["CHECK_RUNS_JSON"]).get("check_runs", [])
states = {}
for run in check_runs:
    states[run.get("name", "")] = run.get("conclusion") or run.get("status") or "missing"

missing = []
failed = []
for name in required:
    state = states.get(name)
    if state is None:
        missing.append(name)
    elif state not in allowed:
        failed.append(f"{name}={state}")

if missing or failed:
    if missing:
        print("Missing required checks: " + ", ".join(missing), file=sys.stderr)
    if failed:
        print("Non-passing required checks: " + ", ".join(failed), file=sys.stderr)
    sys.exit(1)
PY
