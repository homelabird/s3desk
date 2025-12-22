# Bugfix Roadmap

## Analysis Summary
- Overall status: minor issues present; backend flows look stable while recent frontend refactors introduced lint blockers and hook warnings.
- Verification: `go test ./...` ok, `go vet ./...` ok, `npm run lint` ok after fixes.
- Coverage gaps: frontend has no automated tests; backend tests are minimal.

## Findings (prioritized)
1) [P0 - Quality/CI] Frontend lint failed due to `react-hooks/refs` false positives in Objects components and `react-hooks/set-state-in-effect` in the command palette hook.
   - Impact: lint fails block CI; potential re-render churn in the command palette.
   - Fix: destructure props in ref-heavy components; compute a clamped active index without setState in an effect.
   - Risk: low.
   - Estimate: ~20m.

2) [P1 - Maintainability] Objects command palette used a hook object in effect deps, triggering exhaustive-deps warnings and potential stale closures.
   - Impact: warning noise and higher regression risk in keyboard handling.
   - Fix: destructure hook outputs and use those in dependencies and props.
   - Risk: low.
   - Estimate: ~15m.

3) [P2 - Quality] Frontend lacks automated UI tests.
   - Impact: regressions in `/objects` are easy to miss during refactors.
   - Fix: add smoke tests for Simple/Advanced toggles, Transfers drawer, and command palette navigation.
   - Risk: low to medium (test infra work).
   - Estimate: 0.5-1 day. (backlog)

4) [P2 - Performance] Vite emits large chunk warnings (>500kB) during build.
   - Impact: slower initial load on larger pages like `/objects`.
   - Fix: add dynamic imports or manual chunking for heavy routes.
   - Risk: low.
   - Estimate: ~0.5 day. (backlog)

## Roadmap (Executable Now)
1. (P0) Fix frontend lint blockers around refs and command palette state handling.
2. (P1) Normalize command palette hook usage in `ObjectsPage` (deps and call sites).
3. (P0) Re-verify: `npm run lint`, `go test ./...`, `go vet ./...`.

## Execution Log
- Step 1: DONE. Destructured props in `frontend/src/pages/objects/ObjectsGoToPathModal.tsx` and `frontend/src/pages/objects/ObjectsListSection.tsx` to avoid `react-hooks/refs` false positives.
- Step 2: DONE. Reworked `frontend/src/pages/objects/useObjectsCommandPalette.ts` to compute a clamped active index without setState-in-effect; updated `frontend/src/pages/ObjectsPage.tsx` to use destructured hook outputs.
- Step 3: DONE. `npm run lint` passes. Backend checks `go test ./...` and `go vet ./...` were green.
