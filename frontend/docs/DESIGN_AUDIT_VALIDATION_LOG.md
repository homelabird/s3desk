# Design Audit Validation Log

Latest review: 2026-09-06. Earlier entries below retain their original dates.

Use this file to record the evidence required before the UI/UX design audit can be considered complete.

## 2026-09-06 Search, Buckets, and Logs Follow-up

All four findings from [the mobile/desktop review](../../notes/UI_UX_MOBILE_DESKTOP_REVIEW_2026-09-06.md) are implemented. Search rejects reversed size/date ranges without swapping displayed values, keeps visible filter labels, and resumes when corrected. Latest-error navigation scrolls the enclosing sheet and virtual log viewport and focuses log output. Buckets filters the loaded inventory by name and resets the query on authentication/profile changes.

Commands ran from `frontend/` through RTK. Final browser acceptance used the production build served at `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18136`, with separate `/tmp/s3desk-ux-four-*` output directories. This is local fixture evidence. Browser suites and command exit statuses below passed.

| Command / lane | Final result | Log |
| --- | --- | --- |
| `npm run test:unit -- --maxWorkers=2` | 254 files, 1,107 tests passed | `/tmp/s3desk-ux-four-unit-final.log` |
| Focused Objects search, Jobs overlays, and Buckets/search axe checks; exact selection below | 11 passed | `/tmp/s3desk-ux-four-core-preview.log` |
| `./node_modules/.bin/playwright test --grep @mobile-responsive --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=2` | 110 passed; full mobile lane | `/tmp/s3desk-ux-four-mobile-preview.log` |
| `./node_modules/.bin/playwright test --grep @visual --project=chromium --workers=2` | 35 passed after inspecting and updating four intended baselines | `/tmp/s3desk-ux-four-visual-final.log` |
| `npm run lint` | ESLint, CSS tokens, and import cycles passed | `/tmp/s3desk-ux-four-lint-final.log` |
| `npm run bundle:budget` | Passed, including fresh TypeScript and production analysis build | `/tmp/s3desk-ux-four-bundle-final.log` |
| `npm run check:e2e:geometry` | Passed after the final browser test edit | `/tmp/s3desk-ux-four-geometry-final.log` |
| `git diff --check` | Passed after final documentation edits | Terminal output |

