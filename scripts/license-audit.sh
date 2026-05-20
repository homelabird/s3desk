#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
REPORT_DIR="$ROOT_DIR/.license-audit"
GO_LICENSES_VERSION="${GO_LICENSES_VERSION:-v1.6.0}"
mkdir -p "$REPORT_DIR"

MODE="${1:-runtime-only}"
if [[ "$MODE" != "runtime-only" && "$MODE" != "full" ]]; then
  echo "Usage: $0 [runtime-only|full]" >&2
  exit 1
fi

BLOCKED_RE='(AGPL|GPL|LGPL|MPL-2\.0|SSPL|CDDL|EPL|CC-BY-SA|CPAL|OSL|CPL)'
NPM_ALLOWED_LICENSES='Apache-2.0;MIT;BSD-2-Clause;BSD-3-Clause;0BSD;ISC;Zlib;CC0-1.0;Python-2.0;CC-BY-4.0;BlueOak-1.0.0;Unlicense;UNLICENSED'
GO_ALLOWED_LICENSES='0BSD;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;MIT;Zlib;CC0-1.0;Unlicense'
GO_LICENSE_IGNORE_PREFIXES="${GO_LICENSE_IGNORE_PREFIXES:-s3desk}"
GO_LICENSE_OVERRIDES="${GO_LICENSE_OVERRIDES:-modernc.org/mathutil=BSD-3-Clause}"
IMAGE_ALLOWED_LICENSES='0BSD;Apache-2.0;BSD-2-Clause;BSD-3-Clause;BSD-4-Clause;ISC;MIT;Zlib;OpenSSL;MPL-2.0;GPL-2.0-only;GPL-2.0-or-later;GPL-3.0-only;GPL-3.0-or-later;LGPL-2.0-or-later;LGPL-2.1-only;LGPL-2.1-or-later;LGPL-3.0-only;LGPL-3.0-or-later;FTL;blessing;Public-Domain;CC0-1.0;Unicode-DFS-2016;bzip2-1.0.6;IJG'
IMAGE_BLOCKED_RE="${IMAGE_BLOCKED_RE:-}"
LICENSE_AUDIT_IMAGE_TARS="${LICENSE_AUDIT_IMAGE_TARS:-}"

NPM_INSTALL_DEFAULT_ARGS=("--no-audit" "--no-fund")
NPM_CHECK_ARGS=("--json" "--excludePrivatePackages")
NPM_SCOPE_ARGS=()
if [[ "$MODE" == "full" ]]; then
  NPM_SCOPE_ARGS=("--development")
else
  NPM_INSTALL_DEFAULT_ARGS+=("--omit=optional")
  NPM_SCOPE_ARGS=("--production")
fi
NPM_CHECK_ARGS+=("${NPM_SCOPE_ARGS[@]}")

npm_json="$REPORT_DIR/npm-${MODE}.json"
go_report="$REPORT_DIR/go-${MODE}.txt"
npm_bad="$REPORT_DIR/npm-${MODE}-blocked.txt"
npm_unknown="$REPORT_DIR/npm-${MODE}-unknown.txt"
npm_disallowed="$REPORT_DIR/npm-${MODE}-disallowed.txt"
go_bad="$REPORT_DIR/go-${MODE}-blocked.txt"
go_unknown="$REPORT_DIR/go-${MODE}-unknown.txt"
go_disallowed="$REPORT_DIR/go-${MODE}-disallowed.txt"
image_packages="$REPORT_DIR/image-${MODE}-apk-packages.txt"
image_bad="$REPORT_DIR/image-${MODE}-apk-blocked.txt"
image_unknown="$REPORT_DIR/image-${MODE}-apk-unknown.txt"
image_disallowed="$REPORT_DIR/image-${MODE}-apk-disallowed.txt"
artifact_check_report="$REPORT_DIR/artifact-check.txt"
run_info_report="$REPORT_DIR/run-info.txt"

rm -f "$npm_bad" "$npm_unknown" "$npm_disallowed" "$go_bad" "$go_unknown" "$go_disallowed" "$image_packages" "$image_bad" "$image_unknown" "$image_disallowed" "$artifact_check_report" "$run_info_report"

