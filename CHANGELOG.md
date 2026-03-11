# Changelog

## Unreleased

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

### Known Limitations
- Azure legal hold remains read-only in S3Desk.
- Azure immutability editing requires ARM credentials in addition to storage credentials.
- OCI PAR edits are delete-and-recreate rather than in-place mutation, and the full access URI is only guaranteed at creation time.
- AWS typed bucket governance still does not cover Object Lock.
- In-product backup and staged restore target sqlite `DATA_DIR` workflows and do not replace Postgres disaster recovery.

### Full Changelog
Full Changelog: `0.20v...0.21v-rc1`
