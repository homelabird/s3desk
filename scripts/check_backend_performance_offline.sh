#!/usr/bin/env bash
# Runs actual dependency-free production packages, not a substitute backend build.
# The scratch module leaves the project's pinned toolchain and go.mod untouched.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-test}"
case "$MODE" in test|bench) ;; *) echo "usage: $0 [test|bench]" >&2; exit 2;; esac
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/internal"
for package in models logging redact profileendpoint profiletls profilehttp keyedmutex s3listing; do
  cp -R "$ROOT/backend/internal/$package" "$WORK/internal/"
done
printf 'module s3desk\n\ngo 1.23.0\n' > "$WORK/go.mod"
cd "$WORK"
export GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off
if [[ "$MODE" == test ]]; then
  go test -race -count=1 -v ./internal/...
else
  GOMAXPROCS=8 go test -run '^$' -bench . -benchtime=100x -count=3 ./internal/profilehttp ./internal/keyedmutex
fi
