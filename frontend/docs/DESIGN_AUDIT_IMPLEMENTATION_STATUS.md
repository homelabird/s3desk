# Design Audit Implementation Status

Originally audited: 2026-05-24
Last updated: 2026-08-23

## Objective

Track the implementation state for the project-wide UI/UX design audit focused on color, contrast, visual hierarchy, and discoverability issues.

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

## Current Verification (2026-08-23)

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

## Current Status

The current worktree has 49 CSS files and 93 `--s3d-*` tokens after removing 57 lines of orphan or unused CSS. Static design checks, build, focused and full Chromium visual coverage, actual Chromium UI zoom, actual Firefox full-page and text-only zoom, representative zoom focus non-obscuration, native menu/tab navigation, and bidirectional Bucket Policy and Jobs filters sheet traversal with `Escape` trigger restoration, automated Firefox/WebKit reflow, lint, bundle budget, and whitespace checks pass. Manual browser visual review, exhaustive application-wide keyboard order, physical Safari/WKWebView, assistive technology, real-device, live-provider, and deployed-runtime QA remain separate evidence boundaries.
