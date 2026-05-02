# Testing

This document keeps only the commands most contributors need.

## Local Check Modes

```bash
./scripts/check.sh
```

`./scripts/check.sh` now defaults to the `full` mode.

- `./scripts/check.sh full`
  - full local gate
  - includes frontend browser smoke through `npm run test:e2e:smoke`
  - verifies third-party notices by regenerating them and comparing the notice/license file tree before and after generation
- `./scripts/check.sh fast`
  - skips the browser smoke layer
  - keeps the existing non-browser local verification path

If Playwright Chromium is not installed locally yet, run:

```bash
cd frontend
npx playwright install --with-deps chromium
```

## CI

The CI path uses the same split build/test commands that the repository gate wraps:

```bash
cd frontend
npm run build
```

```bash
cd backend
go test ./...
```

GitLab adds required quality gates around that minimal backend command:

- `shellcheck` runs `shellcheck -x` for `scripts/**/*.sh` and stores logs in `artifacts/ci/shellcheck/`.
- `go_test` runs `go vet`, writes `backend/coverage.out`, enforces `GO_COVERAGE_MIN_TOTAL`, and stores backend logs in `artifacts/ci/backend/`.
- `golangci_lint` uses `GOLANGCI_LINT_CONFIG` and fails if the checked-in `.golangci.yml` is missing.

### Sandbox Notes

- `frontend` `npm run build` is expected to run cleanly inside the normal workspace sandbox.
- `backend` `go test ./...` can show false negatives inside a restricted sandbox when `httptest` needs to bind a local listener for API or websocket coverage.
- If you see `httptest: failed to listen on a port` or `socket: operation not permitted`, rerun the backend test command outside the sandbox and treat that result as authoritative.

Use `./scripts/check.sh` when you want the full repository gate locally instead of just the minimal CI pair above.

Do not treat `./scripts/check_ci_pair.sh` as a release-ready verdict. It is a convenience wrapper for workflow lint + frontend build + backend test, not a substitute for required browser lanes, bundle-budget, or the full repository gate.

For dirty-worktree release scope review, generate a repeatable inventory from the repository root:

```bash
python3 scripts/report_release_scope.py
```

Use `--format json` when the inventory needs to be attached to another report or reviewed by automation. This command reports counts, dependency/license snapshot scope, root evidence artifact candidates, top-level tracked/untracked groups, and release-unit `path_list_command`/`stage_command` fields; it does not stage, delete, or rewrite files.
The default matches normal `git status --porcelain` untracked handling. Use `--untracked-files all` only when you need file-level expansion inside untracked directories.
Before final release review, add `--fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all` so the command exits non-zero if root evidence artifacts are still untracked, dependency metadata and license snapshots are split, untracked directories have not been expanded for file-level review, or paths still fall into the catch-all `other` release unit. The inventory also reports `Dependency notice unit: complete` when `backend/go.mod`, `backend/go.sum`, `frontend/package.json`, `frontend/package-lock.json`, `THIRD_PARTY_NOTICES.md`, and generated license snapshots are all present together.
Use the `Release Unit Candidates` section as the first staging/review split for large dirty worktrees; it groups status entries by dependency notices, release tooling, backend surfaces, frontend page owners, browser E2E, docs, and scripts.
Inspect a specific unit before staging:

```bash
python3 scripts/report_release_scope.py --unit dependency-notices
python3 scripts/report_release_scope.py --unit frontend-objects --format json
```

Generate a staging-friendly path list for one unit:

```bash
python3 scripts/report_release_scope.py --unit dependency-notices --format paths --null --untracked-files all
```

Use the NUL-separated path output with review tooling such as `xargs -0`; do not stage the whole worktree just because the inventory is large. To print the exact reviewed-unit staging command without mutating files, use:

```bash
python3 scripts/report_release_scope.py --unit dependency-notices --format stage-command
```

The printed command pipes the NUL-separated file-level path list into `git add --pathspec-from-file=- --pathspec-file-nul`.

To approximate a clean runner before CI, copy the current non-ignored workspace into a temporary directory and run the repository gate there:

```bash
python3 scripts/check_clean_snapshot.py fast
python3 scripts/check_clean_snapshot.py full
```

