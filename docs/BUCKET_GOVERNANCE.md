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
- Azure Blob: typed anonymous access, stored access policies, versioning, soft delete, and ARM-backed immutability editing
- OCI Object Storage: typed visibility, versioning, multi-rule retention, and PAR create/delete flows

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

### Minimal Backend Smoke

Run this low-cost provider smoke before the manual UI pass:

```bash
cd backend
set -a
source ../docs/ci/provider_live_validation.env.example
set +a
go test ./internal/api -run 'TestLiveValidation(AwsS3|GcpGcs|AzureBlob|OciObjectStorage|MinioS3Compatible|CephS3Compatible)$'
```

### Provider Pass Focus

- AWS S3: public exposure, object ownership, versioning, encryption, lifecycle
- GCS: IAM bindings, public access prevention, uniform access, versioning, retention
- Azure Blob: anonymous access, stored access policies, soft delete, versioning, ARM-backed immutability
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
- Azure legal hold remains read-only in the typed UI
- OCI PAR editing is still a delete-and-recreate flow
- S3-compatible capability detection should be reviewed again after more live validation

For release readiness and evidence policy, see [RELEASE_GATE.md](RELEASE_GATE.md).
