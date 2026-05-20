# `Settings` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Settings`
- Goal: verify that `Settings` still supports real mobile task completion for opening the settings surface, switching tabs, and saving stateful preferences.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Automated Coverage

Covered by `frontend/tests/settings-mobile-responsive.spec.ts`.

- [x] The settings drawer opens from the mobile route and compact header.
- [x] The narrow mobile tab row can reach the `Recovery` workflow on `320x568`.
- [x] Transfer preferences persist after close/reopen on mobile.
- [x] API token changes persist after close/reopen on mobile.

## Manual QA Checklist

- [ ] `Settings` still opens from the main UI on a phone-sized viewport.
- [ ] Tab switching remains usable when some tabs require horizontal scrolling.
- [ ] Preference controls remain reachable after changing tabs.
- [ ] Saving or applying settings still leaves the user in a coherent mobile state.
- [ ] Controls near the bottom edge stay usable with safe-area padding.
- [ ] Token, transfer, or tab state changes are not hidden behind the overlay shell.

## `Settings` Flow Checklist

- [x] Open `Settings` from the main UI on a phone-sized viewport.
- [x] Switch across multiple tabs using horizontal scrolling when needed.
- [x] Change at least one setting and confirm the updated state persists after close/reopen.
- [x] Reopen `Settings` and confirm the previously changed state is still visible.

## Playwright Coverage Checklist

- [x] Add a mobile test that verifies `Settings` opens from the main UI.
- [x] Add a test that verifies horizontal tab scrolling still reaches the hidden tabs.
- [x] Add a test that verifies a representative setting persists after close/reopen on mobile.

## Notes

- Prioritize open, tab-switch, and persistence flows. Layout checks only matter when they block those actions.
