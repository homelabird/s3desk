# Bucket Governance Remaining Work

## Status

The core bucket governance rollout is implemented across backend and frontend for:

- AWS S3 typed controls
- GCS typed controls
- Azure Blob typed controls
- OCI Object Storage typed controls

What remains is a focused set of follow-up work to close known feature gaps and harden the rollout.

## Critical Remaining Work

- [ ] Implement Azure immutability editing
  Current state: immutability is surfaced in the controls UI as read-only status, but the client cannot create, update, or remove container immutability policy settings yet.

- [ ] Support multiple OCI retention rules
  Current state: the OCI controls surface edits only the first retention rule returned by the backend. Full parity needs create, update, delete, and ordering behavior for multiple rules.

- [ ] Add OCI sharing and PAR typed controls
  Current state: visibility, versioning, and retention are exposed, but pre-authenticated requests and OCI-native sharing controls are still outside the typed governance flow.

- [ ] Run live validation against real cloud environments
  Current state: backend round-trip tests and frontend unit tests are in place, but the rollout still needs real-provider smoke coverage for AWS, GCS, Azure, and OCI accounts.

- [ ] Document provider support boundaries clearly
  Current state: the implementation works, but the operator-facing docs should explicitly spell out which governance sections are fully editable, partially editable, or read-only per provider.

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
  Current state: the design draft still reads like a forward-looking plan in several sections. It should be updated to reflect what is already shipped and what remains open.

## Current Priority Order

Recommended order for the next implementation slice:

1. Azure immutability editing
2. OCI multi-rule retention support
3. OCI PAR and sharing typed controls
4. Live provider validation
5. Structured editors for GCS and Azure
