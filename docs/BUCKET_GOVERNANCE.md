# Bucket Governance

This document keeps the current governance scope, the real-provider validation
workflow, and the remaining open gaps in one place.

## Current Status

Typed bucket governance is shipped for:

- AWS S3
- Google Cloud Storage
- Azure Blob Storage
- OCI Object Storage

Current implementation highlights:

- AWS S3: typed public exposure, object ownership, versioning, encryption, and lifecycle
- GCS: typed public exposure, uniform access, versioning, retention, and structured IAM bindings
- Azure Blob: typed anonymous access, stored access policies, versioning, soft delete, ARM-backed immutability editing, and legal-hold tag editing
- OCI Object Storage: typed visibility, versioning, multi-rule retention, and PAR create/delete flows
  - Versioning updates accept enabled or suspended; disabled is a read-only initial state. Once enabled, OCI versioning cannot be disabled.

Provider-by-provider operator limits and support notes stay in
[PROVIDERS.md](PROVIDERS.md).

## Live Validation Workflow

Use this pass after governance changes and before any release that changes
provider-facing bucket behavior.

Shared preconditions:

- Start from a disposable bucket or container per provider.
- Use non-production credentials.
- Record the exact profile used for the run.
- Capture API failures and provider-native confirmation for successful saves.

Recommended order:

1. AWS S3
2. Google Cloud Storage
3. Azure Blob Storage
4. OCI Object Storage
5. MinIO S3-compatible
6. Ceph S3-compatible

For release candidates, treat `python3 scripts/check_release_evidence.py --format checklist ...`
as the source of truth for the exact provider evidence required by the diff.

Use [ci/provider_live_validation.env.example](ci/provider_live_validation.env.example)
as the starting point for backend live-provider smoke variables.

### Shared Evidence To Capture

- Provider name
- Bucket or container name
- Profile identifier
- S3Desk commit SHA or release tag
- Exact feature tested
- API response body on failure
- Provider-native console or CLI confirmation on success

Use [PROVIDER_LIVE_VALIDATION_TEMPLATE.md](release/evidence/PROVIDER_LIVE_VALIDATION_TEMPLATE.md)
for release evidence files. Keep one completed record per affected provider.

### Minimal Backend Smoke

Run this low-cost provider-native listing smoke before the manual UI pass. The
canary fixture enables native listing so it does not silently test the rclone
fallback instead. It follows a continuation cursor when the test bucket has
more than one page of results:

```bash
cd backend
set -a
source ../docs/ci/provider_live_validation.env.example
set +a
go test ./internal/api -run '^(TestLiveValidationAwsS3|TestLiveValidationGcpGcs|TestLiveValidationAzureBlob|TestLiveValidationOciObjectStorage|TestLiveValidationMinioS3Compatible|TestLiveValidationCephS3Compatible)$' -count=1
```

### Provider Pass Focus

- AWS S3: public exposure, object ownership, versioning, encryption, lifecycle
- GCS: IAM bindings, public access prevention, uniform access, versioning, retention
- Azure Blob: anonymous access, stored access policies, soft delete, versioning, ARM-backed immutability, and legal-hold tags
- OCI Object Storage: visibility, versioning, retention rules, PAR create/delete

## Exit Criteria

Governance changes are release-ready only when all of the following are true:

- the affected providers were revalidated
- one evidence record exists per affected provider
- provider-native state matches what S3Desk reported
- any failure path includes the captured API body
- [CHANGELOG.md](../CHANGELOG.md) still calls out any relevant known limitation

## Remaining Gaps

The main open work is now narrower than the original rollout:

- real-provider validation evidence still needs to be recorded for release decisions
- OCI PAR editing is still a delete-and-recreate flow
- S3-compatible capability detection should be reviewed again after more live validation

For release readiness and evidence policy, see [RELEASE_GATE.md](RELEASE_GATE.md).

## Policy change audit events

Raw policy and typed governance PUT/DELETE requests emit `bucket.policy.change`
start/response events after token and profile authorization, using the existing
structured application logger. Configure log collection and retention for your deployment.
The shared API credential fingerprint identifies a credential, not an individual person.
Request/response bodies, query strings, credentials, and signed sharing URLs are excluded.

`audit_schema_version` describes the event format. `validation_rules_version`
identifies S3Desk's local policy checks; `app_version` identifies the application build
version. Bump `policyValidationRulesVersion` in `backend/internal/api/policy_audit.go`
when changing raw policy, typed governance, or their shared provider validators.
This rules version does not claim live provider validation.

`accepted_unverified` means a successful HTTP response, not independently confirmed
provider state. `unconfirmed`, or a start event without a response, requires state
inspection before retrying. Versioning changes additionally emit `bucket.policy.versioning.observation` with
before/requested/after statuses. `observed_match` confirms that a follow-up read matched
the requested status at that moment, not long-term enforcement or causality. A failed
initial read blocks the write; failed or mismatched readback returns an unconfirmed error.
Other sections still lack before/after observations, so audit coverage remains incomplete.

AWS encryption writes read the current rule and preserve `BlockedEncryptionTypes` on both SSE-S3 and SSE-KMS updates. SSE-KMS also preserves the explicit `BucketKeyEnabled` value. A failed or unrepresentable read blocks the update. This read/modify/write sequence does not provide a conditional-write guarantee against concurrent external updates.

The current KMS editor represents both SSE-KMS and DSSE-KMS in its KMS mode. For an existing DSSE-KMS bucket, saving in that mode preserves DSSE-KMS while applying the requested key. Selecting SSE-S3 explicitly changes the algorithm. Creating DSSE-KMS or switching DSSE-KMS to standard SSE-KMS is not exposed by this editor.

AWS lifecycle rule updates first read and preserve the existing `TransitionDefaultMinimumObjectSize` setting. An explicit no-configuration response permits creation; read failures block replacement. This prerequisite read does not eliminate concurrent external update races.
