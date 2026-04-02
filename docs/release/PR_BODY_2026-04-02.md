# Summary

- Refactors upload handlers into smaller backend modules and adds focused validation coverage.
- Splits frontend auth/API providers and reduces page/sidebar orchestration in `ProfilesPage`, `BucketsPage`, and backup flows.
- Hardens remote/realtime security defaults and improves local/CI validation scripts.

# Changes

## Frontend

- Added `AuthProvider` / `APIClientProvider` hook boundaries.
- Extracted `ProfilesPage` data, mutation, and YAML import/export helpers.
- Extracted `BucketsPage` list, dialog, and action wiring.
- Split backup sidebar render blocks and async orchestration into smaller sections/hooks.

## Backend

- Decomposed upload handling into `common`, `validation`, `limits`, `direct`, `staging`, `presign`, and `commit` modules.
- Added multipart complete/abort precondition coverage and upload header validation tests.
- Enforced trusted `Origin` checks for realtime ticket issuance and WS/SSE connections.
- Tightened `ALLOW_REMOTE` fail-closed behavior for `ALLOWED_HOSTS` and `ALLOWED_LOCAL_DIRS`.

## Tooling and Docs

- Added focused backend repro script and CI pair wrapper.
- Updated `TESTING.md` and release-prep docs for PR, rollout, and follow-up debt tracking.

# Validation

- `bash ./scripts/check.sh fast`
- `bash ./scripts/check.sh full`
- backend: `go test ./...`, `staticcheck`, `gosec`, `govulncheck`
- frontend: `lint`, unit tests, `build`
- browser smoke passed

# Rollout Notes

- Remote deployments now fail closed if `ALLOW_REMOTE` is enabled without matching `ALLOWED_HOSTS` / `ALLOWED_LOCAL_DIRS`.
- Realtime WS/SSE clients must present a trusted `Origin`.
- `govulncheck` reported only non-reachable imported/required module findings; the gate passed.
