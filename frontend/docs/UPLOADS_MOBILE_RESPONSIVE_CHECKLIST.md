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

## Manual QA Checklist

- [ ] The upload source sheet still opens from mobile and exposes file/folder choices clearly.
- [ ] After selecting files, the page still supports review, clearing, and queueing from the staged selection area.
- [ ] Prefix and bucket choices remain readable enough to confirm the upload target.
- [ ] Transfers can still be opened from the page after queueing work.
- [ ] Mobile sheets and drawers preserve the next required action instead of hiding it behind follow-up UI.
- [ ] Empty and post-selection states both keep the primary upload actions reachable.

## `Uploads` Flow Checklist

- [ ] Open the `Uploads` page on a phone-sized viewport.
- [ ] Open the upload source sheet and choose a source path that the page can stage.
- [ ] Add files and verify the staged selection can be reviewed and cleared.
- [ ] Set or confirm the upload bucket/prefix and queue the staged upload.
- [ ] Open the transfers drawer from the page after queueing work.

## Playwright Coverage Checklist

- [ ] Add a mobile test that verifies the upload source sheet still opens from the page.
- [ ] Add a test that verifies staged file selection can be reviewed and cleared on mobile.
- [ ] Add a test that verifies upload prefix or bucket state persists correctly on mobile.
- [ ] Add a test that verifies transfers remain reachable after queueing work.

## Notes

- Prioritize upload entry, staged-selection review, and transfers handoff. Layout-only checks matter only when they break those flows.