{
  echo "mode=$MODE"
  printf 'npm_install_args='
  printf '%s ' "${NPM_INSTALL_DEFAULT_ARGS[@]}"
  printf '\n'
  printf 'npm_scope_args='
  printf '%s ' "${NPM_SCOPE_ARGS[@]}"
  printf '\n'
  echo "go_allowed_licenses=$GO_ALLOWED_LICENSES"
  echo "go_license_ignore_prefixes=$GO_LICENSE_IGNORE_PREFIXES"
  echo "go_license_overrides=$GO_LICENSE_OVERRIDES"
  echo "image_allowed_licenses=$IMAGE_ALLOWED_LICENSES"
  echo "image_blocked_re=$IMAGE_BLOCKED_RE"
  echo "license_audit_image_tars=$LICENSE_AUDIT_IMAGE_TARS"
} > "$run_info_report"

echo "[1/4] npm license audit ($MODE)"
(
  cd "$FRONTEND_DIR"
  npm ci "${NPM_INSTALL_DEFAULT_ARGS[@]}" >/dev/null
  if ! npx -y license-checker "${NPM_CHECK_ARGS[@]}" > "$npm_json"; then
    echo "license-checker failed due to disallowed/unknown licenses" >> "$npm_bad"
  fi
  if [[ "$MODE" == "runtime-only" ]]; then
    npm ci --no-audit --no-fund >/dev/null
  fi
)

node - <<'NODE' "$npm_json" "$BLOCKED_RE" "$npm_bad" "$npm_unknown" "$npm_disallowed" "$NPM_ALLOWED_LICENSES"
const fs = require('node:fs');

const reportPath = process.argv[2];
const blockedRe = new RegExp(process.argv[3], 'i');
const badPath = process.argv[4];
const unknownPath = process.argv[5];
const disallowedPath = process.argv[6];
const allowListRaw = process.argv[7] || '';

const data = fs.readFileSync(reportPath, 'utf8').trim();
const parsed = data ? JSON.parse(data) : {};
const bad = [];
const unknown = [];
const disallowed = [];
const allow = new Set((allowListRaw || '')
  .split(';')
  .map((item) => item.trim())
  .filter(Boolean));

for (const [name, meta] of Object.entries(parsed)) {
  const raw = meta.licenses || meta.license || '';
  const licenses = String(raw)
    .split(/\s+OR\s+|\s*;\s*|\s*,\s*/g)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!licenses.length || licenses.includes('UNKNOWN')) {
    unknown.push(name);
    continue;
  }
  if (licenses.some((l) => blockedRe.test(l))) {
    bad.push(`${name} :: ${licenses.join(', ')}`);
    continue;
  }
  if (!licenses.some((l) => allow.has(l))) {
    disallowed.push(`${name} :: ${licenses.join(', ')}`);
  }
}

fs.writeFileSync(badPath, bad.join('\n') + (bad.length ? '\n' : ''));
fs.writeFileSync(unknownPath, unknown.join('\n') + (unknown.length ? '\n' : ''));
fs.writeFileSync(disallowedPath, disallowed.join('\n') + (disallowed.length ? '\n' : ''));
NODE

echo "[2/4] go module license audit"
(
  cd "$BACKEND_DIR"
  if ! command -v go-licenses >/dev/null 2>&1; then
    echo "installing go-licenses ${GO_LICENSES_VERSION}..."
    go install "github.com/google/go-licenses@${GO_LICENSES_VERSION}"
  fi
  go_license_ignore_args=()
  IFS=';' read -r -a go_license_ignore_prefixes <<< "$GO_LICENSE_IGNORE_PREFIXES"
  for prefix in "${go_license_ignore_prefixes[@]}"; do
    if [[ -n "$prefix" ]]; then
      go_license_ignore_args+=("--ignore" "$prefix")
    fi
  done
  go-licenses report "${go_license_ignore_args[@]}" ./... > "$go_report"
)

python3 "$ROOT_DIR/scripts/check_go_license_report.py" \
  --report "$go_report" \
  --blocked-re "$BLOCKED_RE" \
  --allowed-licenses "$GO_ALLOWED_LICENSES" \
  --overrides "$GO_LICENSE_OVERRIDES" \
  --blocked-out "$go_bad" \
  --unknown-out "$go_unknown" \
  --disallowed-out "$go_disallowed"

echo "[3/4] runtime image package license audit"
image_tar_args=()
if [[ -n "$LICENSE_AUDIT_IMAGE_TARS" ]]; then
  IFS=';' read -r -a configured_image_tars <<< "$LICENSE_AUDIT_IMAGE_TARS"
  for image_tar in "${configured_image_tars[@]}"; do
    if [[ -n "$image_tar" ]]; then
      image_tar_args+=("--image-tar" "$image_tar")
    fi
  done
