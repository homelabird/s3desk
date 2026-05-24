# Design Audit Validation Log

Date: 2026-05-24T05:04:54.855Z

Use this file to record the evidence required before the UI/UX design audit can be considered complete.

## Command Results

### `npm run check:design`

- Status: Passed
- Started: 2026-05-24T05:04:20.047Z
- Finished: 2026-05-24T05:04:20.925Z
- Evidence:

```text
src/pages/objects/ObjectsGridCards.module.css:220 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/ObjectsGridCards.module.css:219 [small hardcoded radius] border-radius: 8px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsImageViewer.module.css:109 [opacity styling] opacity: 0.86;
  Prefer semantic text/surface tokens over opacity for readable repeated UI.
src/pages/objects/ObjectsListView.module.css:532 [opacity styling] opacity: 0.6;
  Prefer semantic text/surface tokens over opacity for readable repeated UI.
src/pages/objects/ObjectsListView.module.css:612 [opacity styling] opacity: 0.6;
  Prefer semantic text/surface tokens over opacity for readable repeated UI.
src/pages/objects/ObjectsListView.module.css:535 [shadow removed] box-shadow: none;
  Confirm this is intentional; audited surfaces should keep hierarchy through border, shadow, or accent.
src/pages/objects/ObjectsListView.module.css:238 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/ObjectsListView.module.css:393 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/ObjectsListView.module.css:551 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/ObjectsListView.module.css:235 [small hardcoded radius] border-radius: 6px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsListView.module.css:864 [small hardcoded radius] border-radius: 8px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsSearch.module.css:145 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/ObjectsSearch.module.css:121 [small hardcoded radius] border-radius: 6px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsSearch.module.css:243 [small hardcoded radius] border-radius: 6px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsSearch.module.css:667 [small hardcoded radius] border-radius: 8px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/objects/ObjectsShell.module.css:432 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/objects.module.css:91 [opacity styling] opacity: 0.6;
  Prefer semantic text/surface tokens over opacity for readable repeated UI.
src/pages/objects/objects.module.css:93 [shadow removed] box-shadow: none;
  Confirm this is intentional; audited surfaces should keep hierarchy through border, shadow, or accent.
src/pages/objects/objects.module.css:151 [shadow removed] box-shadow: none;
  Confirm this is intentional; audited surfaces should keep hierarchy through border, shadow, or accent.
src/pages/objects/objects.module.css:68 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/objects.module.css:159 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.
src/pages/objects/objects.module.css:171 [small hardcoded radius] border-radius: 6px;
  Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.
src/pages/profiles/ProfileModal.module.css:188 [transparent background] background: transparent;
  Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.

> frontend@0.0.0 check:design-contrast
> node ./scripts/check-design-contrast.mjs

light 17.74 body text on card
light  7.58 secondary text on card
light  4.76 muted text on card
light 15.89 body text on page
light 17.74 body text on input
light  4.08 disabled text on disabled bg
light  6.39 primary link on card
light  9.42 warning text on warning bg
light  4.92 error text on error bg
light  5.07 success text on success bg
light 13.35 tooltip text on tooltip bg
light 15.13 sidebar text on sidebar bg
light  8.31 sidebar secondary on sidebar bg
light  9.52 sidebar active text on sidebar active bg
dark  15.04 body text on card
dark   9.88 secondary text on card
dark   6.91 muted text on card
dark  16.54 body text on page
dark  15.16 body text on input
dark   4.90 disabled text on disabled bg
dark   8.57 primary link on card
dark  10.54 warning text on warning bg
dark  12.20 error text on error bg
dark   7.86 success text on success bg
dark  13.31 tooltip text on tooltip bg
dark  14.53 sidebar text on sidebar bg
dark   6.44 sidebar secondary on sidebar bg
dark  10.24 sidebar active text on sidebar active bg

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
- Started: 2026-05-24T05:04:20.925Z
- Finished: 2026-05-24T05:04:35.639Z
- Evidence:

```text
dist/assets/ObjectsContextMenuPortal-CwzZZUyZ.js           1.69 kB │ gzip:   0.89 kB
dist/assets/ObjectsDownloadPrefixModal-CwQnEu5-.js         1.88 kB │ gzip:   0.97 kB
dist/assets/ObjectsPresignModal-CHiFSBUR.js                1.93 kB │ gzip:   0.99 kB
dist/assets/objectsNewFolderFeedback-CHM_Dd5T.js           1.96 kB │ gzip:   1.00 kB
dist/assets/ObjectsCommandPaletteModal-CVE-FUiy.js         2.00 kB │ gzip:   1.07 kB
dist/assets/ObjectsRenameModal-yPV6Abyi.js                 2.05 kB │ gzip:   0.97 kB
dist/assets/UploadsPage-19B4_EVL.js                        2.08 kB │ gzip:   0.95 kB
dist/assets/deviceFs-TQ7z28rI.js                           2.13 kB │ gzip:   1.07 kB
dist/assets/objectsNewFolderRuntime-DEb3EKeT.js            2.17 kB │ gzip:   1.07 kB
dist/assets/TokenLoginPanel-H-CoKopu.js                    2.21 kB │ gzip:   1.14 kB
dist/assets/providerOperationFeedback-D-GbX93y.js          2.34 kB │ gzip:   1.12 kB
dist/assets/objectsJobFeedback-C535OT9Q.js                 2.37 kB │ gzip:   1.02 kB
dist/assets/ObjectsListHeader-xJXm9Y5_.js                  2.56 kB │ gzip:   0.96 kB
dist/assets/ObjectThumbnail-CnqQDe02.js                    2.65 kB │ gzip:   1.26 kB
dist/assets/ObjectsCopyMoveModal-CkBwP6tC.js               2.68 kB │ gzip:   1.15 kB
dist/assets/AccessSettingsSection-BYf0M-qo.js              2.70 kB │ gzip:   1.25 kB
dist/assets/loadObjectThumbnailAsset-B7rzWeHg.js           2.79 kB │ gzip:   1.19 kB
dist/assets/ObjectsNewFolderModal-DEaIufPl.js              2.86 kB │ gzip:   1.28 kB
dist/assets/useThemeMode-DeVQa_u7.js                       2.88 kB │ gzip:   1.26 kB
dist/assets/ObjectsSettingsSection-3Y-k_0Fh.js             3.02 kB │ gzip:   1.22 kB
dist/assets/objectsClipboardRuntime-CtHsKjuw.js            3.03 kB │ gzip:   1.43 kB
dist/assets/objectsDndRuntime-DB3c1F3m.js                  3.04 kB │ gzip:   1.33 kB
dist/assets/ObjectsDeletePrefixConfirmModal-B-MHW-DG.js    3.15 kB │ gzip:   1.36 kB
dist/assets/ObjectsListContent-CPNpRbU-.js                 3.19 kB │ gzip:   1.26 kB
dist/assets/transfersUploadUtils-D_Li844K.js               3.23 kB │ gzip:   1.36 kB
dist/assets/KeyboardShortcutGuide-Cq0KRpGS.js              3.25 kB │ gzip:   1.35 kB
dist/assets/DownloadJobModal-Bf6E8pwg.js                   3.28 kB │ gzip:   1.64 kB
dist/assets/ObjectsPageHeader-BOtIuRHP.js                  3.32 kB │ gzip:   1.34 kB
dist/assets/NetworkSettingsSection-CcbXa4nE.js             3.54 kB │ gzip:   1.50 kB
dist/assets/ObjectsMoveSelectionSheet-cbMpqeUT.js          3.57 kB │ gzip:   1.50 kB
dist/assets/errors-CwNERbZ5.js                             3.81 kB │ gzip:   1.64 kB
dist/assets/AppTabs-C0YUuTBZ.js                            4.13 kB │ gzip:   1.77 kB
dist/assets/ObjectsSearch.module-CO04RSvl.js               4.43 kB │ gzip:   1.43 kB
dist/assets/CreateJobModal-Dy0eMlDm.js                     4.52 kB │ gzip:   2.14 kB
dist/assets/thumbnailCache-C6cNSVMj.js                     4.61 kB │ gzip:   2.01 kB
dist/assets/TransfersRuntimeUiHost-DoIvA_9Q.js             4.64 kB │ gzip:   1.58 kB
dist/assets/DeletePrefixJobModal-o63qLVNw.js               4.72 kB │ gzip:   2.08 kB
dist/assets/ObjectsCopyPrefixModal-P8tgeVKy.js             4.81 kB │ gzip:   1.79 kB
dist/assets/objectPreviewRuntime-BtwoXjly.js               5.01 kB │ gzip:   1.79 kB
dist/assets/vendor-misc-DtyGqvvc.js                        5.03 kB │ gzip:   1.90 kB
dist/assets/ObjectsPageOverlays-TELSSVBr.js                5.07 kB │ gzip:   1.56 kB
dist/assets/presignedUpload-C57_mYwW.js                    5.16 kB │ gzip:   2.11 kB
dist/assets/vendor-ui-collapse-BtFRwPwZ.js                 5.38 kB │ gzip:   2.05 kB
dist/assets/ObjectsFiltersDrawer-B8sthSZq.js               5.52 kB │ gzip:   1.68 kB
dist/assets/ProfilesModals-CdVDRSEF.js                     5.80 kB │ gzip:   2.19 kB
dist/assets/ServerSettingsSection-Cr6hWPIS.js              6.16 kB │ gzip:   2.49 kB
dist/assets/objectsRefreshEvents-ovXoETPa.js               6.37 kB │ gzip:   2.37 kB
dist/assets/bucketPolicyDecisionGuide-FF81C9YV.js          6.60 kB │ gzip:   1.61 kB
dist/assets/ObjectsListControls-mydnn7aB.js                7.55 kB │ gzip:   2.28 kB
dist/assets/TransfersSettingsSection-D92luEPw.js           7.95 kB │ gzip:   2.34 kB
dist/assets/SettingsDrawer-BFWWrpho.js                    10.44 kB │ gzip:   3.56 kB
dist/assets/ObjectsImageViewerModal-CzkzwBpG.js           10.90 kB │ gzip:   3.56 kB
dist/assets/TransfersDrawer-BSOmmCH5.js                   12.05 kB │ gzip:   3.52 kB
dist/assets/vendor-react-CPd7ItzW.js                      12.18 kB │ gzip:   4.74 kB
dist/assets/ObjectsGlobalSearchDrawer-BmT8mGX5.js         12.87 kB │ gzip:   3.60 kB
dist/assets/LightApp-BZ5hm0cI.js                          13.19 kB │ gzip:   4.37 kB
dist/assets/ObjectsDetailsPanelSection-50LbyNq2.js        13.63 kB │ gzip:   3.58 kB
dist/assets/vendor-tanstack-virtual-bQP9FDyX.js           14.42 kB │ gzip:   4.77 kB
dist/assets/UploadsPageExperience-hZF7bB2B.js             14.64 kB │ gzip:   4.30 kB
dist/assets/ObjectsTreeSection-bDa7v6YS.js                14.69 kB │ gzip:   5.20 kB
dist/assets/ObjectsToolbarSection-CKVRa7RB.js             18.91 kB │ gzip:   5.91 kB
dist/assets/BucketModal-BTHNLqvH.js                       19.77 kB │ gzip:   4.84 kB
dist/assets/SidebarBackupDrawer-BEJkNDEy.js               22.26 kB │ gzip:   6.37 kB
dist/assets/BucketsPage-BFcvr0_U.js                       22.56 kB │ gzip:   6.40 kB
dist/assets/vendor-react-router-BVextrwO.js               36.21 kB │ gzip:  13.13 kB
dist/assets/vendor-tanstack-B1BVHV24.js                   37.12 kB │ gzip:  11.11 kB
dist/assets/JobsOverlaysHost-Ch4OaX8o.js                  37.27 kB │ gzip:  11.73 kB
dist/assets/BucketPolicyModal-DWv7zZbx.js                 39.22 kB │ gzip:  10.70 kB
dist/assets/index-lS6497oT.js                             43.29 kB │ gzip:  11.61 kB
dist/assets/Transfers-DdBFBVJf.js                         43.91 kB │ gzip:  12.97 kB
dist/assets/ProfileModal-C6dyRUYZ.js                      44.13 kB │ gzip:  11.31 kB
dist/assets/ProfilesPage-DSuAdLuQ.js                      50.97 kB │ gzip:  12.63 kB
dist/assets/BucketGovernanceModal-BO9H_ATl.js             56.60 kB │ gzip:  13.19 kB
dist/assets/FullApp-BmEF6hQD.js                           58.42 kB │ gzip:  18.81 kB
dist/assets/JobsPage-BkiRS283.js                          64.99 kB │ gzip:  19.29 kB
dist/assets/vendor-data-4eDMv0oK.js                       97.26 kB │ gzip:  30.35 kB
dist/assets/vendor-react-dom-DwjLOBgM.js                 180.26 kB │ gzip:  56.27 kB
dist/assets/ObjectsPage-CHPDK0xJ.js                      250.55 kB │ gzip:  63.91 kB
dist/assets/vendor-ui-PBU0cVnf.js                        515.61 kB │ gzip: 166.18 kB
✓ built in 5.51s
```

- Notes:


### `npm run test:e2e:design-audit`

- Status: Passed
- Started: 2026-05-24T05:04:35.639Z
- Finished: 2026-05-24T05:04:54.854Z
- Evidence:

```text
> frontend@0.0.0 test:e2e:design-audit
> playwright test tests/design-audit-visual.spec.ts --project=chromium