The focused browser command was:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:18136 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-ux-four-core-preview ./node_modules/.bin/playwright test tests/objects-global-search.spec.ts tests/jobs-overlays.spec.ts tests/accessibility-overlays.spec.ts --project=chromium --workers=2 --grep "search range validation|search errors|global search and favorites|Jobs overlays|Objects global search|Buckets page has no"
```

The 156 final browser cases are distinct across the focused, full mobile, and visual lanes. Unit coverage verifies reversed and equal ranges, open size bounds, manual query refetch rejection, and authentication/profile resets. Browser coverage verifies linked errors and persistent labels; correction without sending reversed conditions; latest-error navigation through 3 and 650 log lines; filtered-log navigation and focus; and a 50-bucket search beyond the virtual window, empty matches, clearing, profile isolation, and Open/Manage actions. Range browser tests activate the field before editing and retain full input-visibility assertions at 320px.

Four existing PNG baselines changed: Buckets desktop/mobile in `design-audit-visual.spec.ts-snapshots`, and Objects global search light/dark in `objects-visual-regression.spec.ts-snapshots` and `dark-theme-visual-regression.spec.ts-snapshots`. The rendered changes were inspected before accepting the updates. Other existing dirty baseline changes were preserved. Baseline update logs are `/tmp/s3desk-ux-four-baselines-final.log` and `/tmp/s3desk-ux-four-search-baselines.log`.

An initial full unit run timed out in the existing Profiles import test. Its isolated recheck passed, followed by the complete 1,107-test run above with two workers. During browser iteration, icon-inclusive role names were corrected in new locators. Retained development-server search traces show `net::ERR_NETWORK_CHANGED` while fetching application modules; final acceptance therefore used the completed production build. The first dev-server mobile log reported 110 passing cases but its launcher returned 143, so the final preview run above, with exit status 0, is the accepted full-lane result. The initial visual run had 33 passing cases and two intended search-label baseline differences; the final comparison passed all 35.

Final compiled-app screenshots were also inspected in `/tmp/s3desk-browser-ux-four-fixed/`: `search-valid-desktop.png`, `search-invalid-dates-mobile-320.png`, `buckets-search-desktop.png`, and `logs-jump-fixed-mobile-320.png`. In the 320×568 log fixture, the error text moved from y≈678 before the fix to y≈532 and is fully visible; focus is on log output. Original audit artifacts remain separately linked in the review.

No backend/provider, deployment, physical-device, assistive-technology, Firefox, or WebKit gate was run. `./scripts/check.sh fast/full` and the entire desktop core suite were not run for this frontend follow-up. Local production-build rendering, mock API responses, touch emulation, and axe scans do not establish live-provider or deployed-runtime behavior. Bucket filter ownership is recorded in [Frontend State Boundaries](../../docs/FRONTEND_STATE_BOUNDARIES.md#bucket-name-search).

## 2026-09-06 Additional Findings Follow-up

All four findings from [the additional browser audit](../../notes/UI_UX_ADDITIONAL_AUDIT_2026-09-06.md) are implemented. Uploads now labels replacement explicitly and retains its in-memory draft across same-profile navigation. Scope changes clear only upload state. Transfers closes before selecting the linked job's profile and opening its details. Failed or unindexed searches no longer show a normal empty result, while failed refetches retain cached matches.

The browser tests cover replacement cancellation, two-file selection across Profiles/Buckets/Activity navigation, subsequent replacement, profile isolation, upload and job-artifact links from another profile, repeated opening of the same job, missing-job recovery, and the four search result states. A focused provider test verifies that clearing an upload draft preserves an unrelated page's edit. Existing folder queue coverage verifies that queueing clears the draft.

Commands ran from `frontend/` through RTK. Browser commands used `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18128` and a `PLAYWRIGHT_OUTPUT_DIR` matching the corresponding log stem. Artifacts under `/tmp` are disposable local evidence.

| Command | Result | Log |
| --- | --- | --- |
| `npm run test:unit -- --maxWorkers=4` | 254 files, 1,097 tests passed on the final implementation | `/tmp/s3desk-ux-followup-unit-final.log` |
| `npx playwright test tests/uploads-more-menu.spec.ts tests/transfers-drawer-actions.spec.ts tests/objects-global-search.spec.ts tests/page-load-recovery.spec.ts tests/accessibility-overlays.spec.ts --project=chromium --workers=2` | 49 passed; 4 failed during resource loading, then passed in the focused run below | `/tmp/s3desk-ux-followup-final.log` |
| `npx playwright test tests/accessibility-overlays.spec.ts:667 tests/accessibility-overlays.spec.ts:810 tests/page-load-recovery.spec.ts:67 tests/transfers-drawer-actions.spec.ts:190 --project=chromium --workers=1` | 7 passed, including all 4 failed cases and their parameterized siblings | `/tmp/s3desk-ux-followup-recheck.log` |
| `npx playwright test tests/objects-mobile-responsive.spec.ts tests/uploads-mobile-responsive.spec.ts tests/jobs-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=2` | 52 passed on the final implementation | `/tmp/s3desk-ux-followup-mobile-verified.log` |
| `npx playwright test --grep "@visual\|preserves drafts across navigation" --project=chromium --workers=2` | 37 passed: 35 visual comparisons and 2 extended draft-navigation cases; no baseline updates | `/tmp/s3desk-ux-followup-visual-verified.log` |
| `npm run lint` | Passed: ESLint, CSS tokens, import cycles | `/tmp/s3desk-ux-followup-lint-verified.log` |
| `npm run bundle:budget` | Passed, including a fresh TypeScript and production analysis build | `/tmp/s3desk-ux-followup-bundle-final.log` |
| `npm run check:e2e:geometry` | Passed after the final browser test edit | `/tmp/s3desk-ux-followup-geometry-final.log` |
| `git diff --check` | Passed after documentation edits | Terminal output |

The four loading failures had `net::ERR_NETWORK_CHANGED` for application JS/CSS in their Playwright traces, before the target workflows were reached. They are not recorded as initial passes. The single-worker recheck passed without a runtime change; together these runs cover all 53 distinct cases in that lane. An earlier search assertion ended while React Query was still retrying; its timeout was adjusted to wait for the terminal state. Obsolete replacement-label assertions and one TypeScript-only test option were corrected before the final unit/build results.

Across these lanes, 140 distinct browser cases have passing evidence after rechecks. The 37-case final run repeats the two upload draft cases after extending their navigation through Profiles, Buckets, and Activity; these and the seven rechecked cases are not counted twice. Existing visual baseline changes from the earlier five-finding follow-up were preserved, and this follow-up introduced no further baseline changes. Focused ESLint also passed for the final navigation-test edit.

Final implementation screenshots in `/tmp/s3desk-ux-followup-final/` include `uploads-draft-restored-and-replaced.png` and `search-error-without-empty-result.png`. Linked job detail captures are also available in `/tmp/s3desk-ux-followup-recheck/`. These were visually inspected to confirm the replacement label, preserved destination, focused job detail, and error presentation without a false empty result.

Uploads draft ownership is documented in [Frontend State Boundaries](../../docs/FRONTEND_STATE_BOUNDARIES.md#upload-drafts-across-routes). Files are retained only in memory until queueing, explicit clearing, or an authenticated/profile scope change; browser reload recovery is outside this change. Local mocks, Chromium, touch emulation, keyboard interactions, and axe do not prove physical-device, assistive-technology, live-provider, or deployed-runtime behavior. `./scripts/check.sh fast/full`, backend tests, Firefox, and WebKit were not run for this frontend-only follow-up. The earlier five-finding implementation and its results remain separately dated below.

## 2026-09-06 Browser Audit Follow-up

The five findings in [the browser audit](../../notes/UI_UX_BROWSER_AUDIT_2026-09-05.md) were implemented within their existing owners. No dependency, public API, or deployment change was needed.

| Finding | Result and evidence |
| --- | --- |
| Active transfer disappears on cleanup | Clear finished and individual Remove preserve every active download/upload phase. A mixed-queue unit test checks state and runtime references. The browser flow removes a finished upload while retaining the running upload and its active badge, observes no cancel request from cleanup, then explicitly cancels the remaining server job. |
| Job Details obscures status | Actions now scroll with the body; status/progress come first. At 320×568, the fixed header measures 81px instead of 249px and status is visible without scrolling. Mobile tests retain 44px action targets and the details/logs flow. |
| Upload destination and queue action are far apart | One selection summary replaces four cards; queue actions follow destination controls. At 390px, Prefix and Queue upload top positions are 64px apart instead of about 1,094px. Both are visible together at 320px and 390px after scrolling to the destination. Selection/prefix recovery and empty-bucket actions remain covered. |
| Stale automatic retry notice | Each fetch retry loop owns its notice and clears it in its completion path, including exhaustion and abort. Unit coverage checks concurrent failing requests, unrelated success, legacy status clearing, exhaustion, and manual recovery. Browser recovery checks reject lingering retry notices. |
| First Objects file is cut off | Mobile header rows and empty spacing are reduced while controls remain accessible. The first complete file row ends at y=558.83 in the 320×568 fixture; the visual test now requires that file row to be fully in the viewport. |

### Current verification

Commands ran from `frontend/` through RTK. Browser lanes used the same local Vite server with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18120`; each lane set a distinct `PLAYWRIGHT_OUTPUT_DIR` matching its log stem below. The counts below are final runs, excluding interim failures and snapshot generation.

