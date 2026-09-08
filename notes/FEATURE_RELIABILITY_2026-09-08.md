# Feature reliability audit — 2026-09-08

Objective: find unstable functionality and improve overall project completeness.
Baseline: `b530346` on `main`, clean worktree at audit start. This audit completed local implementation and cumulative verification; the
earlier optimization report is historical evidence.

Rounds 1–5 describe the earlier 14-file reliability snapshot. Additional
settings recovery changes and verification before publication are recorded
at the end; the earlier cumulative results do not cover those later changes.

## Round 1: bucket governance completion

### Confirmed defects and fixes

1. Saving governance settings and leaving the original modal skipped cache
   invalidation after a successful provider response. The shared mutation hook
   incorrectly applied its screen-lifetime guard to cache maintenance as well.
   Four component regressions (AWS, GCS, Azure, OCI) failed before the fix with
   zero invalidations. Cache maintenance now runs in `finally`, while stale
   messages and screen callbacks remain suppressed. GCS/Azure also invalidate
   the original linked policy cache; the newly selected scope is untouched.
2. OCI sharing creation URLs disappeared immediately after the refreshed
   governance inventory arrived. The backend returns `accessUri` on creation;
   the subsequent inventory does not supply that creation-only value. The
   governance-derived component key remounted the state containing the URL.
   A component regression failed after observing the refreshed cache and the
   updated existing-PAR form. Created URLs now belong to the open OCI bucket
   component, outside the draft subtree that is reset on inventory refresh.
   Closing the modal or switching profile removes these in-memory URLs.

### Validation

- Focused Vitest: governance modal and mutation scope, 3 files / 21 tests passed.
- `npm run build`: passed after correcting a test-only QueryKey annotation.
- `npm run lint`: passed.
- `npm run check:e2e:geometry`: passed.
- Production preview on 127.0.0.1:18219, mock Chromium governance browser suite:
  3 passed. OCI test fills a new PAR, submits the exact payload, waits for the
  refreshed existing-PAR form, verifies the URL remains visible, closes/reopens,
  and verifies the URL is no longer retained.
- Bucket mobile suite: 20 passed on Chromium iPhone/Pixel emulation.
- `npm run test:unit -- --maxWorkers=4`: 254 files / 1,211 tests passed
  (152.49 seconds, exit 0).
- `git diff --check`: passed.

Logs: `/tmp/s3desk-governance-{unit,build,lint,browser,mobile}.log`,
`/tmp/s3desk-governance-par-before.log`,
`/tmp/s3desk-reliability-unit-all.log`.

### Remaining audit

The overall goal is not complete. Next candidates require reproduction before
changes: Jobs log truncation/offset reset and partial-line reconstruction;
transfer cancellation/retry/download completion; policy editor validation and
save lifetime; provider/API failure recovery and partial-success behavior.
The log HTTP service resets an offset beyond the current file size, while the
UI returns early on an empty response before replacing displayed entries.
This is a source-level candidate, not yet a confirmed regression.

The preview logged four unmatched background proxy requests (two realtime
tickets, one object listing, one favorites listing) with local port 8080
connection refusal. This does not prove complete background fixture coverage.
The owned preview was stopped after the browser suites finished.

Evidence covers local UI contracts and mocked responses, not real provider
behavior, deployments, physical mobile devices, or release readiness. No
backend source, OpenAPI, dependencies, deployment, or publication changed in
this round.


## Round 2: Jobs log truncation

The backend log reader resets an offset beyond the file length. When the new
file was empty or contained only an incomplete line, the UI updated its offset
but returned before clearing the old entries. This left stale content on screen;
when a later chunk completed the replacement line it could be appended to old
content. Two focused regressions failed with `old line` still displayed.

The reset branch now clears that job's displayed entries immediately. It keeps
the existing partial-line buffer and line-number reset behavior. Both empty and
partial replacement cases verify the resumed offset and new line number 1.
Two old profile/token-isolation fixtures returned offset 0 after an 11-byte
fresh tail; those fixtures now return the actual unchanged offset 11, so they
exercise scope isolation without simulating an unrelated file truncation.

Validation:
- `npm run test:unit -- src/pages/jobs/__tests__/useJobsLogsState.test.tsx`:
  15 passed; two new regressions failed before the one-line source fix.