The snapshot excludes `.git` and ignored local artifacts, but includes the current tracked and untracked release-candidate files. Use `--skip-check` to inspect the generated snapshot without running the gate.
Because the snapshot intentionally excludes `.git`, `check_release_gate.sh` skips the git-status-based release-scope command inside the temporary copy. Run the strict `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all` command from the source worktree before relying on clean-snapshot output.

### Local To CI Mapping

Use the exact GitHub check names when you describe release evidence or branch-protection state:

- `./scripts/check.sh full`
  - local mirror of the `Release Gate` workflow job named `release-gate`
  - includes the local `npm run test:e2e:smoke` browser smoke layer
  - does not replace the separate `Core Mock E2E` or `Mobile Responsive E2E (Required)` checks
- `bash ./scripts/check_github_workflows.sh`
  - local equivalent of the `Workflow Lint` job in `Frontend E2E`
- `cd frontend && npm run bundle:budget`
  - local equivalent of the advisory `Bundle Budget` job in `Frontend E2E`
- `cd frontend && npm run test:e2e:core`
  - local equivalent of the required `Core Mock E2E` check
- `cd frontend && npm run test:e2e:visual`
  - local equivalent of the `Visual Regression E2E` check
- `cd frontend && npm run test:e2e:mobile-responsive`
  - local equivalent of the required `Mobile Responsive E2E (Required)` check
- `./scripts/check_ci_pair.sh`
  - convenience wrapper for workflow lint + frontend build + backend test only
  - not the GitHub required-check set and not a branch-protection verdict

GitHub Actions workflow syntax and basic structure can be checked locally with:

```bash
bash ./scripts/check_github_workflows.sh
```

If `actionlint` is installed, the wrapper uses it first and then runs the built-in YAML structure validator. If `actionlint` is not installed, the wrapper falls back to the built-in validator.

To install `actionlint` into the repository-local tool path:

```bash
bash ./scripts/install_actionlint.sh
```

That installs `actionlint` into `.tools/go/bin/actionlint`, which the workflow check wrapper picks up automatically.
The installer defaults to the repository's pinned `actionlint` version and still allows `ACTIONLINT_VERSION=...` overrides when needed.

`./scripts/check.sh` runs this workflow check automatically.

## Focused Reproduction Commands

Use these when you only need the `realtime` or `uploads` surfaces instead of the full backend suite.

### Repo Script

Use the checked-in helper from the repository root:

```bash
./scripts/repro_backend_focus.sh help
./scripts/repro_backend_focus.sh list
./scripts/repro_backend_focus.sh all
./scripts/repro_backend_focus.sh realtime
./scripts/repro_backend_focus.sh uploads
./scripts/repro_backend_focus.sh uploads-staging
./scripts/repro_backend_focus.sh uploads-direct
./scripts/repro_backend_focus.sh uploads-multipart-preconditions
```

`./scripts/check.sh fast` now invokes `./scripts/repro_backend_focus.sh all` automatically when the backend test phase fails, so the focused repro buckets are emitted immediately after a fast-gate backend failure.

### Realtime

```bash
cd backend
go test ./internal/api -run 'TestRealtimeTransportOriginAndLimitPolicy|TestRealtimeSSESuccessPath|TestRealtimeWSSuccessPath|TestCreateRealtimeTicketOriginPolicy|TestRequireLocalHost_OriginHostCombinations|TestIsAllowedRealtimeOrigin_PolicyMatrix|TestRejectInvalidRealtimeOrigin_Table'
```

### Uploads

```bash
cd backend
go test ./internal/api -run 'TestNormalizeUploadMode|TestParseUploadChunkHeaders|TestBuildMultipartCompletionParts|TestExpectedMultipartPartCount|TestMultipartPartNumber|TestBuildCompletedMultipartParts|TestUploadMultipartAndCommitLifecycle|TestUploadChunkAndCommitLifecycle'
```

### Uploads Staging

```bash
cd backend
go test ./internal/api -run 'TestUploadMultipartAndCommitLifecycle|TestUploadChunkAndCommitLifecycle|TestCommitUploadQueueFullRollsBackCreatedJob|TestCommitUploadQueueFullThenRetrySucceeds|TestAbortMultipartUploadPreconditions'
```

