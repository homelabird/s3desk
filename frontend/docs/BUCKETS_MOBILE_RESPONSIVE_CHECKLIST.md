# `Buckets` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Buckets`
- Goal: verify that the `Buckets` page stays usable on mobile without horizontal overflow, broken compact cards, or inaccessible actions.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Manual QA Checklist

- [ ] Opening `Buckets` does not create page-level horizontal scrolling on narrow phones.
- [ ] Compact/mobile card layout is active on phone-sized widths.
- [ ] Bucket names and metadata remain readable without clipped text.
- [ ] Compact card actions stack vertically on extra-small widths.
- [ ] Buttons remain visible and comfortably tappable in narrow layouts.
- [ ] Empty, loading, and populated states remain stable within the viewport.

## `Buckets` Flow Checklist

- [ ] Open the buckets list and confirm compact cards render correctly on mobile.
- [ ] Trigger a bucket action from a compact card.
- [ ] Verify bucket names and status text remain readable at narrow widths.
- [ ] Scroll through multiple buckets and confirm cards do not overlap or overflow.

## Playwright Coverage Checklist

- [ ] Add a mobile viewport test that asserts no page-level horizontal overflow in `Buckets`.
- [ ] Add a test that verifies compact cards are active on mobile widths.
- [ ] Add a test that verifies compact card actions stack vertically on extra-small widths.

## Notes

- Prioritize compact card readability and action accessibility because those are the highest-risk mobile behaviors on this page.
