---
name: s3desk-frontend
description: Implement, diagnose, or validate S3Desk React UI, state, accessibility, responsive layouts, generated API clients, unit tests, or Playwright flows. Skip for backend-only and release-metadata-only work.
---

# S3Desk Frontend

Trace the route, controller, shell, and owning tests before editing. Reuse Ant Design, React Query, page hooks, and shared test helpers.

Keep state with its owner: session auth in `AuthProvider`, authenticated transport in `APIClientProvider`, cross-route state in the `FullApp` controller, and page state beside its page. Presentational shells should not access providers or orchestrate raw queries.

Preserve keyboard and focus behavior, labels, reduced-width reflow, and loading/error/empty states. Update screenshots only for an intentional visual change and inspect the rendered result.

For API changes, edit `openapi.yml` and regenerate/check the client; do not edit `src/api/openapi.ts` directly:

```bash
cd frontend && npm run gen:openapi && npm run check:openapi
```

Run the focused unit test first (`npm run test:unit -- <test-file>`), then only the needed check. Use `npm run lint`, `npm run typecheck`, or `npm run build` for the affected static/build surface. Browser lanes:

- `npm run test:e2e:smoke` for smoke; `npm run test:e2e:core` for core flows.
- `npm run test:e2e:mobile-responsive` for mobile reflow.
- `npm run test:e2e:visual` for intentional visual changes.
- `npm run bundle:budget` when bundle shape may change.

See `docs/FRONTEND_STATE_BOUNDARIES.md`, `frontend/docs/MOBILE_RESPONSIVE_E2E.md`, and `docs/TESTING.md` for ownership and lane scope. WebView work also uses `docs/WEBVIEW_COMPATIBILITY.md` and `docs/WEBVIEW_QA_TEST_CASES.md`. Mock browser results do not prove real-device, assistive-technology, provider, or deployed behavior.
