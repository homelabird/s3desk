# E2E Suite Audit - 2026-04-08

## Inventory

- `frontend/tests`: `53` Playwright spec files
- `frontend/tests`: `141` Playwright tests
- `frontend/tests`: `7` mobile-responsive spec files
- `frontend/tests`: `9` live-only spec files
- `frontend/tests`: `1` demo-only spec file
- `frontend/tests`: `1` perf-only spec file

## What Actually Runs

### `./scripts/check.sh full`

- Runs browser E2E only through `npm run test:e2e:smoke`.
- That currently resolves to `2` tests across `2` files:
  - `frontend/tests/objects-smoke.spec.ts`
  - `frontend/tests/settings-auth.spec.ts`

### PR / CI Reality

- The PR-required path is broader than `check-smoke`.
- The main mocked regression lane is `npm run test:e2e:core`.
- A required mobile lane also exists through `npm run test:e2e:mobile-responsive`.
- The nightly/manual live workflow already curates a smaller set of real integration scenarios.

This matters because the suite looks large, but the truly blocking paths are narrower and should stay focused on high-signal flows.

## High-Signal Coverage To Keep

These scenarios validate contracts that are hard to replace with unit/component tests and should remain first-class coverage.

### Core Mock / Recovery / Routing

- `frontend/tests/transfers-scenarios.spec.ts`
- `frontend/tests/transfers-drawer-actions.spec.ts`
- `frontend/tests/transfers-presigned.spec.ts`
- `frontend/tests/transfers-job-artifact.spec.ts`
- `frontend/tests/transfers-progress.spec.ts`
- `frontend/tests/jobs-network.spec.ts`
- `frontend/tests/jobs-realtime-overlays.spec.ts`
- `frontend/tests/uploads-folder.spec.ts`
- `frontend/tests/uploads-more-menu.spec.ts`
- `frontend/tests/objects-clipboard-paste.spec.ts`
- `frontend/tests/objects-new-folder.spec.ts`
- `frontend/tests/objects-image-preview.spec.ts`

### Live / Nightly

- `frontend/tests/api-crud.spec.ts`
- `frontend/tests/objects-live-flow.spec.ts`
- `frontend/tests/uploads-folder-live.spec.ts`
- `frontend/tests/transfers-live-fallback.spec.ts`
- `frontend/tests/objects-prefix-pagination-chaos.spec.ts`
- `frontend/tests/objects-search-favorites-chaos.spec.ts`
- `frontend/tests/objects-network-chaos.spec.ts`

These have real value because they cover:

- end-to-end page-to-page user tasks
- state persistence and routing continuity
- fallback / retry / failure recovery
- realtime or event-stream behavior
- provider-sensitive contracts

## Low-Signal Or Overweight Areas

### Mobile-responsive cluster

Most of the mobile-responsive slice is not fundamentally wrong, but too much of it was checking:

- button height
- stacking order
- raw viewport geometry
- scroll width math

instead of asking whether a mobile user can actually finish a task.

The weakest examples were:

- `frontend/tests/responsive-lists.spec.ts`
- `frontend/tests/settings-mobile-responsive.spec.ts` before rewrite
- `frontend/tests/login-mobile-responsive.spec.ts` before rewrite
- `frontend/tests/mobile-smoke.spec.ts` before rewrite

### Demo / perf / shallow smoke

- `frontend/tests/demo-bucket-upload-delete-jobs.spec.ts`
  - useful as a demo capture path
  - weak as required regression coverage
- `frontend/tests/jobs-perf.spec.ts`
  - useful for ad hoc perf probes
  - weak as a normal Playwright pass/fail lane
- `frontend/tests/objects-smoke.spec.ts`
  - acceptable as a tiny gate
  - but intentionally shallow
- `frontend/tests/objects-layout-density.spec.ts`
  - mostly asserted breakpoint-specific docking and empty-state layout attributes
  - weaker than existing Objects tree, favorites, and mobile task-flow coverage

## Findings

### 1. The suite is broad, but only part of it is regression-critical

- `check-smoke` is intentionally tiny.
- The PR-required path is broader, but much of the mobile-responsive slice is cosmetic.

### 2. Some of the noisiest tests are the least valuable

- The highest-maintenance responsive tests are not the highest-signal tests.
- Several geometry-driven checks duplicate contracts already implied by stronger workflow tests.

### 3. Live coverage is concentrated and mostly good