| Command | Result | Log |
| --- | --- | --- |
| `npm run test:unit -- --maxWorkers=4` | 253 files, 1,094 tests passed | `/tmp/s3desk-ux-unit-final.log` |
| `npx playwright test tests/transfers-drawer-actions.spec.ts tests/page-load-recovery.spec.ts --project=chromium --workers=2` | 8 passed | `/tmp/s3desk-ux-core.log` |
| `npx playwright test tests/objects-mobile-responsive.spec.ts tests/uploads-mobile-responsive.spec.ts tests/jobs-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=2` | 52 passed | `/tmp/s3desk-ux-mobile-final.log` |
| `npx playwright test --grep @visual --project=chromium --workers=2` | 35 passed without snapshot updates | `/tmp/s3desk-ux-visual-final-0906.log` |
| `npx playwright test tests/accessibility-overlays.spec.ts tests/dark-theme-accessibility.spec.ts tests/wcag-reflow.spec.ts tests/objects-network-chaos.spec.ts tests/jobs-network.spec.ts --project=chromium --workers=2` | 54 passed | `/tmp/s3desk-ux-accessibility-0906.log` |
| `npm run lint` | Passed: ESLint, CSS tokens, import cycles | `/tmp/s3desk-ux-lint-final-0906.log` |
| `npm run build` | Passed: TypeScript and production build | `/tmp/s3desk-ux-build-final.log` |
| `npm run check:design` | Passed: tokens, patterns, tracked contrast; pattern advisories remain advisory | `/tmp/s3desk-ux-design-0906.log` |
| `npm run bundle:budget` | Passed | `/tmp/s3desk-ux-bundle-0906.log` |
| `npm run check:e2e:geometry` | Passed | `/tmp/s3desk-ux-geometry-0906.log` |
| `git diff --check` | Passed after final documentation edits | Terminal output |

The final browser lanes contain 149 passing tests. Eight intentional baseline changes were inspected: five Objects captures (light, dark, tablet, narrow mobile, bucket picker) and three Transfers captures (desktop and both mobile tabs). The prior `--update-snapshots=changed` run generated those changes; the separate 35-case run above verified them.

Interim checks exposed obsolete expectations for active Remove and the four selection cards, an empty-bucket action regression, and an icon-inclusive Refresh accessible-name mismatch. The empty-bucket action fallback was restored and the affected assertions were corrected before the final runs. Existing unrelated worktree changes, including the preceding test cleanup, were retained; the unit count difference from September 5 is not solely attributable to these five fixes.

### Direct browser evidence and limits

Fresh local captures are under `/tmp/s3desk-browser-ux-implemented/`: `activity-mobile-320-details.png`, `objects-mobile-320.png`, `uploads-mobile-destination.png`, `uploads-mobile-320-destination.png`, `uploads-desktop.png`, and `buckets-desktop-recovered.png`. Upload geometry and bucket recovery observations are recorded beside them in `uploads-geometry.json` and `bucket-recovery.json`. The mixed upload cleanup/cancel test captures `transfers-clear-keeps-active.png` under `/tmp/s3desk-ux-core/`.

These are local Chromium, mock-response, keyboard, axe, and touch-emulation results. They do not establish real-provider, physical-device, assistive-technology, deployed-runtime, Firefox, or WebKit behavior. Some fixture realtime-ticket requests reached the absent backend and logged proxy errors; the mock assertions passed. `./scripts/check.sh fast/full` and backend tests were not run for this frontend-only follow-up. `/tmp` evidence is disposable; the tracked browser assertions and visual baselines provide repeatable coverage.

## 2026-09-05 UI/UX Review

### Findings and changes

The review covered navigation, action hierarchy, responsive layouts, loading/error/empty states, keyboard recovery, and automated accessibility. Twelve current baseline captures were visually inspected across Login, Profiles, Buckets policy, Objects, Uploads, Activity, Settings, and Transfers, plus the newly reproduced bucket-list error captures. The sampled normal screens showed no additional blocking layout issue; this is not an exhaustive review of every state.

| Priority | Surface | Finding | Result |
| --- | --- | --- | --- |
| P1 | Buckets | After request retries were exhausted, the error advised retrying but exposed no retry action. | Added Retry to the error description, connected to the existing profile/token-scoped query. |
| P1 | Uploads | A destination-list error had no retry action; reloading the page would discard in-memory file selection. | Added Retry without navigation or selection reset. Browser checks retain the chosen file and destination prefix. |
| P2 | Activity | A failed history request also rendered an empty-history message, including a filter explanation when filters were active. | Failed loads now say “Activity could not be loaded” and direct users to the existing Refresh action. Filter/realtime actions no longer replace the failed-list recovery guidance. |
| P2 | Activity offline | Empty-state copy instructed users to retry realtime while its button was unavailable offline. | Reconnect guidance now takes precedence. |

Owners: `src/pages/buckets/BucketsPageShell.tsx`, `buildBucketsPageShellViewProps.ts`, `src/pages/uploads/UploadsPageShell.tsx`, `buildUploadsPagePresentationProps.ts`, and `src/pages/jobs/JobsEmptyState.tsx`/`JobsTableSection.tsx`. Existing query and presentation boundaries remain in use.

On an initial-load retry, React Query clears the failed state and the UI returns to its existing loading presentation; on a refetch with cached error data, the visible Retry button uses the fetching state. Requests use `cancelRefetch: false` to avoid restarting an existing fetch. Error-state buttons retain a descriptive accessible name and a minimum 44px mobile target.

### Current verification

Commands below ran from `frontend/`; shell execution used the repository's RTK wrapper. Artifacts under `/tmp` are local, disposable evidence.

