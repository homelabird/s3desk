# Frontend Design Report: Common Shell/UI - 2026-05-17

## Scope

- `frontend/src/FullAppShellChrome.tsx`
- `frontend/src/FullAppInner.module.css`
- `frontend/index.html`
- `frontend/src/LightApp.tsx`
- `frontend/src/LightApp.module.css`
- `frontend/src/components/AppTabs.tsx`
- `frontend/src/components/appTabs.module.css`
- `frontend/src/components/DialogModal.tsx`
- `frontend/src/components/OverlaySheet.tsx`
- `frontend/src/components/OverlaySheet.module.css`
- `frontend/src/components/DialogModal.module.css`
- `frontend/src/index.css`

## Findings

### New Features

- None.

### Improvements

- Add a skip link in the authenticated full app shell so keyboard users can jump directly to `#main`.
- Add `aria-current="page"` to the active primary navigation link.
- Make the brand lockup navigate to the primary workspace instead of forcing a full-page reload.
- Increase editable tab close-button hit areas on touch/mobile screens.
- Add reduced-motion handling for global transitions and animations.
- Harden shared overlay headers against long titles and dense action groups on narrow screens.
- Harden shared dialog titles and subtitles against very long object/bucket names.
- Reduce shared `PageHeader`/`PageSection` decoration so dense app surfaces read more like workspace UI.
- Move skip-link ownership into each rendered app shell state so the target is always present and focusable.
- Use toolbar semantics for editable/action tab strips that do not render tab panels.
- Add a shared busy-close guard for modal dialogs and overlay sheets.
- Account for device safe-area insets in shared side sheets.
- Remove negative letter spacing and viewport-scaled CSS font sizes from shared app surfaces.
- Let shared `PageSection` headers wrap so narrow action groups move below the copy instead of squeezing it.

### Security

- None.

### Bug Fixes

- Prevent long overlay titles from pushing close/actions out of view on narrow screens.
- Avoid unnecessary shell reloads from brand clicks.
- Remove the global skip link that could point at a missing or duplicate `#main` target.
- Make LightApp skip links first in focus order and land on a focusable `#main` target.
- Prevent editable/action tab strips from exposing invalid tablist semantics.
- Prevent Escape, backdrop, and close-button dismissal while shared dialogs are explicitly busy.
- Prevent shared `PageSection` actions from clipping or compressing titles on narrow screens.

### Chores

- Keep common shell changes scoped to shared layout/accessibility files.

### Release Candidate Notes

- This report is a design/UX implementation note, not release metadata.

### Known Limitations

- No blocking common shell/UI design issue remains in the tested scope.

### Full Changelog

- Added authenticated-shell skip link styling and rendering.
- Added `aria-current="page"` to the active primary navigation link.
- Replaced brand reload buttons with router links to `/objects` when a profile is active and `/profiles` otherwise.
- Expanded editable tab close-button mobile/touch target sizing.
- Added global reduced-motion handling.
- Hardened overlay headers against long titles and wrapped action groups.
- Hardened shared dialog titles/subtitles so long dynamic names wrap instead of pushing the close button or overflowing.
- Added `closeDisabled` support to shared dialog modals and overlay sheets so busy flows no longer expose an active close action.
- Reduced shared `PageHeader`/`PageSection` radius, padding, and shadow-heavy treatment.
- Removed the global skip link and added shell-local skip links for loading, auth, error, and authenticated states.
- Added focusable LightApp `#main` targets and kept the authenticated setup skip link before shell actions.
- Changed action/editable tab strips to `toolbar` plus `aria-pressed` semantics, while preserving real tab semantics only for mounted tab panels.
- Added safe-area inset padding to shared side sheets.
- Removed negative letter spacing and viewport-scaled font sizes from shared CSS surfaces.
- Added wrapping to shared `PageSection` headers so full-width mobile actions can stack below the title/description.
- Verified through `npm run typecheck`, `npm run lint`, `npm run test:unit`, and targeted common component unit tests.
