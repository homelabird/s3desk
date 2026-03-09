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
  Current state: backend round-trip tests and frontend unit tests exist, but the rollout still needs real-provider smoke coverage for AWS, GCS, Azure, and OCI accounts.

## Recommended Follow-Ups

- [ ] Replace the GCS IAM bindings JSON editor with a structured editor
  Current state: GCS typed controls exist, but IAM bindings are still edited as raw JSON in the governance modal.

- [ ] Replace the Azure stored access policies JSON editor with a structured editor
  Current state: Azure typed controls exist, but stored access policies are still edited as raw JSON in the governance modal.

- [ ] Refine provider-specific warning and error copy
  Current state: the controls surface already returns provider-aware warnings, but some messages can be made more explicit for operators.

- [ ] Add Playwright end-to-end scenarios for bucket controls
  Current state: unit and smoke coverage exists, but the bucket governance flows do not yet have dedicated end-to-end UI coverage.

- [ ] Update the governance design document with implementation status
  Current state: the top-level status and provider support notes have been refreshed, but the phased implementation plan still reads forward-looking in several sections.

## Recently Closed

- [x] Implement Azure immutability editing
  Final state: Azure profiles can carry Azure ARM credentials, and the governance UI can create, update, lock, extend, and delete container immutability policies when those credentials are present.

- [x] Support multiple OCI retention rules
  Final state: OCI protection controls now round-trip the full retention rule list and allow create, update, and delete behavior with locked-rule safeguards.

- [x] Add OCI sharing and PAR typed controls
  Final state: OCI governance now exposes typed pre-authenticated request listing, creation, and deletion. Existing PARs are intentionally treated as delete-and-recreate for edits.

- [x] Document provider support boundaries clearly
  Final state: `docs/PROVIDERS.md` now carries the operator-facing governance support matrix and provider-specific limitations.

## Current Priority Order

Recommended order for the next implementation slice:

1. Live provider validation
2. Structured editor for GCS IAM bindings
3. Structured editor for Azure stored access policies
4. Provider-specific warning and error copy cleanup
5. Playwright coverage for governance flows
