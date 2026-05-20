# Frontend Design Report: Jobs - 2026-05-17

## Scope

- `frontend/src/pages/JobsPage.module.css`
- `frontend/src/pages/jobs/**`
- Jobs toolbar, filters, details drawer, logs drawer, upload details, and virtual table

## Findings

### New Features

- None.

### Improvements

- Align compact job filters with mobile-card breakpoints to avoid dense inline filters around 481-767px.
- Let details/log drawer header actions wrap or stack on small screens.
- Wrap long IDs, S3 paths, errors, payload values, and upload detail table content.
- Virtualize loaded log rows so large visible log sets do not require rendering every DOM row at once.
- Add current sort direction to virtual table sort button accessible labels.
- Connect Jobs create/download/delete modal text inputs and textareas to visible labels.
- Add mobile Playwright coverage for job details and logs drawers.
- Remove viewport-scaled queue-health font sizing so compact Jobs toolbar text stays stable.

### Security

- Preserve destructive job action confirmations.

### Bug Fixes

- Reduce narrow drawer horizontal overflow risk.
- Remove visual-only labels from Jobs create/download/delete overlay fields.
- Avoid viewport-dependent text resizing in the Jobs toolbar.

### Chores

- Keep log data flow unchanged while rendering the drawer through a virtual window.

### Release Candidate Notes

- This report is a design/UX implementation note, not release metadata.

### Known Limitations

- No blocking Jobs design issue remains in the tested scope.

### Full Changelog

- Extended compact job filter behavior through the mobile-card breakpoint.
- Added wrapping/stacking behavior for details and logs drawer header actions.
- Added long-value wrapping for details drawer IDs, S3 paths, errors, payloads, and upload detail table content.
- Added horizontal overflow protection for upload details tables.
- Replaced bounded latest-window log rendering with virtualized rendering for all loaded visible log rows.
- Added current sort-state accessible labels to virtual table sort buttons.
- Added `id`/`htmlFor` label connections for upload/download prefixes, local destination folder, delete confirmation, and include/exclude pattern fields.
- Added mobile Playwright coverage for job details and logs drawers, including horizontal overflow checks.
- Removed viewport-scaled queue-health font sizing from the Jobs toolbar.
- Verified through `npm run typecheck`, `npm run lint`, `npm run test:unit`, and targeted Jobs unit tests.
