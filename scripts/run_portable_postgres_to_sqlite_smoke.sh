#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PORTABLE_SMOKE_SOURCE_DB_BACKEND=postgres \
PORTABLE_SMOKE_TARGET_DB_BACKEND=sqlite \
"${ROOT_DIR}/run_portable_sqlite_to_postgres_smoke.sh"
