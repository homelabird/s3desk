# Mobile Responsive E2E

Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).
`Objects`-specific QA and flow checks live in [OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md](./OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md).

## Scope

- `Objects`
- `Jobs`
- `Uploads`
- `Profiles`
- `Buckets`
- `Settings`
- `Login`

## Page Checklists

- `Objects`:
  - [OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md](./OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Jobs`:
  - [JOBS_MOBILE_RESPONSIVE_CHECKLIST.md](./JOBS_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Uploads`:
  - [UPLOADS_MOBILE_RESPONSIVE_CHECKLIST.md](./UPLOADS_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Profiles`:
  - [PROFILES_MOBILE_RESPONSIVE_CHECKLIST.md](./PROFILES_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Buckets`:
  - [BUCKETS_MOBILE_RESPONSIVE_CHECKLIST.md](./BUCKETS_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Settings`:
  - [SETTINGS_MOBILE_RESPONSIVE_CHECKLIST.md](./SETTINGS_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Login`:
  - [LOGIN_MOBILE_RESPONSIVE_CHECKLIST.md](./LOGIN_MOBILE_RESPONSIVE_CHECKLIST.md)

## Local Commands

- Fast boot-only smoke gates:
  - `npm run test:e2e:smoke`
- Full mobile responsive suite:
  - `npm run test:e2e:mobile-responsive`
- `Settings` and `Login` only:
  - `npm run test:e2e:mobile-responsive:settings-login`
- Core desktop/mock suite without mobile responsive coverage:
  - `npm run test:e2e:core`
- Demo-only desktop flows:
  - `npm run test:e2e:demo`
- Opt-in perf probes:
  - `npm run test:e2e:perf`
- Geometry guard for Playwright authoring:
  - `npm run check:e2e:geometry`
  - also rejects viewport-relative `maxDiffPixelRatio`; screenshot assertions inherit the global absolute pixel budget
- Workflow lint for browser-CI wiring:
  - `bash ./scripts/check_github_workflows.sh`

## CI Equivalents

The `Frontend E2E` Actions summaries should surface these lane meanings directly so reviewers can map `Workflow Lint`, `check-smoke`, `core`, and `mobile-responsive` without opening the docs first.

- Workflow-lint-only changes should normally show `Workflow Lint: executed` while `Browser Lanes:` stays `not applicable (...)`.
- The current required workflow does not maintain a narrower mobile-only runtime scope, so once the browser surface is in scope the `Mobile Responsive E2E (Required)` lane normally materializes too.

- `Workflow Lint`
  - equivalent local command: `bash ./scripts/check_github_workflows.sh`
  - runs before browser lanes so workflow wiring breaks fail before Playwright setup

- `check-smoke` boot gates inside `Frontend E2E`
  - equivalent local command: `npm run test:e2e:smoke`
- `Core Mock E2E`
  - equivalent local command: `npm run test:e2e:core`
  - CI shards the same core suite into `1/3`, `2/3`, and `3/3`, then combines smoke, core, and visual regression into the required `Core Mock E2E` check
- `Visual Regression E2E`
  - equivalent local command: `npm run test:e2e:visual`
  - runs separately, but a failure blocks the required `Core Mock E2E` aggregate
- `Mobile Responsive E2E (Required)`
	- equivalent local command: `npm run test:e2e:mobile-responsive`
	- CI runs `mobile-iphone-13` and `mobile-pixel-7` as parallel project jobs, then aggregates both results under this exact required check name
	- `mobile-platform-standards.spec.ts` asserts both projects still run on Chromium with their pinned viewport, device scale factor, and touch emulation
	- includes device-context visual sentinels for the sparse Login shell and dense Jobs operations shell
- `Cross-Browser Reflow E2E`
  - equivalent local commands: `PLAYWRIGHT_BROWSER_UI_ZOOM=1 PLAYWRIGHT_HEADLESS=0 xvfb-run -a npx playwright test tests/wcag-reflow.spec.ts --project=chromium --workers=1`, `PLAYWRIGHT_FIREFOX=1 PLAYWRIGHT_FIREFOX_FULL_PAGE_ZOOM=1 PLAYWRIGHT_HEADLESS=0 xvfb-run -a npx playwright test tests/wcag-reflow.spec.ts --project=firefox-reflow --workers=1`, `PLAYWRIGHT_FIREFOX=1 PLAYWRIGHT_FIREFOX_TEXT_ONLY_ZOOM=1 PLAYWRIGHT_HEADLESS=0 xvfb-run -a npx playwright test tests/wcag-reflow.spec.ts --project=firefox-reflow --workers=1`, `npm run test:e2e:firefox-reflow`, and `npm run test:e2e:webkit-reflow`
  - the Chromium lane drives the headful browser's actual zoom control to 400% and asserts a `320 CSS px` layout viewport before reusing the seven core-route scenarios plus the bucket policy editor
  - the Firefox full-page lane drives actual browser zoom to 400% with `browser.zoom.full=true`, while asserting the native `1280px` window becomes a `320 CSS px` viewport at DPR `4`
  - the Firefox text-only lane drives actual browser zoom to 200% with `browser.zoom.full=false`, while asserting the `320 CSS px` viewport and DPR remain unchanged
  - all actual zoom modes focus representative activation controls, move through the bucket menu with `ArrowDown`, traverse the loaded Bucket Policy and Jobs filters sheets forward and backward with Tab before verifying `Escape` trigger restoration, move from Access through Support with the Settings tablist's `ArrowRight` contract, and fail if every sampled point inside the viewport-and-overflow-clipped focus rect is covered by another authored surface; exhaustive application-wide Tab and assistive-technology reading order remain manual evidence
  - the policy scenario verifies initial loading, long raw JSON content, pending provider validation, and a long validation error in the same constrained overlay
  - runs on the scheduled/manual workflow only and is not a pull-request required check
  - Playwright WebKit evidence does not prove physical Safari, WKWebView, or VoiceOver behavior

## Authoring Rules

Mobile responsive coverage should prove task completion on constrained viewports, not layout trivia.

- Prefer drawer, sheet, tab, filter, picker, queue, and persistence flows.
- Keep page-level checklist wording aligned with that rule; checklist items should describe reachable actions and stable outcomes, not viewport math.
- Keep bootstrap-only checks in `@check-smoke`; use `@mobile-responsive` only when the flow proves real mobile task completion.
- Keep device-context screenshots limited to representative high-risk shells; do not duplicate every desktop-project visual baseline.
- Let ordinary workflows inherit their project viewport so iPhone and Pixel exercise different dimensions; use fixed sizes only for named breakpoint, rotation, short-height, or responsive-transition probes.
- Do not add viewport-fit or element-measurement assertions just to prove a page is "responsive".
- Reuse `tests/support/geometry.ts` for required touch targets; it checks both rendered dimensions instead of allowing height-only local helpers.
- `frontend/tests` (including support helpers) and `frontend/playwright.config.ts` are guarded by `npm run check:e2e:geometry`.
- If a mobile Playwright test truly requires a geometry probe, mark the exact line with `e2e-geometry-allow` and a short reason.

## Required Check

- Branch protection and release gate should include the exact GitHub check name `Mobile Responsive E2E (Required)`.
- Release approval policy and required check context:
  - [RELEASE_GATE.md](../../docs/RELEASE_GATE.md)
- Page-specific QA checklists:
  - [OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md](./OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [JOBS_MOBILE_RESPONSIVE_CHECKLIST.md](./JOBS_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [UPLOADS_MOBILE_RESPONSIVE_CHECKLIST.md](./UPLOADS_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [PROFILES_MOBILE_RESPONSIVE_CHECKLIST.md](./PROFILES_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [BUCKETS_MOBILE_RESPONSIVE_CHECKLIST.md](./BUCKETS_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [SETTINGS_MOBILE_RESPONSIVE_CHECKLIST.md](./SETTINGS_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [LOGIN_MOBILE_RESPONSIVE_CHECKLIST.md](./LOGIN_MOBILE_RESPONSIVE_CHECKLIST.md)

## Dedicated Page Issue Template Policy

Use the shared mobile responsive issue form by default. Add a page-specific issue form only when the page meets most of the conditions below:

- the page has multiple distinct mobile sub-areas that need different triage options
- the page has page-specific terminology that would make the shared form too vague
- the page has a stable owner path that differs from the general shared frontend owner
- the page has repeated mobile regressions that benefit from a dedicated checklist in the issue form itself
- the page needs page-specific labels beyond the shared mobile responsive label set

Do not split into a dedicated page form when the page mainly needs:

- the shared mobile labels
- the shared ownership routing
- the shared viewport, overflow, drawer, sheet, tab, or form questions
- a checklist document without page-specific issue metadata

## Current Template Decision

- `Objects`: keep a dedicated issue form
  - reason: highest layout complexity, distinct drawers and global search states, page-specific labels, and separate ownership routing
- `Jobs`: keep using the shared mobile responsive issue form
  - reason: page-specific checklist is enough for current scope
- `Uploads`: keep using the shared mobile responsive issue form
  - reason: page-specific checklist is enough for current scope
- `Profiles`: keep using the shared mobile responsive issue form
  - reason: compact-card issues fit the shared form
- `Buckets`: keep using the shared mobile responsive issue form
  - reason: compact-card issues fit the shared form
- `Settings`: keep using the shared mobile responsive issue form
  - reason: tab and drawer issues fit the shared form
- `Login`: keep using the shared mobile responsive issue form
  - reason: form visibility and theme-toggle issues fit the shared form
