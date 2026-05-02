# `Buckets` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Buckets`
- Goal: verify that `Buckets` still supports real mobile task completion for compact-card actions, policy/controls access, and delete fallback handling.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Manual QA Checklist

- [ ] Compact cards still expose the primary bucket actions on a phone-sized viewport.
- [ ] Bucket names and metadata remain readable enough to choose the correct bucket.
- [ ] Policy and controls overlays remain reachable from compact cards.
- [ ] Delete actions from compact cards still surface either confirmation or the jobs fallback flow.
- [ ] Empty, loading, and populated states all preserve the next required bucket action.
- [ ] Mobile card interactions remain usable with touch-first controls and safe-area padding.

## `Buckets` Flow Checklist

- [ ] Open the buckets list and confirm compact cards expose the right bucket actions.
- [ ] Open policy or controls from a compact card.
- [ ] Trigger a delete from a compact card and confirm the flow reaches confirmation or jobs fallback.
- [ ] Scroll through multiple buckets and confirm the final card can still execute an action.

## Playwright Coverage Checklist

- [ ] Add a mobile test that verifies policy or controls overlays still open from compact cards.
- [ ] Add a test that verifies delete actions still reach confirmation or jobs fallback on mobile.
- [ ] Add a test that verifies compact-card actions remain usable on the last visible bucket.

## Notes

- Prioritize compact-card actions and delete fallback handling. Layout-only checks are secondary unless they block those actions.
