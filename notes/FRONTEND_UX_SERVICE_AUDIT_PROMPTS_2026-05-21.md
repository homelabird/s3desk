# Frontend UX Service Audit and Execution Prompts - 2026-05-21

## Purpose

This audit translates the current frontend UX/design gaps into implementation-ready prompts. It is not a release-note draft. It is intended to be handed to coding agents or engineers as scoped improvement work.

The earlier 2026-05-17 frontend design reports fixed many baseline issues around labels, touch targets, overflow, mobile drawers, and keyboard semantics. This document focuses on the remaining higher-level UX problems visible in the current repo: service information architecture, operational feedback, recovery paths, visual consistency, and workflows that still feel too implementation-driven.

## Audit Basis

- Static review of `frontend/src` service pages and shared components.
- Cross-check against:
  - `notes/FRONTEND_DESIGN_REPORT_COMMON_2026-05-17.md`
  - `notes/FRONTEND_DESIGN_REPORT_OBJECTS_2026-05-17.md`
  - `notes/FRONTEND_DESIGN_REPORT_BUCKETS_2026-05-17.md`
  - `notes/FRONTEND_DESIGN_REPORT_JOBS_2026-05-17.md`
  - `notes/FRONTEND_DESIGN_REPORT_UPLOADS_TRANSFERS_2026-05-17.md`
  - `notes/FRONTEND_DESIGN_REPORT_PROFILES_SETTINGS_AUTH_2026-05-17.md`
  - `notes/FRONTEND_UX_BACKLOG.md`
- Code evidence from current files, including:
  - `frontend/src/pages/objects/ObjectThumbnail.tsx`
  - `frontend/src/pages/objects/ObjectsDetailsMediaSections.tsx`
  - `frontend/src/pages/SettingsPage.tsx`
  - `frontend/src/pages/profiles/ProfileModal.tsx`
  - `frontend/src/pages/profiles/ProfileModalSections.tsx`
  - `frontend/src/components/transfers/TransferUploadRow.tsx`
  - `frontend/src/pages/buckets/BucketPolicyModal.tsx`
  - `frontend/src/pages/jobs/JobsToolbar.tsx`
  - `frontend/src/pages/LoginPage.tsx`
  - `frontend/src/LightApp.tsx`
  - service CSS modules under `frontend/src/pages/**`

## Execution Progress

- 2026-05-21: Prompt 2 completed. Objects thumbnails, details preview, and large preview now share `objectsMediaState.ts` descriptors for loading, unavailable, blocked, unsupported, failed, ready, and fallback states.
- 2026-05-21: Prompt 3 completed. Settings now separates Access, Browsing, Transfers, Diagnostics, and Recovery workflows, adds `What this affects` copy, separates recovery actions, and requires explicit Apply/Cancel for transfer and retry numeric tuning.
- 2026-05-21: Prompt 4 completed. Profile create/edit now shows a compact provider setup checklist that separates required connectivity fields, optional management-plane setup, and private/self-signed endpoint settings for S3-compatible/AWS, Azure, GCS, and OCI.
- 2026-05-21: Prompt 5 completed. Upload rows now use `uploadRecoveryDescriptor.ts` to show current path, fallback reason, retry file-selection requirements, remembered-handle recovery, and server finalization guidance consistently.
- 2026-05-21: Prompt 6 completed. Bucket policy and governance modals now share provider-specific decision guidance for Controls versus Advanced policy/ACL editing, high-risk effect badges, a prominent provider-validation step, and a separated danger-zone footer for delete/reset actions.
- 2026-05-21: Prompt 7 completed. Jobs now separates Launch work, Queue health, Troubleshooting, and secondary Filters/layout controls; failed-job and realtime recovery actions sit beside their warnings, filtered-empty states offer reset/retry actions, and mobile failed cards have stronger visual treatment.
- 2026-05-21: Prompt 8 completed. LoginPage and LightApp now share `TokenLoginPanel` for token setup copy, header-value validation, saved-token recovery, error display, and quiet token-based card styling.
- 2026-05-21: Prompt 1 completed. Routine Uploads, Buckets, Profiles, Bucket policy/governance, Profile modal, and LightApp surfaces now use small shared radii, token backgrounds, and quieter non-decorative card treatment.