| Command | Result | Log |
| --- | --- | --- |
| `npm run test:unit -- --maxWorkers=4` | 260 files, 1,156 tests passed | `/tmp/s3desk-ux-all-unit.log` |
| `PLAYWRIGHT_WEB_SERVER_PORT=18104 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-ux-recovery-verified npm run test:e2e -- tests/page-load-recovery.spec.ts --project=chromium --workers=1` | 6 passed; desktop and 320px recovery, keyboard Retry, preserved upload selection, four error-state axe scans | `/tmp/s3desk-ux-recovery-verified.log` |
| `PLAYWRIGHT_WEB_SERVER_PORT=18105 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-ux-accessibility npm run test:e2e -- tests/accessibility-overlays.spec.ts tests/dark-theme-accessibility.spec.ts tests/wcag-reflow.spec.ts --project=chromium --workers=3` | 51 passed | `/tmp/s3desk-ux-accessibility.log` |
| `PLAYWRIGHT_WEB_SERVER_PORT=18106 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-ux-mobile npm run test:e2e:mobile-responsive -- --workers=4` | 104 passed; iPhone 13 and Pixel 7 Chromium emulation | `/tmp/s3desk-ux-mobile.log` |
| `PLAYWRIGHT_WEB_SERVER_PORT=18107 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-ux-visual-final npm run test:e2e:visual -- --workers=3` | 35 passed; unchanged baselines | `/tmp/s3desk-ux-visual-final.log` |
| `npm run lint` | Passed: ESLint, CSS tokens, import cycles | `/tmp/s3desk-ux-lint-final.log` |
| `npm run build` | Passed: TypeScript and production build | `/tmp/s3desk-ux-build.log` |
| `npm run check:design` | Passed: token, pattern, and tracked contrast checks; pattern advisories remain advisory | `/tmp/s3desk-ux-design.log` |
| `npm run bundle:budget` | Passed | `/tmp/s3desk-ux-bundle.log` |
| `npm run check:e2e:geometry` | Passed | `/tmp/s3desk-ux-geometry.log` |
| `git diff --check` | Passed | Terminal output |

The final browser lanes above contain 196 passing tests. The initial 35-case visual capture run also passed (`/tmp/s3desk-ux-visual-baseline.log`, images in `/tmp/s3desk-ux-review-captures`); it is not counted again in that total. Mobile fixtures sometimes logged unmatched realtime-ticket requests to the absent local backend; the mock workflow assertions passed, and this does not provide backend connectivity evidence.

The pre-change bucket recovery cases failed at the missing Retry action at both widths. Initial Activity browser attempts ended during automatic retries; their timeouts are not proof of the empty-state defect. The final Activity fixture disables transport retries with the existing `apiRetryCount` setting, allows query retries to settle, and checks failed-to-empty recovery through Refresh. Unit coverage independently checks failed loads with filters in both layouts and offline guidance. Interim assertions were corrected for React Query's initial retry loading transition and the Refresh button's icon-inclusive accessible name.

No CSS tokens, dependencies, or visual baselines were changed. Local Chromium render, axe, keyboard, and emulation results do not establish physical-device, assistive-technology, live-provider, or deployment behavior. Firefox/WebKit and actual browser-zoom checks listed later are historical evidence and were not rerun for this review. The earlier project-wide `check.sh full` result is recorded separately in [the project quality report](../../notes/PROJECT_QUALITY_ANALYSIS_2026-09-05.md); this pass validates frontend UX changes.

## Command Results

### `npm run check:design`

- Status: Passed
- Started: 2026-08-23T08:43:45.481Z
- Finished: 2026-08-23T08:43:46.752Z
- Evidence:

```text
src/pages/objects/ObjectsImageViewer.module.css:104 [opacity styling] opacity: 0.86;
  Prefer semantic text/surface tokens over opacity for readable repeated UI.
src/pages/objects/ObjectsListView.module.css:650 [opacity styling] opacity: 0.6;
  Prefer semantic text/surface tokens over opacity for readable repeated UI.
src/pages/objects/ObjectsListView.module.css:294 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/ObjectsListView.module.css:480 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/ObjectsListView.module.css:587 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/ObjectsListView.module.css:291 [small hardcoded radius] border-radius: 6px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsListView.module.css:896 [small hardcoded radius] border-radius: 8px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsSearch.module.css:136 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/ObjectsSearch.module.css:112 [small hardcoded radius] border-radius: 6px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsSearch.module.css:245 [small hardcoded radius] border-radius: 6px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsSearch.module.css:672 [small hardcoded radius] border-radius: 8px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsShell.module.css:433 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/objects.module.css:72 [opacity styling] opacity: 0.6;
  Prefer semantic text/surface tokens over opacity for readable repeated UI.
src/pages/objects/objects.module.css:74 [shadow removed] box-shadow: none;
  Confirm this is intentional; audited surfaces should keep hierarchy through border, shadow, or accent.
src/pages/objects/objects.module.css:131 [shadow removed] box-shadow: none;
  Confirm this is intentional; audited surfaces should keep hierarchy through border, shadow, or accent.
src/pages/objects/objects.module.css:49 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/objects.module.css:139 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/objects.module.css:151 [small hardcoded radius] border-radius: 6px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/profiles/ProfileModal.module.css:28 [shadow removed] box-shadow: none;
  Confirm this is intentional; audited surfaces should keep hierarchy through border, shadow, or accent.
src/pages/profiles/ProfileModal.module.css:353 [shadow removed] box-shadow: none;
  Confirm this is intentional; audited surfaces should keep hierarchy through border, shadow, or accent.
src/pages/profiles/ProfileModal.module.css:526 [shadow removed] box-shadow: none;
  Confirm this is intentional; audited surfaces should keep hierarchy through border, shadow, or accent.
src/pages/profiles/ProfileModal.module.css:352 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/profiles/ProfileModal.module.css:429 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.

> frontend@0.0.0 check:design-contrast
> node ./scripts/check-design-contrast.mjs

light 15.01 body text on card
light  6.74 secondary text on card
light  4.71 muted text on card
light 13.86 body text on page
light 15.27 body text on input
light  3.93 disabled text on disabled bg
light  5.10 primary link on card
light  7.70 warning text on warning bg
light  5.91 error text on error bg
light  5.17 success text on success bg
light 13.35 tooltip text on tooltip bg
light  6.57 sidebar text on sidebar bg
light  4.59 sidebar secondary on sidebar bg
light  5.36 sidebar active text on sidebar active bg
dark  11.62 body text on card
dark   7.90 secondary text on card
dark   5.60 muted text on card
dark  12.79 body text on page
dark  12.04 body text on input
dark   4.53 disabled text on disabled bg
dark   6.79 primary link on card
dark   6.21 warning text on warning bg
dark   8.38 error text on error bg
dark   5.25 success text on success bg
dark  10.54 tooltip text on tooltip bg
dark  10.26 sidebar text on sidebar bg
dark   5.87 sidebar secondary on sidebar bg
dark   8.18 sidebar active text on sidebar active bg

All tracked design contrast pairs meet their advisory thresholds.
```

