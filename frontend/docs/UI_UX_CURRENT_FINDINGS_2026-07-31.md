# UI/UX Current Findings

Date: 2026-07-31

## Scope

- Current frontend worktree in `frontend/`
- Existing Playwright visual-regression snapshots under `frontend/tests/*-snapshots/`
- Shared shell, objects workflow, uploads workflow, login flow, settings, transfers, bucket policy, and profile-edit surfaces

## Summary

The broad color and contrast cleanup documented in `UI_UX_DESIGN_AUDIT.md` is still visible in the current worktree. The remaining problems are no longer basic contrast failures. They are now mostly hierarchy, density, and layout-priority issues that make data-heavy screens feel tool-heavy and make mobile screens spend too much space on chrome before the main task starts.

## Priority Findings

### 1. Objects header spends too much vertical space before the main data

- Severity: High
- Screens:
  - `frontend/tests/design-audit-visual.spec.ts-snapshots/design-audit-objects-shell-light-chromium-linux.png`
  - `frontend/tests/design-audit-visual.spec.ts-snapshots/design-audit-objects-shell-dark-chromium-linux.png`
  - `frontend/tests/design-audit-visual.spec.ts-snapshots/design-audit-objects-shell-tablet-chromium-linux.png`
- Symptoms:
  - The page title, navigation buttons, bucket picker, upload actions, search, view mode toggle, sort, favorites toggle, and summary text all appear before the file list.
  - The file list starts too low, so the main workflow reads like a toolbar first and a browser second.
  - Tablet width keeps the same control-heavy feel instead of collapsing toward a stronger content-first layout.
- Code evidence:
  - `src/pages/objects/ObjectsPageHeader.tsx`
  - `src/pages/objects/ObjectsToolbar.tsx`
  - `src/pages/objects/ObjectsShell.module.css`
- Likely cause:
  - The shell uses separate stacked header groups plus wide desktop action groups instead of a tighter content-first toolbar.
  - Too many equal-weight controls share the same band.

### 2. Global search table still breaks down with long object keys

- Severity: High
- Screen:
  - `frontend/tests/objects-visual-regression.spec.ts-snapshots/objects-global-search-drawer-actions-chromium-linux.png`
- Symptoms:
  - Long object keys visually run into the size and modified columns.
  - Action buttons consume a lot of fixed width, which makes the key column unstable under realistic data.
  - The table is technically structured, but scanability drops sharply on the most important field.
- Code evidence:
  - `src/pages/objects/ObjectsGlobalSearchResults.tsx`
  - `src/pages/objects/ObjectsSearch.module.css`
- Likely cause:
  - The table reserves fixed width for `Last modified` and `Actions`, while the variable-length `Key` field absorbs the remaining space.
  - The desktop table still expects compact keys more than real S3-style paths.

### 3. Mobile top chrome still competes with task content

- Severity: Medium
- Screens:
  - `frontend/tests/design-audit-visual.spec.ts-snapshots/design-audit-uploads-mobile-chromium-linux.png`
  - `frontend/tests/workflows-visual-regression.spec.ts-snapshots/settings-mobile-drawer-chromium-linux.png`
  - `frontend/tests/design-audit-visual.spec.ts-snapshots/design-audit-transfers-mobile-chromium-linux.png`
- Symptoms:
  - Mobile pages often show the global header, profile switcher, page title, tabs, and local page actions before the main task body settles.
  - `Uploads` spends a large share of the first viewport on shell and card headers before the file-selection action becomes dominant.
  - `Settings` and `Transfers` are readable, but their close controls, tabs, and command buttons are visually close in weight to actual form or status content.
- Code evidence:
  - `src/FullAppInner.module.css`
  - `src/pages/UploadsPage.module.css`
  - `src/pages/objects/ObjectsShell.module.css`
- Likely cause:
  - Global shell chrome and page-local chrome are both well-styled, but together they create stack depth before the task surface starts.

### 4. Login screen still overweights branding relative to the only required action

- Severity: Medium
- Screen:
  - `frontend/tests/workflows-visual-regression.spec.ts-snapshots/login-mobile-token-panel-chromium-linux.png`
- Symptoms:
  - The mascot, large `S3Desk` wordmark, and subtitle have stronger visual presence than the single required form action.
  - On a token-only login screen, the eye lands on brand first and work second.
  - The form itself is clean, but the page still behaves more like a landing panel than a utilitarian auth gate.
- Code evidence:
  - `src/pages/LoginPage.module.css`
  - `src/components/TokenLoginPanel.module.css`
  - `src/pages/LoginPage.tsx`
- Likely cause:
  - The login layout preserves product-brand emphasis that makes sense on a first-run welcome surface but not on a single-field operational login.

### 5. Floating bucket picker is distinct, but the internal hierarchy is still shallow

- Severity: Medium
- Screen:
  - `frontend/tests/design-audit-visual.spec.ts-snapshots/design-audit-objects-bucket-picker-chromium-linux.png`
- Symptoms:
  - Search field, clear action, current bucket card, and future option rows sit close in visual weight.
  - The popover looks polished, but it does not strongly answer "what is current" vs "what can I switch to" at a glance.
  - This will get harder to scan as real bucket counts grow.
- Code evidence:
  - `src/pages/objects/ObjectsBucketPicker.module.css`
- Likely cause:
  - The popover surface is elevated correctly, but the internal sections do not have enough structural contrast or spacing hierarchy.

### 6. Dense configuration sheets still read as long card stacks instead of guided flows

- Severity: Medium
- Screens:
  - `frontend/tests/workflows-visual-regression.spec.ts-snapshots/profiles-mobile-edit-dialog-chromium-linux.png`
  - `frontend/tests/workflows-visual-regression.spec.ts-snapshots/buckets-mobile-policy-sheet-chromium-linux.png`
- Symptoms:
  - Important distinctions such as "safe default path", "advanced path", "status", and "danger zone" are visible but still compete inside long stacked sections.
  - The user can read the screens, but the surfaces feel documentation-heavy before they feel action-oriented.
  - Save and destructive actions sit far from the explanatory hierarchy that leads to them.
- Code evidence:
  - Bucket and profile modal styling referenced by the earlier design audit remains in use.
- Likely cause:
  - The design system fixed contrast and surface separation, but these flows still carry too much explanatory content at the same visual tier.

## Repeated Patterns

- Too many controls share one hierarchy level.
- Long-data layouts still assume shorter labels than real object-storage data produces.
- Mobile screens remain clean but not aggressive enough about pushing primary actions upward.
- Informational copy is usually readable, but often has similar visual weight to the controls that should drive the task.

## Suggested Next Pass

### Highest-value fixes

- Compress the `Objects` page header into a tighter content-first toolbar.
- Rework global search desktop results so long keys dominate the row and actions yield space first.
- Reduce mobile chrome depth before page-local task content, especially on `Uploads`.

### Secondary fixes

- Downscale login branding and increase form-first emphasis.
- Add stronger section separation inside the bucket picker.
- Turn long configuration sheets into clearer "recommended first / advanced / destructive" progressions.

## Evidence Limits

- `npm run test:e2e:design-audit` could not be rerun in the current environment because Playwright is not installed locally (`playwright: command not found`).
- Findings above are based on the current checked-in snapshot assets and the current source files that define those layouts.