### Uploads Direct

```bash
cd backend
go test ./internal/api -run 'TestCommitUploadDirectMultipartListFailure|TestUploadFilesDirectMultipartInvalidCreateResponse|TestCommitUploadDirectMultipartCompleteFailure|TestCommitUploadDirectUsesVerifiedObjectMetadata'
```

## Backend

```bash
cd backend
go test ./...
```

Minimal current-state pair wrapper:

```bash
./scripts/check_ci_pair.sh
```

This wrapper now covers:

- `bash ./scripts/check_github_workflows.sh`
- `cd frontend && npm run build`
- `cd backend && go test ./...`

It intentionally does not cover:

- bundle-budget checks
- Playwright lanes such as `npm run test:e2e:smoke`, `npm run test:e2e:core`, or `npm run test:e2e:mobile-responsive`

Use `./scripts/check.sh full` or the explicit browser commands when the change reaches those release signals. A green `check_ci_pair` result should be read as “minimal CI pair is healthy”, not “all required checks for release are satisfied”.

### Backend Live Provider Smoke

These env-gated smoke tests are read-only and meant for minimal-cost provider validation.

```bash
python3 scripts/check_live_evidence_env.py --scope aws
cd backend
set -a
source ../docs/ci/provider_live_validation.env.example
set +a
go test ./internal/api -run '^(TestLiveValidationAwsS3|TestLiveValidationGcpGcs|TestLiveValidationAzureBlob|TestLiveValidationOciObjectStorage|TestLiveValidationMinioS3Compatible|TestLiveValidationCephS3Compatible)$' -count=1
```

Use [BUCKET_GOVERNANCE.md](BUCKET_GOVERNANCE.md) as the live-provider checklist and [PROVIDER_LIVE_VALIDATION_TEMPLATE.md](release/evidence/PROVIDER_LIVE_VALIDATION_TEMPLATE.md) as the evidence template.

Audit live evidence requirements for the current changed file set:

```bash
python3 scripts/check_release_evidence.py
python3 scripts/check_release_evidence.py --format checklist
python3 scripts/check_release_evidence.py --strict
python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>
```

The strict form exits non-zero when changed files require provider-live or reverse-proxy evidence and no matching release evidence file is present under `docs/release/evidence/`. Matching evidence must include a non-placeholder `S3Desk commit SHA or release tag`; evidence with a blank or placeholder candidate identifier is rejected. Reverse-proxy evidence must record actual `## Checks` results, expected HTTP statuses, and a `Signed proxy URL root` that matches `Expected external base URL`; `## Expected Statuses` examples do not satisfy the evidence requirement by themselves. Add `--require-candidate-id --candidate-id <tag-or-sha>` for the final release-candidate check so omitted candidate IDs fail fast and stale evidence from another tag or commit is rejected. Use `--format json` when automation needs structured `check_status_expectations` and `check_result_expectations` fields.

To summarize the current release blocker set without replacing the full gates, run:

```bash
python3 scripts/check_release_readiness.py --candidate-id <tag-or-sha>
```

This command runs the strict scope/evidence checks and the live-evidence env preflight for missing provider/reverse-proxy scopes. It exits non-zero while live evidence is still missing, and it does not replace `./scripts/check.sh full`, clean-snapshot verification, or browser-lane evidence.

`python3 scripts/check_live_evidence_env.py` reports only set/missing status and treats blank or placeholder environment values as missing, so copied examples such as `...`, `<secret>`, or `replace-me` do not satisfy live evidence preflight.

## Frontend

```bash
cd frontend
npm run lint
npm run test:unit
npm run build
```

Frontend tooling expects Node.js `22.x`.

`npm run lint` also runs the CSS token guard and source import-cycle guard. For a focused import graph check:

```bash
cd frontend
npm run check:import-cycles
```

`check:import-cycles` scans runtime relative `import`/`export` edges under `frontend/src`, excluding tests and type-only imports, and fails on cycles before they can become lazy-boundary or chunk-order regressions.

### Frontend Bundle Budget

Use this when a change can affect chunking, entrypoints, shared vendor splits, or dependency weight.

```bash
cd frontend
npm run bundle:budget
```

Focused contract test for the markdown/report shape:

```bash
cd frontend
npm run check:bundle-report
```

- local equivalent of the `Bundle Budget` job in `Frontend E2E`
- focused contract path for bundle-report wording and action-hint shape: `npm run check:bundle-report`
- artifact in CI: `frontend-bundle-report`
- advisory regression signal, not a default branch-protection replacement for browser lanes or `release-gate`
- `Bundle Budget` and `./scripts/check.sh` both run `npm run check:bundle-report` before the heavier analyze/build path so bundle-report wording and action-hint regressions fail early
- in PR/release evidence, `Bundle Budget:` should normally be `executed` only when frontend entrypoints, chunking, dependencies, or bundle-shape changed; otherwise record it as `not applicable` with a short reason
- in PR/release evidence, `Bundle Budget Contract:` should normally be `executed` only when the bundle manifest, report wording, or CI summary wiring changed; otherwise record it as `not applicable` with a short reason
- the `Frontend E2E` summary now follows the same rule automatically: it shows `Bundle Budget Contract: not applicable (no bundle manifest/report/summary wiring change)` unless that narrower contract scope changed
- the `Frontend E2E` summary now also leaves `Bundle Budget: not applicable (no bundle-affecting runtime change)` when only the narrower contract scope changed
- committed soft-budget defaults live in [bundle-budgets.json](/home/homelab/Downloads/project/s3desk/frontend/scripts/bundle-budgets.json)
- that manifest also carries the short rationale for each page/chunk threshold, so budget changes should update both the number and the explanation together
- routes that are intentionally tighter or looser can also carry per-entry review thresholds in that same manifest, so the report only flags re-baseline candidates when the remaining headroom is actually surprising for that surface
- the generated report now prints actual size, budget usage, remaining headroom, and any re-baseline candidates so reviewers can tell whether a threshold is becoming too tight or too loose
- missing budgeted chunks are treated as budget warnings; `npm run bundle:budget` fails on those warnings so renamed, merged, or accidentally removed lazy boundaries are reviewed deliberately
- when you cite this in a PR or release body, report whether the run ended with `No budget warnings` and `No budget review candidates`, or name the chunk that still needs a re-baseline
- the `Bundle Budget` CI summary now splits `Warnings:` and `Review targets:` into separate evidence lines, each surfacing up to the first two chunks and pointing back to the `frontend-bundle-report` artifact for the full markdown + stats bundle
- the report and CI summary now also surface `Action hints:` so follow-up can distinguish between routes that should shrink first and routes that are better re-baselined if their stable floor has not changed
- current action-hint vocabulary is intentionally small: use `shrink first` for likely regressions and `rebaseline if stable` for routes whose stable floor is already documented
- temporary local experiments can override those values with the matching `BUNDLE_BUDGET_*_KB` environment variables, but the checked-in manifest stays the source of truth

### Browser E2E Lanes

Use the Playwright lane that matches the risk you are trying to cover.

GitHub Actions job summaries in `Frontend E2E` mirror these same lane definitions so reviewers can read the lane purpose directly from the CI UI. That workflow now runs a dedicated `Workflow Lint` job before any browser lane so workflow wiring failures stop early.
Those summaries now use the same evidence labels as the PR/release templates: `Workflow Lint:`, `Bundle Budget:`, `Bundle Budget Contract:`, and `Browser Lanes:`.

Mocked frontend Playwright lanes start a managed Vite server on `http://127.0.0.1:18080` when neither `PLAYWRIGHT_BASE_URL` nor `BASE_URL` is set. The managed server refuses to reuse an already-running process by default so stale local bundles do not silently satisfy a fresh-source run. Set `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` only when intentionally pointing the lane at a matching local Vite server; use `PLAYWRIGHT_WEB_SERVER_PORT=<port>` to move the managed server when `18080` is unavailable.

- `bash ./scripts/check_github_workflows.sh`
  - local equivalent of the `Workflow Lint` job
  - run this for `.github/workflows/**`, `scripts/check_github_workflows.sh`, `scripts/check_github_workflows.py`, `scripts/install_actionlint.sh`, or browser-CI summary wiring changes
- workflow-lint-only changes should normally show `Workflow Lint: executed` while `Browser Lanes:` stays `not applicable (...)`
  - preferred CI wording: `Browser Lanes: smoke + core not applicable (workflow or browser-CI wiring changed, but the browser surface did not)`
