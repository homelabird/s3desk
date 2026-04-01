# Changelog

## Unreleased

## `0.21v-rc3` - 2026-03-24

### New Features
- Added transfer concurrency preferences and backend transfer buffer helpers for more predictable transfer behavior under load.
- Added operational configuration warnings to surface risky runtime settings before execution.
- Added release and deployment checks that harden pre-release validation in CI.

### Improvements
- Stabilized object-page layout behavior and mobile dashboard scrolling for better cross-device consistency.
- Refactored frontend bucket/profile modal flows and API client/test facades into smaller modules for simpler maintenance.
- Refactored jobs and object page internals to separate object styles, page state, and backend job/store pathways.
- Improved demo compose and podman defaults for host/network behavior, making local validation more reliable.

### Security
- Tightened default `CSP` settings and capped realtime connections to reduce exposure risk.
- Remediated backend `gosec` findings and hardened portable import flow paths.
- Restored HMAC integrity for clear backups and added stricter profile endpoint validation.
- Hardened frontend/runtime regression paths for more predictable and safer failure modes.

### Bug Fixes
- Fixed invalid active profile selection recovery and endpoint fallback behavior to prevent unstable state.
- Fixed profile endpoint handling and folder-upload relative path regressions.
- Fixed mobile viewport and popover clamping regressions in object interactions.
- Fixed mobile dashboard scroll behavior and added local smoke coverage for responsive regressions.
- Fixed portable-import smoke paths and restore consistency in end-to-end coverage.
- Fixed demo seeding and object layout stability by hardening demo setup and startup checks.

### Chores
- Added quality gates, provider-live validation smoke coverage, and updated mobile UX audit documentation.
- Added comprehensive mobile UX audit materials and responsive suite coverage for local smoke gates.
- Added release metadata and GitHub release workflow rules to agent guidance.
- Added release/deployment checklist updates and Helm deployment hardening for broader release readiness.

### Release Candidate Notes
- `0.21v-rc3` is a continuation release candidate; this is not a final `0.21v` release.
- Keep this release candidate as final blocker until real-provider validation evidence is completed for AWS S3, GCS, Azure Blob, and OCI Object Storage.
- Keep reverse-proxy and browser-facing download/realtime smoke evidence updated before promoting to final `0.21v`.

### Full Changelog
**Full Changelog**: https://github.com/homelabird/s3desk/compare/0.21v-rc2...0.21v-rc3

## `0.21v-rc2` - 2026-03-12

### New Features
- Added portable backup export, preview, and import flows for sqlite-backed source servers, including encrypted payload support and password-aware import handling.
- Added a unified sidebar backup workflow that covers backup export, staged restore upload, portable preview/import, and staged restore inventory cleanup.
- Added richer jobs overlays, including details and logs drawers, and split the jobs page into dedicated controller and table/mobile view modules.
- Added page-level regression coverage for object interactions, transfers, jobs realtime overlays, and password-protected backup/restore live flow.

### Improvements
- Improved backup and restore UX with clearer sqlite/Postgres scope guidance, visible restore validation signals, helper commands, and apply-plan copy actions.
- Improved frontend reliability by expanding regression coverage across login, settings, uploads, profiles, buckets, objects, transfers, and jobs surfaces.
- Improved dark theme polish and overall UI consistency across the main frontend shell.
- Improved test fixture helpers and mock API controls for delayed, failing, and retried frontend request paths.
- Improved deployment and validation documentation with environment templates, release-gate notes, and portable-backup design/checklist updates.

### Security
- Hardened encrypted backup and portable import handling by validating password-based payload decryption and related contract paths more explicitly.
- Kept OpenAPI and generated frontend client types aligned with the backup/import API surface.

### Bug Fixes
- Fixed waiting `job_artifact` download handling across success, failure, cancel, and retry flows.
- Fixed object context-menu and keyboard interaction edge cases, including `Esc` behavior, selection sync, and prefix/navigation regressions.
- Fixed transfer persistence and duplicate queue edge cases surfaced by refresh, retry, and device download interactions.
- Fixed backup-related frontend/runtime regressions, including password-protected export/restore flows and patch-package compatibility for the frontend build.
- Fixed multiple jobs/object page regressions found by the expanded release-check and Playwright coverage.

### Chores
- Regenerated frontend API types and OpenAPI-derived contracts.
- Refactored jobs-page internals into smaller controller and presentation modules.
- Refreshed release-support docs and demo seed/deployment helper paths.

### Release Candidate Notes
- `0.21v-rc2` is a release candidate, not the final `0.21v` tag.
- Final `0.21v` should still wait for real-provider live validation evidence across AWS S3, GCS, Azure Blob, and OCI Object Storage.
- Final `0.21v` should still carry a recorded reverse-proxy smoke pass for realtime auth and browser-facing download flows.

### Full Changelog
**Full Changelog**: https://github.com/homelabird/s3desk/compare/0.21v-rc1...0.21v-rc2

