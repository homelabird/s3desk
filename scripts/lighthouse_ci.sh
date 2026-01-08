#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${S3DESK_API_TOKEN:-}" ]]; then
  echo "[lighthouse-ci] S3DESK_API_TOKEN is required." >&2
  exit 1
fi

if [[ -z "${S3DESK_PROFILE_ID:-}" ]]; then
  echo "[lighthouse-ci] S3DESK_PROFILE_ID is required." >&2
  exit 1
fi

if [[ -z "${S3DESK_URL:-}" ]]; then
  export S3DESK_URL="https://s3desk.k8s.homelabird.com/objects"
fi

if [[ -z "${S3DESK_BUCKET:-}" ]]; then
  echo "[lighthouse-ci] S3DESK_BUCKET is empty; Objects UI will render the bucket picker." >&2
fi

mkdir -p artifacts/lighthouse-ci

npx --yes -p puppeteer-core -p @lhci/cli@0.15.1 lhci autorun --config=./lighthouserc.js
