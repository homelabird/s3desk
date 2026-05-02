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

## Manual QA Checklist

- [ ] Opening `Jobs` on a phone still exposes the primary actions needed to filter, inspect, and create work.
- [ ] The filters sheet can be opened, updated, and dismissed without losing the page state.
- [ ] The upload creation sheet can be opened from mobile and either queues work or shows the correct provider/offline guard.
- [ ] Queue summary and health indicators stay readable enough to decide the next action.
- [ ] A job row or card still exposes details/log entrypoints on mobile.
- [ ] Mobile interactions remain usable with touch-first controls and safe-area padding.

## `Jobs` Flow Checklist

- [ ] Open the `Jobs` page on a phone-sized viewport.
- [ ] Open the filters sheet, apply at least one filter, and confirm the list reflects the change.
- [ ] Reset filters and confirm the baseline list returns.
- [ ] Open the upload creation sheet and confirm the mobile flow can continue or surfaces the correct guard reason.
- [ ] Open job details or logs from a mobile row/card action.

## Playwright Coverage Checklist

- [ ] Add a mobile test that verifies filter open/apply/reset flows complete successfully.
- [ ] Add a test that verifies the upload creation sheet still opens from mobile.
- [ ] Add a test that verifies mobile job details or logs remain reachable.
- [ ] Add a test that verifies queue or health state remains understandable after filtering or job creation.

## Notes

- Prioritize filter persistence, job creation entry, and detail access. Layout checks only matter when they block one of those actions.
