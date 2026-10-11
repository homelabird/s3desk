# React and Go pattern audit — 2026-10-11

This records the local audit and repairs in the working tree on this date. The
maintained implementation, owner tests, and `scripts/check.sh` remain the source
of truth. No REST schema change, new dependency, deployment, tag, or published
release is included. The existing chi dependency is updated to its security fix
version.

## Reviewed scope

- React: shared storage hooks, effect cleanup and request ownership, scoped React
  Query mutations, backup/restore flows, upload cancellation and retry transport,
  API facade callers, imports, and production build.
- Go: API handlers and streaming, endpoint validation and outbound HTTP/proxy
  boundaries, provider construction, job queue and subprocess ownership, SQL
  transactions and rollback, cancellation cleanup, and application shutdown.
- Existing helpers and owner boundaries were retained. Behavioral repairs have
  regression coverage; the small cleanup-context change uses existing owner
  coverage. This is not a claim that all possible defects are absent.

## Confirmed findings and repairs

| Owner | Finding and evidence | Repair and regression boundary |
| --- | --- | --- |
| Local/session storage hooks | Switching A → B → A restored old state and overwrote newer stored values; local state accepted session events; clear events were ignored. | Normalize the keyed state slot, filter the storage area, and accept clear events. Cover StrictMode, key return, and event isolation. |
| Backup drawer | Late export/restore results could act after close, unmount, or API scope change. | Invalidate request tokens in layout cleanup; abort superseded exports; guard results, errors, and loading cleanup. Test the actual lazy drawer and reopening. |
| Staged restore inventory | Late list/delete/cleanup results survived unmount or API change. | Invalidate the existing operation tokens during cleanup; retain existing result ownership checks. |
| Jobs page mutations | A queued React Query `onMutate` could mint a new token after unmount. | Require an active surface as well as the request token. Cover queued and already-started deletion; retain refresh of the original cache. |
| Upload commit and retry | Canceling an upload during queue backoff could later submit a commit; in-flight commit requests lacked the task signal. | Reuse the existing abortable transport delay and pass the signal through both recovery and fresh commit paths to fetch. Retain the pending commit/session when the server outcome is uncertain. Cover cancellation and durable operation receipts. |
| Job queue | Canceled callers could enqueue or dequeue when the queue was immediately ready. | Check cancellation inside the locked critical section before changing queue ownership. |
| Rclone subprocess output | Calling `Wait` before pipe consumers finished lost final logs; waiting for EOF first could hang on inherited file descriptors. | Give `os/exec` ownership of pipe copies, drain output, and set a five-second `WaitDelay`. Cover slow log consumption, inherited descriptors, early metadata reads, and cancellation. |
| Object-index cleanup | Static inspection: `WithoutCancel` removed cancellation without adding a cleanup deadline. | Allocate a five-second cleanup context inside the defer; existing object-index owner tests cover cleanup. A stalled live database was not exercised. |
| Upload byte reservation | An omitted size bypassed the transaction, ownership check, byte adjustment, and previous metadata needed for rollback. | Use the common transaction for known and unknown sizes; retain prior metadata and correct reserved bytes. Cover rollback and cross-profile rejection. |
| HTTP application shutdown | An incomplete request body could keep its connection open after graceful shutdown timed out and `Run` returned. | Force-close on shutdown failure and close the server before backing resources unwind. Cover a real local TCP connection. |
| Process test ownership | Cleanup and a waiter could call `cmd.Wait` concurrently; race-instrumented child exit delay caused misleading forced-kill results. | Use one waiter and synchronize consumers; disable only the child race exit sleep. Parent race detection remains enabled. |
| Endpoint and provider validation | DNS preflight used background contexts, so canceled HTTP requests and jobs still resolved hosts or reached subprocess preparation. | Thread caller contexts through shared validation, guarded dialing/redirects, proxy invocation, request preparation, job configuration, and provider constructors. Retain no-context compatibility wrappers and metadata/loopback/TLS checks. |
| SSE streaming | Write/flush errors were ignored and blocked writes had no frame deadline, retaining subscriptions and connection slots. | Check handshake/replay/event/heartbeat writes, use `ResponseController` through known wrappers, and release resources on failure. Clear each write deadline after the frame so idle HTTP/2 heartbeats remain valid. |
| Job log reads | Appends after file stat escaped the requested tail bound; truncation returned a cursor beyond bytes actually read. | Bound the reader by the observed size and derive the cursor from bytes read. Cover append, empty-file append, and truncation. |
| Egress response headers | Headers named by `Connection` were forwarded. | Reuse the hop-by-hop sanitizer on a cloned header map; preserve source headers. |
| Transfers bundle | Both the clean HEAD baseline and the tree before module deferral exceeded the 14.5 KiB gzip budget at 15.9 KiB, using the repository reporter. | Defer existing upload execution/resume modules at their async call sites; register cancellation synchronously and check it after module loading. Final size is 14,554 bytes (14.2 KiB); keep the budget unchanged. |
| chi dependency | Package scanning found three `RealIP` advisories in chi v5.2.4; the application does not call that middleware, and symbol scanning found no reachable vulnerability. | Update the existing dependency to v5.3.0 and regenerate notices. Check the used router, middleware, and response-writer APIs and their owner tests. |
| Dependency notice gate | A valid Go-only dependency update failed because the inventory required frontend dependency metadata changes too. | Require the affected owner's metadata pair plus the shared notice and a license snapshot. Preserve split-unit rejection and toolchain/timestamp exceptions; cover Go-only, frontend-only, mixed, and incomplete updates. |
| Presigned browser fixture | The browser test expected a commit after two ambiguous PUT responses. Both clean HEAD and current production deliberately reject persistent ambiguity: matching HEAD size alone can belong to an older object. | Align the test with the existing contract: five attempts, terminal failure, no commit, and no proxy fallback. Allow only this terminal assertion to cover the existing 7.5-second retry backoff; production behavior is unchanged. |

