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
- Updated `TESTING.md`, release-prep docs, and PR/review templates to document the `check-smoke` vs `core` vs `mobile-responsive` browser-test split and the Playwright geometry guard.

# Validation

- `bash ./scripts/check.sh fast`
- `bash ./scripts/check.sh full`
- backend: `go test ./...`, `staticcheck`, `gosec`, `govulncheck`
- frontend: `lint`, unit tests, `build`
- frontend workflow lint for GitHub Actions / browser CI wiring: `bash ./scripts/check_github_workflows.sh`
- frontend bundle-report contract for manifest/report wording changes: `npm run check:bundle-report`
- frontend bundle budget checks for bundle-affecting changes: `npm run bundle:budget`
- frontend browser test policy checks: `npm run check:e2e:geometry`
- frontend boot-gate browser checks: `npm run test:e2e:smoke`
- frontend desktop/mock regression checks: `npm run test:e2e:core`
- frontend mobile task-completion checks: `npm run test:e2e:mobile-responsive`

# Rollout Notes

- Remote deployments now fail closed if `ALLOW_REMOTE` is enabled without matching `ALLOWED_HOSTS` / `ALLOWED_LOCAL_DIRS`.
- Realtime WS/SSE clients must present a trusted `Origin`.
- Workflow or browser-CI wiring changes should report `bash ./scripts/check_github_workflows.sh` separately from Playwright lane evidence.
- Workflow-lint-only changes should usually leave evidence lines like `Workflow Lint: executed`, `Browser Lanes: smoke + core not applicable (workflow or browser-CI wiring changed, but the browser surface did not)`, `Bundle Budget: not applicable (no bundle-affecting runtime change)`, and `Bundle Budget Contract: not applicable (no bundle manifest/report/summary wiring change)`.
- Frontend bundle-affecting changes should report `npm run bundle:budget` or the `Bundle Budget` job only when entrypoints, chunking, dependencies, or bundle-shape changed; otherwise keep `Bundle Budget:` as `not applicable (...)`. Separately, report `npm run check:bundle-report` only when the manifest/report/summary contract changed, and otherwise keep `Bundle Budget Contract:` as `not applicable (...)`. Evidence lines should look like `Bundle Budget: executed`, `Bundle Budget: not applicable (no bundle-affecting runtime change)`, `Bundle Budget Contract: not applicable (no bundle manifest/report/summary wiring change)`, `Warnings: none`, `Review targets: none`, `Action hints: none`, or naming the chunks that still need follow-up.
- Browser-surface test evidence should report each lane used (`smoke`, `core`, `mobile-responsive`) as a separate line, and non-run lanes should say why they were not applicable instead of disappearing into a generic "browser smoke passed".
- `govulncheck` reported only non-reachable imported/required module findings; the gate passed.
