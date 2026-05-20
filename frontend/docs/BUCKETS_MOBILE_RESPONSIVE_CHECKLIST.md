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

## Automated Coverage

Covered by `frontend/tests/buckets-mobile-responsive.spec.ts`.

- [x] The create bucket flow opens and closes on mobile.
- [x] Policy and controls overlays open from compact bucket cards.
- [x] Non-empty delete fallback routes into a prefilled delete-job sheet.
- [x] Compact-card actions remain usable on the final bucket in a multi-bucket mobile list.

## Manual QA Checklist

- [ ] Verify the automated suite at `320x568`, `360x800`, `390x844`, `430x932`, and `768x1024` before a release candidate.
- [ ] Confirm bucket names and metadata remain readable enough to choose the correct bucket.
- [ ] Check empty, loading, and populated states for the next required bucket action.
- [ ] Scroll through multiple buckets and confirm the final card can still execute an action.
- [ ] Record the exact viewport, component, and blocked task when a manual issue is found.

## Playwright Coverage Checklist

- [x] Policy or controls overlays still open from compact cards.
- [x] Delete actions still reach confirmation or jobs fallback on mobile.
- [x] Compact-card actions remain usable on the last visible bucket.

## Notes

- Prioritize compact-card actions and delete fallback handling. Layout-only checks are secondary unless they block those actions.
