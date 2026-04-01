#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_PATH="${ROOT_DIR}/scripts/repro_backend_focus.sh"
cd "$ROOT_DIR/backend"

print_usage() {
  cat <<'EOF'
usage: ./scripts/repro_backend_focus.sh {help|list|all|realtime|uploads|uploads-staging|uploads-direct|uploads-multipart-preconditions}
EOF
}

print_modes() {
  cat <<'EOF'
all
realtime
uploads
uploads-staging
uploads-direct
uploads-multipart-preconditions
EOF
}

usage_error() {
  print_usage >&2
  exit 2
}

case "${1:-}" in
  help|-h|--help)
    print_usage
    ;;
  list)
    print_modes
    ;;
  all)
    bash "${SCRIPT_PATH}" realtime
    bash "${SCRIPT_PATH}" uploads
    bash "${SCRIPT_PATH}" uploads-staging
    bash "${SCRIPT_PATH}" uploads-direct
    ;;
  realtime)
    go test ./internal/api -run 'TestRealtimeTransportOriginAndLimitPolicy|TestRealtimeSSESuccessPath|TestRealtimeWSSuccessPath|TestCreateRealtimeTicketOriginPolicy|TestRequireLocalHost_OriginHostCombinations|TestIsAllowedRealtimeOrigin_PolicyMatrix|TestRejectInvalidRealtimeOrigin_Table'
    ;;
  uploads)
    go test ./internal/api -run 'TestNormalizeUploadMode|TestParseUploadChunkHeaders|TestBuildMultipartCompletionParts|TestExpectedMultipartPartCount|TestMultipartPartNumber|TestBuildCompletedMultipartParts'
    ;;
  uploads-staging)
    go test ./internal/api -run 'TestUploadMultipartAndCommitLifecycle|TestUploadChunkAndCommitLifecycle|TestCommitUploadQueueFullRollsBackCreatedJob|TestCommitUploadQueueFullThenRetrySucceeds|TestAbortMultipartUploadPreconditions|TestCompleteMultipartUploadPreconditions'
    ;;
  uploads-direct)
    go test ./internal/api -run 'TestCommitUploadDirectMultipartListFailure|TestUploadFilesDirectMultipartInvalidCreateResponse|TestCommitUploadDirectMultipartCompleteFailure|TestCommitUploadDirectUsesVerifiedObjectMetadata'
    ;;
  uploads-multipart-preconditions)
    go test ./internal/api -run 'TestAbortMultipartUploadPreconditions|TestCompleteMultipartUploadPreconditions'
    ;;
  *)
    usage_error
    ;;
esac
