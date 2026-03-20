# `Objects` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Objects`
- Goal: verify that the `Objects` experience works correctly on mobile and tablet layouts without horizontal overflow, clipped drawers, or unusable controls.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Manual QA Checklist

- [ ] Opening `Objects` does not create page-level horizontal scrolling at `320x568`.
- [ ] The main list area remains usable at `360x800` without clipped controls.
- [ ] The left tree drawer opens and closes correctly on mobile.
- [ ] The right details drawer opens and closes correctly on mobile.
- [ ] Tree and details panels use drawer behavior instead of docked multi-pane layout on tablet-sized widths that are too narrow for desktop layout.
- [ ] Drawer content stays inside the viewport and does not render off-screen.
- [ ] Drawer header, body, and actions respect safe-area insets on mobile devices.
- [ ] The current S3 location/path text wraps correctly on narrow screens.
- [ ] Long object keys and prefixes wrap or remain readable instead of causing layout overflow.
- [ ] Search and filter controls stack cleanly on narrow screens.
- [ ] Buttons in narrow layouts remain large enough to tap comfortably.
- [ ] Global Search opens at a viewport-safe width on tablet and mobile.
- [ ] Global Search filter fields wrap into multiple rows instead of forcing horizontal overflow.
- [ ] Global Search result rows remain readable on small screens.
- [ ] Global Search action buttons remain visible and usable on small screens.
- [ ] No key action is hidden behind the iOS home indicator or bottom safe area.

## `Objects` Flow Checklist

- [ ] Browse folders from the tree drawer and confirm navigation updates correctly.
- [ ] Select an object and confirm the details drawer shows the correct metadata.
- [ ] Toggle between list and grid view on mobile.
- [ ] Apply filters from the compact/mobile controls.
- [ ] Open Global Search and run a query with results.
- [ ] Open a result from Global Search and verify navigation into the correct prefix.
- [ ] Open object details from Global Search results.
- [ ] Copy location/path from the mobile controls.

## Playwright Coverage Checklist

- [ ] Add a mobile viewport test that asserts no page-level horizontal overflow in `Objects`.
- [ ] Add a test for opening and closing the tree drawer on mobile.
- [ ] Add a test for opening and closing the details drawer on mobile.
- [ ] Add a test for opening Global Search on mobile.
- [ ] Add a test that verifies Global Search drawer width stays within the viewport.
- [ ] Add a test that verifies search/filter controls wrap correctly on narrow widths.
- [ ] Add a test that verifies long object keys do not break layout in Global Search results.
- [ ] Add a test that verifies compact action buttons remain accessible at `640px` and below.
- [ ] Add a tablet-width test to confirm drawer-based behavior is used instead of an unusable docked multi-pane layout.

## Notes

- Prioritize `Objects` over other pages for mobile regression coverage because it has the highest layout complexity in the frontend.
- If additional regressions are found, record the exact viewport, affected component, and whether the issue is overflow, clipping, stacking, or interaction failure.
- Use [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md) for suite-level execution commands and CI check names.
