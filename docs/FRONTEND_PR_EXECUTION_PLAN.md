# Frontend PR Execution Plan (FE-01 ~ FE-09)

Last updated: 2026-03-05

## Scope Baseline (2026-03-05)
- Inline style usages: `392`
- Initial FE-01 targets: `ProfilesPage.tsx`, `BucketsPage.tsx`, `FullAppInner.tsx`

## Current Snapshot (Latest on `main`)
- Inline style usages: `273` (`frontend/src`, `style={{}}` grep count)
- `ProfilesPage.tsx`: `625` LOC
- `SettingsPage.tsx`: `323` LOC
- `ObjectsPage.tsx`: `10` LOC (delegates to `ObjectsPageScreen.tsx`)
- `ObjectsPageScreen.tsx`: `1018` LOC

## Execution Status
- PR-01 (FE-01): **Completed**
- PR-02 (FE-02): **Completed**
- PR-03 (FE-03): **Completed**
- PR-04 (FE-04): **Completed**
- PR-05 (FE-05): **Completed**
- PR-06 (FE-06): **Completed**
- PR-07 (FE-07): **Completed (code-level)**
- PR-08 (FE-08): **In progress**
- PR-09 (FE-09): **Completed**

Related commits:
- `4a6bd8d` refactor(frontend): split profiles/settings and harden smoke interactions
- `bf84595` ci: enforce golangci-lint and net-new inline-style guard
- `d2453f1` refactor(objects): split page screen into data/actions and pane builders

---

## PR-01 (FE-01): Style Debt Reduction Wave 1
Goal:
- Replace most inline styles in key shell/pages with CSS modules + tokens.
- Keep behavior unchanged.

Size:
- L (2 days)

File list:
- `frontend/src/pages/ProfilesPage.tsx`
- `frontend/src/pages/BucketsPage.tsx`
- `frontend/src/FullAppInner.tsx`
- `frontend/src/pages/ProfilesPage.module.css` (new)
- `frontend/src/pages/BucketsPage.module.css` (new)
- `frontend/src/FullAppInner.module.css` (new)

Checklist:
- [x] Add CSS modules for the 3 targets.
- [x] Move static table/container/header styles out of JSX.
- [x] Keep only unavoidable dynamic inline styles.
- [x] Ensure mobile/tablet layout parity.
- [x] `npm -C frontend run lint`
- [x] `npm -C frontend run test:unit`
- [x] `npm -C frontend run build`
- [x] Report style count delta.

Acceptance:
- Target files reduced to `style={{}} = 0`.

## PR-02 (FE-02): Style Debt Reduction Wave 2 (Objects Drawers)
Goal:
- Convert heavy inline style drawers to module styles.

Size:
- L (2-3 days)

File list:
- `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx`
- `frontend/src/pages/objects/ObjectsFiltersDrawer.tsx`
- `frontend/src/pages/objects/objects.module.css`

Checklist:
- [x] Replace width/minWidth/maxWidth inline style patterns with semantic classes.
- [x] Standardize scroll container/card/table wrappers.
- [x] Preserve responsive behavior and keyboard interactions.
- [x] lint/unit/build pass.

Acceptance:
- Inline style usage in both target drawers substantially reduced.

## PR-03 (FE-03): Responsive Table Pattern Unification
Goal:
- Unify table wrappers/cell classes across Buckets/Profiles/BucketPolicy.

Size:
- L (2 days)

File list:
- `frontend/src/pages/BucketsPage.tsx`
- `frontend/src/pages/ProfilesPage.tsx`
- `frontend/src/pages/buckets/BucketPolicyModal.tsx`
- `frontend/src/pages/BucketsPage.module.css`
- `frontend/src/pages/ProfilesPage.module.css`
- `frontend/src/pages/buckets/BucketPolicyModal.module.css`

Checklist:
- [x] Create shared table style conventions (wrap, min-width tiers, cell paddings).
- [x] Add mobile breakpoints for compact columns/action wrapping.
- [x] Verify no horizontal clipping on <= 768px.
- [x] lint/unit/build pass.

Acceptance:
- Consistent responsive table behavior across the 3 surfaces.

## PR-04 (FE-04): ProfilesPage Decomposition Completion
Goal:
- Move non-view domain logic out of page component.

Size:
- L (2 days)

File list:
- `frontend/src/pages/ProfilesPage.tsx`
- `frontend/src/pages/profiles/profileYaml.ts` (new)
- `frontend/src/pages/profiles/profileViewModel.ts` (new)
- `frontend/src/pages/profiles/ProfilesTable.tsx` (new)
- `frontend/src/pages/profiles/ProfilesModals.tsx` (new)
- `frontend/src/pages/profiles/__tests__/profileYaml.test.ts` (new)

