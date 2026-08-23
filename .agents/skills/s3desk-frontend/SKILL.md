---
name: s3desk-frontend
description: Implement, diagnose, review, or validate S3Desk React UI, frontend state, accessibility, responsive layouts, generated API clients, unit tests, and Playwright flows. Do not use for backend-only or release-metadata-only work.
---

# S3Desk Frontend

Use the current code and these maintained references:

- `docs/FRONTEND_STATE_BOUNDARIES.md` for provider, shell, controller, and page ownership.
- `docs/TESTING.md` for unit, build, bundle, and browser lane meanings.
- `frontend/docs/MOBILE_RESPONSIVE_E2E.md` for mobile assertions and required checks.
- `docs/WEBVIEW_COMPATIBILITY.md` and `docs/WEBVIEW_QA_TEST_CASES.md` for embedded-webview work.

## Work

1. Trace the route, controller, shell, and test fixtures that own the behavior.
2. Reuse Ant Design, React Query, existing page hooks, and shared test helpers before adding code.
3. Keep session auth in `AuthProvider`, authenticated transport in `APIClientProvider`, cross-route state in the `FullApp` controller, and page-local state beside its page.
4. Keep presentational shells free of provider access and raw query orchestration.
5. Preserve keyboard access, focus handling, labels, reduced-width reflow, and loading/error/empty states.
6. Update screenshots only when the intended visual contract changed, and inspect the rendered result before accepting them.

For API changes, edit `openapi.yml` and regenerate the client:

```bash
cd frontend
npm run gen:openapi
npm run check:openapi
```

Do not edit `src/api/openapi.ts` directly.

## Validate

Run one focused unit test first, then the smallest relevant static or browser lane:

```bash
cd frontend
npm run test:unit -- <test-file>
npm run lint
npm run build
```

Choose browser evidence by contract:

- smoke: `npm run test:e2e:smoke`
- core flows: `npm run test:e2e:core`
- mobile/reflow: `npm run test:e2e:mobile-responsive`
- intentional visuals: `npm run test:e2e:visual`
- bundle impact: `npm run bundle:budget`

Mock Chromium proves the local browser contract only. Keep real-device, assistive-technology, live-provider, and deployed reverse-proxy claims separate.
