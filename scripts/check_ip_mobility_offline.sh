#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
node --test scripts/tests/ip_mobility.test.cjs
# Only standard-library packages: this does not replace an API/SQLite/S3 test.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/internal"
cp -R backend/internal/operationreceipt "$TMP/internal/"
printf 'module s3desk\n\ngo 1.23.0\n' > "$TMP/go.mod"
(cd "$TMP"; GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off go test -race -count=1 ./internal/operationreceipt)
