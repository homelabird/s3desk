#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

GO_BIN="${GO_BIN:-}"
if [[ -z "${GO_BIN}" ]]; then
  if command -v go >/dev/null 2>&1; then
    GO_BIN="go"
  elif [[ -x "${ROOT}/.tools/go/bin/go" ]]; then
    GO_BIN="${ROOT}/.tools/go/bin/go"
  else
    echo "[build] go not found (install Go or add .tools/go)" >&2
    exit 1
  fi
fi

echo "[build] frontend"
(
  cd "${ROOT}/frontend"
  npm ci --no-audit --no-fund
  npm run gen:openapi
  npm run build
)

echo "[build] third-party notices"
python3 "${ROOT}/scripts/generate_third_party_notices.py"

mkdir -p "${ROOT}/dist"

echo "[build] package ui"
rm -rf "${ROOT}/dist/ui"
mkdir -p "${ROOT}/dist/ui"
cp -a "${ROOT}/frontend/dist/." "${ROOT}/dist/ui/"
cp -f "${ROOT}/openapi.yml" "${ROOT}/dist/openapi.yml"

echo "[build] bundle tools"
mkdir -p "${ROOT}/dist/bin"
RCLONE_SRC=""
if [[ -e "${ROOT}/.tools/bin/rclone" ]]; then
  RCLONE_SRC="${ROOT}/.tools/bin/rclone"
elif command -v rclone >/dev/null 2>&1; then
  RCLONE_SRC="$(command -v rclone)"
fi

if [[ -n "${RCLONE_SRC}" ]]; then
  cp -fL "${RCLONE_SRC}" "${ROOT}/dist/bin/rclone"
  chmod +x "${ROOT}/dist/bin/rclone"
  echo "[build] bundled rclone: ${ROOT}/dist/bin/rclone (from ${RCLONE_SRC})"
else
  echo "[build] rclone not found; skipping"
fi

echo "[build] validate openapi"
bash "${ROOT}/scripts/validate_openapi.sh"

echo "[build] backend"
(
  cd "${ROOT}/backend"
  "${GO_BIN}" build -o "${ROOT}/dist/s3desk-server" ./cmd/server
)

echo "[build] done: ${ROOT}/dist/s3desk-server"
