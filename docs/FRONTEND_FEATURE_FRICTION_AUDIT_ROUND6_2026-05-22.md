# Frontend Feature Friction Audit - Round 6

Date: 2026-05-22

## Scope

This sixth pass reviewed residual frontend friction after the previous five rounds. The focus was not on removing core features, but on reducing unnecessary cognitive load from vague labels such as "More", "Advanced", and "Expert" where the UI could name the actual task instead.

## Design References

- GOV.UK Design Principles: start with user needs, do less, make hard things simple, and iterate.
- Nielsen Norman Group heuristics: prefer user language, recognition over recall, and predictable controls.
- WCAG 2.2 Target Size Minimum: preserve easy activation for compact mobile menu controls.
- Microsoft menu guidance: use menus to organize hidden commands, but avoid hiding frequent actions unnecessarily.
- Microsoft command-button text guidance: labels for secondary surfaces should match the destination or task so users stay oriented.
- Atlassian form guidance: group related configuration fields with concise, informative headings and use progressive disclosure for long forms.

Sources:

- https://www.gov.uk/guidance/government-design-principles
- https://www.nngroup.com/articles/ten-usability-heuristics/
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/menus-and-context-menus
- https://learn.microsoft.com/en-us/previous-versions/windows/desktop/bb226792%28v%3Dvs.85%29
- https://design-system-docs-proxy.services.atlassian.com/patterns/forms/

## Direct Playwright Baseline

Before changes:

- `npm --prefix frontend run test:e2e -- tests/mobile-smoke.spec.ts tests/settings-mobile-responsive.spec.ts --project=mobile-pixel-7`
- Result: 7 passed.

The baseline confirmed that the current mobile header and Settings drawer worked, but still exposed generic labels that made the purpose of hidden commands less clear.

## Cycle 16 - Mobile Header Menu

Finding:

- The mobile app header used an icon-only control named `More actions`. The menu actually contains app-level commands: Settings, theme mode, and logout.

Change:

- Renamed the accessible label to `App menu`.

Expected impact:

- Screen-reader and automated role users now hear the purpose of the menu instead of a generic leftover-action label.

## Cycle 17 - Profile Row Tools

Finding:

- Profile cards and rows used `More` / `More actions for ...`, even though the menu contains profile-specific tools such as edit, test, benchmark, YAML export, and delete.

Change:

- Renamed the row disclosure to `Tools`.
- Renamed the accessible label to `Profile tools for <profile name>`.

Expected impact:

- Users can recognize the menu as profile-scoped tooling before opening it.

## Cycle 18 - Settings Disclosure Labels

Finding:

- Settings still had generic `Advanced` collapses:
  - Access settings: only API docs and OpenAPI YAML links.
  - Objects settings: thumbnail cache and Indexed Search indexing settings.

Change:

- Access collapse: `Advanced` -> `API reference`.
- Objects collapse: `Advanced` -> `Cache and indexing`.

Expected impact:

- Users see what each disclosure contains without treating routine reference/cache settings as expert-only.

## Cycle 19 - Setup and System Copy

Finding:

- `Advanced profile setup`, `Expert transfer tuning`, and "advanced settings area" over-signaled complexity and made ordinary manual/provider setup feel riskier than it is.

Change:

- Setup link: `Advanced profile setup` -> `Manual profile setup`.
- Transfers disclosure: `Expert transfer tuning` -> `Transfer performance tuning`.
- Backup copy: "advanced settings area" -> "system settings area".

Expected impact:

- The UI keeps risky controls grouped, but uses task language instead of status language.

## Cycle 20 - Profile Compatibility Options

Finding:

- The profile modal section `Advanced Options` contains compatibility toggles: force path style, emulator mode, leading slash preservation, and TLS skip verification.

Change:

- Renamed `Advanced Options` to `Compatibility Options`.
- Updated validation helper text to point users to `Compatibility Options`.

Expected impact:

- Users looking for MinIO/Ceph/custom endpoint compatibility have a clearer target than a generic advanced section.

## Verification

Passed:

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:unit -- src/pages/__tests__/ProfilesPage.smoke.test.tsx`
- `npm --prefix frontend run test:unit -- src/__tests__/FullAppInner.smoke.test.tsx src/__tests__/FullAppInner.routes.test.tsx src/pages/__tests__/SettingsPage.test.tsx src/pages/profiles/__tests__/ProfilesTable.test.tsx src/pages/settings/__tests__/ServerSettingsSection.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/mobile-smoke.spec.ts tests/settings-mobile-responsive.spec.ts tests/profiles-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/profiles-provider-forms.spec.ts --project=chromium`
- `npm --prefix frontend run test:e2e:smoke`
- `npm --prefix frontend run test:e2e:visual -- --project=chromium`
- `git diff --check`

Notes:

- The `objects-live-flow.spec.ts` selector was updated from `Advanced Options` to `Compatibility Options`; the test remains live-environment gated by `E2E_LIVE=1` and was not run as part of local non-live verification.