- `npm run build`, `npm run lint`, `npm run check:e2e:geometry`: passed.
- Production preview 18220, `jobs-realtime-overlays.spec.ts`: 5 passed. The new
  browser case displays old content, truncates its mocked file, waits for the
  old entry to disappear, appends replacement content, and verifies only the
  new entry remains. The shared fixture now implements offset reads instead
  of always returning the old offset.
- No full repository/backend gate was run for this frontend-only round. The
  1,211-test full frontend result above predates this additional fix.

Logs: `/tmp/s3desk-logs-reset-before.log`,
`/tmp/s3desk-logs-{build,lint,browser}.log`.

Next: reproduce download cancel/retry overlap using the real task-actions and
queue hooks together. Cancellation marks a task finished immediately, while
its older asynchronous catch/finally can still mutate the same task ID and
remove abort/estimator entries. Device permission or writer promises are a
candidate delay boundary; this has been traced but not yet reproduced.


## Round 3: download cancel/retry attempt isolation

The real download task-actions and queue hooks reproduced a late canceled
presign setting a newer running retry back to canceled and deleting its abort
handle. Three more parameterized regressions (object, job artifact, device
writer boundary) reproduced the old progress callback applying 99 bytes to the
new attempt, which had downloaded zero bytes. The former source failed all
three regressions; the working copy was restored before validation.

The queue now uses its existing per-attempt estimator identity to reject old
progress/completion/error callbacks and to clean up only its own resources.
Async task updates apply only to running tasks, preserving queued retries.
The cancellation signal is checked before saving a blob or reporting success;
artifact aborts now mark that signal as well. No new registry or dependencies.
The device unit test injects a delayed writer boundary; it is not real-device
or File System Access permission evidence.

Validation:
- Focused queue/actions: 13 tests passed.
- `npm run test:unit -- src/components/transfers --maxWorkers=4`: 27 files /
  131 tests passed.
- `npm run build`, `npm run lint`: passed. ESLint was additionally run for the
  subsequently added artifact browser case; geometry guard passed.
- Production preview 18221: artifact, drawer-actions, and presigned browser
  suites, 13 passed. The added browser case cancels a pending artifact request,
  retries, waits for Done, reads the downloaded file, and verifies both the new
  filename and the exact replacement response bytes.
- `git diff --check`: passed. No backend/full repository gate in this round.

Logs: `/tmp/s3desk-download-retry-before.log`,
`/tmp/s3desk-download-attempts-before.log`,
`/tmp/s3desk-download-retry-unit.log`, `/tmp/s3desk-transfers-unit.log`,
`/tmp/s3desk-download-{build,lint,browser}.log`.

The broader audit remains active. Remaining areas include policy editing and
validation lifecycle, log partial-line reconstruction, provider partial-write
recovery, and final cumulative repository/browser validation. Current round
results do not replace cumulative validation or live-provider proof.


## Round 4: policy validation and partial provider failures

### Policy validation tied to the draft

Raw policy input remains editable while provider validation is pending. Both
success and error responses from the old draft were displayed after editing.
Two component regressions failed before the change. The mutation hook now
invalidates validation request tokens and clears prior validation state whenever
the effective draft changes, covering both JSON and structured text sources.
A late response cannot label the replacement draft as validated.

### Refresh after unsuccessful governance writes

The OCI adapter applies existing retention rules sequentially and only rolls
back newly created rules. Azure likewise performs multiple writes with bounded
compensation. An error does not establish that no provider state changed.
The UI previously skipped refresh on errors, leaving the submitted draft in
place even if only one rule had actually changed. An OCI component fixture with
two rules reproduced that stale view after the second update failed.

Governance cache maintenance now runs in `onSettled` for both success and
failure. Screen feedback still respects the original request's lifetime; cache
refresh still addresses the original profile/bucket/token. The regression
checks that the successful rule remains at 60 days and the unsuccessful rule
returns to its actual 45 days instead of retaining the unsaved 90-day draft.
This is UI reconciliation, not a claim of provider-wide atomicity or rollback.

Validation:
- Policy and governance component suites: 39 passed.
- Final policy callback regression after the dependency-lint correction: 2
  passed, 17 intentionally excluded by the test-name filter.
- `GOTOOLCHAIN=auto go test ./internal/bucketgov -run 'Test(OCI|Azure)Adapter' -count=1`:
  passed. These use injected adapter callbacks and are not live provider tests.