Checklist:
- [x] Extract YAML parse/validate/infer provider logic.
- [x] Extract table/modal view components from page file.
- [x] Keep orchestration in page, move mapping/formatting to view model.
- [x] Add focused unit tests for parser and edge cases.
- [x] lint/unit/build pass.

Acceptance:
- `ProfilesPage.tsx` reduced from ~`1013` to `625` LOC.

## PR-05 (FE-05): SettingsPage Sectional Split
Goal:
- Split sections into feature subcomponents.

Size:
- L (2 days)

File list:
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/pages/settings/AccessSettingsSection.tsx` (new)
- `frontend/src/pages/settings/TransfersSettingsSection.tsx` (new)
- `frontend/src/pages/settings/ObjectsSettingsSection.tsx` (new)
- `frontend/src/pages/settings/NetworkSettingsSection.tsx` (new)
- `frontend/src/pages/settings/ServerSettingsSection.tsx` (new)

Checklist:
- [x] Define section props contracts.
- [x] Keep state ownership in orchestrator/page where needed.
- [x] Preserve all existing controls and behavior.
- [x] lint/unit/build pass.

Acceptance:
- `SettingsPage.tsx` reduced from ~`877` to `323` LOC.

## PR-06 (FE-06): Style Regression Guardrail
Goal:
- Prevent style debt from increasing.

Size:
- M (1 day)

File list:
- `frontend/eslint.config.js`
- `.gitlab-ci.yml`
- `scripts/check-inline-style.sh` (new)

Checklist:
- [x] Add CI script to detect net-new `style={{` in frontend.
- [x] Enforce failure on inline-style regressions.
- [x] Keep lint strict (`--max-warnings 0`).

Acceptance:
- CI blocks net-new inline style debt.

## PR-07 (FE-07): Mobile Toolbar UX Hardening
Goal:
- Remove brittle fixed widths in mobile-sensitive toolbars.

Size:
- L (2 days)

File list:
- `frontend/src/pages/jobs/JobsToolbar.tsx`
- `frontend/src/pages/UploadsPage.tsx`
- `frontend/src/pages/objects/ObjectsToolbar.tsx`
- related CSS modules

Checklist:
- [x] Replace fixed-width inline styles with responsive classes/breakpoints.
- [x] Move toolbar layout styling to CSS modules.
- [x] lint/unit/build pass.

Acceptance:
- Code-level responsive hardening completed for target toolbars.
- Note: run manual viewport QA pass (360/390/768) when doing next UI regression sweep.

## PR-08 (FE-08): ObjectsPage Large-File Split
Goal:
- Continue decomposition of objects page and lower page-level complexity.

Size:
- XL (4-5 days)

File list (current phase):
- `frontend/src/pages/ObjectsPage.tsx`
- `frontend/src/pages/ObjectsPageScreen.tsx` (new)
- `frontend/src/pages/objects/useObjectsPageData.ts` (new)
- `frontend/src/pages/objects/useObjectsPageActions.ts` (new)
- `frontend/src/pages/objects/buildObjectsPageOverlaysProps.tsx` (new)
- `frontend/src/pages/objects/useObjectsPageListInteractions.tsx` (new)
- `frontend/src/pages/objects/buildObjectsPagePanesProps.tsx` (new)

Checklist:
- [x] Split `ObjectsPage.tsx` to screen-level component.
- [x] Extract data/actions/overlay-builder/panes-builder/list-interactions modules.
- [ ] Additional split for `ObjectsPageScreen.tsx` action/overlay groups and row/context-menu composition.
- [ ] Add/expand focused tests for extracted pure logic slices.

Acceptance:
- Entry page complexity reduced (`ObjectsPage.tsx` now 10 LOC).
- Remaining work tracked in `ObjectsPageScreen.tsx` (`1018` LOC).

## PR-09 (FE-09): Smoke Test Quality Uplift
Goal:
- Upgrade page smoke tests from render-only checks to interaction assertions.

Size:
- M (1 day)

File list:
- `frontend/src/pages/__tests__/ProfilesPage.smoke.test.tsx`
- `frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx`
- `frontend/src/pages/__tests__/JobsPage.smoke.test.tsx`
- `frontend/src/pages/objects/__tests__/ObjectsPage.smoke.test.tsx`

Checklist:
- [x] Add at least one key interaction/assertion per page.
- [x] Keep test runtime stable.
- [x] lint/unit pass.

Acceptance:
- Smoke tests now validate CTA/state transitions (navigation, dismiss, sort toggle), not only rendering.
