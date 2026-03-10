# Changelog

## Unreleased

### Added
- Added server backup download and staged restore flows for migration between hosts.
- Added provider capability coverage, route-to-OpenAPI contract tests, and expanded backend integration coverage.
- Added shared lightweight frontend primitives for dialogs, sheets, menus, toggles, and number fields.
- Added nightly/mock E2E workflows, live critical-flow coverage, and reusable Playwright fixture helpers.
- Added provider-aware bucket governance APIs and controls for AWS S3, GCS, Azure Blob, and OCI Object Storage.
- Added encrypted backup bundle export, restore validation signals, and restore upload size limits.
- Added short-lived realtime tickets for WebSocket and SSE event streams.
- Added a demo compose stack that seeds a sqlite-backed MinIO profile and sample bucket automatically.

### Changed
- Refactored the Objects, Profiles, Transfers, Jobs, and Uploads screens into smaller frontend modules.
- Reduced frontend bundle weight by replacing several Ant Design-heavy paths with lighter custom components and lazy-loaded sections.
- Updated the OpenAPI spec and generated frontend types to match runtime routes and metadata fields.
- Changed bucket management so secure defaults and typed governance controls are available alongside advanced raw policy editing.
- Hardened browser-facing download URLs so S3-compatible profiles can use `publicEndpoint` for direct browser access.
- Reworked settings navigation, backup and restore presentation, and profile advanced-field disclosure to reduce operator error.
- Improved object browsing interactions, preview status messaging, and transfer fallback visibility in the frontend.

### Fixed
- Fixed frontend/backend contract drift around `/meta`, migration endpoints, and live API payload expectations.
- Fixed thumbnail preview accessibility and stabilized object action menus in list and grid views.
- Fixed OCI native folder creation so empty folders are backed by hidden marker objects, remain visible after refresh, and no longer leak marker files into object listings.
- Fixed browser download and preview flows that leaked internal S3-compatible endpoints to the client.
- Fixed object drag-and-drop handling so internal moves no longer trigger unintended upload-side effects.
- Fixed authentication hardening gaps around spoofable rate-limit keys and realtime channel origin handling.

### Known Limitations
- Azure legal hold remains read-only in S3Desk.
- Azure immutability editing requires ARM credentials in addition to storage credentials.
- OCI PAR edits are delete-and-recreate rather than in-place mutation, and the full access URI is only guaranteed at creation time.
- AWS typed bucket governance still does not cover Object Lock.
- In-product backup and staged restore target sqlite `DATA_DIR` workflows and do not replace Postgres disaster recovery.
- Real-provider live validation evidence for the current governance and auth changes is still required before a final `0.21v` release tag.
