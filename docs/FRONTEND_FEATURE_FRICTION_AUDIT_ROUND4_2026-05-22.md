# Frontend Feature Friction Audit Round 4 - 2026-05-22

## Scope

This is an additional five-cycle frontend friction pass after the Round 3 cleanup. The review focused on remaining controls that were useful but still too prominent, ambiguous, or risky in the default mobile and operational workflows.

## Method

- Re-read the Round 3 deferred candidates.
- Ran Playwright against the current mobile header, Jobs, Profiles, and Objects paths before and after changes.
- Compared findings against:
  - GOV.UK Design Principles: start with user needs, do less, and iterate.
  - NN/g usability heuristics: match controls to user expectations, prevent errors, and keep interfaces minimalist.
  - Material Design dialog guidance: use confirmation dialogs for actions that need explicit intent.
  - Apple HIG button guidance: reserve destructive styling for actions that can cause loss.
  - WCAG target-size guidance: mobile controls should remain reliably tappable.

Sources:

- https://www.gov.uk/guidance/government-design-principles
- https://www.nngroup.com/articles/ten-usability-heuristics/
- https://m1.material.io/components/dialogs.html
- https://developer.apple.com/design/human-interface-guidelines/buttons
- https://w3c.github.io/wcag/understanding/target-size-minimum

## Cycle 6 - Playwright Baseline: Ambiguous Upload Action

### Finding

The baseline mobile Playwright pass found that `Upload` resolved to multiple controls on a narrow phone viewport. This is both a test ambiguity and a user-facing naming problem: the Activity header action opens a device-upload flow, while other upload-related affordances also exist.

### Improvement

- Kept the visible Activity header label short as `Upload`.
- Changed the accessible action name to `Upload from device`.
- Updated Jobs/mobile/a11y Playwright coverage to target the specific action.

Files:

- `frontend/src/pages/jobs/JobsToolbar.tsx`
- `frontend/tests/mobile-smoke.spec.ts`
- `frontend/tests/jobs-mobile-responsive.spec.ts`
- `frontend/tests/accessibility-overlays.spec.ts`

## Cycle 7 - Mobile Header Theme Placement

### Finding

On mobile, theme switching was a first-row header control while Settings lived behind the overflow menu. Theme is useful but lower frequency than navigation, active profile selection, transfers, and Settings.

### Improvement

- Removed the standalone mobile theme button from the header row.
- Added `Dark mode` / `Light mode` to the compact header overflow menu after `Settings`.
- Kept the desktop theme button inline where there is enough space.

Files:

- `frontend/src/FullAppShellChrome.tsx`
- `frontend/src/useFullAppShellState.ts`
- `frontend/tests/mobile-smoke.spec.ts`

## Cycle 8 - Logout Error Prevention

### Finding

`Logout` remained immediately executable from the mobile overflow and desktop header. It does not delete server data, but it can interrupt the current session and clear the active profile from the browser.

### Improvement

- Routed logout through the shared confirmation dialog.
- Added explicit copy: saved profiles and objects are not deleted.
- Requires `LOGOUT` confirmation, with the existing dialog-preference mechanism available for users who deliberately opt out later.

Files:

- `frontend/src/useFullAppShellState.ts`
- `frontend/src/__tests__/FullAppInner.smoke.test.tsx`
- `frontend/tests/mobile-smoke.spec.ts`

## Cycle 9 - Profiles Advanced Menu Language

### Finding

The Profiles row submenu label `Advanced` was vague. Its contents were specifically diagnostic and import/export actions (`Benchmark`, `Export/Edit YAML`), so the label forced users to inspect the submenu to understand the risk and purpose.

### Improvement

- Renamed `Advanced` to `Diagnostics & export`.
- Kept the actions grouped and secondary.

Files:

- `frontend/src/pages/profiles/ProfilesTable.tsx`
- `frontend/src/pages/profiles/__tests__/ProfilesTable.test.tsx`

## Cycle 10 - Objects Mode Switch Language

### Finding

The Objects menu used `Simple mode` / `Advanced mode` as action labels. Those labels described target states, but did not clearly read as commands.

### Improvement

- Renamed the action to `Switch to simple mode` when advanced mode is active.
- Renamed the action to `Switch to advanced mode` when simple mode is active.

Files:

- `frontend/src/pages/objects/objectsGlobalActionCatalog.tsx`
- `frontend/src/pages/objects/__tests__/objectsActionCatalog.test.tsx`

## Verification

Passed:

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:unit -- ...` for affected shell, Jobs, Profiles, and Objects units: 15 tests passed.
- `npm --prefix frontend run test:e2e -- tests/mobile-smoke.spec.ts tests/jobs-mobile-responsive.spec.ts tests/profiles-mobile-responsive.spec.ts --project=mobile-pixel-7`: 13 passed.
- `npm --prefix frontend run test:e2e -- tests/objects-smoke.spec.ts --project=chromium`: 1 passed.
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Jobs upload"`: 1 passed.
- `npm --prefix frontend run test:e2e:smoke`: 2 passed.
- `npm --prefix frontend run test:e2e:visual -- --project=chromium`: 18 passed.

## Remaining Deferred Candidates

- Activity table columns are still available as a first-level `Columns` control. This remains useful for operations, but could become a `Layout` submenu if future Playwright or user testing shows toolbar overload.
- Settings still has broad tab categories including `Advanced`; changing that needs a wider settings information-architecture pass.
- Bucket policy/governance labels still use `Advanced policy` in several provider-specific paths. Those are already behind bucket-level management menus, but wording could be reviewed in a future bucket-focused pass.

## Outcome

This pass reduces friction in the remaining global and secondary controls:

- Mobile header now prioritizes navigation, profile context, transfers, and Settings over theme switching.
- Logout requires explicit intent and explains its actual effect.
- Activity upload, Profiles diagnostic/export actions, and Objects mode switching now use clearer action language.