## Global Rules For All Improvement Prompts

- Keep this app feeling like an operational storage dashboard, not a marketing site.
- Prefer dense but readable layouts, predictable navigation, and clear state/recovery actions.
- Keep cards only for repeated items, modals, and genuinely framed tools. Avoid nested card stacks.
- Align new UI with existing primitives: `PageHeader`, `PageSection`, `OverlaySheet`, `DialogModal`, `FormField`, `NumberField`, `NativeSelect`, `ToggleSwitch`, `MenuPopover`, `PopoverSurface`.
- Use existing CSS tokens from `frontend/src/index.css`; do not introduce a new palette.
- Avoid viewport-scaled font sizes and negative letter spacing.
- Keep mobile targets at least 44px for primary touch controls.
- Do not broaden backend contracts unless the prompt explicitly calls for API changes. Most prompts below are frontend-only.
- Add focused unit tests for extracted view-state logic and targeted Playwright coverage for the workflow being improved.
- Run at minimum:
  - `cd frontend && npm run typecheck`
  - `cd frontend && npx eslint <changed files> --max-warnings 0`
  - targeted `npm run test:unit -- <tests>`
  - targeted `npx playwright test <spec> --project=chromium` when a browser workflow changes
  - `git diff --check`

## Service Audit Summary

| Service / Area | Current UX Problem | User Impact | Priority |
| --- | --- | --- | --- |
| Common shell and visual system | Several service-specific surfaces still use oversized radii, decorative gradients, or custom login panels while shared workspace primitives are already quieter. | Visual hierarchy feels inconsistent between pages; repeated operational areas look less systematic than the underlying design system. | P1 |
| Objects | Thumbnail, details preview, and large preview states are improved but still use separate wording and state logic. | Users cannot quickly distinguish loading, unsupported, blocked, failed, and fallback preview states across list/details/viewer. | P0 |
| Settings | Settings tabs are better than before, but access/profile/dialog preferences/API docs are grouped under `Workspace`, while diagnostics also contains UI reset. Advanced transfer/network values apply immediately. | Operators have to infer what is safe daily configuration, what is diagnostic, and what is recovery or risky tuning. | P0 |
| Profiles | Profile creation uses collapsible sections, but provider-specific completion guidance is still spread across section hints and validation. Profile testing is mainly after save/list. | New users can still miss provider-specific required fields until submit, especially Azure ARM, GCS JSON, OCI auth, and TLS details. | P1 |
| Uploads / Transfers | Upload rows expose current mode and fallback tags, but retry requirements and fallback reasons are still not normalized as a user-facing recovery model. | Failed/resumable uploads are harder to triage, especially when file handles are lost or a presigned path falls back. | P1 |
| Buckets | Policy and governance flows are powerful but still split routine safe controls from raw policy editing through copy and shortcuts rather than a simplified decision path. | Users can enter advanced JSON/ACL editing before understanding safe provider-level controls or irreversible effects. | P1 |
| Jobs | Jobs page combines work launching, queue health, realtime health, filters, column controls, and failure alerts into one dense top region. | Operators scanning failures or active work spend too much attention parsing controls before actionable recovery. | P2 |
| Auth / setup | `LoginPage` and `LightApp` implement similar token login/setup flows with different component systems and some inline/custom styling. | Auth/setup screens drift visually and behaviorally from the authenticated app and from each other. | P2 |

## Prompt 1: Common Shell And Visual System Consistency

### Problem

Shared primitives such as `PageHeader` and `PageSection` now use restrained 8px-radius workspace surfaces, but many service-specific modules still use larger decorative treatment:

- `UploadsPage.module.css` contains 18px cards and gradient surfaces.
- `BucketsPage.module.css`, `BucketModal.module.css`, and `BucketGovernanceModal.module.css` include 18-22px surface radii and decorative gradients.
- `ProfilesPage.module.css` and `ProfileModal.module.css` still use 18-22px surfaces in operational forms.
- `LightApp.module.css` has 24px cards/sections and pill-style custom buttons.
- Some pages still use service-local visual treatments instead of shared workspace primitives.

### Execution Prompt

