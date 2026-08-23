# Design Audit Validation Log

Date: 2026-08-23T08:44:29.184Z

Use this file to record the evidence required before the UI/UX design audit can be considered complete.

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
