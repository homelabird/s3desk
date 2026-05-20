# Frontend Design Report: Objects - 2026-05-17

Status note: this report is retained as the original 2026-05-17 design pass. It was superseded on 2026-05-18 for object card accessibility semantics: object cards now use `list` / `listitem` / `group` semantics instead of ARIA `grid` / `row` / `gridcell`, because the card layout does not implement the full ARIA grid keyboard contract.

## Scope

- `frontend/src/pages/ObjectsPage*.tsx`
- `frontend/src/pages/objects/**`
- Objects search, grid, details, preview, and toolbar surfaces

## Findings

### New Features

- None.

### Improvements

- Prevent global search results from forcing horizontal scrolling on tablet-width drawers.
- Increase mobile/touch hit areas for key icon-only grid, details, search, and filter actions.
- Wrap long details metadata values such as object keys, ETags, and metadata values.
- Wrap long Content-Type values in details and large-preview metadata badges.
- Add a regression check for tablet/narrow overflow where feasible.
- Add a 320x568 mobile regression check for the large image preview viewer.
- Keep global search and filter drawer controls, including checkbox rows, at stable mobile touch heights down to 320px.
- Use `list`/`listitem`/`group` semantics for object card view while keeping nested action buttons valid.
- Render object grid load-more and loading footers outside any invalid ARIA grid structure.
- Keep mobile object toolbar and overlay close controls at stable 44px touch targets.
- Wrap long local-device modal source and destination paths.

### Security

- None.

### Bug Fixes

- Reduce narrow drawer overflow risk from long object metadata and search result tables.
- Prevent 480px-and-smaller search/filter controls from collapsing below touch-friendly heights.
- Avoid invalid presentational children directly inside the object grid.
- Prevent long local upload/download paths from overflowing modal rows.

### Chores

- Keep object card behavior stable while clarifying grid semantics.

### Release Candidate Notes

- This report is a design/UX implementation note, not release metadata.

### Known Limitations

- No blocking Objects design issue remains in the tested scope.

### Full Changelog

- Switched global search results to compact cards below the large breakpoint to avoid tablet drawer overflow.
- Added a tablet-width overflow regression check for global search results.
- Increased touch/mobile target sizing for object grid/list/details/search/filter actions.
- Added wrapping classes for long object keys, ETags, metadata labels, and metadata values.
- Added wrapping to Content-Type values in details and large-preview metadata badges.
- Changed object/prefix cards from nested `role="button"` containers to named card groups while keeping row selection and keyboard behavior.
- Added a 320x568 image preview stress test that checks modal, preview stage, and footer fit without horizontal overflow.
- Added mobile assertions for global-search card actions, filter drawer checkbox rows, and filter drawer controls at compact widths.
- Replaced the earlier grid-semantics recommendation with list/card semantics and prevented bubbled Enter/Space events from child action controls activating the card.
- Changed load-more and loading footers so they do not depend on grid row/cell structures.
- Added mobile touch-target sizing for object toolbar buttons and the local overlay close action.
- Added wrapping for local-device modal source and destination path code values.
- Verified through `npm run typecheck`, `npm run lint`, `npm run test:unit`, and targeted Objects unit tests.
