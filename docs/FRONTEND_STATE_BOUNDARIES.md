# Frontend State Boundaries

This note explains where frontend state should live after the provider split and
route-shell refactors.

## Runtime Stack

`frontend/src/main.tsx` composes the app in this order:

- `A11yLiveRegions`
- `ThemeModeProvider`
- `AuthProvider`
- `APIClientProvider`
- `BrowserRouter`
- `App`

Keep each layer narrow. Do not let route guards persist auth state, and do not
let providers absorb page-local orchestration.

## `AuthProvider`

- Owns the current API token.
- Persists the token with `useSessionStorageState`.
- Exposes `apiToken`, `setApiToken`, and `clearApiToken`.
- Does not construct API clients.
- Does not choose routes, profiles, or page tabs.

Use `AuthProvider` for state scoped to the current authenticated browser
session.

## `APIClientProvider`

- Derives a fresh `APIClient` from the current `apiToken`.
- Recreates the client when the token changes.
- Does not persist auth state.
- Does not own route, profile, or page view state.

Use `APIClientProvider` when code needs authenticated transport, not when it
needs to decide whether the user is logged in.

## Route Guards

### `RequireAuth`

- Converts `401` API failures into the login gate.
- Remounts the login surface when the token changes.
- Stays a thin rendering boundary.

Do not move API client creation or session persistence into this layer.

### `ProfileGate`

- Redirects users without an active profile to `/profiles`.
- Allows `/profiles` to render without a selected profile.
- Stays route-focused.

Do not add token persistence, API bootstrap, or page mutation logic here.

## `FullApp` Boundary

`frontend/src/FullAppInner.tsx` is the top-level authenticated app composition
point.

- It reads router location, theme, viewport, auth state, and API client.
- It delegates orchestration to `useFullAppController`.
- It renders thin boundaries: `FullAppBootstrapGate`, `TransfersProvider`,
  `FullAppShellChrome`, `FullAppContentHost`, and `FullAppOverlaysHost`.

`frontend/src/useFullAppController.ts` is the place where cross-route shell
state is assembled.

- `useFullAppProfileState` owns profile-query and profile-gate wiring.
- `useFullAppShellState` owns nav/settings/guide open-close state.
- `useFullAppShellViewModel` translates shell state into render-ready props.
- The controller returns bounded slices: `bootstrap`, `transfers`, `chrome`,
  `overlays`, and `routes`.

Do not create API clients, persist tokens, or hide page-local queries inside
`FullApp` shell components.

## Page Layering

For page surfaces like `Buckets`, `Jobs`, `Profiles`, and `Uploads`, prefer this
split:

1. Route entry component
   `BucketsPage.tsx`, `JobsPage.tsx`, `ProfilesPage.tsx`, `UploadsPage.tsx`
   should stay thin and delegate immediately.
2. Route shell / gate
   `*PageRouteShell.tsx` decides setup-callout or no-profile rendering versus
   the real page shell.
3. Environment adapter
   `use*PageState` reads provider or browser environment such as
   `useAPIClient`, `useTransfers`, `useIsOffline`, media queries, or theme.
4. Controller
   `use*PageControllerState` owns page query, mutation, realtime, and
   orchestration wiring.
5. Narrow sub-hooks
   `useBucketsPageQueriesState`, `useBucketsPageCreateState`,
   `useBucketsPageScopeState`, `useJobsPageTableState`,
   `useUploadsPageSelectionActions` and similar hooks should own one concern
   each.
6. Composition / builders
   `use*PageCompositionState` and `build*PresentationProps` turn controller
   output into render-ready shell props.
7. Presentational shell
   `*PageShell.tsx` renders props and should not reach back into providers.

## Upload drafts across routes

`FullAppRoutes` hosts `UploadsDraftProvider` so selected device files, folder labels,
and directory-selection mode survive navigation away from Uploads. Its scope key
clears only this draft when the authenticated/profile scope changes; other routes
retain their own component lifecycle. Queueing or Clear selection releases the
draft. Files stay in memory and are not restored after a browser reload.

Destination storage and temporary picker state remain in
`useUploadsPageScopedStorageState`. Jobs navigation from a transfer is resolved by
`FullAppRoutes`, which selects the transfer's profile and passes the requested job
to the existing Jobs details state.

## Bucket name search

`useBucketScopedViewState` owns the Buckets name query and clears it on authentication
or profile changes. `BucketsList` filters the already-loaded inventory for display
before applying the existing virtualizer. It does not change the bucket query cache.

## Placement Rules

When adding new state, ask which scope it belongs to first.

- Browser session scope: `AuthProvider`
- Authenticated transport scope: `APIClientProvider`
- Route guard scope: `RequireAuth` or `ProfileGate`
- Cross-route shell scope: `useFullAppController` and its shell/profile
  sub-hooks
- Single-page orchestration scope: `use*PageControllerState`
- Single concern within a page: narrow page sub-hook next to that page
- Pure rendering / prop formatting: shell component or presentation builder

## Anti-Patterns

Avoid these:

- putting `selectedProfile`, nav drawer state, or page filters into providers
- constructing `APIClient` inside page hooks or shell components
- letting `*PageShell.tsx` call `useAPIClient`, `useAuth`, or `useTransfers`
- mixing setup-callout routing and heavy query orchestration in the same
  component
- passing raw React Query objects deep into presentational shells when a smaller
  view model is enough

## Practical Rule

If the state must survive a token change, it probably does not belong in
`AuthProvider`.

If the state is only meaningful for one page, it probably belongs in that
page's controller or one of its narrower sub-hooks.