```text
You are improving the frontend visual system consistency of S3Desk.

Goal:
Make service-specific workspace surfaces match the quieter operational design already used by `PageHeader` and `PageSection`, without changing app behavior.

Scope:
- `frontend/src/pages/UploadsPage.module.css`
- `frontend/src/pages/BucketsPage.module.css`
- `frontend/src/pages/buckets/BucketModal.module.css`
- `frontend/src/pages/buckets/BucketGovernanceModal.module.css`
- `frontend/src/pages/ProfilesPage.module.css`
- `frontend/src/pages/profiles/ProfileModal.module.css`
- `frontend/src/LightApp.module.css`
- any directly related component markup only if CSS cannot solve the layout.

Do:
- Audit page-level cards, summary panels, form shells, governance panels, upload empty states, and profile/setup panels.
- Reduce operational workspace card radii toward `var(--s3d-radius-sm)` unless the element is a modal sheet, image/media frame, brand mark, or shared overlay.
- Remove decorative gradients from routine workspace panels where they compete with data, controls, and status.
- Keep borders, spacing, and backgrounds token-based.
- Preserve high-contrast status surfaces and destructive warnings.
- Avoid changing selectors used by tests unless unavoidable.
- Keep modal/sheet geometry stable.

Do not:
- Redesign the entire app shell.
- Touch backend/API behavior.
- Replace Ant Design primitives.
- Add a new color palette.
- Turn dense operational pages into marketing-style hero layouts.

Acceptance criteria:
- Routine service panels read consistently with `PageHeader`/`PageSection`.
- No nested card stack becomes visually heavier after the change.
- Mobile layouts retain 44px action hit areas.
- Existing service tests still pass.

Validation:
- `cd frontend && npm run typecheck`
- `cd frontend && npx eslint <changed files> --max-warnings 0`
- targeted unit tests for touched components
- targeted mobile Playwright specs for touched services, for example:
  - `npx playwright test tests/uploads-mobile-responsive.spec.ts --project=mobile-pixel-7`
  - `npx playwright test tests/buckets-mobile-responsive.spec.ts --project=mobile-pixel-7`
  - `npx playwright test tests/profiles-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `git diff --check`
```

## Prompt 2: Objects Media State Polish

### Problem

Objects media states are currently split across thumbnail loading, details preview, and large preview:

- `ObjectThumbnail.tsx` distinguishes loading vs failed but still uses generic labels like `Preview unavailable` and `Open large preview or retry later`.
- `ObjectsDetailsMediaSections.tsx` has separate handling for `loading`, `blocked`, `error`, `unsupported`, ready image/video/text/json, and video fallback thumbnail.
- `ObjectsImageViewerBody.tsx` has its own blocked/error/loading/fallback copy.

The states are useful, but the vocabulary is not centralized. A user moving from list to details to large preview has to learn the same state more than once.

### Execution Prompt

```text
You are improving Objects media UX in S3Desk.

Goal:
Create a shared, consistent media-state vocabulary and apply it across object thumbnails, details preview, and large preview.

Scope:
- `frontend/src/pages/objects/ObjectThumbnail.tsx`
- `frontend/src/pages/objects/ObjectsDetailsMediaSections.tsx`
- `frontend/src/pages/objects/ObjectsImageViewerBody.tsx`
- `frontend/src/pages/objects/ObjectsImageViewerFooter.tsx`
- `frontend/src/pages/objects/ObjectsThumbnailPrimitives.module.css`
- `frontend/src/pages/objects/ObjectsDetails.module.css`
- `frontend/src/pages/objects/ObjectsImageViewer.module.css`
- new small helper under `frontend/src/pages/objects/` if useful, for example `objectsMediaState.ts`.

Do:
- Define a shared media-state descriptor model for:
  - thumbnail loading
  - thumbnail unavailable
  - preview not requested
  - preview loading
  - preview blocked because object is too large
  - unsupported type
  - provider/network failure
  - ready image/video/text/json
  - fallback thumbnail shown
- Use the same title, short label, tone, and recovery hint across list thumbnails, details, and large preview.
- Replace vague copy with specific recovery actions: `Retry preview`, `Open large preview`, `Use download`, or `Unsupported for this type`.
- Keep live regions only for state transitions, not rapidly changing progress.
- Keep thumbnails compact in list rows and richer in details/viewer.
- Add a compact visual state badge or icon only when it clarifies the state.