- Build, lint, browser geometry guard, and `git diff --check`: passed.
- Production preview 18222, governance browser suite: 4 passed. The new test
  holds the first validation response, edits the raw draft, releases it,
  verifies no old validation success, validates again, and checks the exact
  second request body and visible success. A first browser attempt used an
  incorrect menu label; the final test uses the observed `Policy editor` label.
- The owned preview was stopped after browser completion.

Logs: `/tmp/s3desk-policy-validation-before.log`,
`/tmp/s3desk-governance-partial-before.log`,
`/tmp/s3desk-policy-governance-unit.log`,
`/tmp/s3desk-policy-validation-focused.log`,
`/tmp/s3desk-provider-recovery-tests.log`,
`/tmp/s3desk-policy-{build,lint,browser}.log`.

Remaining before closure: inspect and reproduce the initial log-tail partial
line boundary, then perform cumulative repository/browser validation and audit
the final changes against this reliability objective. No commit/push or
external provider mutation has occurred during this audit.


## Round 5: initial log fragments and cumulative audit

The initial tail parser treated its unfinished final line as complete and
cleared the remainder. Subsequent polling buffered only the new fragment,
so `pending ` followed by `line` did not become `pending line` in the UI.
The focused regression failed before the change.

Initial and incremental reads now share one parser. It retains the unfinished
suffix, displays it at its current source line number, and replaces that line
as additional bytes arrive. Completed preceding lines remain intact and the
existing line limit is enforced. This also makes an incomplete replacement
line visible immediately after truncation, while old lines remain removed.
The old duplicate parser and line counter were deleted.

- Jobs log hook: 16 tests passed, including truncation, scope cancellation,
  partial extension, completion, line-number continuity, and the two-line cap.
- New browser case covers the same initial/partial/completed sequence through
  the actual logs drawer; it is included in the forthcoming Core run.
- Reproduction log: `/tmp/s3desk-logs-partial-before.log`.

### Completion requirements and evidence to verify

| Requirement from the reliability objective | Authoritative evidence |
| --- | --- |
| Identify actual unstable workflows | Before-fix failures recorded in rounds 1–5; current owner/caller traces |
| Keep settings consistent after navigation or partial provider failure | Four provider scope regressions; two-rule partial-failure component case; linked-cache assertions |
| Keep generated OCI links usable after refresh without retaining across scopes | Refreshed-inventory component case; creation/reopen browser workflow |
| Preserve download retries against older attempts | Actual queue/actions integration; old progress/completion tests for all three download kinds; artifact download bytes in browser |
| Tie validation results to the draft that was validated | Delayed success/error component cases; second-request body and visible validation in browser |
| Display correct logs during truncation and partial writes | Hook line/offset assertions; two browser log transition cases |
| Avoid cumulative regressions | Current full repository gate, bundle budget, Core, mobile, visual, and perf lanes; final results recorded below |
| Preserve repository and evidence boundaries | No unrelated baseline changes; no API/dependency/backend mutation; no external publication or deployment |

Validation source snapshot: `/tmp/s3desk-reliability-validated-files.json`
(SHA-256 of the 14 changed tracked files). Recheck this against the final tree
before claiming that the cumulative runs cover it. The audit report itself is
not part of that source snapshot.


### Cumulative results (round 5 snapshot)

- `GOTOOLCHAIN=auto CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18223 ./scripts/check.sh full`:
  passed, exit 0. Frontend 254 files / 1,221 tests, lint, build, OpenAPI,
  workflow/Helm checks, Go packages/vet/security, 2 Chromium smoke tests, and
  reproducible third-party notices. Backend packages used valid Go test cache;
  the focused provider adapter tests in round 4 were explicitly uncached.
- Security: affected call paths 0; 3 vulnerabilities in imported packages are
  reported as uncalled. This is not a claim of zero dependency advisories.
- `npm run bundle:budget`: passed, no circular-chunk/budget warnings. Initial
  JS gzip 164.4/170 KiB, Objects 68.6/72, Profiles 13.8/15.5, Transfers
  13.6/14.5. The existing Transfers 0.9 KiB headroom review hint remains.
- Visual: 35 passed with no snapshot changes, 59.9 seconds.

