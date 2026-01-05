#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

VERSION="${1:-}"
if [[ -z "${VERSION}" ]]; then
  VERSION="$(curl -fsSL https://api.github.com/repos/rclone/rclone/releases/latest | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"tag_name\"])')"
fi
if [[ "${VERSION}" != v* ]]; then
  VERSION="v${VERSION}"
fi
VER_NO_V="${VERSION#v}"

OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "${OS}" != "Linux" ]]; then
  echo "[install_rclone] unsupported OS: ${OS}" >&2
  exit 1
fi

case "${ARCH}" in
  x86_64|amd64) ASSET_ARCH="amd64" ;;
  i386|i686) ASSET_ARCH="386" ;;
  aarch64|arm64) ASSET_ARCH="arm64" ;;
  armv7l|armv7|armv6l|armv6) ASSET_ARCH="arm" ;;
  ppc64le) ASSET_ARCH="ppc64le" ;;
  s390x) ASSET_ARCH="s390x" ;;
  *)
    echo "[install_rclone] unsupported arch: ${ARCH}" >&2
    exit 1
    ;;
esac

ASSET="rclone-${VERSION}-linux-${ASSET_ARCH}.zip"
URL="https://github.com/rclone/rclone/releases/download/${VERSION}/${ASSET}"

DEST_DIR="${ROOT}/.tools/rclone/${VER_NO_V}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

mkdir -p "${DEST_DIR}"
echo "[install_rclone] downloading ${URL}"
curl -fL -o "${TMP_DIR}/${ASSET}" "${URL}"
unzip -q "${TMP_DIR}/${ASSET}" -d "${TMP_DIR}"

BIN_PATH="${TMP_DIR}/rclone-${VERSION}-linux-${ASSET_ARCH}/rclone"
if [[ ! -f "${BIN_PATH}" ]]; then
  echo "[install_rclone] expected ${BIN_PATH} not found" >&2
  exit 1
fi

install -m 0755 "${BIN_PATH}" "${DEST_DIR}/rclone"

mkdir -p "${ROOT}/.tools/bin"
ln -sf "${DEST_DIR}/rclone" "${ROOT}/.tools/bin/rclone"

echo "[install_rclone] installed: ${ROOT}/.tools/bin/rclone"
echo "[install_rclone] export RCLONE_PATH=\"${ROOT}/.tools/bin/rclone\""
