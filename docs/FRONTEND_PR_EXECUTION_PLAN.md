# Frontend PR Execution Plan (FE-01 ~ FE-09)

Scope baseline (2026-03-05):
- Inline style usages: 392
- Target files in FE-01: `ProfilesPage.tsx`, `BucketsPage.tsx`, `FullAppInner.tsx`

Execution status:
- PR-01 (FE-01): completed locally (style count 392 -> 336, target files `style={{}}` = 0)
- PR-02 (FE-02): completed locally (style count 336 -> 293, target files `style={{}}` = 0)
- PR-03 (FE-03): completed locally (responsive table pattern unified; style count 293 -> 291)
- PR-04 (FE-04): completed locally (`ProfilesPage.tsx` 1013 -> 625; table/modal/view-model split)
- PR-05 (FE-05): completed locally (`SettingsPage.tsx` 877 -> 323; Access/Transfers/Objects/Network/Server sections extracted)
- PR-06+: pending

## PR-01 (FE-01): Style debt reduction wave 1

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
- (optional) touched smoke tests if snapshots/queries need updates

Checklist:
- [x] Add CSS modules for the 3 targets.
- [x] Move static table/container/header styles out of JSX.
- [x] Keep only unavoidable dynamic inline styles.
- [x] Ensure mobile/tablet layout parity.
- [x] `npm -C frontend run lint`
- [x] `npm -C frontend run test:unit`
- [x] `npm -C frontend run build`
- [x] Report style count delta (`rg -n "style={{" ... | wc -l`).

Acceptance:
- `style={{}}` in target files reduced by >= 70%.

## PR-02 (FE-02): Style debt reduction wave 2 (Objects drawers)

Goal:
- Convert heavy inline style drawers to module styles.

Size:
- L (2-3 days)

File list:
- `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx`
- `frontend/src/pages/objects/ObjectsFiltersDrawer.tsx`
- `frontend/src/pages/objects/objects.module.css` (extend) OR split module files

Checklist:
- [x] Replace width/minWidth/maxWidth inline style patterns with semantic classes.
- [x] Standardize scroll container/card/table wrappers.
- [x] Preserve responsive behavior and keyboard interactions.
- [x] lint/unit/build pass.

Acceptance:
- Inline styles in both files reduced by >= 80%.

## PR-03 (FE-03): Responsive table pattern unification

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

## PR-04 (FE-04): ProfilesPage decomposition completion

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
- `ProfilesPage.tsx` <= 700 LOC.

## PR-05 (FE-05): SettingsPage sectional split

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
- `SettingsPage.tsx` <= 500 LOC.

## PR-06 (FE-06): Style regression guardrail

Goal:
- Prevent style debt from increasing.

Size:
- M (1 day)

File list:
- `frontend/eslint.config.js`
- `.gitlab-ci.yml`
- `scripts/check-inline-style.sh` (new)

Checklist:
- [ ] Add lint rule or CI script to detect new `style={{` in frontend.
- [ ] Allowlist only unavoidable component-level cases.
- [ ] Fail CI on regressions.

Acceptance:
- CI blocks net-new inline style debt.

## PR-07 (FE-07): Mobile toolbar UX hardening

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
- [ ] Replace fixed width inline styles with responsive classes (`clamp`, breakpoints).
- [ ] Validate at 360/390/768 widths.
- [ ] lint/unit/build pass.

Acceptance:
- No overflow/overlap in toolbar controls on target breakpoints.

## PR-08 (FE-08): ObjectsPage large-file split

Goal:
- Continue decomposition of `ObjectsPage.tsx` and lower page-level complexity.

Size:
- XL (4-5 days)

File list:
- `frontend/src/pages/ObjectsPage.tsx`
- new slices in `frontend/src/pages/objects/` (containers/hooks/view-models)
- focused tests for extracted logic

Checklist:
- [ ] Split orchestration/view-model/UI assembly layers.
- [ ] Keep runtime behavior and keyboard shortcut flows unchanged.
- [ ] Add tests for extracted pure logic.
- [ ] lint/unit/build pass.

Acceptance:
- `ObjectsPage.tsx` <= 900 LOC.

## PR-09 (FE-09): Smoke test quality uplift

Goal:
- Upgrade page smoke tests from render-only to critical interaction assertions.

Size:
- M (1 day)

File list:
- `frontend/src/pages/__tests__/ProfilesPage.smoke.test.tsx`
- `frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx`
- `frontend/src/pages/__tests__/JobsPage.smoke.test.tsx`
- `frontend/src/pages/objects/__tests__/ObjectsPage.smoke.test.tsx`

Checklist:
- [ ] Add at least one key interaction/assertion per page.
- [ ] Keep test runtime stable.
- [ ] lint/unit pass.

Acceptance:
- Smoke tests validate core CTA/state transitions, not only title rendering.
