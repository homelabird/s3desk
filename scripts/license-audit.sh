#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
REPORT_DIR="$ROOT_DIR/.license-audit"
mkdir -p "$REPORT_DIR"

MODE="${1:-runtime-only}"
if [[ "$MODE" != "runtime-only" && "$MODE" != "full" ]]; then
  echo "Usage: $0 [runtime-only|full]" >&2
  exit 1
fi

BLOCKED_RE='(AGPL|GPL|LGPL|MPL-2\.0|SSPL|CDDL|EPL|CC-BY-SA|CPAL|OSL|CPL)'
NPM_ALLOWED_LICENSES='Apache-2.0;MIT;BSD-2-Clause;BSD-3-Clause;0BSD;ISC;Zlib;CC0-1.0;Python-2.0;CC-BY-4.0;BlueOak-1.0.0;Unlicense;UNLICENSED'

NPM_INSTALL_DEFAULT_ARGS=("--no-audit" "--no-fund")
NPM_CHECK_ARGS=("--json" "--excludePrivatePackages")
NPM_SCOPE_ARGS=()
if [[ "$MODE" == "full" ]]; then
  NPM_SCOPE_ARGS=("--development")
else
  NPM_SCOPE_ARGS=("--production")
fi
NPM_CHECK_ARGS+=("${NPM_SCOPE_ARGS[@]}")

npm_json="$REPORT_DIR/npm-${MODE}.json"
go_report="$REPORT_DIR/go-${MODE}.txt"
npm_bad="$REPORT_DIR/npm-${MODE}-blocked.txt"
npm_unknown="$REPORT_DIR/npm-${MODE}-unknown.txt"
npm_disallowed="$REPORT_DIR/npm-${MODE}-disallowed.txt"
go_bad="$REPORT_DIR/go-${MODE}-blocked.txt"
artifact_check_report="$REPORT_DIR/artifact-check.txt"

rm -f "$npm_bad" "$npm_unknown" "$npm_disallowed" "$go_bad" "$artifact_check_report"

echo "[1/3] npm license audit ($MODE)"
(
  cd "$FRONTEND_DIR"
  npm ci "${NPM_INSTALL_DEFAULT_ARGS[@]}" >/dev/null
  if ! npx -y license-checker "${NPM_CHECK_ARGS[@]}" > "$npm_json"; then
    echo "license-checker failed due to disallowed/unknown licenses" >> "$npm_bad"
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

echo "[2/3] go module license audit"
(
  cd "$BACKEND_DIR"
  if ! command -v go-licenses >/dev/null 2>&1; then
    echo "installing go-licenses..."
    go install github.com/google/go-licenses@latest
  fi
  go-licenses report ./... > "$go_report"
)

if grep -E "$BLOCKED_RE|UNKNOWN" "$go_report" > "$go_bad" || true; then
  :
fi

echo "[3/3] distributed artifact guardrails"
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
} > "$artifact_check_report"

FAIL=0
if [ -s "$npm_bad" ] || [ -s "$npm_unknown" ] || [ -s "$npm_disallowed" ] || [ -s "$go_bad" ]; then
  echo "Blocked/unknown licenses found."
  [ -s "$npm_bad" ] && echo "[npm blocked]" && cat "$npm_bad"
  [ -s "$npm_unknown" ] && echo "[npm unknown]" && cat "$npm_unknown"
  [ -s "$npm_disallowed" ] && echo "[npm disallowed]" && cat "$npm_disallowed"
  [ -s "$go_bad" ] && echo "[go blocked/unknown]" && cat "$go_bad"
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
