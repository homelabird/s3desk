# Frontend Feature Friction Audit - Round 5

Date: 2026-05-22

## Scope

This fifth follow-up pass focused on residual feature friction in secondary controls after the previous simplification rounds. The review used direct Playwright execution against the current frontend, source inspection, and external design-practice checks.

## Design References

- GOV.UK Design Principles: start with user needs, do less, make complex services simple, and iterate.
- Nielsen Norman Group usability heuristics: use user language, support recognition over recall, keep controls predictable, and avoid unnecessary visual or functional noise.
- WCAG 2.2 Target Size Minimum: pointer targets should remain easy to activate, especially in dense mobile toolbars and menus.
- Material Design dialogs: dialogs are interruptive and should be used for specific tasks with clear impact.
- Apple Human Interface Guidelines for buttons: button labels should clearly communicate the resulting action.

Sources:

- https://www.gov.uk/guidance/government-design-principles
- https://www.nngroup.com/articles/ten-usability-heuristics/
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- https://m1.material.io/components/dialogs.html
- https://developer.apple.com/design/human-interface-guidelines/buttons

## Direct Playwright Baseline

Before changes, these checks were run:

- `npm --prefix frontend run test:e2e -- tests/settings-mobile-responsive.spec.ts tests/buckets-mobile-responsive.spec.ts tests/objects-layout-density.spec.ts --project=chromium`
  - Result: 15 passed, 1 failed.
  - Failure: `filters and toggles favorites controls inside the folders drawer` could not find `objects-favorites-controls`.
  - Assessment: existing Objects folders/favorites state issue, not caused by the label changes in this round.
- `npm --prefix frontend run test:e2e -- tests/settings-mobile-responsive.spec.ts tests/buckets-mobile-responsive.spec.ts --project=mobile-pixel-7`
  - Result: 7 passed.

## Cycle 11 - Activity Table Layout

Finding:

- The Activity toolbar used `Columns` as a first-level control. The function is not only about a field list; it changes the visible table layout. This required users to infer the result from a generic noun.

Change:

- Renamed the Activity table control from `Columns` to `Table layout`.
- Renamed its dialog accessible name from `Job columns` to `Job table layout`.
- Renamed the reset action from `Reset columns` to `Reset table layout`.

Expected impact:

- Users can identify the control as a view/layout adjustment before opening it.

## Cycle 12 - Settings System Area

Finding:

- The Settings page used an `Advanced` tab for server information, network diagnostics, backup/restore, retry policy, and UI recovery. The label hid practical recovery tasks behind a generic expert-only term.

Change:

- Renamed the tab label from `Advanced` to `System`.
- Kept the internal key unchanged to avoid unnecessary state or route churn.

Expected impact:

- Recovery and diagnostics remain grouped, but are easier to discover without implying that the user must be an expert.

## Cycle 13 - Bucket Policy Entry

Finding:

- Bucket cards exposed `Advanced policy`, while the actual user intent is opening the policy editor. The label over-emphasized complexity instead of the task.

Change:

- Renamed `Advanced policy` to `Policy editor`.
- Renamed `Policy unavailable` to `Policy editor unavailable`.
- Updated the bucket manage tooltip to match the clearer label.

Expected impact:

- Users can more confidently open policy editing from compact cards and menus.

## Cycle 14 - Objects Toolbar Overflow

Finding:

- The Objects toolbar exposed `More actions` / `More`. On a dense object-management screen, this was too vague because the menu contains navigation, folders, transfers, refresh, path, upload, folder creation, and mode controls.

Change:

- Renamed the accessible toolbar disclosure from `More actions` to `Object tools`.
- Renamed the desktop visible label from `More` to `Tools`; mobile keeps the compact visible `Actions` label while screen readers receive `Object tools`.

Expected impact:

- The overflow menu reads as a tool group rather than an undifferentiated leftovers menu.

## Cycle 15 - Regression Coverage Alignment

Finding:

- Several tests were coupled to the old vague labels. Leaving them unchanged would either fail or keep future changes biased toward the old terminology.

Change:

- Updated related unit and Playwright tests for Activity, Settings, Buckets, and Objects terminology.
- Kept unrelated header/profile `More actions` labels unchanged because those refer to profile/header overflow controls outside this round's object-toolbar scope.

Expected impact:

- Tests now encode clearer user-facing language without broadening the functional surface.

## Verification

Passed:

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:unit -- src/pages/jobs/__tests__/JobsToolbar.test.tsx src/pages/__tests__/SettingsPage.test.tsx src/pages/buckets/__tests__/BucketActions.test.tsx src/pages/__tests__/BucketsPage.smoke.test.tsx src/pages/objects/__tests__/ObjectsToolbar.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/settings-mobile-responsive.spec.ts tests/buckets-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/objects-layout-density.spec.ts --project=chromium --grep "uses compact desktop action buttons"`
- `npm --prefix frontend run test:e2e -- tests/objects-smoke.spec.ts --project=chromium`
- `npm --prefix frontend run test:e2e -- tests/jobs-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e:smoke`
- `npm --prefix frontend run test:e2e:visual -- --project=chromium`

Known residual risk:

- Full `objects-layout-density.spec.ts` on Chromium had one pre-change failure in the folders drawer favorites-control test. This should be investigated separately because the failure was present before this round's label changes.

