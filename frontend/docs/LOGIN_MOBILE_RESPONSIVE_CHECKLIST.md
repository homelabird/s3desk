# `Login` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Login`
- Goal: verify that the login experience stays usable on mobile without horizontal overflow, hidden controls, or unreachable theme switching.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`

## Manual QA Checklist

- [ ] Opening `Login` does not create page-level horizontal scrolling on narrow phones.
- [ ] The login form remains fully visible without clipped labels or actions.
- [ ] Stored-token warning or recovery states do not hide critical controls.
- [ ] The theme toggle remains visible and reachable on small screens.
- [ ] Primary login controls remain comfortably tappable on mobile widths.

## `Login` Flow Checklist

- [ ] Open the login screen in a narrow mobile viewport.
- [ ] Verify login inputs and submit controls remain visible with the virtual keyboard closed.
- [ ] Simulate an invalid stored token state and confirm recovery controls remain visible.
- [ ] Toggle the theme and confirm the control remains reachable after layout changes.

## Playwright Coverage Checklist

- [ ] Add a mobile viewport test that asserts no page-level horizontal overflow on `Login`.
- [ ] Add a test that verifies controls remain visible with an invalid stored token state.
- [ ] Add a test that verifies the theme toggle remains reachable on mobile.

## Notes

- `Login` is a release-critical entry point, so control visibility and tappability matter more than dense visual polish.