- required browser lanes now key off the narrower browser surface (`frontend/src/**`, `frontend/tests/**`, `frontend/public/**`, `frontend/playwright.config.ts`, runtime/build config, API/runtime backend wiring, and live-E2E harness files), so frontend docs or bundle-only tooling changes no longer retrigger Playwright by default

- `npm run test:e2e:smoke`
  - `@check-smoke` only
  - fast boot gates for login/settings bootstrap and objects route boot
  - runs inside `./scripts/check.sh full`
- `npm run test:e2e:core`
  - main desktop/mock regression lane
  - excludes `@check-smoke`, `@mobile-responsive`, `@demo`, `@perf`, and `@visual`
- `npm run test:e2e:visual`
  - dedicated Chromium screenshot-baseline lane for tests tagged `@visual`
  - owns visual-regression specs separately from the core desktop/mock regression lane
- `npm run test:e2e:mobile-responsive`
  - required mobile task-completion lane
  - runs the `mobile-iphone-13` and `mobile-pixel-7` projects
- `npx playwright test tests/dark-theme-accessibility.spec.ts tests/dark-theme-visual-regression.spec.ts --project=chromium`
  - focused dark-theme axe and screenshot lane
  - run this for theme tokens, dark-mode surfaces, overlay contrast, or visual-regression baseline changes
- In PR/release evidence, list browser lanes as separate lines such as `smoke`, `core`, `visual`, and `mobile-responsive`; if a lane did not run, say why it was not applicable.
- `npm run test:e2e:demo`
  - demo-only flow coverage
  - keep this out of the core release signal unless the demo path itself changed
- `npm run test:e2e:perf`
  - opt-in performance probes
  - keep this out of the default local and CI gate unless you are working on perf-sensitive behavior

Geometry and layout guard:

```bash
cd frontend
npm run check:e2e:geometry
```

### Browser E2E Authoring Rules

`npm run check:e2e:geometry` scans `frontend/tests` and `frontend/tests/support` and fails on direct geometry probes such as:

- `boundingBox`
- `getBoundingClientRect`
- `scrollWidth`
- `clientWidth` / `clientHeight`
- `offsetWidth` / `offsetHeight`

Only use the inline `e2e-geometry-allow` escape hatch when a browser test truly needs coordinate math and that contract cannot be pushed into a lower-level unit/component test.

When writing browser E2E:

- prefer task completion, state persistence, routing continuity, and backend/result confirmation over pixel math
- keep new boot-only checks in `@check-smoke`; move them into `core` or `mobile-responsive` only when they prove a broader user task
- do not add Playwright assertions whose main signal is size, stacking order, or viewport-fit geometry

Exact width/height/style assertions should normally live in unit/component tests, not browser E2E. The remaining exact size checks in `frontend/src/components/__tests__/DialogModal.test.tsx` and `frontend/src/components/__tests__/OverlaySheet.test.tsx` are intentional public API passthrough coverage, not visual-polish locks.

Minimal browser smoke:

```bash
cd frontend
npm run test:e2e:smoke
```

This smoke subset currently covers:

- login / settings bootstrap
- objects route boot and basic toolbar behavior

Core mock regression lane:

```bash
cd frontend
npm run test:e2e:core
```

Required mobile task-completion lane:

```bash
cd frontend
npm run test:e2e:mobile-responsive
```

### Playwright Authoring Rules

Run the E2E geometry guard whenever you add or rewrite Playwright coverage:

```bash
cd frontend
npm run check:e2e:geometry
```

The guard also runs in:

- `./scripts/check.sh`
- `Frontend E2E` GitHub Actions before `check-smoke` and `core`

Avoid geometry-driven assertions in `frontend/tests` and `frontend/tests/support`.
Prefer proving task completion or stable UI state instead of measuring layout.

Blocked by default:

- `boundingBox`
- `getBoundingClientRect`
- `scrollWidth`
- `clientWidth` / `clientHeight`
- `offsetWidth` / `offsetHeight`

If a Playwright test genuinely cannot avoid one of these probes, add an inline `e2e-geometry-allow` marker with a short reason. Treat that as a last resort, not the default path.

