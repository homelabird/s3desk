# `Objects` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Objects`
- Goal: verify that `Objects` still supports real mobile task completion for folder navigation, object details, filters, and global search.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Automated Coverage

Covered by `frontend/tests/objects-mobile-responsive.spec.ts`.

- [x] The mobile header, location controls, and initial objects render at constrained width.
- [x] Primary toolbar actions remain exposed at mid-width mobile breakpoints.
- [x] Object action menus open and dismiss from mobile rows.
- [x] Image preview opens directly from a mobile grid card.
- [x] Selection actions appear and selected objects can be cleared on mobile.
- [x] The folders drawer opens, navigates to a prefix, and closes on mobile.
- [x] Core overlay drawers open and close at mid-width mobile sizes.
- [x] Folder navigation, Global Search, and filters are exercised as task flows.
- [x] Object details open from mobile actions and close cleanly.
- [x] Large preview viewer opens with image metadata and actions on mobile.
- [x] Large preview viewer fits a short `320px` mobile viewport.
- [x] Global Search preserves query filters across mobile reopen.
- [x] Global Search result cards expose object actions on mobile.
- [x] Filters drawer applies and clears file filters on mobile.
- [x] Copy key actions remain reachable from details and Global Search mobile surfaces.

## Manual QA Checklist

- [ ] Verify the automated suite at `320x568`, `360x800`, `390x844`, `430x932`, and `768x1024` before a release candidate.
- [ ] Confirm copy or path reuse actions remain reachable from the mobile controls.
- [ ] Toggle between list and grid view on mobile if a release changes either presentation.
- [ ] Check safe-area padding on a real device or browser emulation with device insets.
- [ ] Record the exact viewport, component, and blocked task when a manual issue is found.

## Playwright Coverage Checklist

- [x] Opening and closing the tree drawer on mobile.
- [x] Opening and closing the details drawer on mobile.
- [x] Mobile filter application and filter clearing.
- [x] Opening Global Search on mobile and navigating from a result.
- [x] Mobile search state persistence across reopen.
- [x] Tablet-width drawer task completion coverage.
- [x] Copy/path actions remain reachable from constrained controls.

## Notes

- Prioritize `Objects` over other pages for mobile regression coverage because it has the highest layout complexity in the frontend.
- If additional regressions are found, record the exact viewport, affected component, and the blocked user task.
- Use [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md) for suite-level execution commands and CI check names.
