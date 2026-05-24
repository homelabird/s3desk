# UI/UX Design Audit

Date: 2026-05-24

## Scope

- Global design tokens in `src/index.css`
- Ant Design token bridge in `src/theme.ts`
- App shell, sidebar, header, common page surfaces, tabs, dialogs, drawers, tables, object browsing views, and dense form pages
- Light and dark theme color hierarchy, with emphasis on text visibility, selection states, focus states, and scanability

## Findings

### 1. Surface hierarchy is too flat

- `--s3d-color-bg`, `--s3d-color-bg-card`, `--s3d-color-bg-elevated`, and `--s3d-color-bg-secondary` are visually close in light mode.
- Page headers, sections, tables, mobile cards, and object panes often read as one continuous white/gray block.
- Dense screens such as objects, buckets, profiles, jobs, and settings rely on borders alone to express grouping.

### 2. Borders and hover states are too subtle for dense data

- `--s3d-color-border-soft` and several `color-mix(... transparent)` backgrounds are too weak when many rows, controls, or cards appear together.
- Table headers, virtualized rows, list rows, and search results need stronger structure so users can scan quickly.

### 3. Primary color is doing too many jobs

- Primary blue is used for links, active rows, selected navigation, focus, badges, onboarding, and hover fills.
- Because selected/active backgrounds are very pale, active navigation and selected object rows can be missed.

### 4. App chrome does not separate navigation from work area enough

- The sidebar background is close to the page background in light mode.
- The top header uses translucent white without enough edge contrast, so global controls visually merge into content.

### 5. Common page sections lack visual anchors

- `PageHeader` and `PageSection` use flat cards with no accent, depth, or clear title hierarchy.
- This makes primary actions less discoverable and page context harder to identify.

### 6. Object browser selection and row states need stronger affordance

- Selected object rows use a pale fill with no strong edge marker.
- List headers and selection bars need more contrast because this is the most data-dense workflow in the app.

### 7. Form and Ant Design defaults are not fully aligned with app tokens

- Native and Ant Design controls both use the token set, but Ant Design layout/container tokens were not explicitly aligned.
- This can create mismatched whites, weak borders, and inconsistent table/card surfaces.

## Work Plan

### Immediate fixes applied

- Strengthen global light/dark color tokens for page, card, elevated, border, text, focus, and selected states.
- Give the sidebar and header clearer chrome hierarchy.
- Align Ant Design background, text, border, hover, and selection tokens with the app palette.
- Upgrade `PageHeader`, `PageSection`, and tabs with clearer surface separation and active-state contrast.
- Improve object list headers, selection bars, and selected row affordance.
- Upgrade buckets and profiles table/mobile-card surfaces so dense lists are not separated only by thin gray borders.
- Upgrade settings apply/recovery/log surfaces so warning, pending, and diagnostic content have stronger visual priority.
- Upgrade uploads mode, summary, preview, and empty states so primary workflow decisions are easier to scan.
- Upgrade login/light-app/profile-modal surfaces so first-run and profile-edit workflows use the same visual hierarchy as the main app.
- Upgrade modal, sheet, popover, and menu surfaces so overlays stand apart from the page behind them.
- Upgrade object bucket picker, grid cards, details previews, and global search result/table surfaces.
- Upgrade jobs mobile cards, virtual table borders, logs, realtime status, health cards, and diagnostics dropdowns.
- Add `docs/DESIGN_TOKEN_USAGE.md` so future UI changes preserve the audited color and hierarchy rules.
- Add `docs/DESIGN_CONTRAST_MATRIX.md` so implementation and QA can check safe token pairings and required non-color cues.
- Add `docs/VISUAL_QA_CHECKLIST.md` so completion can be verified against concrete screens, states, and evidence.
- Add `docs/DESIGN_AUDIT_IMPLEMENTATION_STATUS.md` so implementation coverage and remaining verification gates are tracked separately from the issue analysis.
- Add `docs/DESIGN_AUDIT_VALIDATION_LOG.md` so command and manual QA evidence can be recorded before completion is claimed.
- Upgrade shared form labels, helper text, native selects, number fields, switches, and help affordances so repeated form workflows stay readable.
- Upgrade bucket create, policy, and governance modals so secure defaults, policy routes, advanced paths, and structured cards have clearer hierarchy.
- Upgrade sidebar backup, transfer rows, and tree status blocks so repeated operational cards and selected tree rows do not rely on faint fills alone.
- Upgrade app loading, upload source choices, and image viewer stage/fallback surfaces so transitional and media-heavy workflows keep the same contrast hierarchy.
- Run a CSS pattern scan for remaining faint-surface usage and clean up high-impact hits in object menus, object overlays, favorites, job shared upload tables, and the remaining policy validation action row.
- Upgrade thumbnail placeholders, deferred thumbnail hints, image viewer thumbnail layer opacity, and virtual table sort indicators so compact repeated controls avoid opacity-only visibility.
- Add a focused Playwright `@visual` smoke spec for design-audit hierarchy surfaces across object shell, bucket picker, transfers, uploads, and light/dark modes.
- Add tablet-width object shell coverage so the audit checks the intermediate responsive layout, not only desktop and mobile.
- Add `npm run test:e2e:design-audit` as the standard command for the focused design-audit visual smoke.
- Add `npm run check:design-audit` as an advisory scan for recurring opacity, flat background, missing shadow, and hardcoded compact-radius patterns.
- Add `npm run check:design-contrast` as an advisory contrast calculation for tracked light/dark token pairs.
- Add `npm run check:design` to run CSS token, design-audit pattern, and contrast checks together.
- Add `npm run validate:design-audit` to run the main validation gates and update `docs/DESIGN_AUDIT_VALIDATION_LOG.md`.
- Fix dark-mode global search table rows so long object keys wrap inside the key column and cannot visually collide with size, modified, or action columns.
- Fix the mobile login/token page so the theme button, brand lockup, token field, and action buttons stay inside the viewport instead of being pushed sideways by a row-oriented shell.
- Add mobile login visual regression coverage with viewport-bound assertions for the theme button, brand heading, token field, and login action.