### Shared UI Test Rules

Shared component and hook tests should also avoid cosmetic style locks unless the style is itself the public API.

Keep exact size/style assertions only when they prove an intentional contract, for example:

- [DialogModal width passthrough](/home/homelab/Downloads/project/s3desk/frontend/src/components/__tests__/DialogModal.test.tsx)
- [OverlaySheet size passthrough](/home/homelab/Downloads/project/s3desk/frontend/src/components/__tests__/OverlaySheet.test.tsx)

Do not add exact spacing, hover, or breakpoint numbers to unit tests when the behavior can be expressed as focus, open/close, enable/disable, or successful task completion.

### Reviewer Quick Check

When reviewing browser-surface changes, verify the lane matches the risk:

- frontend bundle-shape changes should normally show `npm run bundle:budget` or the `Bundle Budget` job in CI
- workflow or browser-CI wiring changes should normally show `bash ./scripts/check_github_workflows.sh` and the `Workflow Lint` job in CI
- workflow-lint-only changes should not by themselves imply `smoke`, `core`, or `mobile-responsive`
- boot, login/settings bootstrap, or route-entry changes should normally show `npm run test:e2e:smoke`
- desktop regression coverage should normally show `npm run test:e2e:core`
- visual-regression baseline changes should normally show `npm run test:e2e:visual`
- mobile layout, drawer, sheet, card, tab, or touch interaction changes should normally show `npm run test:e2e:mobile-responsive`
- dark-mode token, contrast, overlay, or screenshot-baseline changes should normally show the focused dark-theme Playwright command
- the current required workflow does not split a narrower mobile-only runtime scope, so once the browser surface is in scope the `Mobile Responsive E2E (Required)` lane normally materializes too
- new or rewritten Playwright coverage should normally show `npm run check:e2e:geometry`

When reviewing the tests themselves, prefer these questions:

- does the browser test prove a real task can complete?
- does the assertion rely on stable UI state instead of raw geometry?
- if a unit test keeps an exact size assertion, is it covering an intentional public API passthrough such as `DialogModal` or `OverlaySheet`?

## Release Gate

Use [RELEASE_GATE.md](RELEASE_GATE.md) when deciding whether a build is releasable. Provider-facing changes are not release-ready without the required live validation evidence.

Use this focused check when you only need the release-doc/changelog subset locally.

```bash
./scripts/check_release_gate.sh
```

GitHub Actions runs the `Release Gate` workflow as the full `./scripts/check.sh` pass so pull requests exercise the same repository gate used for local verification. The standalone `./scripts/check_release_gate.sh` command remains available for the release-doc/changelog subset.

`./scripts/check_release_gate.sh` also runs `python3 scripts/check_go_toolchain.py`, which keeps the Go `1.25.9` declarations aligned across `backend/go.mod`, `Containerfile`, GitHub Actions, and GitLab CI.

When the release scope is already selected and you need a concise blocker summary, use `python3 scripts/check_release_readiness.py --candidate-id <tag-or-sha>`. It is expected to fail until strict release evidence passes.

## Helm Chart

Run the local Helm render and lint validation with:

```bash
./scripts/check_helm_chart.sh
```

This covers:

- default chart lint/render
- hardened CI values render
- Postgres values render
- Istio/browser-facing render
- NetworkPolicy render
- ServiceMonitor and PodMonitor render
- numeric and string `backup.restoreMaxBytes` overrides
- release-tag to chart-semver conversion helpers

## OpenAPI Schema Workflow

Edit [openapi.yml](/home/homelab/Downloads/project/s3desk/openapi.yml), not the generated frontend schema file.

```bash
cd frontend
npm run gen:openapi
npm run check:openapi
```

`npm run check:openapi` fails when [src/api/openapi.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/openapi.ts) no longer matches [openapi.yml](/home/homelab/Downloads/project/s3desk/openapi.yml).

## API / Provider E2E

```bash
./scripts/compose.sh e2e up -d --build
./scripts/compose.sh e2e run --rm runner
```

## Portable Migration Smoke

These are the concrete portable backup/import validation paths.

```bash
./scripts/run_portable_sqlite_to_postgres_smoke.sh
./scripts/run_portable_postgres_to_sqlite_smoke.sh
```