- The live/nightly list is smaller and much more meaningful overall.
- After the docs rewrite, the remaining weak spots are mostly shallow mock/layout checks rather than live-only scenarios.

## Actions Taken In This Audit

### Removed

- Deleted `frontend/tests/responsive-lists.spec.ts`.
  - Reason: it duplicated the same breakpoint and stacking contracts already exercised by the profiles/buckets mobile-responsive specs and did not add unique regression signal.

### Demoted From Required-Core Mock Coverage

- Marked `frontend/tests/demo-bucket-upload-delete-jobs.spec.ts` with `@demo`.
- Updated `frontend/package.json`:
  - `test:e2e:core` now excludes `@demo`.
  - added `test:e2e:demo` for manual/demo execution.

This keeps the scenario available for artifact capture or demos without making it part of the required mock regression path.

### Moved To An Explicit Perf Lane

- Marked `frontend/tests/jobs-perf.spec.ts` with `@perf`.
- Updated `frontend/package.json`:
  - `test:e2e:core` now excludes `@perf`.
  - added `test:e2e:perf` for explicit performance runs with `PERF_TESTS=1`.

This keeps the perf probes available while removing them from the default core regression lane, where they mostly added skipped/noisy coverage rather than actionable pass/fail signal.

### Reworked Mobile-Responsive Coverage

- Rewrote `frontend/tests/settings-mobile-responsive.spec.ts` around mobile persistence flows.
  - It now verifies transfer proxy preference persistence and API token persistence after close/reopen, instead of viewport math and touch-target size checks.
- Rewrote `frontend/tests/login-mobile-responsive.spec.ts` around real auth flows.
  - It now verifies successful narrow-viewport login and stale-token clear/relogin behavior, instead of visibility-only checks.
- Slimmed `frontend/tests/mobile-smoke.spec.ts` down to actual mobile interactions.
  - It now verifies overflow-menu access to settings, job filter activation, and upload-sheet open/close behavior instead of padding, card stacking, and button-height assertions.
- Rewrote `frontend/tests/jobs-mobile-responsive.spec.ts`, `frontend/tests/objects-mobile-responsive.spec.ts`, and `frontend/tests/uploads-mobile-responsive.spec.ts` around task completion.
  - They now verify mobile filter persistence, job details access, object details/global-search persistence, upload-prefix persistence, file staging/clearing, and transfers drawer access, instead of viewport-safe geometry and stacking assertions.
- Rewrote `frontend/tests/profiles-mobile-responsive.spec.ts` and `frontend/tests/buckets-mobile-responsive.spec.ts` around compact-card workflows.
  - They now verify active-profile switching, mobile edit/import entrypoints, bucket policy and controls overlays, and delete-to-jobs fallback handling, instead of overflow and button-stacking geometry.
- Strengthened `frontend/tests/docs-smoke.spec.ts`.
  - It now verifies that `/docs` renders known OpenAPI operations from `/openapi.yml` in Swagger UI, instead of only checking that the HTML shell exists.
- Trimmed `frontend/tests/objects-smoke.spec.ts` into a single fast boot-and-toggle gate.
  - It now verifies that the Objects page boots in simple mode, exposes the advanced-mode affordance, and persists the real mode switch to `localStorage`, instead of mirroring simple/advanced visibility checks in two shallow tests.
- Kept `frontend/tests/settings-auth.spec.ts` as a single-purpose auth boot gate.
  - It now stays intentionally narrow: successful login must unlock the app shell and open the Settings drawer with the applied API token, rather than growing into another broad settings-persistence matrix.
- Reworked `frontend/tests/objects-layout-density.spec.ts` around adaptive desktop workflows.
  - It now verifies medium-width desktop folder navigation through the overflow-driven folders sheet and wide-desktop favorites-driven details recovery, instead of only checking docked-tree and empty-pane geometry.
- Reworked the weakest desktop assertion in `frontend/tests/objects-bucket-picker.spec.ts`.
  - It now verifies desktop clear-and-reselect behavior from recents, instead of measuring whether the popover is numerically wider than its trigger.
- Reworked `frontend/tests/objects-context-menu.spec.ts` around actionable menu coverage.
  - It now verifies that short-height list menus can still launch `New folder`, constrained desktop row menus can still open object details, and mobile row menus still reach details above the selection bar, instead of checking viewport-fit math.
- Reworked `frontend/tests/webview-environment-posture.spec.ts` around short-posture task completion.
  - It now verifies that the jobs download drawer can browse for a local folder, submit, and surface a real device-download completion message in a short landscape webview, instead of comparing dialog and button bounding boxes against the viewport.