Running 6 tests using 1 worker

  ✓  1 [chromium] › tests/design-audit-visual.spec.ts:36:2 › Design audit visual smoke @visual › Objects shell hierarchy remains visible in light mode (3.0s)
  ✓  2 [chromium] › tests/design-audit-visual.spec.ts:42:2 › Design audit visual smoke @visual › Objects shell hierarchy remains visible in dark mode (2.7s)
  ✓  3 [chromium] › tests/design-audit-visual.spec.ts:48:2 › Design audit visual smoke @visual › Objects shell hierarchy remains visible at tablet width (2.5s)
  ✓  4 [chromium] › tests/design-audit-visual.spec.ts:54:2 › Design audit visual smoke @visual › Objects bucket picker floating surface remains distinct (2.8s)
  ✓  5 [chromium] › tests/design-audit-visual.spec.ts:63:2 › Design audit visual smoke @visual › Jobs operational surfaces remain scannable on mobile (3.0s)
  ✓  6 [chromium] › tests/design-audit-visual.spec.ts:77:2 › Design audit visual smoke @visual › Uploads workflow cards remain distinct on mobile (1.4s)

  6 passed (18.2s)

[WebServer] (node:398963) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:398950) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
(node:399158) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node-22 --trace-warnings ...` to show where the warning was created)
(node:399158) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node-22 --trace-warnings ...` to show where the warning was created)
```

- Notes:


## Supplemental Verification

### `npm run test:e2e:visual`

- Status: Passed
- Evidence: `25 passed (45.2s)`
- Notes: Full visual regression suite now includes the mobile login/token panel plus the design-audit, object, dark-theme, image preview, workflow, bucket, profile, job, transfer, upload, and settings captures.

### `npm run lint`

- Status: Passed
- Evidence: ESLint, CSS token check, and import-cycle check all completed successfully.
- Notes: `check:css-tokens` reported `ok (50 CSS files, 78 tokens)` and `check:import-cycles` reported `ok (560 files, 1158 runtime edges)`.

### `git diff --check`

- Status: Passed
- Evidence: No whitespace or conflict-marker issues reported.
- Notes:

## Manual Visual QA Results

### Light theme desktop

- Status: Reviewed
- Screens reviewed: object shell light smoke, object bucket picker surface, global search action drawer, uploads workflow cards
- Findings: Surface separation, page hierarchy, input focus, table/card contrast, and overlay boundaries are visible without relying on faint gray-only states.

### Dark theme desktop

- Status: Reviewed
- Screens reviewed: object shell dark smoke, dark global search drawer, long-key global search row
- Findings: Text and table headers remain readable; long object keys wrap inside the key column without colliding with size, modified, or action columns.

### Mobile

- Status: Reviewed
- Screens reviewed: login token panel, jobs filters sheet, transfers drawer states, uploads source sheet, bucket create/delete/governance flows, profile dialogs, settings drawer
- Findings: Modal/sheet/card hierarchy is visible at 390px width; the login theme button, brand lockup, token field, and login action remain inside the viewport.

## Regression Findings

- Dark-mode global search initially allowed long object keys to visually collide with adjacent columns. Fixed by constraining the key column and adding geometry coverage in `tests/dark-theme-visual-regression.spec.ts`.
- Mobile login initially rendered the theme button row and token panel as side-by-side flex items at 390px, pushing the panel offscreen. Fixed by switching the mobile login shell to column flow and adding viewport-bound assertions plus `login-mobile-token-panel.png`.
- Tablet object shell coverage was added so intermediate responsive layout hierarchy is checked in addition to desktop and mobile captures.

## Completion Decision

- Status: Complete for the current worktree.
- Reason: Static design checks, contrast checks, build, focused design-audit visual smoke, full visual regression, lint, whitespace checks, and manual visual QA have all passed; regressions found during validation were fixed and covered by tests.
