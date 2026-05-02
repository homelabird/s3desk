#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
GO_BIN="${GO_BIN:-go}"
ACTIONLINT_VERSION="${ACTIONLINT_VERSION:-v1.7.12}"
PACKAGE="github.com/rhysd/actionlint/cmd/actionlint@${ACTIONLINT_VERSION}"
DEST_DIR="${ROOT}/.tools/go/bin"

if ! command -v "${GO_BIN}" >/dev/null 2>&1; then
  echo "[install_actionlint] go not found" >&2
  echo "[install_actionlint] install Go first or set GO_BIN to a working go binary" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"

echo "[install_actionlint] installing ${PACKAGE}"
GOBIN="${DEST_DIR}" "${GO_BIN}" install "${PACKAGE}"

if [[ ! -x "${DEST_DIR}/actionlint" ]]; then
  echo "[install_actionlint] expected ${DEST_DIR}/actionlint not found after install" >&2
  exit 1
fi

echo "[install_actionlint] installed: ${DEST_DIR}/actionlint"
echo "[install_actionlint] verify with: ${DEST_DIR}/actionlint -version"
