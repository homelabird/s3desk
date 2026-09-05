# Design Audit Implementation Status

Originally audited: 2026-05-24
Last updated: 2026-09-06

## Objective

Track the implementation state for the project-wide UI/UX design audit focused on color, contrast, visual hierarchy, and discoverability issues.

## 2026-09-06 Mobile and Desktop Review Follow-up

- Reversed size/date ranges now show linked field errors and block automatic search and Refresh. Manual query refetch also rejects invalid ranges before reaching the API. Correcting the inputs resumes search without silently swapping boundaries.
- Global search uses persistent visible filter labels. Latest-error navigation scrolls both the sheet and the virtual log list, then focuses log output.
- Buckets supports case-insensitive name filtering across the loaded inventory, a result count, an empty-match state, and Clear search. Authentication and profile changes reset the filter.
- Original findings and implementation details are in [the browser review](../../notes/UI_UX_MOBILE_DESKTOP_REVIEW_2026-09-06.md); final commands and evidence limits are in [the validation log](DESIGN_AUDIT_VALIDATION_LOG.md#2026-09-06-search-buckets-and-logs-follow-up).

## 2026-09-06 Additional Findings Follow-up

- Uploads labels the existing replacement behavior as Replace selection once files are selected. Canceling a replacement preserves the current draft.
- Selected files and folder metadata survive same-profile route navigation in memory. Scope changes clear the upload draft without remounting unrelated pages.
- Transfers closes before opening the linked job's details and selects the matching profile. Upload and job-artifact download rows share this behavior; a missing job can be closed to return to history.
- Failed and unindexed searches omit the normal empty-result message; refetch errors retain existing matches and filters.
- Original findings and completion evidence are in [the additional audit](../../notes/UI_UX_ADDITIONAL_AUDIT_2026-09-06.md) and [the validation log](DESIGN_AUDIT_VALIDATION_LOG.md#2026-09-06-additional-findings-follow-up).

## 2026-09-06 Browser Audit Follow-up

- Transfers now offers Clear finished for completed, failed, and canceled records across both queues. Active transfers stay visible; Remove is restricted to finished records, and Cancel remains a separate action.
- Job Details keeps only the title and close control in its fixed header. Actions scroll with the body, and status/progress precede technical details. The 320×568 fixture header shrank from 249px to 81px.
- Uploads places its queue action immediately after the destination controls and uses one selection summary line. Selected files, prefix, and empty/error recovery actions are preserved.
- Retry notices follow individual requests through retry, completion, exhaustion, and abort. Finishing an unrelated request cannot clear another request's notice.
- Objects uses less mobile header space while retaining its controls. The complete first file row is visible in the audited 320×568 fixture.
- All five findings from [the browser audit](../../notes/UI_UX_BROWSER_AUDIT_2026-09-05.md) are implemented and locally verified. Commands, screenshots, baseline changes, and environment limits are in [the validation log](DESIGN_AUDIT_VALIDATION_LOG.md#2026-09-06-browser-audit-follow-up).

## 2026-09-05 UX Recovery Review

- Buckets and Uploads now expose an accessible Retry button when bucket listing fails. It reuses the scoped query and preserves the selected upload files and destination prefix.
- Activity distinguishes a failed history request from a successful empty result. Offline guidance asks users to reconnect; it does not direct them to an unavailable realtime retry action.
- The review sampled current light/dark desktop and narrow mobile screenshots across the main screens and added desktop/320px browser recovery coverage, including keyboard activation and axe scans of the bucket error states.
- Findings, commands, results, and environment limits are recorded in [the validation log](DESIGN_AUDIT_VALIDATION_LOG.md#2026-09-05-uiux-review).

## Completed Implementation Areas

- Global light/dark color tokens and Ant Design token bridge
- App shell background, sidebar hierarchy, header separation, and sticky chrome
- Shared page headers, sections, tabs, overlays, sheets, popovers, menus, and dialogs
- Shared form labels, helper text, native selects, number inputs, switches, and help triggers
- Login, initial profile selection, loading state, and light app surfaces
- Mobile login/token panel viewport fit and layout guard
- Buckets list, bucket creation modal, bucket policy modal, and bucket governance modal
- Profiles list and profile create/edit modal
- Objects browser list, grid, bucket picker, details, favorites, global search, thumbnails, and image viewer
- Uploads page and upload source sheet
- Jobs page, virtual table, logs drawer, toolbar, diagnostics, and upload table surfaces
- Settings page apply/recovery/log surfaces
- Backup drawer, transfer rows, and tree status/selection states
- Dark-mode global search long-key wrapping and column-boundary guard
- Design token usage guide
- Visual QA checklist
- Design audit visual smoke spec for key light/dark/tablet/mobile hierarchy surfaces
- CSS ownership cleanup for orphan modules, retired selectors, and unused design tokens

## Files Added

- `frontend/docs/UI_UX_DESIGN_AUDIT.md`
- `frontend/docs/DESIGN_TOKEN_USAGE.md`
- `frontend/docs/DESIGN_CONTRAST_MATRIX.md`
- `frontend/docs/VISUAL_QA_CHECKLIST.md`
- `frontend/docs/DESIGN_AUDIT_IMPLEMENTATION_STATUS.md`
- `frontend/docs/DESIGN_AUDIT_VALIDATION_LOG.md`

## Files Added For Validation Coverage

- `frontend/tests/design-audit-visual.spec.ts`
- `frontend/tests/design-audit-visual.spec.ts-snapshots/`
- `frontend/tests/workflows-visual-regression.spec.ts-snapshots/login-mobile-token-panel-chromium-linux.png`

## Files Updated For Validation Coverage

- `frontend/tests/dark-theme-visual-regression.spec.ts`
- `frontend/tests/workflows-visual-regression.spec.ts`

## Commands Added For Validation

- `npm run check:design`
- `npm run check:design-audit`
- `npm run check:design-contrast`
- `npm run test:e2e:design-audit`
- `npm run validate:design-audit`

## 2026-08-23 Verification

- `npm run check:design`
- `npm run check:css-tokens` through `npm run check:design`
- `npm run check:design-audit` through `npm run check:design`
- `npm run check:design-contrast` through `npm run check:design`
- `npm run build`
- `npm run test:e2e:design-audit`: 10 passed
- `npm run test:e2e:visual`: 35 passed with a viewport-independent 100-pixel diff budget
- `npm run test:e2e:mobile-responsive`: 104 passed, including Login and Jobs iPhone/Pixel visual sentinels
- `npm run test:e2e:firefox-reflow`: 8 passed
- `PLAYWRIGHT_FIREFOX=1 PLAYWRIGHT_FIREFOX_TEXT_ONLY_ZOOM=1 PLAYWRIGHT_HEADLESS=0 npx playwright test tests/wcag-reflow.spec.ts --project=firefox-reflow --workers=1`: 8 passed with actual Firefox 200% text-only zoom (`innerWidth: 320`, `devicePixelRatio: 1`, computed text scale `200%`)
- `npm run test:e2e:webkit-reflow`: 8 passed in the version-matched official Playwright container
- `PLAYWRIGHT_BROWSER_UI_ZOOM=1 PLAYWRIGHT_HEADLESS=0 xvfb-run -a npx playwright test tests/wcag-reflow.spec.ts --project=chromium --workers=1`: 8 passed with actual 400% headful Chromium zoom (`1280px` to `320 CSS px`)
- The bucket policy scenario covers initial loading, a long S3 resource, pending provider validation, and a long provider error without page or overlay overflow
- StrictMode action guards remain active after replayed mount effects; 21 focused policy, governance, Jobs, and Profiles unit tests passed
- `./scripts/check.sh fast`
- `./scripts/check.sh full`: backend security analysis, 1,025 frontend unit tests, production build, and 2 Chromium smoke tests passed
- `npm run lint`
- `npm run bundle:budget`
- `git diff --check`
- CSS ownership audit: 48 modules, with no orphan modules/classes, unused tokens/keyframes, or exact duplicate rules

The full visual suite was rerun on 2026-08-23 after replacing the viewport-relative 1% tolerance with a 100-pixel absolute budget. Ten stale baselines exposed by the stricter contract were inspected and refreshed against the current worktree; the complete 35-case suite then passed with five workers.

## Remaining Advisory Notes

- `npm run check:design-audit` reports 58 advisory review prompts for intentional transparent controls, compact radii, and selected opacity/shadow cases. The command is advisory by design and passed without `--fail-on-findings`.
- Full real-data visual review is still recommended after new data-heavy workflows are added, but the audited fixtures cover the current high-risk hierarchy and contrast surfaces.

## Completion Criteria

The design audit work should not be marked complete until all of the following are true:

- The implementation files are present in the current worktree.
- The audit report documents the original issues, applied work, and remaining validation needs.
- Token usage guidance exists for future UI work.
- Contrast token pair guidance exists for implementation and visual QA.
- Visual QA checklist exists and covers required screens, states, and evidence.
- CSS token validation passes.
- Build succeeds.
- Browser visual QA confirms the hierarchy improvements in light and dark modes.
- Any regressions discovered during validation are either fixed or explicitly logged as follow-up work.
- Validation evidence is recorded in `frontend/docs/DESIGN_AUDIT_VALIDATION_LOG.md`.

## Earlier Audit Status

The results below describe the earlier audit. Current follow-up evidence and limits are in the dated September entries above.

The current worktree has 49 CSS files and 93 `--s3d-*` tokens after removing 57 lines of orphan or unused CSS. Static design checks, build, focused and full Chromium visual coverage, actual Chromium UI zoom, actual Firefox full-page and text-only zoom, representative zoom focus non-obscuration, native menu/tab navigation, and bidirectional Bucket Policy and Jobs filters sheet traversal with `Escape` trigger restoration, automated Firefox/WebKit reflow, lint, bundle budget, and whitespace checks pass. Manual browser visual review, exhaustive application-wide keyboard order, physical Safari/WKWebView, assistive technology, real-device, live-provider, and deployed-runtime QA remain separate evidence boundaries.