Browser lanes use `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18224`,
a shared production analysis build, separate artifact directories, and
`--reporter=list,json`. Core runs with 3 workers, mobile with 2, visual with
1. Performance ran alone with 1 worker after these lanes completed.
Full logs: `/tmp/s3desk-reliability-final-full.log`,
`/tmp/s3desk-reliability-final-bundle.log`.
Browser logs/reports: `/tmp/s3desk-reliability-final-{core,mobile,visual,perf}.{log,json}`.


### Final completion audit

All completion-table items above are supported by current evidence. The final
14 tracked source/test files match the SHA-256 snapshot taken before cumulative
validation. `git diff --check` passes; no snapshot images, API schema, generated
client, dependencies, backend source, or unrelated files changed. The additional
untracked file is this report. HEAD remains `b530346`; changes are local and
uncommitted.

| Current browser lane | Passed | Skipped | Unexpected / flaky / runner errors |
| --- | ---: | ---: | --- |
| Core | 182 | 15 | 0 / 0 / 0 |
| Mobile | 126 | 0 | 0 / 0 / 0 |
| Visual | 35 | 0 | 0 / 0 / 0 |
| Performance | 4 | 0 | 0 / 0 / 0 |

All 15 skips explicitly require `E2E_LIVE=1`; none is counted as passed.
Performance annotations in this single local mock run: Jobs render 619 ms,
filter 103 ms, logs drawer 104 ms, Objects render 706 ms. These pass the
checked-in budgets; they are not before/after improvement or production p95.

The preview logged 29 unmatched background requests with connection refusal
at local port 8080: 21 realtime tickets, 3 object lists, 2 favorites, 2 thumbnails,
and 1 search. No other preview error type was observed. The passing browser
results establish the asserted workflows, not complete background mocking or
a functioning external backend. The owned preview was stopped and port 18224
was verified closed.

Seven reproduced defect classes were corrected: governance cache completion
after leaving a screen; creation-only OCI URL loss; stale truncated logs;
download retry contamination by older attempts; old-draft provider validation;
missing reconciliation after partially applied governance writes; and broken
initial log-fragment continuation. Each has a failing-before regression and
passing owner evidence. The cumulative full, bundle, Core, mobile, visual, and
performance gates passed with the final tracked files unchanged.

This completes the requested code reliability improvement and local regression
verification. Real providers, deployed proxies, physical devices, and release
readiness were not verified or claimed; no deployment or publication was
performed. No confirmed defect from this audit remains unresolved.

## Settings recovery and pre-publication verification

Bucket controls and policy dialogs now offer Retry after a failed initial
read. A failed background refresh retains cached content and the mounted
editor, showing a warning instead of discarding the unsaved draft. Successful
retry against the same saved state preserves the draft. Governance inventory
changes still reset provider controls through their existing draft key.

Four component regressions cover initial retry and draft retention for both
dialogs. Browser coverage retries both dialogs without reopening and follows
an edited policy through a failed reconnect refresh, retry, and Save, checking
the exact saved policy body.

Verification for the 20 changed source/test files before publication:

- `npm run test:unit -- src/pages/buckets/__tests__/BucketGovernanceModal.test.tsx src/pages/buckets/__tests__/BucketPolicyModal.test.tsx src/pages/jobs/__tests__/useJobsLogsState.test.tsx src/components/transfers/__tests__/useTransfersDownloadQueue.test.tsx --maxWorkers=4`: 69 passed.
- `npm run lint`, `npm run build`, `npm run check:e2e:geometry`: passed.
  The final browser fixture edit also passed focused ESLint.
- Mock Chromium against production preview port 18225: governance 7 passed,
  Jobs realtime/logs 6 passed, artifact downloads 5 passed.
- Initial browser execution exposed nested transport/query retries exceeding
  the fixture timeout. The fixture now uses the existing `apiRetryCount: 0`
  setting; query retries remain active and application defaults are unchanged.
- One artifact case received HTTP 404 for `/jobs` during the concurrent build.
  After build completion, its full five-test suite passed without code changes.
- The broad full gate, bundle, mobile, visual, and performance lanes above
  were not rerun for the additional settings recovery changes. These focused
  results do not establish live-provider, deployment, or real-device behavior.

Logs: `/tmp/s3desk-publish-{unit,lint,build,browser,recovery-browser,artifact-browser}.log`.