- Notes:


### `npm run check:css-tokens`

- Status: Passed via `npm run check:design`
- Evidence: See the `npm run check:design` command output above.
- Notes: Covered by `npm run check:design` when that aggregate command is run.


### `npm run check:design-audit`

- Status: Passed via `npm run check:design`
- Evidence: See the `npm run check:design` command output above.
- Notes: Covered by `npm run check:design` when that aggregate command is run.


### `npm run check:design-contrast`

- Status: Passed via `npm run check:design`
- Evidence: See the `npm run check:design` command output above.
- Notes: Covered by `npm run check:design` when that aggregate command is run.


### `npm run build`

- Status: Passed
- Started: 2026-08-23T08:43:46.752Z
- Finished: 2026-08-23T08:44:05.959Z
- Evidence:

```text
dist/assets/FileTextOutlined-D82Ltpma.js                   0.98 kB │ gzip:  0.63 kB
dist/assets/format-CHLMx_6j.js                             1.01 kB │ gzip:  0.38 kB
dist/assets/ObjectsGoToPathModal-c41Ie5s5.js               1.23 kB │ gzip:  0.67 kB
dist/assets/ReloadOutlined-CK6ZyKW0.js                     1.25 kB │ gzip:  0.78 kB
dist/assets/transfer-BD0BE-dN.js                           1.32 kB │ gzip:  0.63 kB
dist/assets/UploadSourceSheet-Dxofj_pF.js                  1.61 kB │ gzip:  0.78 kB
dist/assets/ObjectsContextMenuPortal-DcuCfSYC.js           1.70 kB │ gzip:  0.88 kB
dist/assets/UploadsPage-BaeZy9Bj.js                        1.89 kB │ gzip:  0.82 kB
dist/assets/ObjectsPresignModal-BoVVj9pt.js                1.93 kB │ gzip:  0.98 kB
dist/assets/objectsNewFolderFeedback-D_jpb3LS.js           1.96 kB │ gzip:  0.98 kB
dist/assets/ObjectsCommandPaletteModal-xVJrDR6W.js         2.02 kB │ gzip:  1.07 kB
dist/assets/ObjectsRenameModal-Dwc_0s0V.js                 2.07 kB │ gzip:  0.97 kB
dist/assets/objectsDeferredActionRuntime-C-9wp6HF.js       2.16 kB │ gzip:  0.96 kB
dist/assets/objectsNewFolderRuntime-DkdUiDth.js            2.19 kB │ gzip:  1.08 kB
dist/assets/ObjectsDownloadPrefixModal-5qszijt5.js         2.34 kB │ gzip:  1.18 kB
dist/assets/objectsJobFeedback-C85-k_br.js                 2.37 kB │ gzip:  1.01 kB
dist/assets/AccessSettingsSection-BqUmVVG5.js              2.42 kB │ gzip:  1.10 kB
dist/assets/ObjectThumbnail-CKW1xK4h.js                    2.65 kB │ gzip:  1.23 kB
dist/assets/ObjectsCopyMoveModal-BlRknx-I.js               2.70 kB │ gzip:  1.15 kB
dist/assets/loadObjectThumbnailAsset-BaM4Gd5w.js           2.81 kB │ gzip:  1.21 kB
dist/assets/NetworkSettingsSection-B65-wiMA.js             2.85 kB │ gzip:  1.24 kB
dist/assets/ObjectsSettingsSection-DZ-s2U_Q.js             2.86 kB │ gzip:  1.15 kB
dist/assets/ObjectsNewFolderModal-DlDl_5n0.js              2.89 kB │ gzip:  1.28 kB
dist/assets/objectsClipboardRuntime-PcaA6-tN.js            3.04 kB │ gzip:  1.41 kB
dist/assets/objectsDndRuntime-BB_oPiJu.js                  3.05 kB │ gzip:  1.31 kB
dist/assets/ObjectsPageHeader-j53i9EAf.js                  3.19 kB │ gzip:  1.27 kB
dist/assets/ObjectsMoveSelectionSheet-DdGGaYy7.js          3.57 kB │ gzip:  1.48 kB
dist/assets/ObjectsListHeader-BhX9fozm.js                  3.57 kB │ gzip:  1.54 kB
dist/assets/LoginPage-C3ty5-7T.js                          3.74 kB │ gzip:  1.77 kB
dist/assets/AppTabs-CvKjjk9O.js                            4.23 kB │ gzip:  1.81 kB
dist/assets/DeletePrefixJobModal-BskDNYjA.js               4.70 kB │ gzip:  2.06 kB
dist/assets/ObjectsListContent-5pQt1Mqt.js                 4.80 kB │ gzip:  2.02 kB
dist/assets/ObjectsPageOverlays-Cfty_LCR.js                4.81 kB │ gzip:  1.48 kB
dist/assets/ObjectsSearch.module-iW3S1b5W.js               4.86 kB │ gzip:  1.52 kB
dist/assets/ObjectsCopyPrefixModal-BhPmNAgy.js             4.87 kB │ gzip:  1.81 kB
dist/assets/objectPreviewRuntime-DHzYmD4F.js               4.99 kB │ gzip:  1.77 kB
dist/assets/ProfilesModals-z_baG7a0.js                     5.12 kB │ gzip:  1.93 kB
dist/assets/Overflow-CAqdEd9c.js                           5.28 kB │ gzip:  2.49 kB
dist/assets/transfersUploadUtils-Cacn14re.js               5.29 kB │ gzip:  2.18 kB
dist/assets/presignedUpload-DHXY826J.js                    5.46 kB │ gzip:  2.20 kB
dist/assets/ObjectsFiltersDrawer-DELvjruc.js               5.53 kB │ gzip:  1.67 kB
dist/assets/useJobsRealtimeEvents-Drw3w7H_.js              5.98 kB │ gzip:  2.46 kB
dist/assets/TransfersSettingsSection-Cw5zOi7P.js           6.09 kB │ gzip:  1.85 kB
dist/assets/bucketPolicyDecisionGuide-FF81C9YV.js          6.60 kB │ gzip:  1.61 kB
dist/assets/ObjectsListControls-BMccMY63.js                6.65 kB │ gzip:  2.05 kB
dist/assets/ObjectsDeletePrefixConfirmModal-CFw0nrk2.js    7.62 kB │ gzip:  2.88 kB
dist/assets/index-ClCwWlg0.js                              7.65 kB │ gzip:  2.71 kB
dist/assets/index-C7tz1Nyg.js                              7.98 kB │ gzip:  3.13 kB
dist/assets/objectsRefreshEvents-CsOsUocT.js               8.06 kB │ gzip:  2.88 kB
dist/assets/ServerSettingsSection-DgCnP-Tb.js              8.41 kB │ gzip:  3.52 kB
dist/assets/SettingsDrawer-DPAHjQu3.js                     8.72 kB │ gzip:  3.10 kB
dist/assets/ObjectsImageViewerModal-DzUwQOFZ.js           11.94 kB │ gzip:  3.87 kB
dist/assets/vendor-ui-BV5vKm2k.js                         11.96 kB │ gzip:  4.87 kB
dist/assets/vendor-react-CATs5nEF.js                      12.23 kB │ gzip:  4.74 kB
dist/assets/ObjectsDetailsPanelSection-C15gXVDN.js        13.67 kB │ gzip:  3.58 kB
dist/assets/ObjectsGlobalSearchDrawer-CFwTpBkz.js         14.22 kB │ gzip:  4.06 kB
dist/assets/vendor-tanstack-virtual-Zl4lkMR9.js           14.42 kB │ gzip:  4.77 kB
dist/assets/UploadsPageExperience-Bsk-K5tc.js             15.14 kB │ gzip:  4.71 kB
dist/assets/TransfersRuntimeUiHost-CdRTiNbN.js            15.98 kB │ gzip:  4.70 kB
dist/assets/ObjectsTreeSection-DJCD7r9e.js                16.53 kB │ gzip:  5.93 kB
dist/assets/BucketModal-C4GyCjlS.js                       19.87 kB │ gzip:  4.88 kB
dist/assets/ObjectsToolbarSection-I6PD6Vq0.js             21.08 kB │ gzip:  6.58 kB
dist/assets/BucketsPage-KMgTPU2d.js                       22.17 kB │ gzip:  6.52 kB
dist/assets/JobsOverlaysHost-CiDE5zIm.js                  35.27 kB │ gzip: 11.32 kB
dist/assets/vendor-react-router-BEGUCwle.js               35.99 kB │ gzip: 13.08 kB
dist/assets/vendor-tanstack-CrdBuhJL.js                   37.12 kB │ gzip: 11.11 kB
dist/assets/ProfileModal-2PGD27UG.js                      39.85 kB │ gzip:  9.84 kB
dist/assets/BucketPolicyModal-CrrbUd9S.js                 40.10 kB │ gzip: 11.10 kB
dist/assets/Transfers-CfqzvYZQ.js                         41.99 kB │ gzip: 12.60 kB
dist/assets/JobsPage-IAwg-Rc_.js                          58.51 kB │ gzip: 17.67 kB
dist/assets/BucketGovernanceModal-RqmZY380.js             58.78 kB │ gzip: 13.81 kB
dist/assets/index-e9cKLUxW.js                             62.89 kB │ gzip: 22.33 kB
dist/assets/vendor-ui-upload-B8cV-TPx.js                  63.49 kB │ gzip: 20.65 kB
dist/assets/SidebarBackupDrawer-B_KXV7uq.js               63.52 kB │ gzip: 19.86 kB
dist/assets/vendor-data-4eDMv0oK.js                       97.26 kB │ gzip: 30.35 kB
dist/assets/vendor-ui-collapse-CIs3KKIV.js               126.69 kB │ gzip: 45.76 kB
dist/assets/vendor-react-dom-DYDFLMQG.js                 180.26 kB │ gzip: 56.27 kB
dist/assets/index-DOUQ5-FG.js                            317.71 kB │ gzip: 95.38 kB
dist/assets/ObjectsPage-CoEj_65G.js                      319.30 kB │ gzip: 84.91 kB
✓ built in 6.81s
```