- Reworked the last overflow-only check in `frontend/tests/mobile-smoke.spec.ts`.
  - It now verifies that the compact bucket list can scroll to the final card and still open that card's delete confirmation, instead of comparing document `scrollWidth` against the viewport.
- Removed the dead `frontend/tests/support/mobileResponsive.ts` helper path.
  - Its generic `scrollWidth` and viewport-fit assertions were no longer called by any active spec, so keeping them around only encouraged low-signal layout checks.
- Reworked the oversized-image fallback case in `frontend/tests/objects-image-preview.spec.ts`.
  - It now verifies that mobile fallback still exposes a real `Download` action, keeps fallback guidance visible, and suppresses zoom controls, instead of asserting that the modal is numerically wider than `300px`.
- Moved image pan mechanics out of browser E2E.
  - `frontend/tests/objects-image-preview.spec.ts` now keeps the browser-level contract to opening the viewer plus zoom/reset behavior, while the drag/pan transform contract lives in `frontend/src/pages/objects/__tests__/ObjectsImageViewerModal.test.tsx`.
- Removed the last direct Playwright geometry probes from active specs.
  - `frontend/tests/objects-context-menu.spec.ts` now opens the short-viewport list menu with a fixed locator-position right-click, and a grep pass over `frontend/tests` plus `frontend/tests/support` no longer finds active `boundingBox`, `scrollWidth`, or `getBoundingClientRect` usage.
- Added an automated guard for new Playwright geometry probes.
  - `frontend/scripts/check-e2e-geometry-probes.mjs` now fails fast when `frontend/tests` or `frontend/tests/support` reintroduce `boundingBox`, `getBoundingClientRect`, `scrollWidth`, `clientWidth`/`clientHeight`, or `offsetWidth`/`offsetHeight` without an explicit `e2e-geometry-allow` annotation.
- Tightened adjacent overlay primitive tests without pinning raw magic pixels.
  - `frontend/src/components/__tests__/PopoverSurface.test.tsx` now derives clamp expectations from the mocked viewport and safe-area rectangles, instead of hard-coding bare `top/left` and budget literals that were harder to read and maintain.
- Trimmed the remaining cosmetic style lock from shared presentation tests.
  - `frontend/src/components/__tests__/HelpTooltip.test.tsx` no longer asserts exact host spacing values; it now keeps the behavioral contract that focus/blur interaction still works when custom styling is present.
- Reframed the remaining size assertions as explicit public API coverage.
  - `frontend/src/components/__tests__/DialogModal.test.tsx` and `frontend/src/components/__tests__/OverlaySheet.test.tsx` now name those checks as width/height prop passthrough contracts, making it clear that they are intentionally testing component API wiring rather than visual polish.
- Codified the lane split and geometry-guard rules in contributor docs.
  - `docs/TESTING.md`, `docs/RELEASE_GATE.md`, and `frontend/docs/MOBILE_RESPONSIVE_E2E.md` now explain the `@check-smoke` versus `core` versus `mobile-responsive` split, the `npm run check:e2e:geometry` guard, and why the remaining exact `DialogModal` / `OverlaySheet` size checks stay as unit-level public API coverage.
- Wired the contributor-facing browser-test policy into the release-doc gate.
  - `scripts/check_release_gate.sh` now fails if the lane split, geometry guard, mobile authoring rules, or pull-request review checklist drift out of `docs/TESTING.md`, `docs/RELEASE_GATE.md`, `frontend/docs/MOBILE_RESPONSIVE_E2E.md`, or `.github/pull_request_template.md`.
- Added a reviewer quick-check entry point.
  - `docs/TESTING.md` now gives reviewers a short browser-test checklist for smoke/core/mobile lane choice, geometry-guard expectations, and the narrow cases where exact size assertions are still acceptable.
- Updated release-prep templates to report browser-test evidence with the same lane split.
  - `docs/release/PR_BODY.md`, `docs/release/PR_BODY_2026-04-02.md`, and `docs/release/DEPLOYMENT_CHECKLIST.md` now call out `npm run check:e2e:geometry`, `npm run test:e2e:smoke`, `npm run test:e2e:core`, and `npm run test:e2e:mobile-responsive` explicitly instead of collapsing browser coverage into a generic smoke note.
