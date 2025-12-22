#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

VERSION="${1:-}"
if [[ -z "${VERSION}" ]]; then
  VERSION="$(curl -fsSL https://api.github.com/repos/peak/s5cmd/releases/latest | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"tag_name\"])')"
fi
VER_NO_V="${VERSION#v}"

OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "${OS}" != "Linux" ]]; then
  echo "[install_s5cmd] unsupported OS: ${OS}" >&2
  exit 1
fi

case "${ARCH}" in
  x86_64|amd64) ASSET_ARCH="64bit" ;;
  i386|i686) ASSET_ARCH="32bit" ;;
  aarch64|arm64) ASSET_ARCH="arm64" ;;
  armv6l) ASSET_ARCH="armv6" ;;
  ppc64le) ASSET_ARCH="ppc64le" ;;
  *)
    echo "[install_s5cmd] unsupported arch: ${ARCH}" >&2
    exit 1
    ;;
esac

ASSET="s5cmd_${VER_NO_V}_Linux-${ASSET_ARCH}.tar.gz"
URL="https://github.com/peak/s5cmd/releases/download/${VERSION}/${ASSET}"

DEST_DIR="${ROOT}/.tools/s5cmd/${VER_NO_V}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

mkdir -p "${DEST_DIR}"
echo "[install_s5cmd] downloading ${URL}"
curl -fL -o "${TMP_DIR}/${ASSET}" "${URL}"
tar -C "${DEST_DIR}" -xzf "${TMP_DIR}/${ASSET}"

if [[ ! -f "${DEST_DIR}/s5cmd" ]]; then
  echo "[install_s5cmd] expected ${DEST_DIR}/s5cmd not found" >&2
  exit 1
fi

chmod +x "${DEST_DIR}/s5cmd"

mkdir -p "${ROOT}/.tools/bin"
ln -sf "${DEST_DIR}/s5cmd" "${ROOT}/.tools/bin/s5cmd"

echo "[install_s5cmd] installed: ${ROOT}/.tools/bin/s5cmd"
echo "[install_s5cmd] export S5CMD_PATH=\"${ROOT}/.tools/bin/s5cmd\""

