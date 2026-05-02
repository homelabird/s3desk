# Frontend Final Quality Report - 2026-04-29

## Scope

- Target: current local worktree in `/home/homelab/Downloads/project/s3desk`
- Focus: frontend architecture, UX/accessibility, responsive behavior risk, build/test/bundle readiness
- Method: local quality gates plus three sub-agent audits
- Sub-agents:
  - Lovelace: architecture and maintainability audit
  - Russell: UX, accessibility, and responsive audit
  - Hubble: build, test, bundle, and release-gate audit
- Note: the worktree contains many modified and untracked files. This report is a snapshot of the current local state, not a clean tag comparison.

## Executive Summary

The frontend now passes the main local quality gates exercised in this pass: typecheck, lint, CSS token check, full unit tests, E2E smoke, E2E mobile-responsive, E2E core, geometry check, bundle budget, and bundle report validation.

Release readiness is **local green with CI confirmation required**. The original high accessibility issue, the webview realtime core E2E blocker, the missing bucket-picker browser keyboard coverage, the public Objects screen VM type leak, the Objects full-page axe blocker, and the first automated overlay axe coverage gap have been remediated. Remaining risks are non-blocking for this local snapshot but should stay on the next work queue:

- A full unit suite flake was observed by the build/test sub-agent earlier, but it did not reproduce across two additional consecutive local full-suite reruns on 2026-04-29.
- Mobile/modal axe coverage is broader now, including destructive confirmation flows, GCS/Azure/OCI governance controls, GCS locked-retention warnings, and Azure immutability warning states. Remaining modal risk is concentrated in narrower provider-specific edge variants.
- Visual regression coverage now includes the provider-warning sheets added in this pass for GCS locked-retention and Azure immutability states.
- Mocked Playwright lanes now default to a managed Vite server on port `18080` and do not reuse existing servers unless explicitly requested, reducing stale-bundle local verification risk.
- The earlier `UploadsPage` empty-bucket flake watch now has an additional mitigation: the authenticated route no longer renders a blank `Suspense` fallback while the upload workspace chunk loads.

## Remediation Update

Completed after the sub-agent audit:

- Fixed object list row keyboard handling so nested checkbox, favorite, preview, and menu controls no longer bubble `Space`/`Enter` into row activation.
- Added object row keyboard regression coverage for nested controls and row body activation.
- Improved bucket picker accessible names to expose the current bucket, added desktop `aria-haspopup`/`aria-controls`, and added focus containment for the desktop popover.
- Added bucket picker regression coverage for selected-bucket naming and focus wrapping.
- Improved global search result actions so `Open` has row-specific accessible names and desktop `Details` has a visible icon plus title.
- Added keyboard panning to the image viewer for zoomed previews and a focus-visible stage style.
- Converted type-only hook imports in `buildObjectsPageDataState.ts` to `import type`.
- Moved `BuildObjectsPagePanesPropsArgs` into `buildObjectsPagePanesPropsTypes.ts`, so sub-builders no longer import the parent pane builder type.
- Added `components/transfersTypes.ts` as a lightweight type facade and moved page-level `TransfersContextValue` imports away from the heavy `components/Transfers.tsx` runtime module.
- Added `role="status"`/`aria-live="polite"` coverage for object details metadata loading, global search loading/result counts, and image viewer loading states.
- Stabilized Jobs realtime callbacks by removing the changing `props` object from callback dependencies in `useJobsPageEventActions.ts`.
- Hardened the webview realtime Playwright runtime so mocked WS/SSE behavior survives reconnects, active connections receive events, and recovered channels can verify post-disconnect job updates.
- Added browser-level Bucket picker keyboard traversal coverage for desktop popover focus containment and mobile drawer focus restore.
- Fixed desktop Bucket picker focus trapping for real browser Tab timing by handling root capture and escaped `focusin` recovery.
- Moved Buckets shell/route-shell shared props into `bucketsPagePresentationTypes.ts`, removing the controller dependency on route-shell prop types.
- Removed the unused duplicate Buckets governance `GovernanceDialogShell.tsx`; `governance/shell.tsx` is now the single shell owner.
- Added Playwright axe smoke coverage for Objects global search and Jobs details overlays.
- Adjusted succeeded Jobs status tags away from Ant's low-contrast success tag and verified the overlay axe scans pass.
- Added `@axe-core/playwright`/`axe-core` and ran `npm audit fix`; production dependency audit now reports 0 vulnerabilities.
- Updated Playwright local-storage seeding to mirror the current server/profile-scoped storage keys and legacy migration keys, then restored the Objects new-folder, clipboard profile-switch, and global search action checks in full core E2E.
- Added shared Playwright readers for the current server/profile-scoped localStorage keys and updated Jobs, Profiles, and Uploads mobile persistence checks; seeding now preserves a user-selected active profile across reloads instead of resetting it on every document load.
- Exported explicit-origin server/profile storage key builders from `profileScopedStorage.ts` and moved Playwright persistence readers onto those production helpers, reducing key-algorithm drift between app code and browser tests.
- Added raw-token profile-scoped legacy key migration for Jobs, Uploads, and Objects persistence hooks so pre-origin-scoped `namespace:apiToken:profileId:name` values migrate into the new origin-scoped hashed-token keys instead of being dropped.
- Added browser-level Playwright coverage for raw-token profile-scoped migration across Jobs filters, Uploads destination state, and Objects bucket/global-search state.
- Replaced public `ReturnType`-derived Objects screen data/viewport types with exported VM/state contracts from the owning builders.
- Expanded Playwright axe smoke coverage to the app header/primary navigation, Objects image viewer modal, Bucket governance dialog, Bucket policy dialog, and Transfers drawer.
- Added accessible names to upload/download transfer progress bars.
- Removed the nested app-shell `main` landmark by rendering the layout content wrapper as a neutral `div` around `FullAppContentHost`.
- Darkened the light-theme primary/link tokens from `#1a73e8` to `#1765cc` so link-style controls meet contrast on the app shell backgrounds.
- Refactored Objects list/prefix rows so row shells no longer use `role="button"` around nested controls; row body activation now uses a dedicated native button target.
- Promoted Objects whole-page axe coverage into `accessibility-overlays.spec.ts`; it now scans `body` after the object list renders.
- Added browser E2E coverage for the image viewer's mobile layout, stage focus, and arrow-key panning behavior.
- Added assertion-based Playwright visual regression coverage with baselines for Objects global search actions, mobile image-viewer pan/focus, and mobile object grid density.
- Expanded Playwright axe smoke coverage to mobile Objects global search, mobile Objects filters, and mobile Objects image viewer overlays.
- Fixed the mobile image viewer footer `URL` action contrast by forcing toolbar button text/icons to inherit the app text token.
- Expanded Playwright axe smoke coverage to non-Objects mobile overlays: Jobs filters, Jobs upload source, Uploads source selection, and Settings drawer.
- Expanded Playwright axe smoke coverage to lower-traffic mobile overlays: Profiles edit, Profiles YAML import, Bucket policy, Bucket governance controls, and Transfers downloads/uploads.
- Fixed the Profiles edit-mode status tag contrast by replacing Ant's low-contrast gold tag text with a warning text token.
- Expanded Playwright axe smoke coverage to bucket destructive flows: delete confirmation, not-empty warning, and delete-job fallback sheet.
- Expanded provider-specific mobile governance axe coverage to GCS IAM bindings, Azure stored access policy controls, and OCI warning states.
- Expanded provider-specific mobile governance axe coverage to GCS locked-retention warning states.
- Expanded provider-specific mobile governance axe coverage to Azure immutability warning states with legal-hold and locked-policy alerts.
- Fixed Ant's default danger primary button contrast by routing solid danger buttons through app danger tokens.
- Added workflow visual regression coverage for mobile Jobs filters, Transfers download/upload drawer states, Uploads source selection, Profiles edit, and Buckets delete warning flows.
- Centralized Buckets governance Playwright fixture builders and added provider-specific visual regression baselines for GCS, Azure, and OCI mobile governance sheets.
- Expanded workflow visual regression coverage to Profile YAML import, Bucket create, Bucket policy, and Settings mobile drawer overlays.
- Added provider-warning visual regression baselines for GCS locked-retention and Azure immutability warning sheets.
- Moved the default managed Playwright Vite server from `8080` to `18080` and disabled existing-server reuse by default; `PLAYWRIGHT_WEB_SERVER_PORT` and `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` are now the explicit escape hatches.
- Replaced the `UploadsPage` authenticated route's blank lazy fallback with a non-empty polite `status` region and added unit coverage for that loading state.
- Re-ran the bundle budget, bundle report contract, production audit, release gate, and GitHub workflow checks after the expanded visual coverage and managed Playwright server policy work; all passed locally.
- Removed the remaining `boundingBox()` geometry probes from the Objects image preview E2E and replaced them with accessible region, label, focusability, keyboard-panning, and screenshot assertions so the geometry guard passes cleanly.

