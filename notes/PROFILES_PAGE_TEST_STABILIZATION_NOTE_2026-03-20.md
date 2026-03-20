# ProfilesPage test stabilization note

## Summary

- The `act(...)` warning in [ProfilesPage.smoke.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/__tests__/ProfilesPage.smoke.test.tsx) was not caused by the onboarding callout UI.
- The actual trigger was `antd` message cleanup from `message.destroy()` during `afterEach`.

## Root cause

- `ProfilesPage` tests use `antd` global message APIs for success, warning, and error feedback.
- The test cleanup previously called `message.destroy()` outside `act(...)`.
- That cleanup path schedules React updates inside `antd`, which produced `not wrapped in act(...)` warnings.

## Fix

- Keep the test cleanup in [ProfilesPage.smoke.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/__tests__/ProfilesPage.smoke.test.tsx).
- Wrap `message.destroy()` in `await act(async () => { ... })`.
- Leave [setup.ts](/home/homelab/Downloads/project/s3desk/frontend/src/test/setup.ts) with the normal console guard only. The temporary trace-only logic was removed after confirming the cause.

## Notes

- Temporary tracing showed the warning path converging on `antd/lib/message/index.js`.
- The onboarding `Alert`, dismiss button, and modal lazy-loading path were not the root cause.
