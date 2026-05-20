# `Uploads` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Uploads`
- Goal: verify that `Uploads` still supports real mobile task completion for source selection, staged upload review, and transfers access.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Automated Coverage

Covered by `frontend/tests/uploads-mobile-responsive.spec.ts`.

- [x] Upload destination prefix persists across a mobile reload.
- [x] Upload source sheet opens from the mobile page and exposes file/folder choices.
- [x] Selected files can be cleared from the mobile uploads header.
- [x] Queueing a mobile upload exposes the queued file in Transfers.

## Manual QA Checklist

- [ ] Verify the automated suite at `320x568`, `360x800`, `390x844`, `430x932`, and `768x1024` before a release candidate.
- [ ] Confirm the upload source sheet exposes file/folder choices clearly on the target browser.
- [ ] Confirm bucket choices remain readable enough to verify the upload target.
- [ ] Check empty and post-selection states for touch-first controls and safe-area padding.
- [ ] Record the exact viewport, component, and blocked task when a manual issue is found.

## Playwright Coverage Checklist

- [x] Upload source sheet opens from the page.
- [x] Staged file selection can be cleared on mobile.
- [x] Upload prefix state persists correctly on mobile.
- [x] Transfers remain reachable after queueing work.

## Notes

- Prioritize upload entry, staged-selection review, and transfers handoff. Layout-only checks matter only when they break those flows.
