# Functional completeness — 2026-09-08

Objective: identify incomplete user workflows and improve their completion and
recovery. The earlier reliability audit is recorded separately in
[FEATURE_RELIABILITY_2026-09-08.md](FEATURE_RELIABILITY_2026-09-08.md).
This follow-up is based on published `a2d930b`.

## Completed workflows

| Finding | Result | Direct evidence |
| --- | --- | --- |
| Failed bucket settings reads required closing and reopening; background errors removed edited forms | Controls and policy dialogs offer Retry and retain the editor and draft after refresh failure | Four component cases and three browser cases, already included in `a2d930b` |
| A later OCI sharing save discarded URLs created earlier in the same open dialog | Match returned PAR IDs to previously captured URLs, retain active links, and discard links absent from the successful save response | The resave component assertion failed before the fix; browser cases create twice, resave, copy both exact URLs, delete one, and close/reopen at 1280px and 390px |
| Retrying a failed job created a new ID hidden by the failed filter, leaving only a transient notification | Open the existing details drawer for the new job and preserve list filters | Before-fix browser case had no details dialog; final cases open the queued result, refresh it to succeeded, and verify the retained failed filter at 1280px and 390px |

The retry-result callback runs only while the requesting screen, profile,
authentication scope, and request remain current. Unit checks cover scope
changes and unmounts while a retry is pending; cache invalidation still updates
the original job scope.

OCI URLs remain in the current dialog's memory. Existing copy controls are
reused; no URL persistence, backend/API changes, or dependencies were added.
Existing object metadata/preview retry and Jobs log download were inspected
and already provide their recovery/export actions, so no duplicate feature
was added.

## Round 1 verification: bucket sharing and job retry

- Focused component/hook tests: 4 files / 30 passed.
- Production build and lint: passed. A test fixture needed explicit provider
  and bucket fields to satisfy its API response type.
- Focused production-preview Chromium workflows: 11 passed, including both
  wide and narrow layouts. The first job-status refresh test used an incorrect
  exact accessible name; the corrected selector matches the rendered button.
- The preview reported one unmatched background realtime-ticket request to
  local port 8080. Workflow assertions do not establish complete API mocking.
- `GOTOOLCHAIN=auto CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18227 ./scripts/check.sh full`:
  passed, exit 0. Frontend 254 files / 1,227 tests, build, lint, geometry,
  OpenAPI, workflow and Helm checks, Go tests/vet/security, 2 browser smoke
  cases, and third-party notice reproducibility passed. Go package tests used
  valid cache. Security analysis reported zero affected call paths and three
  advisories in imported packages that do not appear to be called.
- `npm run bundle:budget`: passed. Initial JS gzip 164.4/170 KiB; no budget
  warnings or circular chunks.
- Final Core: 188 passed / 15 skipped, 167.4 seconds. All skips explicitly
  require `E2E_LIVE=1`; none is counted as passed.
- Final mobile: 126 passed, 107.5 seconds, Chromium iPhone/Pixel emulation.
  Both JSON reports contain zero unexpected results, flaky results, or runner
  errors. The focused wide/narrow cases are included in Core, not added again
  to this count.
- These browser lanes use the final production analysis build at local port
  18228, `E2E_LIVE=0`, separate artifact directories, and 3 and 2 workers.
  The preview logged 18 unmatched background proxy requests (9 realtime
  tickets, 3 object lists, 2 favorites, 2 thumbnails, 2 searches), all refused
  at local port 8080. No other preview error type was observed. Assertions
  establish the tested workflows, not complete backend availability.
- Visual snapshots and performance lanes were not rerun; no snapshot, CSS,
  dependency, API schema, or backend source changed in this follow-up.

Logs: `/tmp/s3desk-completeness-{oci-resave-before,retry-result-before,job-result-browser-before,followup-unit,followup-build,followup-lint,workflows-browser}.log`.
Final source snapshot: `/tmp/s3desk-completeness-final-snapshot.json` (base SHA
and hashes for the nine changed tracked source/test files).
Final logs: `/tmp/s3desk-completeness-final-{full,bundle,core,mobile,preview}.log`;
Core/mobile also have JSON reports with the same basename.

## Round 1 completion audit

