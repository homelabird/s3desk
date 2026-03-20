# `Profiles` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Profiles`
- Goal: verify that the `Profiles` experience remains usable on mobile without horizontal overflow, unreadable cards, or cramped actions.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Manual QA Checklist

- [ ] Opening `Profiles` does not create page-level horizontal scrolling on narrow phones.
- [ ] Compact/mobile card layout is active on phone-sized widths instead of a desktop table layout.
- [ ] Card content remains readable without clipped text or overlapping controls.
- [ ] Primary and secondary actions stack cleanly on extra-small widths.
- [ ] Buttons in compact cards remain large enough to tap comfortably.
- [ ] Empty, loading, and populated states stay inside the viewport.

## `Profiles` Flow Checklist

- [ ] Open the profiles list and confirm cards remain readable on mobile.
- [ ] Open a profile action menu or primary action from a compact card.
- [ ] Verify switching between multiple cards does not cause layout shift or overflow.
- [ ] Confirm profile identifiers and labels remain readable on narrow widths.

## Playwright Coverage Checklist

- [ ] Add a mobile viewport test that asserts no page-level horizontal overflow in `Profiles`.
- [ ] Add a test that verifies compact cards are active on mobile widths.
- [ ] Add a test that verifies compact card actions stack vertically on extra-small widths.

## Notes

- Keep `Profiles` coverage focused on compact card behavior because that is the highest-risk mobile layout mode for this page.