Do not:
- Add global toasts for every preview failure.
- Start automatically loading all full previews.
- Increase object listing request volume.
- Change thumbnail cache semantics unless required for state labels.

Acceptance criteria:
- The same failure state reads the same in list/details/viewer.
- A blocked oversized image shows a reason and an alternate action.
- Unsupported types are clearly different from failed previews.
- Failed thumbnail state does not imply the object itself failed to load.

Validation:
- Unit tests for the shared descriptor helper.
- Update object thumbnail/details/image viewer tests.
- Add or update one Playwright visual/UX check around image/video preview fallback.
- `cd frontend && npm run typecheck`
- `cd frontend && npx eslint <changed files> --max-warnings 0`
- `git diff --check`
```

## Prompt 3: Settings Information Architecture And Risky Tuning

### Problem

`SettingsPage.tsx` currently organizes settings into `Workspace`, `Objects`, `Transfers`, and `Diagnostics`. This is a clear improvement, but some tasks remain mixed:

- `Workspace` includes API token, selected profile, dialog confirmation preferences, API docs links.
- `Diagnostics` includes network retry settings, network log, and reset saved UI state.
- Advanced transfer/network numeric settings apply directly as users type/change values.

This makes it hard to separate daily setup, performance tuning, diagnostics, and recovery actions.

### Execution Prompt

```text
You are improving the Settings UX/information architecture of S3Desk.

Goal:
Make Settings read as operator workflows rather than a collection of implementation toggles.

Scope:
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/pages/SettingsPage.module.css`
- `frontend/src/pages/settings/AccessSettingsSection.tsx`
- `frontend/src/pages/settings/ObjectsSettingsSection.tsx`
- `frontend/src/pages/settings/TransfersSettingsSection.tsx`
- `frontend/src/pages/settings/NetworkSettingsSection.tsx`
- `frontend/src/pages/settings/ServerSettingsSection.tsx`
- related settings tests under `frontend/src/pages/__tests__` and `frontend/src/pages/settings/__tests__`.

Do:
- Reframe the sections around workflows:
  - Access: API token, active profile, API docs.
  - Browsing: objects thumbnails, cost mode, indexing.
  - Transfers: download/proxy and upload concurrency.
  - Diagnostics: retry policy and network log.
  - Recovery: reset saved UI state and dismissed dialogs.
- Add a one-line `What this affects` explanation at the top of each section.
- Keep destructive or surprising actions in a visually distinct Recovery card.
- For risky numeric tuning values, introduce draft/apply/cancel behavior or an explicit `Apply tuning` action instead of silent immediate persistence.
- Preserve current localStorage keys and sanitizers.
- Keep advanced settings collapsed, but surface current effective values in the collapsed summary where feasible.

Do not:
- Remove existing settings.
- Rename localStorage keys.
- Require backend changes.
- Hide network retry controls entirely.

Acceptance criteria:
- A user can tell what is daily setup, performance tuning, diagnostics, and recovery.
- Reset UI state is not visually adjacent to ordinary network log browsing.
- Risky transfer tuning changes are intentional and reversible before apply.
- Settings remain usable at 320px width.

Validation:
- Update `SettingsPage.test.tsx` and settings section tests.
- Add mobile Playwright coverage if layout/sections change materially:
  - `npx playwright test tests/settings-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `cd frontend && npm run typecheck`
- `cd frontend && npx eslint <changed files> --max-warnings 0`
- `git diff --check`
```

## Prompt 4: Profiles Provider Setup Guidance

### Problem

The profile modal already uses collapsible sections and provider hints. However, provider-specific setup still depends on scattered hints plus submit-time validation:

- Create mode opens `basic` and `credentials`; edit mode opens `basic`.
- Advanced and Security/TLS can contain fields that are important for some provider/operator environments.
- Profile test actions are available in the saved profile table, but the modal does not give a concise post-save next step.

### Execution Prompt

```text
You are improving provider setup UX for S3Desk profiles.

Goal:
Make profile creation/editing guide users through provider-specific minimum requirements and next steps without making the modal longer or noisier.