The three identified workflow gaps have direct passing assertions, including
draft preservation through Save, exact clipboard contents after repeated
sharing writes, removal and scope cleanup, and retried-job status through
completion while preserving filters. The full local gate and broader browser
lanes validate the round 1 implementation. The base commit and all
nine source/test hashes still match the snapshot taken before these gates.

Round 1 was verified as nine uncommitted source/test changes on `a2d930b`.
Owned preview processes were stopped after verification.

These are local tests and mocked provider responses. Real providers,
deployments, and physical devices are outside this implementation verification.


## Round 2: upload recovery

- Restoring a mixed-size upload used the chunk-resume file list as the full
  selection. That list contains only chunked files, so smaller files were
  silently omitted when the old session expired and a fresh session started.
  The browser reproduction reached Done but submitted one file / five bytes
  from the original two files / nine bytes. Retry now uses the persisted full
  path list, retaining the resume list as a fallback for older history.
  Selecting an incomplete folder reports the missing files.
- A canceled upload's late progress callback could use the estimator belonging
  to a newer retry. The shared attempt owner now captures its estimator and
  ignores progress after cancellation or estimator replacement. Direct,
  staging, and presigned unit cases each failed before this guard.
- `npm run test:unit -- src/components/transfers --maxWorkers=4`: 27 files /
  136 tests passed after both fixes, including the five added regression cases.

Before-fix logs: `/tmp/s3desk-upload-mixed-retry-before.log`,
`/tmp/s3desk-upload-mixed-browser-before.log`, and
`/tmp/s3desk-upload-progress-before.log`.
Focused passing log: `/tmp/s3desk-upload-recovery-unit.log`.
The browser reproduction uses mocked session expiry, a seeded persisted task,
and a real Chromium file chooser with small local fixtures; it does not prove
provider-side chunk storage or large-file integrity.


## Round 2 publication verification

- `GOTOOLCHAIN=auto CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 ./scripts/check.sh fast`:
  exit 0; 254 frontend test files / 1,232 tests, lint, production build,
  OpenAPI, geometry, workflow, Helm, Go tests/vet, bundle-report contract,
  and third-party notice reproducibility passed. Backend package tests used
  valid cache. This fast gate excludes backend security and browser smoke.
- Against that production build at `http://127.0.0.1:18230`,
  `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18230 npm run test:e2e -- tests/uploads-folder.spec.ts tests/transfers-drawer-actions.spec.ts tests/transfers-presigned.spec.ts tests/transfers-progress.spec.ts tests/transfers-scenarios.spec.ts tests/transfers-job-artifact.spec.ts tests/bucket-governance.spec.ts tests/jobs-flow.spec.ts --project=chromium --workers=3 --reporter=list,json`:
  29 passed in 40.9 seconds; zero skipped, unexpected, flaky, or runner errors.
  The restored upload now commits both original paths and all nine fixture
  bytes before reaching Done. Bucket sharing and job retry also pass at wide
  and narrow viewports in this run.
- The preview logged two unmatched background realtime-ticket requests,
  refused at local port 8080; no other preview error type was observed.
  The owned preview was stopped after verification.
- All 14 tracked source/test file hashes match the snapshot taken before the
  fast gate. The nine round 1 hashes are unchanged. `git diff --check` passed.
- Full/Core/mobile/bundle results above belong to the round 1 snapshot.
  Round 2 did not rerun full, complete Core, mobile device emulation, visual,
  performance, or bundle-budget lanes; its five added files change upload
  recovery logic and tests, without changing layout, entrypoints, chunking,
  dependencies, API schemas, or backend code. Provider, deployed runtime,
  and physical-device verification were not run.

Snapshot: `/tmp/s3desk-publish-completeness-snapshot.json`.
Logs: `/tmp/s3desk-publish-completeness-{fast,browser,preview}.log`.
Browser JSON: `/tmp/s3desk-publish-completeness-browser.json`.


## Round 3: follow object jobs through completion

Base: published `b3c0590`, with a clean worktree at the start of this round.
The previous round made progress through verified fixes and publication.

Object copy jobs exposed only a transient ID. Other object actions offered
Open Jobs but opened the list without selecting the job. Existing filters
could hide that new job. A mobile move reproduction clicked Open Jobs and
failed because no Job Details dialog appeared.

