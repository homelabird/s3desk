# `Login` Mobile Responsive Checklist

Suite-level mobile responsive commands and CI mapping live in [MOBILE_RESPONSIVE_E2E.md](./MOBILE_RESPONSIVE_E2E.md).
Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).

## Scope

- Page: `Login`
- Goal: verify that the login experience still supports real mobile task completion for authentication, stale-token recovery, and theme switching.

## Recommended Viewports

- `320x568`
- `360x800`
- `390x844`
- `430x932`

## Manual QA Checklist

- [ ] The login form still exposes the token input and submit action on a phone-sized viewport.
- [ ] A valid token can still complete the login flow on mobile.
- [ ] Stored-token warning or recovery states still expose the action needed to recover.
- [ ] Theme switching remains reachable before and after authentication failures.
- [ ] The page keeps the primary auth action visible during the common mobile flow.

## `Login` Flow Checklist

- [ ] Open the login screen in a narrow mobile viewport.
- [ ] Sign in with a valid token and confirm the app leaves the login screen.
- [ ] Simulate an invalid stored token state and confirm recovery controls remain visible and usable.
- [ ] Clear the invalid state and confirm a second login attempt can succeed.
- [ ] Toggle the theme and confirm the control remains reachable before or after recovery.

## Playwright Coverage Checklist

- [ ] Add a mobile test that verifies successful narrow-viewport login.
- [ ] Add a test that verifies invalid stored token recovery remains usable.
- [ ] Add a test that verifies theme switching remains reachable on mobile.

## Notes

- `Login` is a release-critical entry point, so auth completion and recovery matter more than cosmetic mobile polish.