- Notes:


### `npm run test:e2e:design-audit`

- Status: Passed
- Started: 2026-08-23T08:44:05.959Z
- Finished: 2026-08-23T08:44:29.184Z
- Evidence:

```text
> frontend@0.0.0 test:e2e:design-audit
> playwright test tests/design-audit-visual.spec.ts --project=chromium


Running 10 tests using 1 worker

  ✓   1 [chromium] › tests/design-audit-visual.spec.ts:49:2 › Design audit visual smoke @visual › Objects shell hierarchy remains visible in light mode (2.7s)
  ✓   2 [chromium] › tests/design-audit-visual.spec.ts:60:2 › Design audit visual smoke @visual › Objects shell hierarchy remains visible in dark mode (2.1s)
  ✓   3 [chromium] › tests/design-audit-visual.spec.ts:66:2 › Design audit visual smoke @visual › Objects shell hierarchy remains visible at tablet width (1.9s)
  ✓   4 [chromium] › tests/design-audit-visual.spec.ts:72:2 › Design audit visual smoke @visual › Objects shell remains usable at the narrow mobile floor (1.9s)
  ✓   5 [chromium] › tests/design-audit-visual.spec.ts:96:2 › Design audit visual smoke @visual › Objects bucket picker floating surface remains distinct (2.1s)
  ✓   6 [chromium] › tests/design-audit-visual.spec.ts:105:2 › Design audit visual smoke @visual › Jobs operational surfaces remain scannable on mobile (1.8s)
  ✓   7 [chromium] › tests/design-audit-visual.spec.ts:119:2 › Design audit visual smoke @visual › Uploads workflow cards remain distinct on mobile (1.3s)
  ✓   8 [chromium] › tests/design-audit-visual.spec.ts:132:2 › Design audit visual smoke @visual › Profiles switches cleanly between desktop table and mobile cards (1.3s)
  ✓   9 [chromium] › tests/design-audit-visual.spec.ts:145:2 › Design audit visual smoke @visual › Profiles mobile cards preserve hierarchy in dark mode (987ms)
  ✓  10 [chromium] › tests/design-audit-visual.spec.ts:157:2 › Design audit visual smoke @visual › Buckets switches cleanly between desktop table and mobile cards (1.6s)

  10 passed (22.0s)

[WebServer] (node:458516) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:458235) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
(node:459115) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node-22 --trace-warnings ...` to show where the warning was created)
(node:459115) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node-22 --trace-warnings ...` to show where the warning was created)
[WebServer] 5:44:17 PM [vite] http proxy error: /api/v1/buckets/objects-mobile-bucket/objects/thumbnail?key=preview.png&size=34&objectSize=2048&etag=%22preview%22&lastModified=2024-01-01T00%3A00%3A00Z
[WebServer] Error: connect ECONNREFUSED 127.0.0.1:8080
[WebServer]     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1637:16)
[WebServer] 5:44:17 PM [vite] http proxy error: /api/v1/buckets/objects-mobile-bucket/objects/thumbnail?key=preview.png&size=34&objectSize=2048&etag=%22preview%22&lastModified=2024-01-01T00%3A00%3A00Z
[WebServer] Error: connect ECONNREFUSED 127.0.0.1:8080
[WebServer]     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1637:16)
```

