# Bucket Governance Live Validation

## Purpose

This checklist is for real-provider validation of the typed bucket governance flows now shipped in S3Desk.

Use it after backend or frontend governance changes, and before cutting a release that changes provider-specific bucket controls.

## Scope

Providers covered here:

- AWS S3
- Google Cloud Storage
- Azure Blob Storage
- OCI Object Storage

This document is for real cloud environments. Mocked UI coverage already exists in:

- [bucket-governance.spec.ts](../frontend/tests/bucket-governance.spec.ts)
- [BucketGovernanceModal.test.tsx](../frontend/src/pages/buckets/__tests__/BucketGovernanceModal.test.tsx)

## Shared Preconditions

- Start from a clean test bucket or container that is safe to mutate.
- Use a dedicated non-production account, project, subscription, or compartment.
- Record the exact profile used for the run.
- Capture API responses for failed saves and any provider-native console screenshots for unexpected results.
- After each scenario, restore the bucket to its original baseline unless the scenario explicitly tests irreversible locking behavior.

## Shared Evidence To Capture

- Provider name
- Bucket or container name
- Profile identifier
- S3Desk commit SHA or release tag
- Exact feature tested
- Whether the operation was done through typed controls or advanced/raw policy editing
- API response body on failure
- Provider-native console or CLI confirmation on success

## Quick Runbook

Use this order when running a fresh validation pass:

1. Record the S3Desk commit or tag you are validating.
2. Prepare one disposable test bucket or container per provider.
3. Run AWS S3 first.
4. Run GCS second.
5. Run Azure third.
6. Run OCI fourth.
7. After each provider:
   - capture success or failure evidence
   - note any permission gap
   - restore the bucket or container unless the scenario intentionally locks or preserves state
8. At the end of the pass, update:
   - [PROVIDERS.md](PROVIDERS.md)
   - [BUCKET_GOVERNANCE_REMAINING_WORK.md](BUCKET_GOVERNANCE_REMAINING_WORK.md)

Recommended minimum provider pass:

| Order | Provider | Must verify before moving on |
| --- | --- | --- |
| 1 | AWS S3 | Public exposure, object ownership, versioning, encryption, lifecycle |
| 2 | GCS | Structured IAM bindings, PAP, uniform access, versioning, retention |
| 3 | Azure Blob | Anonymous access, structured stored access policies, soft delete, ARM-backed immutability |
| 4 | OCI Object Storage | Visibility, versioning, multi-rule retention, PAR create/delete |

## AWS S3 Checklist

Prerequisites:

- AWS credentials with bucket policy, public access block, versioning, encryption, and lifecycle permissions
- A test bucket that is not covered by organization-level SCP or account-level restrictions that would mask bucket-level behavior

Checklist:

- [ ] Open bucket governance modal and confirm AWS typed sections render
- [ ] Toggle Block Public Access flags and verify save succeeds
- [ ] Change Object Ownership and confirm provider-native state changes
- [ ] Toggle versioning between `enabled` and `suspended`
- [ ] Change default encryption between `sse_s3` and `sse_kms` if a test KMS key is available
- [ ] Add an AWS lifecycle rule and confirm it round-trips
- [ ] Remove the lifecycle rule and confirm the bucket returns to empty lifecycle state
- [ ] Open advanced policy editor and confirm raw bucket policy read/write still works

Notes:

- Object Lock is still outside the typed AWS flow.
- KMS validation depends on a usable key policy and principal permissions.

## Google Cloud Storage Checklist

Prerequisites:

- GCS profile with valid credentials and `projectNumber`
- A bucket where IAM, Public Access Prevention, Uniform Bucket-Level Access, versioning, and retention changes are allowed

Checklist:

- [ ] Open bucket governance modal and confirm GCS typed sections render
- [ ] Add or edit an IAM binding through the structured editor
- [ ] Save members and optional condition JSON, then confirm the binding round-trips
- [ ] Toggle public mode between `private` and `public`
- [ ] Toggle Public Access Prevention and verify provider-native state changes
- [ ] Toggle Uniform Bucket-Level Access and confirm the bucket updates
- [ ] Toggle versioning between `enabled` and `disabled`
- [ ] Set retention days and confirm the period round-trips
- [ ] If testing a locked-retention bucket, confirm the UI stays read-only for destructive retention changes

Notes:

- IAM conditions are still entered as JSON fragments, not a fully typed condition builder.
- Live validation should explicitly confirm that the saved IAM `etag` handling does not cause stale-write regressions.

## Azure Blob Storage Checklist

Prerequisites:

- Azure Blob profile with storage account credentials
- For immutability editing, also provide:
  - `subscriptionId`
  - `resourceGroup`
  - `tenantId`
  - `clientId`
  - `clientSecret`
- A test container under a storage account where anonymous access, stored access policies, soft delete, versioning, and immutability are allowed

Checklist:

- [ ] Open bucket governance modal and confirm Azure typed sections render
- [ ] Change anonymous access visibility between `private`, `blob`, and `container`
- [ ] Add, edit, and delete stored access policies through the structured editor
- [ ] Confirm stored access policy permission ordering is normalized correctly on save
- [ ] Toggle account-level versioning and verify the storage account reflects the change
- [ ] Toggle soft delete and change soft delete retention days
- [ ] Without ARM credentials, confirm immutability is visible but not editable
- [ ] With ARM credentials, create an unlocked container immutability policy
- [ ] Edit the unlocked immutability period
- [ ] Lock the immutability policy
- [ ] Extend the locked immutability period
- [ ] For a separate unlocked test container, delete the immutability policy
- [ ] If a legal hold exists, confirm it is surfaced as a warning and remains read-only in S3Desk

Notes:

- Azure legal hold release is not part of the current typed flow.
- Immutability policy operations are partly irreversible once locked. Use separate test containers for `lock` and `delete` scenarios.

## OCI Object Storage Checklist

Prerequisites:

- OCI native profile with valid `region`, `namespace`, and `compartment`
- A test bucket where visibility, versioning, retention rules, and PAR operations are allowed

Checklist:

- [ ] Open bucket governance modal and confirm OCI typed sections render
- [ ] Change bucket visibility between supported values and verify provider-native state changes
- [ ] Toggle versioning between `enabled` and `disabled`
- [ ] Add multiple retention rules and confirm they round-trip in order
- [ ] Edit an unlocked retention rule
- [ ] Delete an unlocked retention rule
- [ ] Confirm locked retention rules cannot be shortened or deleted from the UI
- [ ] Create a new PAR and confirm the returned access URI is shown in the UI
- [ ] Copy the PAR access URI immediately and verify it works
- [ ] Delete an existing PAR and confirm it disappears from the list
- [ ] Confirm existing PARs are treated as delete-and-recreate for edits

Notes:

- OCI only returns the full PAR access URI at create time. Validation should confirm operators can capture it during that save.
- Existing PAR entries are intentionally immutable in-place in this client.

## Suggested Run Log Template

```md
Provider:
Bucket/Container:
Profile:
Commit/Tag:

Scenario:
Expected:
Actual:

API response:
Provider-native confirmation:
Follow-up action:
```

## Exit Criteria

The live validation pass is complete when:

- every provider-specific typed section that is marked `Typed` or `Partial` in [PROVIDERS.md](PROVIDERS.md) has at least one real-provider validation run
- known provider limitations are confirmed to behave as documented
- any provider-specific permission gaps or control-plane mismatches are written down before release