## `0.21v-rc1` - 2026-03-11

### New Features
- Added sqlite-based `Full backup` and `Cache + metadata backup` export flows in the server settings UI.
- Added staged restore inventory management, including restore listing, deletion, stale-restore cleanup, apply plans, and helper commands.
- Added encrypted backup payload support for server backup bundles.
- Added restore validation signals, including checksum, signature, encryption, and preflight metadata in restore results.
- Added a demo compose stack that boots S3Desk with an auto-seeded MinIO profile and sample bucket.
- Added typed bucket governance and bucket policy controls across AWS S3, GCS, Azure Blob, and OCI Object Storage.
- Added Azure immutability editing support with ARM credential fields and typed UI flows.
- Added OCI multi-rule retention support and typed PAR and sharing controls.
- Added short-lived realtime tickets for WebSocket and SSE event streams.
- Added cost-control features for object browsing, including cache-first thumbnail handling, thumbnail request throttling, and conservative prefetch modes.
- Added frontend UX backlog and release gate documents to track rollout work and exit criteria.

### Improvements
- Improved browser-facing S3-compatible downloads to honor `publicEndpoint` instead of leaking internal endpoints.
- Improved object browsing interactions with clearer thumbnail and preview states, better empty and blocked placeholders, and more predictable selection versus preview behavior.
- Improved transfer UX by making upload fallback mode and fallback reasons visible in the transfers UI.
- Improved settings UX by regrouping sections into clearer operational categories and separating backup export, restore staging, and staged restore inventory.
- Improved profile UX by collapsing advanced provider fields by default and surfacing connection and credential guidance more clearly.
- Improved bucket policy and governance dialogs by prioritizing typed controls and moving advanced and raw editing into secondary sections.
- Improved backup and restore guidance with clearer sqlite/Postgres scope separation and staged restore lifecycle documentation.
- Improved release readiness checks by enforcing OpenAPI drift detection, third-party notice generation, and release-gate document structure.

### Security
- Hardened realtime auth by replacing query-string `apiToken` usage for WebSocket and SSE with short-lived realtime tickets.
- Hardened WebSocket upgrade handling with proper origin validation instead of unconditional `CheckOrigin`.
- Hardened auth rate limiting by avoiding spoofable forwarding headers as the primary limiter key.
- Hardened restore handling with configurable upload size caps to reduce oversized bundle abuse risk.
- Hardened `rclone` profile/config generation by rejecting control-character and config-injection inputs.
- Hardened demo deployment defaults, including safer bind behavior and less risky demo credential defaults.
- Added support for fixed external base URLs in `download-proxy` generation so deployment-sensitive links do not trust request `Host` values.

### Bug Fixes
- Fixed drag-and-drop move behavior so internal object moves no longer trigger unintended upload-side effects before confirmation.
- Fixed persisted object location state so stale bucket and prefix selections are reset when they no longer match the active profile.
- Fixed clipboard object actions so copy and move context now carries profile identity correctly.
- Fixed bucket-page to objects-page handoff so it no longer depends on legacy global localStorage keys.
- Fixed browser download and preview flows that exposed internal S3-compatible endpoints to clients.
- Fixed restore settings async teardown leaks that caused frontend unit-test instability.
- Fixed multiple frontend test regressions caused by recent UX and runtime changes in object preview, DnD, settings, realtime events, and policy modals.
- Fixed backend test deadlocks and smoke-test seams around `rclone` process helpers.
- Fixed bucket, jobs, and backend regression cases surfaced by the full release check pipeline.

### Chores
- Refactored bucket governance frontend into provider-specific modules and shared dialog shells and utilities.
- Refactored bucket creation and bucket policy surfaces into smaller provider-aware modules.
- Reduced mutable global test-hook exposure in backend test seams.
- Added release-gate CI workflow support and documentation for final release evidence.
- Updated `THIRD_PARTY_NOTICES.md` and bundled npm license texts for newly introduced runtime dependencies.
- Refreshed technical debt tracking, UX backlog docs, and live validation prep docs.

### Release Candidate Notes
- `0.21v-rc1` is a release candidate, not the final `0.21v` tag.
- Final `0.21v` should wait for real-provider live validation evidence across AWS S3, GCS, Azure Blob, and OCI Object Storage.
- Final `0.21v` should also carry a recorded reverse-proxy smoke pass for realtime auth and browser-facing download flows.

### Known Limitations
- Azure legal hold remains read-only in S3Desk.
- Azure immutability editing requires ARM credentials in addition to storage credentials.
- OCI PAR edits are delete-and-recreate rather than in-place mutation, and the full access URI is only guaranteed at creation time.
- AWS typed bucket governance still does not cover Object Lock.
- In-product backup and staged restore target sqlite `DATA_DIR` workflows and do not replace Postgres disaster recovery.

### Full Changelog
**Full Changelog**: https://github.com/homelabird/s3desk/compare/0.20v...0.21v-rc1