- Surfaced the lane meaning directly in GitHub Actions job summaries.
  - `.github/workflows/frontend-e2e.yml` now writes summary text for `Core Mock E2E` and `Mobile Responsive E2E (Required)`, including skip reasons, lane purpose, commands, geometry-guard context, and artifact names.
  - `.github/workflows/release-gate.yml` now writes a short summary showing that the full gate runs `check:e2e:geometry` plus `test:e2e:smoke`, while the broader desktop/mobile browser lanes live in `Frontend E2E`.
- Extended the release-doc gate to cover CI workflow UX wiring too.
  - `scripts/check_release_gate.sh` now fails if `.github/workflows/frontend-e2e.yml` or `.github/workflows/release-gate.yml` lose the expected summary steps, geometry-guard commands, smoke/core/mobile commands, or `GITHUB_STEP_SUMMARY` output hooks.
- Added a local workflow lint wrapper with optional `actionlint`.
  - `scripts/check_github_workflows.sh` now uses `actionlint` when available and always runs the built-in `scripts/check_github_workflows.py` validator, which parses `.github/workflows/*.yml`, rejects duplicate YAML keys, and checks the basic `name` / `on` / `jobs` / `steps` shape.
  - `scripts/check.sh` now calls the wrapper so workflow edits fail fast even when `actionlint` is absent.
- Standardized the repo-local `actionlint` install path.
  - `scripts/install_actionlint.sh` now installs a pinned `actionlint` version into `.tools/go/bin/actionlint`, and the workflow lint wrapper plus docs now point contributors at that exact path instead of an ad-hoc global `go install`.
- Promoted the pinned `actionlint` path into CI.
  - `.github/workflows/release-gate.yml` now installs repo-local `actionlint` before the full check gate, and `scripts/check_release_gate.sh` now fails if that workflow step or command drifts.
- Promoted workflow lint execution into `Frontend E2E` too.
  - `.github/workflows/frontend-e2e.yml` now runs a dedicated `Workflow Lint` job that installs repo-local `actionlint` and executes `bash ./scripts/check_github_workflows.sh` before the browser lanes, and `scripts/check_release_gate.sh` now fails if that job, its summary, or its dependency wiring drifts.
- Expanded the `Frontend E2E` change-scope filter to include workflow-lint tooling changes.
  - Updates to `scripts/check_github_workflows.sh`, `scripts/check_github_workflows.py`, or `scripts/install_actionlint.sh` now count as `browser_facing` for the workflow, so the browser-lane jobs actually execute when the CI tooling that they depend on changes.
- Aligned reviewer-facing docs and PR verification with the dedicated workflow-lint gate.
  - `.github/pull_request_template.md`, `docs/TESTING.md`, and `frontend/docs/MOBILE_RESPONSIVE_E2E.md` now point contributors at `bash ./scripts/check_github_workflows.sh` and the `Workflow Lint` job whenever `.github/workflows/**` or browser-CI wiring changes.
- Aligned release-prep templates with the same workflow-lint evidence rule.
  - `docs/release/PR_BODY.md`, `docs/release/PR_BODY_2026-04-02.md`, and `docs/release/DEPLOYMENT_CHECKLIST.md` now call out `bash ./scripts/check_github_workflows.sh` separately from Playwright lane evidence whenever workflow or browser-CI wiring changes.
- Clarified that the minimal CI pair wrapper is not a release verdict.
  - `docs/RELEASE_GATE.md`, `docs/TESTING.md`, and `docs/release/DEPLOYMENT_CHECKLIST.md` now state directly that `bash ./scripts/check_ci_pair.sh` is a local convenience wrapper, not a replacement for required browser checks, branch-protection signals, or release-ready evidence.
- Surfaced the bundle-budget lane as a separate frontend signal.
  - `.github/workflows/frontend-e2e.yml` now writes a `Bundle Budget` summary, while `docs/TESTING.md`, `docs/RELEASE_GATE.md`, the PR template, and release-prep docs now point contributors at `cd frontend && npm run bundle:budget` for frontend bundle-affecting changes.
- Aligned the `Release Gate` workflow summary with the bundle-budget split too.
  - `.github/workflows/release-gate.yml` now points readers at the advisory `Bundle Budget` job in `Frontend E2E` and its local equivalent `cd frontend && npm run bundle:budget`, so the Actions UI distinguishes required browser lanes from the separate bundle-size signal.
- Unified the bundle-budget execution path across local and CI.
  - `frontend/package.json` now routes `npm run bundle:budget` through a dedicated frontend script that writes `dist/build-analyze.log`, enforces the circular-chunk check, and runs the bundle report, while `.github/workflows/frontend-e2e.yml` now uses that same single command instead of an inline shell copy.
