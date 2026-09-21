#!/usr/bin/env bash
# Deliberately focused checks, NOT the full backend/frontend/release gate.
# Tests the real dependency-free Go packages and TypeScript transfer functions.
# XHR/API responses are simulated in the Node tests; no storage service is used.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
if [[ -z "${TYPESCRIPT_PATH:-}" ]]; then
  TYPESCRIPT_PATH="$(cd "$ROOT/frontend" && node -p 'require.resolve("typescript")')" || {
    echo 'Install frontend dependencies or set TYPESCRIPT_PATH to a local TypeScript installation.' >&2
    exit 1
  }
fi
export TYPESCRIPT_PATH
printf '\n[transfer-check] Production TS functions; explicit XHR/API doubles (no React/app test).\n'
node --test "$ROOT/scripts/tests/transfer_resilience.test.cjs"
mkdir -p "$WORK/internal"
for package in objectdownload streamlimit multipartverify operationreceipt; do
  cp -R "$ROOT/backend/internal/$package" "$WORK/internal/"
done
printf 'module s3desk\n\ngo 1.23.0\n' > "$WORK/go.mod"
printf '\n[transfer-check] Production dependency-free Go packages; scratch module, original pins unchanged.\n'
(cd "$WORK" && GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off go test -race -count=1 -v ./internal/...)
printf '\n[transfer-check] Focused checks passed. Full build, real provider, browser and device gates remain separate.\n'
