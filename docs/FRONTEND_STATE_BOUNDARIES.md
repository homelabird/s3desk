# Frontend State Boundaries

This note explains where frontend state should live after the provider split.

## `AuthProvider`

- Owns the current API token.
- Persists the token with `useSessionStorageState`.
- Exposes `apiToken`, `setApiToken`, and `clearApiToken`.
- Does not construct API clients.
- Does not choose routes or profiles.

Use `AuthProvider` for state that is scoped to the current authenticated browser session.

## `APIClientProvider`

- Derives a fresh `APIClient` from the current `apiToken`.
- Recreates the client when the token changes.
- Does not persist auth state.
- Does not own route or profile state.

Use `APIClientProvider` when code needs an authenticated transport, not when it needs to decide whether the user is logged in.

## `RequireAuth`

- Converts `401` API failures into the login gate.
- Remounts the login surface when the token changes.
- Should stay a thin rendering boundary.

Do not move API client creation or session persistence into this layer.

## `ProfileGate`

- Redirects users without an active profile to `/setup`.
- Allows `/profiles` to render without a selected profile.
- Should stay route-focused.

Do not add token persistence or API bootstrap logic here.

## Page-level guidance

- Keep pages focused on route orchestration and rendering.
- Put session-scoped state in `AuthProvider`.
- Put transport construction in `APIClientProvider`.
- Put auth error rendering in `RequireAuth`.
- Put profile-selection redirects in `ProfileGate`.
- Put page-specific query and mutation orchestration in page-local hooks.

## Practical rule

When adding new state, ask which scope it belongs to first.

- Browser session scope: `AuthProvider`
- Authenticated transport scope: `APIClientProvider`
- Route guard scope: `RequireAuth` or `ProfileGate`
- Single page scope: page hook next to that page
