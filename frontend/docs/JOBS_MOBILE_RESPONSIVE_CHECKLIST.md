# `Jobs` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Jobs`
- Goal: verify that `Jobs` still supports real mobile task completion for filtering, job creation entrypoints, queue visibility, and job detail access.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Automated Coverage

Covered by `frontend/tests/jobs-mobile-responsive.spec.ts`.

- [x] Queue health reflects loaded mobile job fixtures.
- [x] Mobile filters persist across reopen and can reset.
- [x] The mobile upload entrypoint opens and closes the upload source sheet.
- [x] Mobile job details and logs drawers stay readable without horizontal overflow.

## Manual QA Checklist

- [ ] Verify the automated suite at `320x568`, `360x800`, `390x844`, `430x932`, and `768x1024` before a release candidate.
- [ ] Confirm provider/offline guard copy remains correct when upload creation is unavailable.
- [ ] Check touch-first controls and safe-area padding on a real device or browser emulation with device insets.
- [ ] Record the exact viewport, component, and blocked task when a manual issue is found.

## Playwright Coverage Checklist

- [x] Filter open/apply/reset flows complete successfully.
- [x] Upload creation sheet still opens from mobile.
- [x] Mobile job details and logs remain reachable.
- [x] Queue or health state remains understandable on mobile fixtures.

## Notes

- Prioritize filter persistence, job creation entry, and detail access. Layout checks only matter when they block one of those actions.