Scope:
- `frontend/src/pages/profiles/ProfileModal.tsx`
- `frontend/src/pages/profiles/ProfileModalSections.tsx`
- `frontend/src/pages/profiles/profileModalBasicConnectionSection.tsx`
- `frontend/src/pages/profiles/profileModalCredentialsSection.tsx`
- `frontend/src/pages/profiles/profileModalAdvancedSection.tsx`
- `frontend/src/pages/profiles/profileModalSecuritySection.tsx`
- `frontend/src/pages/profiles/profileModalValidation.ts`
- `frontend/src/pages/profiles/ProfileModal.module.css`
- profile modal tests.

Do:
- Add a compact provider-specific checklist panel near the modal hero:
  - Required for basic connectivity.
  - Optional for management-plane features.
  - Optional for private/self-signed endpoints.
- Derive checklist state from existing `values`, `viewState`, and `errors`.
- For Azure, distinguish blob access from ARM management fields.
- For GCS, distinguish anonymous access from service-account JSON.
- For OCI, distinguish namespace/compartment/region from auth provider/config overrides.
- For S3-compatible/AWS, distinguish endpoint/region/access key/secret/public endpoint.
- When submit validation fails, keep opening the section with errors, but also update the checklist to show which requirement is incomplete.
- Add post-save guidance in the modal footer or success feedback only if it uses existing saved-profile test flow; do not invent a new backend API.

Do not:
- Add a `Test connection` button inside the create modal unless the existing API supports testing unsaved draft profiles.
- Expose secret values in summary/checklist text.
- Make all advanced fields visible by default.
- Change validation rules unless the current rules are wrong.

Acceptance criteria:
- A first-time user can see what must be filled for the selected provider before pressing Save.
- Provider-specific advanced requirements do not look mandatory for basic connectivity.
- Error recovery is visible both in the section and in the checklist.
- Existing create/edit profile flows remain stable.

Validation:
- Unit tests for checklist derivation.
- Profile modal tests for at least S3-compatible, Azure, GCS, and OCI.
- `npx playwright test tests/profiles-provider-forms.spec.ts --project=chromium`
- `cd frontend && npm run typecheck`
- `cd frontend && npx eslint <changed files> --max-warnings 0`
- `git diff --check`
```

## Prompt 5: Uploads And Transfers Fallback Recovery

### Problem

Transfer rows now show upload mode and fallback messaging, but the UX model is still row-local text:

- `TransferUploadRow.tsx` displays `Current path`, `Fallback`, `Preview frame`, and errors in the row.
- Fallback reason handling is limited to `provider_unsupported` and `network_path_failed`.
- Retry/resume requirements are not presented as a consistent recovery checklist.

### Execution Prompt

```text
You are improving Uploads/Transfers recovery UX in S3Desk.

Goal:
Turn upload mode/fallback/retry details into a consistent recovery model that users can scan and act on.

Scope:
- `frontend/src/components/transfers/TransferUploadRow.tsx`
- `frontend/src/components/transfers/uploadRuntimeFallback.ts`
- `frontend/src/components/transfers/uploadRuntimeRetry.ts`
- `frontend/src/components/transfers/uploadRuntimeTask.ts`
- `frontend/src/components/transfers/useTransfersUploadRuntime.ts`
- `frontend/src/components/transfers/transferRows.module.css`
- `frontend/src/components/transfers/transfersTypes.ts`
- transfer unit tests.

Do:
- Define a user-facing upload recovery descriptor:
  - current path/mode
  - previous path/mode if fallback happened
  - fallback reason
  - whether retry can reuse remembered file handles
  - whether user must re-select local files
  - whether server-side job finalization is pending
- Render this descriptor consistently in upload rows.
- Keep the mode tag short, and put detailed recovery guidance in one compact detail line or disclosure.
- Preserve the finalizing commit state that hides destructive removal.
- Make retry buttons disabled or accompanied by guidance when retry requires file re-selection.
- Keep screen-reader live announcements to status changes, not progress churn.

Do not:
- Change upload protocols.
- Store raw local filesystem paths beyond existing behavior.
- Expand every upload row by default.
- Remove existing progress metrics.

Acceptance criteria:
- Failed upload rows tell the user exactly what to do next.
- Fallback from presigned to direct/staging is visible without reading implementation terms.
- Retry requirements are clear for resumable and non-resumable failures.
- Transfer drawer remains dense and mobile friendly.

