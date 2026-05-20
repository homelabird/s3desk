# Frontend Design Report: Buckets - 2026-05-17

## Scope

- `frontend/src/pages/BucketsPage.module.css`
- `frontend/src/pages/buckets/**`
- Bucket create, policy, and governance modals

## Findings

### New Features

- None.

### Improvements

- Stack/wrap governance modal section headers, editor headers, and toggle rows on narrow screens.
- Keep mobile governance primary buttons above WCAG AA text contrast in light and dark themes.
- Add an accessible name to the primary editable raw policy JSON textarea.
- Add accessible labels to policy preview and diff read-only text areas.
- Add an accessible label to destructive bucket confirmation inputs.
- Add list semantics to mobile bucket cards.
- Reduce nested governance card visual density on mobile where possible.
- Disable Escape, backdrop, and close-button dismissal while create, policy, governance, or destructive confirmation work is submitting.

### Security

- Preserve existing policy/governance mutation behavior.

### Bug Fixes

- Prevent governance header actions from compressing descriptions on mobile.
- Prevent very long bucket names from overflowing shared dialog titles.
- Prevent busy bucket dialogs from looking dismissible or closing midway through a mutation.

### Chores

- Keep bucket workflow selectors stable for existing Playwright tests.

### Release Candidate Notes

- This report is a design/UX implementation note, not release metadata.

### Known Limitations

- No blocking Buckets design issue remains in the tested scope. Long bucket names are covered by the shared overlay wrapping fix.

### Full Changelog

- Stacked governance section/editor/toggle rows on narrow screens.
- Adjusted mobile governance primary button styling to pass light/dark axe contrast checks.
- Reduced mobile nested governance card visual density.
- Added a visible/programmatic label to the editable raw policy JSON textarea.
- Added accessible names to policy preview and diff text areas.
- Added a programmatic label to destructive bucket confirmation inputs.
- Added semantic list/listitem roles to compact bucket cards while preserving existing selectors.
- Wired create, policy, governance, and destructive confirmation dialogs into the shared busy-close guard.
- Verified through `npm run typecheck`, `npm run lint`, `npm run test:unit`, and targeted bucket unit tests.
