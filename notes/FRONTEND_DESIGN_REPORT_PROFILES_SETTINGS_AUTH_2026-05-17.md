# Frontend Design Report: Profiles, Settings, Auth - 2026-05-17

## Scope

- `frontend/src/pages/ProfilesPage.module.css`
- `frontend/src/pages/profiles/**`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/pages/SettingsPage.module.css`
- `frontend/src/pages/settings/**`
- `frontend/src/components/SettingsDrawer.tsx`
- `frontend/src/LightApp.tsx`
- `frontend/src/LightApp.module.css`
- `frontend/src/pages/LoginPage.tsx`

## Findings

### New Features

- None.

### Improvements

- Improve wrapping for long profile IDs, endpoints, regions, and setup profile metadata.
- Make the settings drawer use more of very narrow mobile screens.
- Add accessible names to settings number/select controls, especially advanced transfer/object/network fields.
- Replace empty settings lazy-load fallbacks with a lightweight loading status.
- Connect login/token validation errors to the token inputs with `aria-invalid` and `aria-describedby`.
- Remove redundant Profile modal `aria-label` attributes where visible `FormField` labels already provide the accessible name.
- Add visible/programmatic labels and error linkage to profile YAML import/export textareas.
- Expose profile row action buttons as menu triggers with expanded state.
- Keep profile onboarding action buttons and links at mobile-friendly touch sizes.
- Stack LightApp shell actions above the setup/login/error content on mobile to avoid horizontal squeeze.

### Security

- Keep API token validation aligned with HTTP header value constraints before storing/applying tokens.

### Bug Fixes

- Prevent narrow-screen horizontal overflow caused by long profile/setup strings.
- Remove unlabeled YAML textareas from profile import/export flows.
- Prevent compact profile onboarding actions from shrinking below usable mobile hit areas.
- Prevent mobile LightApp setup, loading, login, and error states from keeping a horizontal shell layout.

### Chores

- Prefer existing `FormField`, `NumberField`, and local settings section patterns.

### Release Candidate Notes

- This report is a design/UX implementation note, not release metadata.

### Known Limitations

- No blocking Profiles/Settings/Auth design issue remains in the tested scope.

### Full Changelog

- Added overflow wrapping for compact profile cards and setup profile metadata.
- Widened the settings drawer on very narrow mobile screens.
- Added accessible names to settings controls in access, network, objects, and transfers sections.
- Replaced empty settings lazy fallbacks with a lightweight loading status.
- Connected login/token validation errors to token inputs with `aria-invalid` and `aria-describedby`.
- Applied HTTP header value validation to the Light setup token flow.
- Connected core Profile modal labels and validation messages to their inputs through `htmlFor`, `id`, `aria-invalid`, and `aria-describedby`.
- Removed redundant Profile modal field `aria-label` attributes while preserving label-based access.
- Added visible labels and error linkage for profile YAML import/export textareas.
- Added menu trigger semantics to profile row action buttons.
- Increased profile onboarding action, link, and dismiss controls to mobile-friendly touch heights.
- Changed mobile LightApp center shell layout to a stacked, full-width column so top-right actions do not squeeze the main panel.
- Verified through `npm run typecheck`, `npm run lint`, `npm run test:unit`, and targeted profile/auth/settings unit tests.
