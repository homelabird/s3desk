# `Uploads` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Uploads`
- Goal: verify that the `Uploads` page stays usable on mobile without horizontal overflow, clipped upload sheets, or inaccessible header actions.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Manual QA Checklist

- [ ] Opening `Uploads` does not create page-level horizontal scrolling on narrow phones.
- [ ] The upload source sheet opens fully inside the viewport on mobile.
- [ ] After selecting files, header actions stack cleanly on narrow widths.
- [ ] The transfers drawer opens fully inside the viewport on mobile.
- [ ] Upload source controls and follow-up actions remain comfortably tappable.
- [ ] Drawer or sheet content respects mobile safe-area insets.

## `Uploads` Flow Checklist

- [ ] Open the `Uploads` page on a narrow mobile viewport.
- [ ] Open the upload source sheet and confirm all controls remain visible.
- [ ] Add files and verify header actions remain usable after selection.
- [ ] Open the transfers drawer from the header and confirm it stays within the viewport.

## Playwright Coverage Checklist

- [ ] Add a mobile viewport test that asserts no page-level horizontal overflow in `Uploads`.
- [ ] Add a test that verifies the upload source sheet remains inside the viewport.
- [ ] Add a test that verifies header actions stack cleanly after file selection on narrow widths.
- [ ] Add a test that verifies the transfers drawer remains inside the viewport.

## Notes

- Prioritize upload entry points and post-selection actions because those are the highest-risk mobile interactions on the `Uploads` page.