else
  for image_tar in "$ROOT_DIR/release-postgres.tar" "$ROOT_DIR/release-sqlite.tar"; do
    if [[ -f "$image_tar" ]]; then
      image_tar_args+=("--image-tar" "$image_tar")
    fi
  done
fi
if [[ "${#image_tar_args[@]}" -gt 0 ]]; then
  python3 "$ROOT_DIR/scripts/check_runtime_image_licenses.py" \
    "${image_tar_args[@]}" \
    --allowed-licenses "$IMAGE_ALLOWED_LICENSES" \
    --blocked-re "$IMAGE_BLOCKED_RE" \
    --packages-out "$image_packages" \
    --blocked-out "$image_bad" \
    --unknown-out "$image_unknown" \
    --disallowed-out "$image_disallowed"
else
  echo "No runtime image tar inputs found; skipping APK package license scan." > "$image_packages"
fi

echo "[4/4] distributed artifact guardrails"
{
  if [ -d "$FRONTEND_DIR/dist/node_modules" ]; then
    echo "ERROR: frontend/dist includes node_modules."
  fi
  if [ -d "$ROOT_DIR/dist" ]; then
    if [ -d "$ROOT_DIR/dist/node_modules" ]; then
      echo "ERROR: dist includes node_modules."
    fi
  fi
  if [ -d "$ROOT_DIR/backend/dist" ] && [ -d "$ROOT_DIR/backend/dist/node_modules" ]; then
    echo "ERROR: backend/dist includes node_modules."
  fi
  if [ -d "$FRONTEND_DIR/node_modules/ffmpeg-static" ] && [ "$MODE" == "runtime-only" ]; then
    echo "WARNING: ffmpeg-static is installed in working tree but should not be bundled in runtime outputs."
  fi
  if [ "$MODE" == "full" ] && [ ! -d "$FRONTEND_DIR/node_modules/ffmpeg-static" ]; then
    echo "ERROR: full mode expected ffmpeg-static to be installable as dev/build support for audit traceability."
  fi
  if ! grep -Fq -- "- rclone - MIT" "$ROOT_DIR/THIRD_PARTY_NOTICES.md"; then
    echo "ERROR: THIRD_PARTY_NOTICES.md must include the copied runtime rclone binary notice."
  fi
  if [ ! -s "$ROOT_DIR/third_party/licenses/external/rclone-LICENSE" ]; then
    echo "ERROR: copied runtime rclone binary license text is missing from third_party/licenses/external/."
  fi
} > "$artifact_check_report"

FAIL=0
if [ -s "$npm_bad" ] || [ -s "$npm_unknown" ] || [ -s "$npm_disallowed" ] || [ -s "$go_bad" ] || [ -s "$go_unknown" ] || [ -s "$go_disallowed" ] || [ -s "$image_bad" ] || [ -s "$image_unknown" ] || [ -s "$image_disallowed" ]; then
  echo "Blocked/unknown licenses found."
  [ -s "$npm_bad" ] && echo "[npm blocked]" && cat "$npm_bad"
  [ -s "$npm_unknown" ] && echo "[npm unknown]" && cat "$npm_unknown"
  [ -s "$npm_disallowed" ] && echo "[npm disallowed]" && cat "$npm_disallowed"
  [ -s "$go_bad" ] && echo "[go blocked]" && cat "$go_bad"
  [ -s "$go_unknown" ] && echo "[go unknown]" && cat "$go_unknown"
  [ -s "$go_disallowed" ] && echo "[go disallowed]" && cat "$go_disallowed"
  [ -s "$image_bad" ] && echo "[runtime image APK blocked]" && cat "$image_bad"
  [ -s "$image_unknown" ] && echo "[runtime image APK unknown]" && cat "$image_unknown"
  [ -s "$image_disallowed" ] && echo "[runtime image APK disallowed]" && cat "$image_disallowed"
  FAIL=1
fi
if grep -q '^ERROR:' "$artifact_check_report"; then
  echo "Artifact guardrail violations:"
  cat "$artifact_check_report"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "License audit passed"
  cat "$artifact_check_report"
  exit 0
fi

echo "License audit failed. See: $REPORT_DIR"
exit 1
