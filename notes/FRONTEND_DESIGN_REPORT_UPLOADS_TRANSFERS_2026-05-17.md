# Frontend Design Report: Uploads and Transfers - 2026-05-17

## Scope

- `frontend/src/pages/UploadsPage.module.css`
- `frontend/src/pages/uploads/**`
- `frontend/src/components/UploadSourceSheet.*`
- `frontend/src/components/transfers/**`

## Findings

### New Features

- None.

### Improvements

- Make the four upload selection summary cards lay out evenly on desktop.
- Wrap long destination labels in the upload source sheet.
- Make upload source sheet actions stronger on mobile by using full-width buttons.
- Prevent long transfer job IDs from pushing row layouts.
- Render long transfer destinations as wrapping text instead of hover-only ellipses on touch screens.
- Hide destructive removal while an upload commit is finalizing and show an honest finalizing state.
- Keep transfer status text live while leaving frequently changing progress metrics out of live regions.
- Let transfer row titles and tags breathe on narrow screens, and keep action buttons at a stable mobile touch height.
- Prevent the global "Clear all" action from hiding or aborting uploads that are already finalizing commit.
- Wrap long Uploads page destination labels in the target source control.

### Security

- Preserve existing upload capability and provider gating.

### Bug Fixes

- Reduce overflow risk from long destinations and job IDs.
- Avoid presenting a remove action as if it could stop an already finalizing upload commit.
- Avoid over-announcing rapidly changing progress percentages to screen readers.
- Keep commit-stage uploads visible when clearing completed, failed, or abortable transfer rows.

### Chores

- Keep upload and transfer runtime behavior unchanged.

### Release Candidate Notes

- This report is a design/UX implementation note, not release metadata.

### Known Limitations

- No blocking Uploads/Transfers design issue remains in the tested scope.

### Full Changelog

- Adjusted upload summary cards to use balanced 4/2/1 responsive columns.
- Added destination label wrapping and stronger mobile full-width actions in the upload source sheet.
- Shortened long upload job IDs visually while retaining the full value through title/accessibility copy.
- Switched upload/download destination subtitles to wrapping text with full `title` values.
- Replaced active commit removal with a non-action finalizing status until the task reaches a removable state.
- Kept upload and download status tags live while removing live semantics from rapidly changing progress metrics.
- Disabled the upload source sheet close affordance while source selection is busy, avoiding an apparent close action that does nothing.
- Tuned mobile transfer row density by separating header title flow from tag wrapping and stabilizing action button height.
- Disabled the transfer drawer "Clear all" action when only commit-stage uploads remain and preserved commit uploads during clear-all handling.
- Added wrapping for the Uploads page destination label.
- Verified through `npm run typecheck`, `npm run lint`, `npm run test:unit`, and targeted upload/transfer unit tests.
