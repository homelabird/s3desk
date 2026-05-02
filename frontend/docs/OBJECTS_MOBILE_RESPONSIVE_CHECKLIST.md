# `Objects` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Objects`
- Goal: verify that `Objects` still supports real mobile task completion for folder navigation, object details, filters, and global search.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Manual QA Checklist

- [ ] The folders drawer still opens, closes, and updates the current prefix on mobile.
- [ ] Object details remain reachable from a row/card action and show the selected object metadata.
- [ ] Filter and search entrypoints remain usable from constrained mobile controls.
- [ ] Global Search still supports query entry, result inspection, and navigation into the matching prefix.
- [ ] Copying or reusing the current bucket/prefix path remains reachable from mobile controls.
- [ ] Mobile drawer/sheet interactions preserve safe-area padding and do not hide the next required action.

## `Objects` Flow Checklist

- [ ] Browse folders from the tree drawer and confirm navigation updates correctly.
- [ ] Select an object and confirm the details drawer shows the correct metadata.
- [ ] Toggle between list and grid view on mobile if the flow depends on a different presentation.
- [ ] Apply filters from the compact/mobile controls and confirm the list updates.
- [ ] Open Global Search and run a query with results.
- [ ] Open a result from Global Search and verify navigation into the correct prefix.
- [ ] Open object details from Global Search results.
- [ ] Copy location/path from the mobile controls.

## Playwright Coverage Checklist

- [ ] Add a test for opening and closing the tree drawer on mobile.
- [ ] Add a test for opening and closing the details drawer on mobile.
- [ ] Add a test for mobile filter application and state persistence.
- [ ] Add a test for opening Global Search on mobile and navigating from a result.
- [ ] Add a test that verifies copy/path actions remain reachable from constrained controls.
- [ ] Add a tablet-width test only when it proves drawer-based task completion, not width math.

## Notes

- Prioritize `Objects` over other pages for mobile regression coverage because it has the highest layout complexity in the frontend.
- If additional regressions are found, record the exact viewport, affected component, and the blocked user task.
- Use [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md) for suite-level execution commands and CI check names.
