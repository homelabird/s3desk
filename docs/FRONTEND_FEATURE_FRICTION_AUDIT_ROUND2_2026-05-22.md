# Frontend Feature Friction Audit Round 2 - 2026-05-22

## Scope

This is the second 5-step frontend friction pass after the first cleanup commit. The review focused on whether useful but low-frequency features still compete with the primary task path in Profiles, Uploads, Activity, and Settings.

## Method

- Static review of the current React surface after the first pass.
- Four role-scoped sub-agent reviews:
  - shell / global header
  - uploads flow
  - jobs / activity flow
  - profiles / settings / onboarding
- Playwright validation on affected mobile workflows and visual regression snapshots.
- Best-practice comparison against:
  - GOV.UK Design Principles: user needs, doing less, simplifying complex services, and iteration.
  - NN/g heuristics: minimalist UI, plain language, and avoiding rarely needed information in primary views.
  - WCAG 2.2 target-size guidance: mobile controls should remain comfortably tappable.
  - Ant Design button conventions: one clear primary action per task area, with secondary actions visually demoted.

Sources:

- https://www.gov.uk/guidance/government-design-principles
- https://www.nngroup.com/articles/ten-usability-heuristics/
- https://www.w3.org/WAI/WCAG22/quickref/?versions=2.2&showtechniques=255%2C258#target-size-minimum
- https://ant.design/components/button/

## Cycle Results

### Cycle 1 - Baseline Recheck

The first pass had already removed major menu overload from Objects, Buckets, Profiles row actions, transfer tuning, and backup/restore. Remaining friction was concentrated in places where advanced or secondary actions still appeared before the user's next likely action.

### Cycle 2 - Expert Findings

1. Activity used `More` as the entry to job creation, while upload is a common primary action.
2. Uploads allowed source selection before a destination bucket was selected.
3. Uploads showed `0 item(s)`, `0 B`, and `Not selected` summary cards before the user selected anything.
4. Profiles exposed `Import YAML` beside and before `New Profile`, making the migration path look like a default setup path.
5. Settings exposed `Selected Profile` with a `Clear` button even though profile switching already belongs to the header selector and Profiles page.
6. Playwright found Activity header buttons at 40px height on mobile, below the project's 44px touch-target expectation.

### Cycle 3 - Implemented Improvements

| Area | Change | Files |
| --- | --- | --- |
| Activity | Promoted `Upload` to a primary header action and renamed the overflow to `New job` for download/delete job creation. | `frontend/src/pages/jobs/JobsToolbar.tsx` |
| Activity mobile | Added 44px minimum touch height to Activity header buttons on mobile. | `frontend/src/pages/jobs/JobsToolbar.module.css` |
| Uploads | Added `canOpenPicker`; source picker now stays disabled until a bucket is selected and the hook also guards direct calls. | `frontend/src/pages/uploads/useUploadsPageSelectionActions.ts`, `frontend/src/pages/uploads/UploadsSelectionSection.tsx` |
| Uploads | Hid empty summary cards until files are selected, keeping the empty state focused on the next action. | `frontend/src/pages/uploads/UploadsSelectionSection.tsx` |
| Profiles | Changed header order to `New Profile` first and renamed `Import YAML` to `Import profile`. | `frontend/src/pages/profiles/ProfilesPageShell.tsx` |
| Settings | Removed profile-clearing from the default Access settings panel; it is now read-only context with guidance to use the header selector or Profiles page. | `frontend/src/pages/settings/AccessSettingsSection.tsx` |

### Cycle 4 - Playwright Findings During Verification

Playwright caught two useful regressions during the first verification run:

- Activity header buttons were still 40px high on mobile after promoting `Upload`.
- Uploads mobile tests still asserted the destination URL inside the old summary-card DOM.

Both were corrected and the affected Playwright suites were rerun.

### Cycle 5 - Remaining Deferred Candidates

These were identified but intentionally not changed in this cycle because they need broader product decisions:

- `Active` in Activity queue health currently behaves like `all`; this should become a real active filter or a non-clickable summary.
- Activity diagnostic filters (`Type exact`, `Error code exact`) could move behind an advanced diagnostics disclosure.
- Profiles onboarding still mixes setup steps with environment diagnostics such as backend, rclone, and API token status.
- Mobile global header still gives theme switching a higher position than Settings.
- Mobile `Logout` is still immediate from the global menu; a confirmation or lower-priority placement may reduce accidental session loss.

## Verification

Passed:

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:unit -- ...` for affected Uploads, Jobs, Profiles, and Settings units: 35 tests passed.
- `npm --prefix frontend run test:e2e -- tests/jobs-mobile-responsive.spec.ts tests/uploads-mobile-responsive.spec.ts tests/profiles-mobile-responsive.spec.ts tests/settings-mobile-responsive.spec.ts --project=mobile-pixel-7`: 16 passed.
- `npm --prefix frontend run test:e2e:visual -- --project=chromium`: 18 passed.
- `npm --prefix frontend run test:e2e:smoke`: 2 passed.

## Outcome

The second pass reduces feature friction by aligning visible controls with immediate user intent:

- Create new profile before import.
- Choose upload destination before source selection.
- Show upload summary after there is something to summarize.
- Make Activity upload direct and keep other job types secondary.
- Keep profile-clearing out of the default settings path.