- Notes:

The 10 focused Chromium cases passed against the local test fixtures. Two thumbnail requests logged a refused `127.0.0.1:8080` proxy fallback, so this run is not live-backend or provider evidence.


## Supplemental Verification

### `npm run test:e2e:visual`

- Status: Passed on 2026-08-23
- Evidence: `35 passed (50.4s)` with five workers and global `maxDiffPixels: 100`
- Notes: A transparent Login theme-control mutation failed both mobile and desktop screenshots (405 and 389 differing pixels), proving the strict budget catches the previously missed regression.

### `npm run test:e2e:mobile-responsive`

- Status: Passed on 2026-08-23
- Evidence: `104 passed (1.2m)` across `mobile-iphone-13` and `mobile-pixel-7`
- Notes: The required device projects now include inspected Login and Jobs screenshot sentinels; both remain mock Chromium evidence rather than physical-device or Safari proof.

### `npm run test:e2e:firefox-reflow`

- Status: Passed on 2026-08-24
- Evidence: `8 passed (18.7s)` for Login, Profiles, Buckets, Objects, the bucket policy editor, Uploads, Jobs, and Settings
- Notes: This is automated Firefox reflow, computed-text resize, and pointer-target evidence. The earlier headed probe only checked `innerWidth` and `devicePixelRatio`, so it did not distinguish failed full-page zoom from successful text-only zoom.

### Firefox 200% browser text-only zoom command

- Status: Passed on 2026-08-24
- Command: `PLAYWRIGHT_FIREFOX=1 PLAYWRIGHT_FIREFOX_TEXT_ONLY_ZOOM=1 PLAYWRIGHT_HEADLESS=0 npx playwright test tests/wcag-reflow.spec.ts --project=firefox-reflow --workers=1`
- Evidence: `8 passed (27.8s)` in `mcr.microsoft.com/playwright:v1.57.0-noble` after Firefox reported text scale `200%` while retaining `innerWidth: 320` and `devicePixelRatio: 1`
- Notes: The lane launches Firefox with `browser.zoom.full=false`, sends six real browser-window zoom increments through Xvfb/xdotool, and reuses the seven core-route scenarios plus the bucket policy editor. The bucket menu uses `ArrowDown` from its initial focused item to Policy editor; after loading, the sheet traverses 16 forward and 8 reverse Tab stops before `Escape` restores an exposed Manage trigger. The Jobs filters sheet traverses 10 forward and 6 reverse Tab stops before `Escape` restores an exposed Filters trigger; the Settings tablist uses `ArrowRight` from Access through Support. Every focused stop is sampled inside its viewport-and-overflow-clipped rect. A standalone browser probe also held a `100px` image fixed while `16px` text grew to `32px`. This is actual Firefox text-only zoom geometry and representative keyboard evidence, not exhaustive application-wide Tab, manual visual review, assistive-technology, or physical-device proof.

### Firefox 400% browser full-page zoom command

- Status: Passed on 2026-08-24
- Command: `PLAYWRIGHT_FIREFOX=1 PLAYWRIGHT_FIREFOX_FULL_PAGE_ZOOM=1 PLAYWRIGHT_HEADLESS=0 npx playwright test tests/wcag-reflow.spec.ts --project=firefox-reflow --workers=1`
- Evidence: `8 passed (29.9s)` in `mcr.microsoft.com/playwright:v1.57.0-noble` after Firefox changed from `innerWidth: 1280` and DPR `1` to `innerWidth: 320` and DPR `4`
- Notes: The lane launches Firefox with `browser.zoom.full=true`, disables Playwright viewport emulation, sizes the native browser window to `1280×800`, and sends nine real browser-window zoom increments through Xvfb/xdotool. Post-zoom controls use their accessible keyboard activation because Playwright's Firefox pointer coordinates remain mapped to the unzoomed window. The Bucket Policy menu verifies initial focus on Controls, `ArrowDown` focus on Policy editor, and `Enter` activation; after loading, the sheet traverses 16 forward and 8 reverse Tab stops before `Escape` restores an exposed Manage trigger. The Jobs filters sheet traverses 10 forward and 6 reverse Tab stops before `Escape` restores an exposed Filters trigger; the Settings tablist verifies `ArrowRight` focus and selection from Access through Support. The traversal exposed an offscreen shared sheet footer at the 179 CSS px content height, and the shared panel overflow fallback fixed it. The same path passed in actual Chromium 400% and Firefox 200% text-only zoom. This is actual Firefox full-page zoom geometry and representative keyboard evidence, not exhaustive application-wide Tab, manual visual review, assistive-technology, or physical-device proof.