- Promoted bundle thresholds into an explicit manifest.
  - `frontend/scripts/bundle-budgets.json` now holds the committed soft-budget defaults, `scripts/bundle_report.js` reads that manifest instead of hard-coded literals, and the report/docs now point contributors at the manifest as the source of truth.
- Added rationale alongside each committed soft budget.
  - `frontend/scripts/bundle-budgets.json` now explains why each threshold exists, and the generated bundle report prints that explanation so re-baselines stay reviewable instead of looking like unexplained number churn.
- Added explicit headroom review hints to the bundle report.
  - `scripts/bundle_report.js` now prints actual size, usage ratio, and remaining headroom for each soft budget, then calls out review candidates when a threshold looks unusually tight or loose.
- Allowed per-route review thresholds for intentionally narrow surfaces.
  - `frontend/scripts/bundle-budgets.json` can now override the default “tight headroom” rule for routes like `UploadsPage` where a smaller buffer is expected and already documented.
- Re-based the `ObjectsPage` soft budget after checking split points.
  - `ObjectsPage` already lazy-loads optional overlays and modal surfaces, so the remaining `tree/list/details` orchestration was treated as the stable route floor and the soft budget moved from `61 kB` to `62 kB` instead of forcing a low-value split.
- Aligned PR/release evidence wording with the lane split.
  - PR templates, release PR bodies, deployment checklists, and release-doc gates now ask reviewers to report workflow lint, bundle-budget, and each browser lane as separate evidence lines instead of flattening everything into a generic “checks passed” note.
- Aligned GitHub Actions summaries with the same evidence labels.
  - `Frontend E2E` and `Release Gate` summaries now use `Workflow Lint:`, `Bundle Budget:`, and `Browser Lanes:` lines so CI UI wording matches the PR and release templates.
- Tightened the bundle-budget summary for faster triage.
  - `Bundle Budget` now emits separate `Warnings:` and `Review targets:` lines for up to the first two follow-up chunks, while still pointing reviewers at the `frontend-bundle-report` artifact for the full markdown + stats bundle.
- Aligned PR/release examples with the same bundle-budget evidence shape.
  - The PR template and release body templates now show `Bundle Budget: executed`, `Warnings: ...`, and `Review targets: ...` as separate evidence lines instead of collapsing them into one sentence.
- Added per-route action hints for bundle follow-up.
  - `frontend/scripts/bundle-budgets.json` now tags each route with a short action such as `shrink first` or `rebaseline if stable`, and the generated report plus CI summary surface that as `Action hints:` when follow-up is needed.
- Added a checked-in contract test for bundle-report wording.
  - `scripts/__tests__/bundle_report.test.js` now forces a candidate/action-hint scenario without a child process, `frontend/package.json` exposes it as `npm run check:bundle-report`, and both `Bundle Budget` plus `./scripts/check.sh` run it before the heavier analyze/build path so report-shape regressions fail before browser or release-evidence review.
- Surfaced the bundle-report contract as a first-class evidence line.
  - The PR template, release body templates, deployment checklist, and `Frontend E2E` bundle summary now call out `Bundle Budget Contract:` / `npm run check:bundle-report` separately from the heavier `npm run bundle:budget` run.
- Aligned the `Release Gate` summary with that same contract label.
  - `docs/TESTING.md`, `docs/RELEASE_GATE.md`, `scripts/check_release_gate.sh`, and `.github/workflows/release-gate.yml` now include `Bundle Budget Contract:` so CI, docs, and PR/release evidence all refer to the same four labels.
- Narrowed when reviewers should actually report the contract line as executed.
  - PR/release templates and deployment notes now treat `Bundle Budget Contract:` as `not applicable (...)` by default unless the bundle manifest, report wording, or CI summary wiring changed.
- Matched the `Frontend E2E` summary to that same narrower contract scope.
  - The workflow now tracks `frontend_bundle_contract` separately, runs `npm run check:bundle-report` only for that scope, and otherwise emits `Bundle Budget Contract: not applicable (no bundle manifest/report/summary wiring change)`.
- Narrowed the heavier runtime bundle scope too.
  - `frontend_bundle_runtime` now tracks only entrypoint/chunk/dependency/runtime inputs, so contract-only changes leave `Bundle Budget: not applicable (no bundle-affecting runtime change)` instead of implying the full analyze/build path was relevant.
