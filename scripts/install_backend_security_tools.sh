#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export GOBIN="${GOBIN:-${ROOT}/.tools/go/bin}"
mkdir -p "${GOBIN}"

go install honnef.co/go/tools/cmd/staticcheck@v0.6.1
go install github.com/securego/gosec/v2/cmd/gosec@v2.23.0
go install golang.org/x/vuln/cmd/govulncheck@v1.1.4
