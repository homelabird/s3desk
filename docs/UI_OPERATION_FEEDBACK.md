# UI Operation Feedback Rules

This document defines how the frontend should present API operations that use an application-level `ok` flag.

## Scope

Apply these rules only when the backend returns a successful HTTP response and the JSON body contains an explicit `ok` field that represents business or provider outcome.

Do not apply these rules to:

- local browser capability checks such as clipboard or directory picker support
- local parsing and validation helpers that never call the backend
- regular API errors that already use non-2xx HTTP responses

## Decision Rules

1. HTTP `2xx` with `ok=true`
Use a success toast.

2. HTTP `2xx` with `ok=false`
Treat this as "operation reached the provider/backend logic, but the provider-specific result was unsuccessful".
Use a warning toast, not an error toast.

3. HTTP non-`2xx` or thrown `APIError`
Treat this as "operation unavailable" or "request could not complete".
Use an error toast.

## Message Construction

Use the shared helpers in [providerOperationFeedback.ts](../frontend/src/lib/providerOperationFeedback.ts):

- `formatProviderOperationFailureMessage(...)`
  Use for `2xx` + `ok=false` responses that may include `details.error`, `details.normalizedError`, or similar provider-level fields.

- `formatValidationOperationMessage(...)`
  Use for validation-style responses that return `ok`, plus `errors[]` and `warnings[]`.

- `formatUnavailableOperationMessage(...)`
  Use for thrown API errors, timeout errors, or other non-2xx failures where the operation could not run or could not finish.

## UI Rules

1. `ok=false` responses must use `message.warning(...)`.
2. API failures must use `message.error(...)`.
3. Success responses must use `message.success(...)`.
4. When `normalizedError.code` exists, include the troubleshooting hint in the warning toast.
5. When the response contains rich arrays such as `errors[]` or `warnings[]`, the toast should summarize counts and the first actionable item.
6. If the screen already has an inline alert, table, or panel for detailed diagnostics, keep the toast short and use the inline surface for the full list.
7. Do not collapse API failures into the same UX as `ok=false`. The user needs to distinguish "provider rejected it" from "the app could not run the operation".

## Testing Requirements

When a new API adds an `ok` field, add tests for all applicable paths:

1. `ok=true` success path
2. `2xx` + `ok=false` warning path
3. API error path such as `400`, `403`, timeout, or transfer-engine failure

If the new response shape introduces new formatting logic, add or update a unit test for the shared helper as well.

## Current Reference Implementations

- [ProfilesPage.tsx](../frontend/src/pages/ProfilesPage.tsx)
  `test` and `benchmark` use `ok=false` warnings and API-error "unavailable" messages.

- [BucketPolicyModal.tsx](../frontend/src/pages/buckets/BucketPolicyModal.tsx)
  provider validation uses `ok=false` warnings and API-error "validation unavailable" messages.

- [providerOperationFeedback.test.ts](../frontend/src/lib/__tests__/providerOperationFeedback.test.ts)
  shared formatting contract tests

- [ProfilesPage.smoke.test.tsx](../frontend/src/pages/__tests__/ProfilesPage.smoke.test.tsx)
  screen-level wiring for success, warning, and unavailable flows

- [BucketPolicyModal.test.tsx](../frontend/src/pages/buckets/__tests__/BucketPolicyModal.test.tsx)
  validation warning and unavailable flows