### `npm run test:e2e:webkit-reflow`

- Status: Passed on 2026-08-23
- Evidence: `8 passed (22.5s)` in `mcr.microsoft.com/playwright:v1.57.0-noble`, matching the repository Playwright version
- Notes: The native host run did not execute product tests because browser launch failed on missing WebKit host libraries. The version-matched official container supplied those dependencies. This is WebKit engine evidence, not physical Safari, WKWebView, VoiceOver, or real-device proof.

### Chromium 400% browser UI zoom command

- Status: Passed on 2026-08-24
- Command: `PLAYWRIGHT_BROWSER_UI_ZOOM=1 PLAYWRIGHT_HEADLESS=0 xvfb-run -a npx playwright test tests/wcag-reflow.spec.ts --project=chromium --workers=1`
- Evidence: `8 passed (26.9s)` after the headful Chromium window reported `innerWidth: 320` and `devicePixelRatio: 4` at 400% browser UI zoom from a 1280px viewport
- Notes: The seven core-route scenarios plus the bucket policy editor reused the same reflow, pointer-target, and computed-text resize checks under actual Chromium browser zoom. The policy scenario holds the initial policy request, renders a long S3 resource, traverses the ready sheet in both Tab directions, verifies `Escape` trigger restoration, holds provider validation, and renders a long provider error before checking reflow. The Jobs filters sheet also traverses forward and backward before restoring its exposed trigger. It previously exposed StrictMode cleanup leaving policy actions permanently inactive; the policy editor, policy mutations, governance mutations, Jobs actions, and Profiles scope guards now reactivate during effect setup, with 21 focused unit tests covering the affected owners. The earlier raw JSON textarea fix preserves vertical scrolling at 200% text size, and the new shared panel overflow fallback keeps short-viewport sheet footers reachable. The same run also verified native `ArrowDown` Bucket Policy menu traversal and `ArrowRight` Settings tab traversal with focus non-obscuration. Xvfb and `xdotool` supplied browser-window input in the version-matched official Playwright container. This remains automated Chromium geometry and representative keyboard evidence, not exhaustive application-wide Tab, manual browser review, or assistive-technology/physical-device proof.

### `npm run lint`

- Status: Passed
- Evidence: ESLint, CSS token check, and import-cycle check all completed successfully.
- Notes: On 2026-08-23, `check:css-tokens` reported `ok (49 CSS files, 93 tokens)` and `check:import-cycles` reported `ok (548 files, 1130 runtime edges)`.

### `npm run bundle:budget`

- Status: Passed
- Evidence: Production build and bundle report completed successfully on 2026-08-23.
- Notes:

### `git diff --check`

- Status: Passed
- Evidence: No whitespace or conflict-marker issues reported.
- Notes:

### `./scripts/check.sh fast` and `./scripts/check.sh full`

- Status: Passed on 2026-08-24
- Evidence: The full gate completed backend security analysis, 252 frontend test files with 1,025 passing unit tests, a 3,416-module production build, and 2 passing Chromium smoke tests.
- Notes: This is the current mixed worktree's full local gate. It does not prove live-provider, deployed-runtime, physical-device, or assistive-technology behavior.

## Manual Visual QA Results

The broad review began on 2026-05-24. On 2026-08-23, the ten baselines exposed by the stricter visual budget and the four newly covered desktop surfaces were inspected before acceptance.

### Light theme desktop

- Status: Reviewed on 2026-08-23
- Screens reviewed: object shell light/tablet, object bucket picker, Profiles, Buckets, Jobs, Login, Uploads, Settings, and Transfers desktop surfaces
- Findings: Surface separation, page hierarchy, input focus, table/card contrast, and overlay boundaries are visible without relying on faint gray-only states.

### Dark theme desktop

- Status: Object shell reviewed on 2026-08-23; global-search cases remain the 2026-05-24 review
- Screens reviewed: object shell dark smoke; historical dark global search drawer and long-key global search row
- Findings: Text and table headers remain readable; long object keys wrap inside the key column without colliding with size, modified, or action columns.

### Mobile

- Status: Reviewed on 2026-08-23
- Screens reviewed: login token panel, image viewer, jobs filters, transfers, uploads source, bucket create/delete/governance flows, profile dialogs, and settings drawer
- Findings: Modal/sheet/card hierarchy is visible at 390px width; the login theme button, brand lockup, token field, and login action remain inside the viewport.

## Regression Findings

- Dark-mode global search initially allowed long object keys to visually collide with adjacent columns. Fixed by constraining the key column and adding geometry coverage in `tests/dark-theme-visual-regression.spec.ts`.
- Mobile login initially rendered the theme button row and token panel as side-by-side flex items at 390px, pushing the panel offscreen. Fixed by switching the mobile login shell to column flow and adding viewport-bound assertions plus `login-mobile-token-panel.png`.
- Tablet object shell coverage was added so intermediate responsive layout hierarchy is checked in addition to desktop and mobile captures.

## Completion Decision

- Status: Current local automated design verification complete.
- Reason: Static design checks, contrast checks, build, focused and full visual Chromium suites, actual Chromium UI zoom, actual Firefox full-page and text-only zoom, Firefox/WebKit reflow, strict mutation detection, lint, bundle budget, whitespace checks, and current baseline review passed on 2026-08-24. Manual browser visual review, physical Safari/WKWebView, assistive technology, real-device, live-provider, and deployed-runtime evidence remain separate.