- Copy and background delete reuse the existing job-start notification with
  an Open Jobs action. The replaced text-only helpers have no callers and
  were removed.
- Every object job notification now supplies its job ID and originating
  profile to the existing Jobs route: object/folder copy and move, selection
  move, rename, clipboard paste, drag/drop, ZIP, deletion, and indexing.
- The existing route selects that profile and opens the job details without
  changing Jobs filters. The mobile flow switches profiles after submitting,
  opens the original job, explicitly refreshes queued to succeeded, checks
  the request's profile header, and verifies the original failed filter.
- Existing request/session guards remain in place. Unit assertions check
  that stale copy/delete requests emit neither a text-only success nor an
  actionable notification. A drag/drop unit case clicks the rendered action
  and checks the actual router location and state.

The pre-fix browser failure is recorded at
`/tmp/s3desk-object-job-before.log`. Focused hook tests passed (8 files / 89
cases), and the additional drag/drop navigation assertion passed (4 existing
cases in its file). The initial focused browser run passed 14 cases; six
folder copy/move/rename/ZIP/delete/index flows also passed. These overlapping
focused counts are not added to the final regression total below.

Fixture corrections matched native folder menus, accessible textbox names,
the index-summary response contract, and profile-scoped filter storage.
The new job initially renders from cache; an explicit Refresh establishes
which profile the API request uses. No production change was made to bypass
these checks. Focused artifacts use local mock APIs and Chromium, including
390px viewport rendering; they are not live provider or physical-device proof.


### Round 3 final verification

The shared job-feedback helper is now used directly by clipboard, copy, and
background delete actions. Its formerly deferred clipboard import no longer
created a separate chunk; removing that redundant path eliminated the mixed
static/dynamic import warning. Clipboard's seven cases passed after cleanup.

- `GOTOOLCHAIN=auto CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 ./scripts/check.sh fast`:
  final run exited 0; 254 frontend files / 1,232 tests, lint, build, OpenAPI,
  geometry, workflow, Helm, Go tests/vet, bundle-report contract, and notice
  reproducibility passed. Backend package tests used valid cache.
- `npm run bundle:budget`: final run exited 0. Initial JS gzip remains
  164.4 KiB under the 170 KiB budget. ObjectsPage gzip is 69.0 KiB.
  The mixed-import warning is absent from the final production build.

Final logs: `/tmp/s3desk-object-job-final-fast-2.log` and
`/tmp/s3desk-object-job-final-bundle-2.log`.
Final source/test snapshot: `/tmp/s3desk-object-job-final-snapshot.json`.

- Final Core command:
  `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18233 npm run test:e2e:core -- --project=chromium --workers=3 --reporter=list,json`.
  Exit 0; 195 passed / 15 skipped in 165.4 seconds. All skips require
  `E2E_LIVE=1`. JSON reports zero unexpected results, flaky results, or runner
  errors. This includes all six folder-action navigation cases and the
  mobile profile-switch / completion / filter-preservation flow.
- The final production analysis build served these tests without rebuilding
  during the run. The preview logged seven unmatched background requests
  refused at local port 8080: six realtime tickets and one object list. No
  other preview error type was observed.
- All 17 source/test hashes and the base commit match the final snapshot.
  `git diff --check` passed. All three owned preview ports (18231–18233) were
  confirmed closed after verification.
- The fast gate excludes backend security analysis. Full, dedicated mobile
  device-emulation, visual, performance, live-provider, deployment, and
  physical-device lanes were not rerun in this round. The wide and 390px
  browser cases establish the local mocked navigation contract only.

Core log/JSON: `/tmp/s3desk-object-job-final-core.{log,json}`.
Preview log: `/tmp/s3desk-object-job-final-preview.log`.
Browser artifacts: `/tmp/s3desk-object-job-final-core-artifacts/`.

Round 3 completion audit: the reproduced missing-detail behavior is corrected;
copy and background delete expose the same actionable result path; job links
retain the source profile; the mobile workflow follows the job to completion
without changing its saved filter; stale-request and drag/drop navigation
checks pass. The maintained state-boundary document describes this ownership.
This round remains a local, uncommitted change on `b3c0590`.
