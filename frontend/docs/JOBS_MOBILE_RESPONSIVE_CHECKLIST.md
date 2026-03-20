# `Jobs` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Jobs`
- Goal: verify that the `Jobs` page stays usable on mobile without horizontal overflow, clipped filter sheets, or broken card stacking.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Manual QA Checklist

- [ ] Opening `Jobs` does not create page-level horizontal scrolling on narrow phones.
- [ ] The filters sheet opens fully inside the viewport on mobile.
- [ ] The upload creation sheet opens fully inside the viewport on mobile.
- [ ] Health cards stack vertically on narrow widths instead of colliding horizontally.
- [ ] Buttons and filter controls remain comfortably tappable.
- [ ] Drawer or sheet content respects safe-area insets on mobile devices.

## `Jobs` Flow Checklist

- [ ] Open the `Jobs` page on a narrow mobile viewport.
- [ ] Open the filters sheet and confirm all controls remain reachable.
- [ ] Open the upload creation sheet and verify it stays within the viewport.
- [ ] Scroll through the jobs list and confirm health/status cards remain readable.

## Playwright Coverage Checklist

- [ ] Add a mobile viewport test that asserts no page-level horizontal overflow in `Jobs`.
- [ ] Add a test that verifies the filters sheet remains inside the viewport.
- [ ] Add a test that verifies health cards stack vertically on narrow widths.
- [ ] Add a test that verifies the upload creation sheet remains inside the viewport.

## Notes

- Prioritize filter-sheet containment and health-card stacking because those are the highest-risk mobile behaviors on the `Jobs` page.