### Implementation status

- Applied global token and Ant Design token updates in `src/index.css` and `src/theme.ts`.
- Applied app shell chrome updates in `src/FullAppInner.module.css`.
- Applied shared page structure updates in `src/components/PageHeader.module.css`, `src/components/PageSection.module.css`, and `src/components/appTabs.module.css`.
- Applied object browser list updates in `src/pages/objects/ObjectsListView.module.css`.
- Applied data-page updates in `src/pages/BucketsPage.module.css`, `src/pages/ProfilesPage.module.css`, `src/pages/SettingsPage.module.css`, and `src/pages/UploadsPage.module.css`.
- Applied first-run/profile-entry updates in `src/LightApp.module.css`, `src/pages/LoginPage.module.css`, `src/components/TokenLoginPanel.module.css`, and `src/pages/profiles/ProfileModal.module.css`.
- Applied overlay/menu updates in `src/components/DialogModal.module.css`, `src/components/OverlaySheet.module.css`, `src/components/PopoverSurface.module.css`, and `src/components/MenuPopover.module.css`.
- Applied object workflow updates in `src/pages/objects/ObjectsBucketPicker.module.css`, `src/pages/objects/ObjectsGridCards.module.css`, `src/pages/objects/ObjectsDetails.module.css`, and `src/pages/objects/ObjectsSearch.module.css`.
- Applied jobs workflow updates in `src/pages/jobs/JobsTableSection.module.css`, `src/pages/jobs/jobsVirtualTable.module.css`, `src/pages/jobs/JobsLogsDrawer.module.css`, and `src/pages/jobs/JobsToolbar.module.css`.
- Added design-token usage rules in `docs/DESIGN_TOKEN_USAGE.md`.
- Added contrast token-pairing rules in `docs/DESIGN_CONTRAST_MATRIX.md`.
- Added visual QA acceptance and evidence rules in `docs/VISUAL_QA_CHECKLIST.md`.
- Added implementation status and completion-gate tracking in `docs/DESIGN_AUDIT_IMPLEMENTATION_STATUS.md`.
- Added validation evidence logging in `docs/DESIGN_AUDIT_VALIDATION_LOG.md`.
- Applied shared form-control updates in `src/components/FormField.module.css`, `src/components/NativeSelect.module.css`, `src/components/NumberField.module.css`, `src/components/ToggleSwitch.module.css`, and `src/components/HelpTooltip.module.css`.
- Applied bucket modal updates in `src/pages/buckets/BucketModal.module.css`, `src/pages/buckets/BucketPolicyModal.module.css`, and `src/pages/buckets/BucketGovernanceModal.module.css`.
- Applied operational-card updates in `src/components/SidebarBackupAction.module.css`, `src/components/transfers/transferRows.module.css`, and `src/components/simpleTree.module.css`.
- Applied transitional/media workflow updates in `src/App.module.css`, `src/components/UploadSourceSheet.module.css`, and `src/pages/objects/ObjectsImageViewer.module.css`.
- Applied pattern-scan follow-up updates in `src/pages/objects/objects.module.css`, `src/pages/objects/ObjectsShell.module.css`, `src/pages/objects/ObjectsFavorites.module.css`, `src/pages/jobs/JobsShared.module.css`, and `src/pages/buckets/BucketPolicyModal.module.css`.
- Applied compact repeated-control updates in `src/pages/objects/ObjectsThumbnailPrimitives.module.css`, `src/pages/objects/ObjectsGridCards.module.css`, `src/pages/objects/ObjectsImageViewer.module.css`, and `src/pages/jobs/jobsVirtualTable.module.css`.
- Added visual smoke coverage in `tests/design-audit-visual.spec.ts`.
- Added tablet-width visual smoke coverage in `tests/design-audit-visual.spec.ts`.
- Added the focused visual smoke command in `package.json`.
- Added the advisory CSS design-audit scan in `scripts/check-design-audit-patterns.mjs`.
- Added the advisory token contrast scan in `scripts/check-design-contrast.mjs`.
- Added the aggregate static design check command in `package.json`.
- Added the validation runner in `scripts/run-design-audit-validation.mjs`.
- Added global search long-key geometry coverage in `tests/dark-theme-visual-regression.spec.ts`.
- Added mobile login/token viewport coverage in `tests/workflows-visual-regression.spec.ts`.
- Verified in browser with focused and full Playwright visual coverage.

### Follow-up work recommended

- Expand visual regression capture further when adding new major workflows.
- Expand automated contrast checks to additional page-specific semantic token pairs as new surfaces are introduced.
- Review remaining page-specific cards that still use `--s3d-color-bg` directly where `--s3d-color-bg-card` or `--s3d-color-bg-elevated` is more appropriate.
- Repeat screenshot review with production-scale real data after new data-heavy workflows or datasets are introduced.

## Acceptance Criteria

- Primary navigation, current page, selected rows, and active tabs are visually obvious in light and dark themes.
- Text, secondary text, placeholders, and disabled states remain readable against their backgrounds.
- Dense data screens can be scanned without relying only on thin borders.
- Ant Design components no longer introduce mismatched white/gray surfaces.
- Global fixes improve multiple pages without requiring one-off color overrides in every feature module.
