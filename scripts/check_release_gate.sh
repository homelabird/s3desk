#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CHANGELOG="${ROOT}/CHANGELOG.md"
RELEASE_GATE="${ROOT}/docs/RELEASE_GATE.md"
LIVE_VALIDATION="${ROOT}/docs/BUCKET_GOVERNANCE_LIVE_VALIDATION.md"
TESTING_DOC="${ROOT}/docs/TESTING.md"

require_text() {
  local file="$1"
  local needle="$2"
  local description="$3"
  if ! grep -Fq -- "${needle}" "${file}"; then
    echo "[release-gate] missing ${description}: ${needle}" >&2
    exit 1
  fi
}

if [[ ! -f "${CHANGELOG}" ]]; then
  echo "[release-gate] CHANGELOG.md not found" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_GATE}" ]]; then
  echo "[release-gate] docs/RELEASE_GATE.md not found" >&2
  exit 1
fi
if [[ ! -f "${LIVE_VALIDATION}" ]]; then
  echo "[release-gate] docs/BUCKET_GOVERNANCE_LIVE_VALIDATION.md not found" >&2
  exit 1
fi
if [[ ! -f "${TESTING_DOC}" ]]; then
  echo "[release-gate] docs/TESTING.md not found" >&2
  exit 1
fi

require_text "${CHANGELOG}" "## Unreleased" "Unreleased changelog section"
require_text "${CHANGELOG}" "### Known Limitations" "Known Limitations changelog section"
require_text "${CHANGELOG}" "Azure legal hold remains read-only in S3Desk." "Azure legal hold known limitation"
require_text "${CHANGELOG}" "Azure immutability editing requires ARM credentials in addition to storage credentials." "Azure immutability known limitation"
require_text "${CHANGELOG}" "OCI PAR edits are delete-and-recreate rather than in-place mutation" "OCI PAR mutation known limitation"
require_text "${CHANGELOG}" "AWS typed bucket governance still does not cover Object Lock." "AWS Object Lock known limitation"
require_text "${CHANGELOG}" "In-product backup and staged restore target sqlite \`DATA_DIR\` workflows and do not replace Postgres disaster recovery." "sqlite backup known limitation"

require_text "${LIVE_VALIDATION}" "- Provider name" "provider evidence field"
require_text "${LIVE_VALIDATION}" "- Bucket or container name" "bucket/container evidence field"
require_text "${LIVE_VALIDATION}" "- Profile identifier" "profile evidence field"
require_text "${LIVE_VALIDATION}" "- S3Desk commit SHA or release tag" "commit/tag evidence field"
require_text "${LIVE_VALIDATION}" "- Exact feature tested" "feature evidence field"
require_text "${LIVE_VALIDATION}" "- API response body on failure" "API failure evidence field"
require_text "${LIVE_VALIDATION}" "- Provider-native console or CLI confirmation on success" "provider confirmation evidence field"
require_text "${LIVE_VALIDATION}" "## Exit Criteria" "live validation exit criteria section"

require_text "${RELEASE_GATE}" "## Minimum Release Checklist" "release gate checklist"
require_text "${RELEASE_GATE}" "## Required Evidence" "release gate evidence section"
require_text "${RELEASE_GATE}" "## Automated Enforcement" "release gate automation section"
require_text "${RELEASE_GATE}" "## Provider Change Gate" "provider change gate section"
require_text "${RELEASE_GATE}" "## Release Notes Requirements" "release notes requirements section"
require_text "${RELEASE_GATE}" "## Blockers" "release blockers section"
require_text "${TESTING_DOC}" "./scripts/check_release_gate.sh" "release gate testing command"
require_text "${TESTING_DOC}" "Release Gate" "release gate testing documentation"

echo "[release-gate] ok"
