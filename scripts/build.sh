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
S5CMD_SRC=""
if [[ -e "${ROOT}/.tools/bin/s5cmd" ]]; then
  S5CMD_SRC="${ROOT}/.tools/bin/s5cmd"
elif command -v s5cmd >/dev/null 2>&1; then
  S5CMD_SRC="$(command -v s5cmd)"
fi

if [[ -n "${S5CMD_SRC}" ]]; then
  cp -fL "${S5CMD_SRC}" "${ROOT}/dist/bin/s5cmd"
  chmod +x "${ROOT}/dist/bin/s5cmd"
  echo "[build] bundled s5cmd: ${ROOT}/dist/bin/s5cmd (from ${S5CMD_SRC})"
else
  echo "[build] s5cmd not found; skipping"
fi

echo "[build] validate openapi"
bash "${ROOT}/scripts/validate_openapi.sh"

echo "[build] backend"
(
  cd "${ROOT}/backend"
  "${GO_BIN}" build -o "${ROOT}/dist/object-storage-server" ./cmd/server
)

echo "[build] done: ${ROOT}/dist/object-storage-server"
