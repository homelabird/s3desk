# Bucket Governance Remaining Work

## Status

The core bucket governance rollout is implemented across backend and frontend for:

- AWS S3 typed controls
- GCS typed controls
- Azure Blob typed controls
- OCI Object Storage typed controls
- Azure ARM-backed immutability editing
- OCI multi-rule retention editing
- OCI PAR typed sharing controls

What remains is a smaller set of validation, UX hardening, and documentation cleanup tasks.

## Critical Remaining Work

- [ ] Run live validation against real cloud environments
  Current state: backend round-trip tests, frontend unit tests, and governance Playwright smoke tests exist, but the rollout still needs real-provider smoke coverage for AWS, GCS, Azure, and OCI accounts. Use [`docs/BUCKET_GOVERNANCE_LIVE_VALIDATION.md`](BUCKET_GOVERNANCE_LIVE_VALIDATION.md).

## Recommended Follow-Ups

- [ ] Update the governance design document with implementation status
  Current state: the top-level status and provider support notes have been refreshed, but the phased implementation plan still reads forward-looking in several sections.

- [ ] Add typed handling for Azure legal hold release
  Current state: legal hold detection is surfaced in Azure immutability warnings, but release or edit remains outside this controls surface.

- [ ] Replace GCS IAM condition JSON fragments with a typed condition editor
  Current state: GCS IAM bindings now use a structured editor for role and members, but binding conditions are still entered as JSON.

- [ ] Improve OCI PAR edit UX without hiding the delete-and-recreate model
  Current state: existing OCI PARs are intentionally immutable in place. The UI should make replace flows more explicit once live validation is complete.

- [ ] Revisit S3-compatible governance capability detection after live validation
  Current state: typed S3-compatible governance remains intentionally conservative because provider behavior still varies across MinIO, Ceph RGW, and similar targets.

## Recently Closed

- [x] Implement Azure immutability editing
  Final state: Azure profiles can carry Azure ARM credentials, and the governance UI can create, update, lock, extend, and delete container immutability policies when those credentials are present.

- [x] Support multiple OCI retention rules
  Final state: OCI protection controls now round-trip the full retention rule list and allow create, update, and delete behavior with locked-rule safeguards.

- [x] Add OCI sharing and PAR typed controls
  Final state: OCI governance now exposes typed pre-authenticated request listing, creation, and deletion. Existing PARs are intentionally treated as delete-and-recreate for edits.

- [x] Document provider support boundaries clearly
  Final state: `docs/PROVIDERS.md` now carries the operator-facing governance support matrix and provider-specific limitations.

- [x] Replace the GCS IAM bindings JSON editor with a structured editor
  Final state: GCS IAM bindings are now edited through a structured list of roles, members, and optional condition JSON fragments.

- [x] Replace the Azure stored access policies JSON editor with a structured editor
  Final state: Azure stored access policies are now edited through structured policy cards with typed permission selection.

- [x] Refine provider-specific warning and error copy
  Final state: governance capability reasons and modal copy now use provider-specific operator language instead of generic placeholder messaging.

- [x] Add Playwright end-to-end scenarios for bucket controls
  Final state: governance smoke coverage now includes Playwright scenarios for GCS and Azure structured editors.

## Current Priority Order

Recommended order for the next implementation slice:

1. Live provider validation
2. Update the governance design document implementation status in more detail
3. Azure legal hold typed handling
4. GCS IAM condition structured editor
5. OCI PAR replacement UX and S3-compatible capability review
