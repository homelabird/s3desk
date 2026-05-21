# Frontend Feature Friction Audit Round 3 - 2026-05-22

## Scope

This report continues the frontend friction cleanup after Round 1 and Round 2. Those two rounds removed broad navigation/menu overload and simplified the first upload, profile, settings, and activity paths. This round completes the remaining 3rd, 4th, and 5th improvement cycles from the same audit request.

## Method

- Re-read the Round 2 deferred candidates and the current Jobs/Profiles frontend code.
- Used Playwright mobile workflows to exercise the affected Activity and Profiles paths after each change.
- Compared the current UI against these design references:
  - GOV.UK Design Principles: start with user needs, do less, make complex services simple, and iterate.
  - NN/g usability heuristics: visibility of system status, match controls to user expectations, and keep rarely needed information out of primary views.
  - WCAG 2.2 target-size guidance: interactive controls need reliable touch targets.
  - Ant Design Button guidance: buttons trigger operations, and primary actions should remain limited to the main action in a section.

Sources:

- https://www.gov.uk/guidance/government-design-principles
- https://www.nngroup.com/articles/ten-usability-heuristics/
- https://w3c.github.io/wcag/understanding/target-size-minimum
- https://ant.design/components/button/

## Cycle 3 - Activity Active Filter

### Finding

The `Active` queue-health card looked clickable but applied the `all` status filter. This violated the user's mental model: a user clicking Active expects queued/running jobs, not the entire queue.

### Improvement

- Added a virtual `active` status filter.
- Kept the API request broad for `active`, then filtered the loaded table to `queued` and `running`.
- Added `Active (queued/running)` to the status select.
- Updated Playwright to click the Active health card and verify `statusFilter=active` persists and appears in the mobile filter sheet.

Files:

- `frontend/src/pages/jobs/useJobsFilters.ts`
- `frontend/src/pages/jobs/useJobsPageQueries.ts`
- `frontend/src/pages/jobs/useJobsPageTableState.ts`
- `frontend/src/pages/jobs/useJobsPageControllerState.tsx`
- `frontend/src/pages/jobs/JobsToolbar.tsx`
- `frontend/tests/jobs-mobile-responsive.spec.ts`

## Cycle 4 - Activity Diagnostic Filters

### Finding

`Type exact` and `Error code exact` were useful for incident investigation, but they competed with common status/search tasks in the default desktop toolbar. This made the Activity page feel like a diagnostic console before the user had asked for diagnostics.

### Improvement

- Kept Search and Status visible as the common controls.
- Moved exact type/error-code filters into a `Diagnostics` popover on desktop.
- Preserved the existing mobile filters sheet, because those controls were already behind a deliberate `Filters` action on small screens.

Files:

- `frontend/src/pages/jobs/JobsToolbar.tsx`
- `frontend/src/pages/jobs/JobsToolbar.module.css`
- `frontend/src/pages/jobs/__tests__/JobsToolbar.test.tsx`

## Cycle 5 - Profiles Onboarding

### Finding

The Profiles onboarding card mixed first-run user tasks with backend/rclone/API-token diagnostics at the same level. For a normal user, this made "create and select a profile" feel like a systems checklist.

### Improvement

- Reduced the visible checklist to the actual setup path:
  - Create a storage profile.
  - Select the active profile.
- Moved backend, transfer engine, compatibility, and API-token checks into `System readiness`.
- Automatically opens `System readiness` only when a prerequisite needs attention.

Files:

- `frontend/src/pages/profiles/ProfilesOnboardingCard.tsx`
- `frontend/src/pages/ProfilesPage.module.css`
- `frontend/src/pages/profiles/__tests__/ProfilesOnboardingCard.test.tsx`

## Verification

Passed:

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:unit -- ...` for affected Jobs and Profiles units: 30 tests passed.
- `npm --prefix frontend run test:e2e -- tests/jobs-mobile-responsive.spec.ts tests/profiles-mobile-responsive.spec.ts --project=mobile-pixel-7`: 9 passed.
- `npm --prefix frontend run test:e2e:visual -- --project=chromium`: 18 passed.
- `npm --prefix frontend run test:e2e:smoke`: 2 passed after rerunning separately from the visual suite to avoid a shared dev-server port conflict.

## Remaining Deferred Candidates

These still look worth evaluating, but they need broader product decisions or a wider shell-level pass:

- Mobile global header still gives theme switching prominent placement compared with Settings.
- Mobile `Logout` remains immediately available from the global menu; confirmation or lower placement may reduce accidental session loss.
- Activity columns customization is still visible beside filters. It is useful for operations, but could move behind a layout-specific control if future testing shows clutter.
- Profiles row-level `Benchmark` and YAML actions remain secondary row operations. They are no longer primary setup actions, but may still warrant a grouped `Diagnostics & export` menu in a later pass.

## Outcome

Across the five total frontend friction cycles, the app now keeps common user paths more direct while retaining advanced functionality:

- Primary paths stay visible: create/select profile, open objects, upload, search/status-filter jobs.
- Advanced or diagnostic paths are still available, but no longer compete as first-level setup or monitoring tasks.
- Misleading click behavior on Activity `Active` now matches the visible label.
