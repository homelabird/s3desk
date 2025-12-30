# Bugfix Roadmap

## Analysis Summary
- Overall status: minor issues present; core flows are stable but job lifecycle cleanup and backend test coverage need attention.
- Verification: `go test ./...` ok, `npm run lint` ok, `npm run test:e2e` ok (server started with `STATIC_DIR=../frontend/dist`).

## Findings (prioritized)
1) [P1 - Stability] Job contexts are never canceled after completion, leaving per-job goroutines alive until shutdown.
   - Impact: goroutine leak per job; cleanup tied to context cancellation never triggers.
   - Fix: cancel the job context in the runJob cleanup block.
   - Risk: low.
   - Estimate: ~10m.

2) [P2 - Stability] `runRclone` starts the progress tracker before `cmd.Start`; early start failures keep the goroutine alive until the job context is canceled.
   - Impact: short-lived goroutine leak on start/pipe failures; unnecessary progress work on failed starts.
   - Fix: start progress tracking after a successful `cmd.Start`.
   - Risk: low.
   - Estimate: ~10m.

3) [P0 - Quality/CI] Frontend lint error from setting state synchronously in an effect, plus hook dependency warnings.
   - Impact: lint blocks CI; warning noise.
   - Fix: compute settings-open state without setState-in-effect; stabilize hook dependencies/cleanup refs.
   - Risk: low.
   - Estimate: ~20m.

4) [P1 - Quality/CI] Playwright jobs-network test expected a "Retry realtime" button that no longer appears for log polling retries.
   - Impact: e2e test failure.
   - Fix: assert the log polling retry button within the logs drawer.
   - Risk: low.
   - Estimate: ~10m.

5) [P2 - Quality] Backend tests cover only a few API handlers; job manager and store flows lack integration tests.
   - Impact: regressions in job lifecycle (queue -> running -> completed/canceled) can slip through.
   - Fix: add tests around job status transitions, cancellation, and log tail handling.
   - Risk: low to medium (test harness work).
   - Estimate: 0.5-1 day. (backlog)

## Roadmap (Executable Now)
1. (P1) Cancel per-job contexts after completion to avoid goroutine leaks.
2. (P2) Defer progress tracking until `cmd.Start` succeeds.
3. (P0) Fix frontend lint blockers and hook warnings.
4. (P1) Align Playwright jobs-network expectations with current UI.
5. (P1) Re-verify: `go test ./...`, `npm run lint`, `npm run test:e2e` (serve `../frontend/dist`).

## Execution Log
- Step 1: DONE. Added job context cancellation in `backend/internal/jobs/manager.go`.
- Step 2: DONE. Start progress tracking after `cmd.Start` in `backend/internal/jobs/manager.go`.
- Step 3: DONE. Removed setState-in-effect in `frontend/src/App.tsx` and stabilized hook dependencies in `frontend/src/components/Transfers.tsx` and `frontend/src/pages/ObjectsPage.tsx`.
- Step 4: DONE. Updated `frontend/tests/jobs-network.spec.ts` to assert the log polling retry button.
- Step 5: DONE. `go test ./...`, `npm run lint`, `npm run test:e2e` all succeeded (server run with `STATIC_DIR=../frontend/dist`).