## Local Verification

| Gate | Result | Notes |
|---|---:|---|
| `npm --prefix frontend run typecheck` | Pass | TypeScript project build completed successfully. |
| `npm --prefix frontend run lint` | Pass | Includes `check:css-tokens`; 47 CSS files and 76 tokens checked. |
| `npm --prefix frontend run test:unit` | Pass | Latest full suite after the Uploads route fallback mitigation: 237 test files, 885 tests, duration 91.61s. |
| `npm --prefix frontend run test:unit` repeat verification | Pass | Earlier consecutive full-suite reruns passed before the latest migration tests were added: 236 files / 878 tests in 92.18s and 101.47s; then 236 files / 879 tests in 99.33s. |
| Uploads route fallback focused unit tests | Pass | 4 focused Uploads files passed with 14 tests after adding the non-empty route loading fallback; `UploadsPage.test.tsx` also passed two additional focused reruns with 7 tests each. |
| `npm --prefix frontend run check:openapi` | Pass | Latest rerun after the storage migration and accessibility coverage work confirmed generated OpenAPI TypeScript output matches `openapi.yml`. |
| `bash ./scripts/validate_openapi.sh` | Pass | Latest rerun after the storage migration and accessibility coverage work confirmed the root OpenAPI schema validates. |
| `npm --prefix frontend run check:e2e:geometry` | Pass | Latest rerun after the storage key helper refactor confirmed the geometry probe guard stays clean. |
| `npm --prefix frontend run bundle:budget` | Pass | Latest rerun after the managed Playwright server policy work completed `tsc -b`, Vite production build, bundle analysis, and report generation with no warnings. |
| `npm --prefix frontend run check:bundle-report` | Pass | Latest rerun after the managed Playwright server policy work confirmed the bundle report contract still passes. |
| `npm --prefix frontend audit --omit=dev` | Pass | Latest rerun after the managed Playwright server policy work found 0 production vulnerabilities. |
| `bash ./scripts/check_release_gate.sh` | Pass | Latest rerun after the managed Playwright server policy work passed release metadata, release-gate docs, browser-lane docs, bundle-budget docs, and Go toolchain parity checks. |
| `bash ./scripts/check_github_workflows.sh` | Pass | Latest rerun after the managed Playwright server policy work passed `actionlint` plus built-in workflow validation for 3 workflows. |
| Targeted remediation tests | Pass | 8 files, 39 tests covering status announcements, pane props, transfers shell, page transfer hooks, global search, image viewer, and object downloads. |
| Jobs realtime targeted unit tests | Pass | 3 files, 17 tests covering realtime events, event actions, and page controller behavior. |
| Buckets/Objects/Jobs targeted unit tests | Pass | 6 files, 18 tests covering Buckets presentation composition, Bucket picker, and Jobs status utilities. |
| Profile scoped storage unit test | Pass | `profileScopedStorage.test.ts` 5 tests passed, including explicit-origin key builders and raw-token profile-scoped legacy key helpers. |
| Raw-token storage migration focused unit tests | Pass | 11 files, 43 tests covering Jobs filters/columns/logs/surface, Uploads destination state, Objects search/location/global search/filters/tree, and storage key helpers. |
| Raw-token storage migration browser E2E | Pass | `storage-migration.spec.ts` 3 Chromium tests passed against the Vite server on port 18080; Jobs, Uploads, and Objects now assert every seeded legacy value moves to the origin-scoped key and the raw-token key is removed. |
| `webview-realtime.spec.ts` WV-010/WV-011 isolated | Pass | 2 tests passed after realtime stabilization. |
| `accessibility-overlays.spec.ts` | Pass | 27 Chromium axe tests passed against the Vite server on port 18080, including whole Objects page plus mobile Objects, destructive bucket flows, provider-specific governance overlays, GCS locked-retention warnings, Azure immutability warnings, and both mobile Transfers tabs. |
| Shell/Objects targeted unit tests | Pass | 4 files, 20 tests covering app content shell, route remounts, Objects page data, and screen composition. |
| Objects row semantic unit test | Pass | `ObjectsListRow.test.tsx` 4 tests passed after removing row-level `role="button"`. |
| Objects context-menu E2E | Pass | 5 Chromium tests passed after the row semantic refactor. |
| Objects image preview E2E | Pass | 5 Chromium tests passed, including mobile layout, accessible stage focus, and keyboard panning. |
| Visual regression E2E | Pass | 21 Chromium tests passed across `objects-image-preview.spec.ts`, `objects-visual-regression.spec.ts`, and `workflows-visual-regression.spec.ts`; 19 screenshot baselines are now asserted, including GCS locked-retention and Azure immutability warning sheets. |
| Objects E2E recovery checks | Pass | `objects-new-folder.spec.ts` 5 passed; clipboard profile-switch and global search action focused checks each passed against the fresh Vite server. |
| `npm --prefix frontend run test:e2e:smoke` | Pass | Latest rerun used the default managed Vite server policy on port 18080 and passed 2 Chromium smoke tests. |
| Targeted mobile persistence checks | Pass | Jobs, Profiles, and Uploads mobile-responsive specs passed on both mobile projects: 18 tests passed after the storage key helper refactor. |
| Uploads route focused browser regression | Pass | `uploads-mobile-responsive.spec.ts` passed 6 tests on `mobile-iphone-13` and `mobile-pixel-7` after adding the non-empty route loading fallback. |
| Jobs/Uploads/Objects mobile regression E2E | Pass | 38 tests passed on `mobile-iphone-13` and `mobile-pixel-7` after adding the raw-token browser migration coverage. |
| `npm --prefix frontend run test:e2e:mobile-responsive` | Pass | Latest full mobile-responsive rerun used the default managed Vite server policy on port 18080: 66 tests passed on `mobile-iphone-13` and `mobile-pixel-7`. |
| `npm --prefix frontend run test:e2e:core` | Pass | Latest rerun used the default managed Vite server policy on port 18080 after provider-warning visual baselines: 137 passed, 15 skipped. |