The portable smoke stack verifies:

- source fixture creation through the public API on either sqlite or postgres
- portable backup export from the configured source backend
- preview and import on the configured target backend
- imported `profiles`, `profile_connection_options`, `jobs`, `upload_sessions`, `upload_multipart_uploads`, `object_favorites`, and `object_index`
- thumbnail asset copy into the target `DATA_DIR`
- incomplete multipart metadata stays incomplete after import and still rejects `commit`

Run the same smoke against encrypted, password-protected portable bundles:

```bash
PORTABLE_BUNDLE_CONFIDENTIALITY=encrypted \
PORTABLE_BUNDLE_PASSWORD=operator-secret \
./scripts/run_portable_sqlite_to_postgres_smoke.sh

PORTABLE_BUNDLE_CONFIDENTIALITY=encrypted \
PORTABLE_BUNDLE_PASSWORD=operator-secret \
./scripts/run_portable_postgres_to_sqlite_smoke.sh
```

Failure-path validation is covered by:

```bash
./scripts/run_portable_failure_smoke.sh
./scripts/run_portable_postgres_to_sqlite_failure_smoke.sh
```

These scripts verify:

- wrong password on encrypted/password-protected portable bundles
- destination `ENCRYPTION_KEY` mismatch against the bundle fingerprint
- missing destination `ENCRYPTION_KEY` preflight blockers
- partial thumbnail asset copy warnings after successful database import

## Reverse Proxy Smoke

Use this minimal pass when auth, realtime transport, `download-proxy`, `EXTERNAL_BASE_URL`, or `ALLOWED_HOSTS` changes.

Check required reverse-proxy smoke variables without printing secret values:

```bash
python3 scripts/check_live_evidence_env.py --scope reverse-proxy
```

With the built-in Caddy stack:

```bash
podman run -d --rm \
  --name s3desk-caddy-smoke \
  --network host \
  --security-opt label=disable \
  -v "$PWD/scripts/Caddyfile:/etc/caddy/Caddyfile:ro" \
  docker.io/library/caddy:2.8.4

curl -k https://localhost:8443/healthz
curl -k -H "X-Api-Token: <token>" https://localhost:8443/api/v1/meta
curl -k -X POST -H "X-Api-Token: <token>" "https://localhost:8443/api/v1/realtime-ticket?transport=ws"
curl -k -H "X-Api-Token: <token>" -H "X-Profile-Id: <profile-id>" \
  "https://localhost:8443/api/v1/buckets/<bucket>/objects/download-url?key=<key>&proxy=true"
```

Expected result:

- `healthz` returns `200`
- `/api/v1/meta` returns `200`
- `/api/v1/realtime-ticket` returns `201`
- proxied download URL returns `200` and is rooted at the expected external base URL

## UI E2E

```bash
cd frontend
E2E_LIVE=1 E2E_API_TOKEN=change-me npm run test:e2e
```

Use `docs/ci/e2e_live.env.example` as the starting point for live Playwright environment variables.
Use `docs/ci/provider_live_validation.env.example` as the starting point for backend live-provider smoke variables.

For a local capture bundle with video, trace, screenshots, and an HTML report:

```bash
cd frontend
npm run test:e2e:capture
```

The capture bundle is written under `frontend/recordings/<run-id>/`.

To record the nightly live suite with the same artifact set:

```bash
PLAYWRIGHT_RECORD_ARTIFACTS=1 LIVE_E2E_SUITE=critical ./scripts/run_live_e2e_local.sh
```

### Nightly Live UI Flows

Nightly CI and local migration smoke checks currently run these browser flows:

- `tests/api-crud.spec.ts`
- `tests/objects-live-flow.spec.ts`
- `tests/jobs-live-flow.spec.ts`
- `tests/transfers-live-fallback.spec.ts`
- `tests/bucket-policy-live.spec.ts`
- `tests/docs-smoke.spec.ts`
- `tests/server-migration-live.spec.ts`
- `tests/uploads-folder-live.spec.ts`
- `tests/objects-image-preview-live.spec.ts`

Run the nightly live suite locally with:

```bash
LIVE_E2E_SUITE=critical ./scripts/run_live_e2e_local.sh
```