The chi findings are
[GO-2026-5777](https://pkg.go.dev/vuln/GO-2026-5777),
[GO-2026-5775](https://pkg.go.dev/vuln/GO-2026-5775), and
[GO-2026-5774](https://pkg.go.dev/vuln/GO-2026-5774). Their affected symbol is
`middleware.RealIP`, with v5.3.0 recorded as the fixed version. These package
findings are not evidence that S3Desk's request handling was exploitable.

## Validation record

Final checks used Node 22.22.0, npm 10.9.4, Go
`go1.26.8-X:nodwarf5`, and repository Playwright 1.57 Chromium. Backend security
tools were staticcheck v0.6.1, gosec v2.23.0, and govulncheck v1.1.4 on `PATH`.
The existing repository gosec exclusions were retained. No live-test opt-in was
enabled. Frontend dependencies were already installed.

| Command and working directory | Final result |
| --- | --- |
| Root: `GOMAXPROCS=2 CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=2 ./scripts/check.sh full` | Exit 0, `[check] ok`. OpenAPI, release/tooling contracts, Helm, formatting, Go vet/tests/security, frontend lint/import cycles/CSS checks, resilience scripts, build, and notice reproducibility passed. Vitest: 271 files, 1,434 tests passed. Chromium `@check-smoke`: 2 passed. |
| `backend/`: `GOMAXPROCS=2 go test -race -json ./... -count=1` | Exit 0. 39 tested packages passed; 1,352 top-level tests passed and 13 skipped. No race failures. Five additional packages had no tests. |
| `frontend/`: `npm run bundle:budget` | Exit 0. All existing budgets passed. Transfers: 14,554 bytes gzip against 14,848 bytes; 294 bytes of headroom. |
| `frontend/`: `npx playwright test tests/transfers-presigned.spec.ts tests/transfers-drawer-actions.spec.ts tests/backup-trust.spec.ts tests/jobs-overlays.spec.ts --project=chromium --workers=1` | Exit 0, 14/14 passed in 2.3 minutes. Used isolated managed-server port 18081; backup trust covered desktop and narrow Chromium widths. These are mocked API browser flows. |
| Root: `python3 scripts/report_release_scope.py --format json --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all` | Exit 0. Dependency notice unit complete, no dependency scope warnings or root evidence artifacts. The full gate also passed the 23 inventory and 9 scope-audit regression tests. |
| Root: `git diff --check`; focused ESLint for the revised presigned browser fixture | Both passed. Generated OpenAPI types and the REST schema were unchanged. |

The race run skipped six live-provider tests, three PostgreSQL tests, two real
FFmpeg tests, one optional object-index runtime test, and the process test helper.
Workflow validation used the script's built-in YAML validator because actionlint
was unavailable. No remote CI result is claimed. The later browser fixture-only
repair was covered by focused ESLint and the complete 14-case owner rerun.

Interim checks reproduced defects before applying fixes and are not counted as
passing final gates. An early `fast` run overlapped an intentionally failing
log-read regression and encountered an existing five-second governance UI
timeout. The governance case passed alone in 4.52 seconds; it now uses the file's
existing 15-second timeout for expensive UI scenarios. An interim `full` run
detected an obsolete, unused internal validator after context threading; it was
removed. A subsequent run rejected the valid Go-only dependency update at the
notice-scope gate, motivating the owner-aware repair above. The first targeted
browser batch passed 13/14 and exposed the stale ambiguity assertion; the final
batch passed 14/14 after aligning that fixture with the unchanged safety policy.

Local logs are kept under `/tmp/s3desk-patterns-*`, including
`full-final.log`, `race-with-chi-final.jsonl`, `bundle-fixed-final.log`, and
`browser-owners-fixed.log`. Raw runtime logs and credentials are not committed.

## Evidence limits

- Unit tests, race detection, static/security checks, and Chromium mock smoke
  establish local evidence only. They do not establish real-provider behavior,
  deployed reverse-proxy behavior, PostgreSQL runtime acceptance, or real-device
  results. Those environment-dependent checks were not invoked.
- Optional real-FFmpeg and object-index runtime evidence tests were also skipped;
  their passing unit substitutes are not runtime evidence.
- The Transfers budget has 294 bytes of gzip headroom. Initial JavaScript is
  approximately 168.7 KiB against its 170 KiB cap; future additions still need
  the existing budget gate.
- `WaitDelay` bounds inherited-pipe waiting. It does not promise termination of
  arbitrary detached descendants after the original process has exited.
- Aborting an upload request does not prove that the server rejected it. Pending
  commit metadata remains available for operation reconciliation.
- No commit, push, tag, publication, or deployment was performed.