Validation:
- Update transfer upload row and upload runtime tests.
- `npx playwright test tests/transfers-presigned.spec.ts --project=chromium`
- `npx playwright test tests/transfers-live-fallback.spec.ts --project=chromium` when live prerequisites are available; otherwise document why skipped.
- `cd frontend && npm run typecheck`
- `cd frontend && npx eslint <changed files> --max-warnings 0`
- `git diff --check`
```

## Prompt 6: Buckets Governance And Policy Simplification

### Problem

Bucket policy/governance flows are powerful but remain cognitively heavy:

- `BucketPolicyModal.tsx` defaults S3 to JSON editing and GCS/Azure to form editing.
- The policy editor contains validate/preview/diff tabs, provider warnings, server validation, controls shortcut guidance, presets, raw text, and delete/reset actions.
- Governance controls are separate by provider, which is correct, but the decision path between routine controls and raw policy remains copy-driven.

### Execution Prompt

```text
You are improving Buckets policy/governance UX in S3Desk.

Goal:
Make routine safe bucket controls the obvious first path, while keeping raw policy/ACL editing available for advanced cases.

Scope:
- `frontend/src/pages/buckets/BucketPolicyModal.tsx`
- `frontend/src/pages/buckets/BucketPolicyWorkspaceHeader.tsx`
- `frontend/src/pages/buckets/BucketPolicyContentTabs.tsx`
- `frontend/src/pages/buckets/BucketPolicyFooterActions.tsx`
- `frontend/src/pages/buckets/BucketGovernanceModal.tsx`
- `frontend/src/pages/buckets/governance/**`
- `frontend/src/pages/buckets/BucketPolicyModal.module.css`
- `frontend/src/pages/buckets/BucketGovernanceModal.module.css`
- bucket policy/governance tests.

Do:
- Add a provider-specific decision header:
  - `Recommended: Controls` for routine public access, encryption, versioning, lifecycle, ownership, retention.
  - `Advanced: Policy JSON/IAM/ACL` for cross-account statements, etag-sensitive IAM edits, raw ACL JSON, and presets.
- Surface irreversible or high-risk effects as compact badges before the user enters the editor.
- Keep raw JSON/policy editors collapsed or visually secondary when a safer structured route exists.
- Preserve validation/diff/preview, but make `Validate` and provider warnings more prominent before Save.
- Keep destructive delete/reset actions visually separated from save/validate actions.
- Keep existing provider behavior and mutation payloads unchanged.

Do not:
- Remove raw policy editing.
- Reduce provider-specific controls.
- Change backend policy validation behavior.
- Hide delete/reset actions without an alternate route.

Acceptance criteria:
- A user understands whether to use Controls or Advanced Policy before editing.
- Save/reset/destructive paths are visually distinct.
- Provider warnings are visible before mutation.
- Mobile policy/governance modals remain usable without horizontal overflow.

Validation:
- Update bucket policy/governance unit tests.
- `npx playwright test tests/bucket-governance.spec.ts --project=chromium`
- `npx playwright test tests/buckets-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `cd frontend && npm run typecheck`
- `cd frontend && npx eslint <changed files> --max-warnings 0`
- `git diff --check`
```

## Prompt 7: Jobs Operations Signal Hierarchy

### Problem

The Jobs page is functionally rich, but the top region combines many competing concerns:

- Work launch actions: upload, download, more.
- Realtime connection health and retry.
- Upload support/bucket lookup/realtime alerts.
- Queue health counts.
- Filters and column preferences.

This makes active failure recovery harder than it needs to be for operators scanning the page.

### Execution Prompt

