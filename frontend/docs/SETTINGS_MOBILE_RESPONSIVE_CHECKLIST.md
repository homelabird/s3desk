# `Settings` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Settings`
- Goal: verify that the `Settings` experience remains usable on mobile with viewport-safe drawers, horizontally scrollable tabs, and touch-friendly controls.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Manual QA Checklist

- [ ] Opening `Settings` does not create page-level horizontal scrolling on narrow phones.
- [ ] The settings drawer or overlay stays fully inside the viewport.
- [ ] Drawer header, body, and actions respect mobile safe-area insets.
- [ ] The tab strip scrolls horizontally instead of clipping or wrapping unusably.
- [ ] Active and inactive tabs remain reachable on phone-sized widths.
- [ ] Mobile touch targets remain at least comfortably tappable.

## `Settings` Flow Checklist

- [ ] Open `Settings` from the main UI on a phone-sized viewport.
- [ ] Switch across multiple tabs using horizontal scrolling when needed.
- [ ] Verify tab content changes without clipping the drawer or overlay.
- [ ] Confirm controls near the bottom edge remain usable above the safe area.

## Playwright Coverage Checklist

- [ ] Add a mobile viewport test that asserts the settings drawer remains inside the viewport.
- [ ] Add a test that verifies horizontal tab scrolling works on mobile widths.
- [ ] Add a test that verifies tab touch targets remain large enough for mobile use.

## Notes

- Prioritize drawer containment and tab usability because these are the highest-risk mobile behaviors on the `Settings` page.