Sub-agent Hubble additionally reported passing `check:bundle-report`, `check:e2e:geometry`, `check:css-tokens`, `lint`, `bundle:budget`, `scripts/check_release_gate.sh`, and `scripts/check_github_workflows.sh`.

## Bundle Status

Current `frontend/dist/bundle-report.md` has no review candidates, action hints, or warnings.

| Budget | Actual | Limit | Headroom | Usage |
|---|---:|---:|---:|---:|
| `vendor-ui` gzip | 162.1 kB | 170.0 kB | 7.9 kB | 95.3% |
| initial JS gzip | 85.8 kB | 92.0 kB | 6.2 kB | 93.3% |
| `ObjectsPage` gzip | 60.3 kB | 63.0 kB | 2.7 kB | 95.8% |
| `UploadsPage` gzip | 0.9 kB | 1.2 kB | 0.3 kB | 73.4% |
| `UploadsPageExperience` gzip | 4.1 kB | 4.4 kB | 0.3 kB | 92.5% |
| `Transfers` gzip | 12.4 kB | 14.5 kB | 2.1 kB | 85.4% |

Main bundle risk: `ObjectsPage` and `UploadsPageExperience` are close to their budgets. Keep every new object/upload feature behind lazy boundaries unless it is required for first interaction.

## Sub-Agent Findings