```text
You are improving Jobs page signal hierarchy in S3Desk.

Goal:
Make active work and failures faster to scan while keeping all existing controls available.

Scope:
- `frontend/src/pages/jobs/JobsToolbar.tsx`
- `frontend/src/pages/jobs/JobsToolbar.module.css`
- `frontend/src/pages/jobs/JobsTableSection.tsx`
- `frontend/src/pages/jobs/JobsMobileList.tsx`
- `frontend/src/pages/jobs/JobsDetailsDrawer.tsx`
- `frontend/src/pages/jobs/JobsLogsDrawer.tsx`
- related Jobs tests.

Do:
- Separate the top region into three clear groups:
  - Launch work: Upload, Download, More.
  - Queue health: active/running/queued/failed/succeeded/canceled.
  - Troubleshooting: realtime status, retry, bucket lookup warning, provider support warning.
- Put failure and paused-realtime recovery actions close to the warning that requires action.
- Keep filters accessible but secondary to current queue state.
- Improve empty and filtered-empty states with an explicit next action:
  - reset filters
  - create upload/download job
  - retry realtime
- Keep mobile cards dense but make failed jobs visually easier to identify and act on.

Do not:
- Remove existing filters or column controls.
- Change job APIs or polling/realtime behavior.
- Add persistent global notifications for every job update.
- Rework log virtualization unless necessary for layout.

Acceptance criteria:
- Operators can identify failed jobs and realtime disconnection without reading the whole toolbar.
- Filters and column controls remain available but do not dominate the initial scan.
- Mobile Jobs remains usable at 390px and 320px widths.

Validation:
- Jobs toolbar/table unit tests.
- `npx playwright test tests/jobs-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `npx playwright test tests/jobs-overlays.spec.ts --project=chromium`
- `cd frontend && npm run typecheck`
- `cd frontend && npx eslint <changed files> --max-warnings 0`
- `git diff --check`
```

## Prompt 8: Auth And Light Setup Consolidation

### Problem

There are two similar unauthenticated/setup login experiences:

- `frontend/src/pages/LoginPage.tsx` uses Ant Design, `BrandLockup`, `FormField`, and inline layout styles.
- `frontend/src/LightApp.tsx` implements `LightLogin` with custom HTML/CSS and similar token validation behavior.
- `LightApp.module.css` uses larger decorative card/radius/button styling than the authenticated app.

This increases drift in copy, validation behavior, visual treatment, and accessibility.

### Execution Prompt

```text
You are consolidating S3Desk auth/setup UX.

Goal:
Use one shared token-login panel and one shared setup shell treatment for both `LoginPage` and `LightApp`.

Scope:
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/LightApp.tsx`
- `frontend/src/LightApp.module.css`
- optional new shared component under `frontend/src/components/` or `frontend/src/auth/`
- auth/light app tests.

Do:
- Extract a shared token login panel that accepts:
  - initial token
  - submit handler
  - clear saved token handler
  - validation error
  - loading state
  - explanatory hint variant
- Reuse `getHttpHeaderValueValidationError` and preserve existing token validation.
- Remove duplicated token input markup/copy between `LoginPage` and `LightApp`.
- Replace inline layout styles in `LoginPage` with CSS module styles or shared layout classes.
- Align setup/login surfaces with the authenticated app's quieter workspace visual system.
- Preserve `aria-invalid`, `aria-describedby`, form labels, and keyboard submit behavior.

Do not:
- Change auth storage semantics.
- Change `/meta` token validation behavior.
- Remove theme toggle.
- Replace the setup/profile selection flow.

Acceptance criteria:
- Login/setup token validation behaves the same in both routes.
- Copy and error handling do not drift between `LoginPage` and `LightApp`.
- The unauthenticated setup surface visually belongs to the same app as the authenticated shell.
- Existing auth tests pass.

Validation:
- `npm run test:unit -- src/__tests__/LightApp.auth.test.tsx src/pages/__tests__/LoginPage.test.tsx`
- `npx playwright test tests/login-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `cd frontend && npm run typecheck`
- `cd frontend && npx eslint <changed files> --max-warnings 0`
- `git diff --check`
```

## Recommended Execution Order

1. Objects media state polish.
2. Settings information architecture and risky tuning.
3. Uploads/Transfers fallback recovery.
4. Profiles provider setup guidance.
5. Buckets governance/policy simplification.
6. Jobs operations signal hierarchy.
7. Auth/LightApp consolidation.
8. Common visual system consistency pass.

Rationale:

- Objects and Settings affect the most frequent workflows and have well-contained implementation seams.
- Uploads/Transfers and Profiles reduce user recovery/setup failures.
- Buckets and Jobs are important but should follow after shared wording/state patterns settle.
- The visual system pass should come after workflow changes so CSS cleanup does not churn twice.