- Narrowed the required browser-lane scope away from `frontend/**`.
  - `browser_facing` now keys off the actual browser surface (`frontend/src/**`, `frontend/tests/**`, `frontend/public/**`, `frontend/playwright.config.ts`, runtime/build config, backend API wiring, and live-E2E harness files), so frontend docs and bundle-only tooling changes stop retriggering the required Playwright jobs.
- Split workflow-lint-only scope back out of the browser lane scope.
  - `workflow_lint_scope` now tracks `.github/workflows/**` plus the repo-local workflow-lint tooling, so those changes still run `Workflow Lint` but no longer retrigger `Core Mock E2E` or `Mobile Responsive E2E` unless the real browser surface changed too.
- Made the required-lane summaries explicit for workflow-only PRs.
  - `Core Mock E2E` and `Mobile Responsive E2E` now say `Browser Lanes: ... not applicable (workflow or browser-CI wiring changed, but the browser surface did not)` instead of collapsing those cases into the generic “no browser-facing changes” wording.
- Reworded the generic skip path around the browser surface term.
  - The workflow skip steps and no-op summaries now use `browser surface` phrasing (`the browser surface is out of scope`, `no workflow or browser-surface changes were detected`) so CI wording matches the scoped filters more directly.
- Removed the last label-case drift from the workflow-lint summary.
  - The `Workflow Lint` summary now writes `Browser Lanes:` with the same capitalization used by the PR template, release docs, and the other CI summaries.
- Added an explicit workflow-lint-only evidence example to the PR/release templates.
  - The PR template and release PR body drafts now show the expected `Workflow Lint: executed` plus `Browser Lanes: ... not applicable (...)` shape for wiring-only changes, so reviewers can copy a concrete example instead of inferring it from the policy text.
- Matched the mobile lane guide to the same scope language.
  - `frontend/docs/MOBILE_RESPONSIVE_E2E.md` now states that workflow-lint-only changes leave `Browser Lanes:` as `not applicable (...)`, while real browser-surface changes still materialize the required mobile lane with the rest of the browser surface.
- Dropped the misleading PR-template example that implied a separate mobile-only runtime scope.
  - Reviewer-facing docs now state explicitly that the current required workflow materializes the mobile lane together with the rest of the browser surface unless the whole browser lane is out of scope.
- Stopped treating bundle-report tooling as part of the browser surface.
  - `scripts/bundle_report.js` and `scripts/__tests__/bundle_report.test.js` now stay inside the bundle-budget runtime/contract scopes only, so report-shape changes stop retriggering the required Playwright lanes.

### Resulting Lane Split

- `npm run test:e2e:smoke -- --list` now isolates `2` boot-gate tests in `2` files.
- `npm run test:e2e:core -- --list` now enumerates `90` tests in `42` files.
- `npm run test:e2e:demo -- --list` isolates `1` demo test in `1` file.
- `npm run test:e2e:perf -- --list` isolates `4` perf tests in `1` file.
- `.github/workflows/frontend-e2e.yml` now runs the `@check-smoke` lane ahead of the larger core mock suite, instead of burying those boot gates inside the core lane.
- `.github/workflows/frontend-e2e.yml` and `scripts/check.sh` now run the E2E geometry guard before browser suites.

## Recommended Next Batch

### P1

- Keep new mock-only smoke additions inside the dedicated `@check-smoke` lane unless they prove more than a boot gate.
- Treat the remaining exact width/height assertions in `DialogModal` and `OverlaySheet` as intentional prop-API coverage rather than cosmetic locks, unless those components stop exposing size props directly.
- Revisit the `e2e-geometry-allow` escape hatch only if a future browser test truly needs coordinate math that cannot be pushed into a lower-level contract.

### P2

- Keep `frontend/tests/jobs-perf.spec.ts` in the dedicated perf lane instead of treating it like a normal Playwright regression spec.
- Consolidate repeated mobile helpers and naming now that the responsive specs have converged on similar task-based patterns.

### P3

- Add an explicit `manual/demo` lane in CI only if artifact capture is still a recurring need.

## Practical Rule Going Forward

Keep browser E2E when a scenario validates at least one of these:

- a user-critical flow across pages
- a backend or provider contract under realistic conditions
- realtime behavior
- retry/fallback/error recovery behavior
- state persistence or routing continuity that unit/component tests do not realistically exercise

Push a scenario down or merge it when it is mostly checking:

- pixel geometry
- font size
- button height
- vertical stacking order
- static visibility that is already covered by component tests
