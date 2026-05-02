# `Profiles` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Profiles`
- Goal: verify that `Profiles` still supports real mobile task completion for active-profile switching, edit/import entrypoints, and compact-card actions.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`

## Manual QA Checklist

- [ ] Opening `Profiles` on a phone still exposes the active profile, compact-card actions, and onboarding/import entrypoints.
- [ ] Compact-card actions can still switch the active profile without ambiguity.
- [ ] Edit actions from a compact card still open with the correct profile prefilled.
- [ ] YAML import/export entrypoints remain reachable on mobile.
- [ ] Validation state, labels, and profile identifiers remain readable enough to choose the correct profile.
- [ ] Empty, loading, and populated states still preserve the primary actions.

## `Profiles` Flow Checklist

- [ ] Open the profiles list on a phone-sized viewport.
- [ ] Switch the active profile from a compact card and confirm the choice persists after reload.
- [ ] Open the edit flow from a compact card and verify the selected profile loads into the form.
- [ ] Open the YAML import or export entrypoint from mobile and confirm the dialog/sheet can be used.
- [ ] Confirm validation warnings still point to the right profile after switching cards.

## Playwright Coverage Checklist

- [ ] Add a mobile test that verifies active-profile switching from compact cards.
- [ ] Add a test that verifies the edit flow opens from a compact card with the correct profile.
- [ ] Add a test that verifies the YAML import/export entrypoint is still reachable on mobile.
- [ ] Add a test that verifies validation or label state remains readable after profile switching.

## Notes

- Keep `Profiles` coverage focused on mobile profile selection and edit/import actions. Layout-only checks are secondary unless they block those flows.