### Architecture And Maintainability

Status: no runtime circular import was reported in the sub-agent audit. The route entries for `ObjectsPage`, `UploadsPage`, and `BucketsPage` are generally thin, and the recent presenter/builder splits improved ownership.

Resolved after audit:

- The `buildObjectsPageDataState.ts` hook imports used only for `ReturnType` have been converted to `import type`, removing those unnecessary runtime graph edges.
- The object pane parent/sub-builder type cycle around `BuildObjectsPagePanesPropsArgs` has been removed by moving the args type into a neutral type module.
- Page-level transfer context type imports now use `components/transfersTypes.ts` instead of importing from the heavy `components/Transfers.tsx` runtime module.
- Buckets controller state no longer derives its shell shape from route-shell props; shared presentation props now live in `bucketsPagePresentationTypes.ts`.
- Buckets governance shell ownership has been consolidated by removing the unused duplicate `GovernanceDialogShell.tsx`.

Remaining issues:

- No open architecture blocker from this pass. Continue keeping public screen contracts explicit when new Objects VM fields are added.

### UX And Accessibility

Status: dialogs and overlay sheets have a strong baseline: `role="dialog"`, `aria-modal`, labelled titles, Escape close, focus trap, and focus restore are in place. Mobile drawers and object/image/detail flows have semantic E2E coverage.

Resolved after audit:

- The high object-list keyboard issue has been fixed. Row activation now ignores `Space`/`Enter` events that originate from interactive descendants, and regression tests cover checkbox, favorite, preview, menu, and row body behavior.
- Bucket picker keyboard traversal is now covered in browser E2E for desktop focus containment and mobile drawer focus restore.
- Objects global search, Objects image viewer, Jobs details, Bucket governance, Bucket policy, Transfers, and app chrome now have automated Playwright axe smoke coverage.
- Transfer progress bars now expose upload/download-specific accessible names.
- The app shell no longer creates nested `main` landmarks.
- Light-theme primary/link colors now meet contrast on header and page backgrounds covered by the axe smoke tests.
- Objects object/prefix row shells no longer wrap nested controls in row-level `role="button"` containers.
- Whole-page Objects axe scanning now passes and is part of the local Playwright axe smoke set.
- Image viewer focus, arrow-key panning, and mobile layout now have browser E2E coverage in one flow.
- Playwright visual snapshots now cover global search actions, image viewer mobile pan/focus, responsive object grid density, Jobs filters, Transfers drawer states, and Uploads source selection.
- Mobile Objects global search, filters, and image viewer overlays now have automated axe smoke coverage.
- Mobile image viewer footer action contrast now passes axe after the `URL` action color fix.
- Jobs filters, Jobs upload source, Uploads source selection, and Settings mobile drawers now have automated axe smoke coverage.
- Profiles edit/import, Bucket policy/governance, and Transfers downloads/uploads mobile overlays now have automated axe smoke coverage.
- Profiles edit-mode status tag contrast now passes axe after moving the warning state onto `--s3d-color-warning-text`.
- Bucket delete confirmation, bucket-not-empty warning, and delete-job fallback overlays now have axe coverage.
- GCS, Azure, and OCI mobile governance controls now have provider-specific axe coverage.
- GCS locked-retention warning states now have provider-specific axe coverage.
- Azure legal-hold and locked immutability warning states now have provider-specific axe coverage.
- Danger primary buttons now use app danger solid tokens instead of Ant's lower-contrast default red.
- GCS locked-retention and Azure immutability warning sheets now have visual regression baselines.

Remaining issues:

- Low: preview/loading/result-count status announcements have been added in the main Objects details/search/viewer surfaces; axe coverage now exists for the highest-risk Objects and non-Objects overlays. Remaining accessibility work should focus on rarer provider warning states as they stabilize.

### Build, Test, And Release Gate

Status: latest local full unit runs passed, including two additional consecutive repeat runs after the earlier flake observation. Build, lint, bundle, static checks, E2E smoke, mobile-responsive, and core checks passed after the storage key helper refactor; targeted Bucket picker E2E and targeted overlay axe checks also passed in this quality pass.

Remaining issues:

- Reliability watch: Hubble observed one full-suite unit failure in `frontend/src/pages/__tests__/UploadsPage.test.tsx` for the empty-bucket message. The focused spec passed afterward, two additional consecutive local full-suite reruns passed, and the route now exposes a non-empty lazy loading status instead of a blank `Suspense` fallback. Keep CI watch enabled, but the local repeat-verification and route-fallback mitigation items are complete.
- Coverage gap: automated axe coverage now exists for app chrome, the full Objects page, several high-traffic desktop overlays, the main Objects/Profiles/Buckets/Jobs/Uploads/Settings/Transfers mobile overlays, and selected destructive/provider-specific variants. It is still not exhaustive for every OCI or provider-warning edge variant.
- Coverage gap: visual regression coverage now exists for the highest-risk Objects and workflow overlays, including primary provider-specific governance sheets, GCS/Azure provider-warning sheets, Profile YAML import, Bucket create/policy, and Settings drawer flows. It is broad enough for the current local snapshot but should still expand when new overlays or significant layout changes are introduced.
- Local tooling note: mocked Playwright lanes now use `http://127.0.0.1:18080` by default and refuse existing-server reuse unless `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` is set.

## Quality Decision

Current local build quality is **green across static, build, unit, and exercised browser E2E gates**. Final release quality is no longer blocked by the webview realtime failure or the earlier locally observed unit flake, but CI should still confirm the same result on clean runners.

This is not a broad architecture failure. The recent splits reduced file size and improved local ownership across Objects components. The remaining risks are now concentrated and actionable.

## Recommended Next Work

1. Confirm the latest green suite on CI clean runners. If the `UploadsPage` empty-bucket flake reappears there, focus on query/render timing because the blank route `Suspense` fallback has now been removed.
2. Expand provider-warning axe coverage only when new GCS/Azure/OCI control variants are added; the current primary mobile warning paths now have smoke coverage.
3. Add new visual regression baselines only when new overlays are introduced or existing lower-traffic overlays receive significant layout changes.
4. Keep bundle budgets active. `ObjectsPage` and `UploadsPageExperience` have narrow headroom and should not absorb optional UI code eagerly.

## Positive Signals

- Main quality gates pass in the latest local run.
- The latest full unit suite passed with 885 tests after the `UploadsPage` route fallback mitigation.
- `UploadsPage` now exposes a non-empty polite loading status while its authenticated workspace chunk loads, and focused reruns passed after the change.
- Bundle report has no warnings or review candidates.
- E2E smoke, mobile-responsive, and core suites pass.
- Webview realtime WS/disconnect/reconnect scenarios now pass in isolated and full core runs.
- Bucket picker desktop/mobile keyboard traversal now has browser-level coverage.
- App chrome, the full Objects page, and Objects/Profiles/Buckets/Jobs/Uploads/Settings/Transfers overlays now have automated axe smoke coverage, including primary mobile, destructive, and GCS/Azure/OCI governance overlays.
- Objects global search, image viewer pan/focus, mobile grid density, Jobs filters, Transfers drawer states, Uploads source selection, Profiles edit/YAML import, Buckets create/policy/delete/governance flows, GCS/Azure provider-warning sheets, and Settings drawer now have screenshot assertions.
- `ObjectsPage`, `UploadsPage`, and `BucketsPage` entry points are thin compared with the earlier monolithic structure.
- Dialog and overlay accessibility primitives are substantially better than the remaining bespoke row/picker/viewer interactions.
- The codebase now has more focused presenter modules and testable builder seams across the Objects surface.
