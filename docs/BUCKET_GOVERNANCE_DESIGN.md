# Bucket Governance Design Draft

## Status

This document now mixes shipped governance behavior with forward-looking design notes.

Current implementation snapshot as of 2026-03-10:

- AWS S3: typed access, public exposure, versioning, encryption, and lifecycle controls are shipped.
- Google Cloud Storage: typed public exposure, uniform access, versioning, and retention are shipped; IAM bindings remain a JSON-backed editor.
- Azure Blob: typed anonymous access, stored access policy flow, versioning, soft delete, and ARM-backed container immutability are shipped.
- OCI Object Storage: typed bucket visibility, versioning, multi-rule retention, and pre-authenticated request controls are shipped.
- Provider-by-provider operator guidance now lives in [`docs/PROVIDERS.md`](PROVIDERS.md).
- Real cloud validation remains the main open rollout task.

This document covers:

- API design draft
- proposed capability enum
- UI information architecture
- phased implementation plan
- backend issue list
- frontend issue list
- OpenAPI rollout order
- Phase 1 AWS MVP spec

## Problem

The current product model is too narrow for provider-aware bucket control.

Today, S3Desk exposes:

- bucket CRUD
- raw S3 bucket policy editing
- GCS IAM policy editing
- Azure container ACL editing

That is not enough to represent provider best practices for secure bucket management.

Current limitations in the codebase:

- bucket create accepts only `name` and `region`: [`backend/internal/models/models.go`](/home/homelab/Downloads/project/s3desk/backend/internal/models/models.go#L257)
- provider policy APIs are collapsed into one `policy` object contract: [`backend/internal/models/models.go`](/home/homelab/Downloads/project/s3desk/backend/internal/models/models.go#L262)
- capability flags are too coarse for fine-grained UI gating: [`backend/internal/api/profile_capabilities.go`](/home/homelab/Downloads/project/s3desk/backend/internal/api/profile_capabilities.go#L24)
- the bucket page exposes a single `Policy` action instead of a broader control surface: [`frontend/src/pages/BucketsPage.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/BucketsPage.tsx#L166)
- the current modal is policy-centric, not governance-centric: [`frontend/src/pages/buckets/BucketPolicyModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx#L150)

## Goals

- model bucket controls as typed governance features instead of a single raw policy blob
- expose provider best-practice controls directly in the UI
- preserve advanced raw policy editing where it still makes sense
- support capability-based rendering for AWS S3, S3-compatible, GCS, Azure Blob, and OCI native
- allow secure defaults during bucket creation, not only after creation

## Non-goals

- full parity with every provider-specific control-plane feature in the first release
- vendor-specific features for every S3-compatible system
- replacing provider IAM authoring outside bucket scope

## Provider Baseline

The redesign should target these first-class controls.

### AWS S3

Primary controls:

- Block Public Access
- Object Ownership
- bucket policy
- versioning
- default encryption
- lifecycle
- optional later: Object Lock

Best-practice direction:

- block public access by default
- prefer bucket-owner-enforced ownership and disabled ACLs
- keep raw bucket policy editing as an advanced feature, not the only feature

Official docs:

- https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html

### Google Cloud Storage

Primary controls:

- IAM bindings
- IAM etag preservation
- Uniform bucket-level access
- Public Access Prevention
- versioning
- retention
- lifecycle
- optional later: CMEK

Best-practice direction:

- treat IAM as the primary access model
- prefer uniform bucket-level access
- expose Public Access Prevention as an explicit control

Official docs:

- https://cloud.google.com/storage/docs/uniform-bucket-level-access
- https://cloud.google.com/storage/docs/public-access-prevention
- https://cloud.google.com/storage/docs/lifecycle

### Azure Blob

Primary controls:

- container public access
- stored access policies
- versioning
- soft delete
- container immutability

Best-practice direction:

- keep containers private by default
- warn that Microsoft recommends identity-based access over Shared Key and broad anonymous access
- treat stored access policy and sharing flows separately from base access controls

Official docs:

- https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-configure
- https://learn.microsoft.com/en-us/azure/storage/blobs/authorize-access-azure-active-directory
- https://learn.microsoft.com/en-us/rest/api/storageservices/set-container-acl
- https://learn.microsoft.com/en-us/azure/storage/common/storage-sas-overview

### OCI Object Storage

Primary controls:

- bucket visibility
- pre-authenticated requests
- versioning
- retention rules
- lifecycle and encryption as later work

Best-practice direction:

- do not force OCI native into the S3 bucket policy model
- model public exposure and share links separately

Official docs:

- https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/managingbuckets.htm
- https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingpreauthenticatedrequests.htm
- https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/objectstoragepolicyreference.htm

### S3-compatible

Primary controls:

- S3 bucket policy where supported
- versioning where supported
- default encryption where supported

Best-practice direction:

- do not assume AWS-only features exist everywhere
- gate advanced controls per capability
- keep raw policy editing available for compatibility targets

## Proposed Domain Model

Replace the current `bucket policy` mental model with `bucket governance`.

Top-level areas:

- `access`
- `publicExposure`
- `protection`
- `versioning`
- `encryption`
- `lifecycle`
- `sharing`
- `advanced`

Proposed normalized shape:

```ts
type BucketGovernanceView = {
  provider: ProfileProvider
  bucket: string
  capabilities: BucketGovernanceCapabilities
  access?: BucketAccessView
  publicExposure?: BucketPublicExposureView
  protection?: BucketProtectionView
  versioning?: BucketVersioningView
  encryption?: BucketEncryptionView
  lifecycle?: BucketLifecycleView
  sharing?: BucketSharingView
  advanced?: BucketAdvancedView
  warnings?: string[]
}
```

The normalized view is for UI rendering only. Provider adapters remain responsible for mapping to provider-native APIs.

## Proposed Capability Enum

Provider capability flags should move from a few booleans to a typed enum-like set.

```ts
export type BucketGovernanceCapability =
  | 'bucket_access_raw_policy'
  | 'bucket_access_bindings'
  | 'bucket_access_public_toggle'
  | 'bucket_access_acl_reset'
  | 'bucket_public_access_block'
  | 'bucket_public_access_prevention'
  | 'bucket_uniform_access'
  | 'bucket_object_ownership'
  | 'bucket_versioning'
  | 'bucket_default_encryption'
  | 'bucket_lifecycle'
  | 'bucket_retention'
  | 'bucket_object_lock'
  | 'bucket_soft_delete'
  | 'bucket_immutability'
  | 'bucket_stored_access_policy'
  | 'bucket_par'
  | 'bucket_sas_policy'
  | 'bucket_cmek'
```

Suggested backend representation:

```go
type BucketGovernanceCapability string

type BucketGovernanceCapabilityState struct {
    Enabled bool   `json:"enabled"`
    Reason  string `json:"reason,omitempty"`
}

type BucketGovernanceCapabilities map[BucketGovernanceCapability]BucketGovernanceCapabilityState
```

This should live alongside provider capability metadata, then flow into:

- `/meta`
- profile-effective capabilities
- bucket governance response

## API Design Draft

### Design Rules

- keep raw policy editing only for advanced flows
- use typed subresources for normal UI controls
- return provider-specific unsupported reasons at field level
- avoid one huge `PUT /settings` payload that forces every provider into the same schema

### Recommended Endpoints

#### 1. Governance Summary

```http
GET /api/v1/buckets/{bucket}/governance
```

Returns a normalized view for UI rendering.

Example response:

```json
{
  "provider": "aws_s3",
  "bucket": "media-prod",
  "capabilities": {
    "bucket_public_access_block": { "enabled": true },
    "bucket_object_ownership": { "enabled": true },
    "bucket_access_raw_policy": { "enabled": true },
    "bucket_versioning": { "enabled": true },
    "bucket_default_encryption": { "enabled": true }
  },
  "publicExposure": {
    "mode": "private",
    "blockPublicAccess": {
      "blockPublicAcls": true,
      "ignorePublicAcls": true,
      "blockPublicPolicy": true,
      "restrictPublicBuckets": true
    }
  },
  "versioning": {
    "status": "enabled"
  },
  "advanced": {
    "rawPolicySupported": true
  }
}
```

#### 2. Access Controls

```http
GET    /api/v1/buckets/{bucket}/governance/access
PUT    /api/v1/buckets/{bucket}/governance/access
POST   /api/v1/buckets/{bucket}/governance/access/validate
```

Provider mapping:

- AWS/S3-compatible: bucket policy, object ownership where applicable
- GCS: IAM bindings plus etag
- Azure: public access plus stored access policy references
- OCI: visibility guidance only in the first phase

#### 3. Public Exposure Controls

```http
GET /api/v1/buckets/{bucket}/governance/public-exposure
PUT /api/v1/buckets/{bucket}/governance/public-exposure
```

Provider mapping:

- AWS: Block Public Access
- GCS: Public Access Prevention
- Azure: public access level
- OCI: bucket visibility

#### 4. Protection Controls

```http
GET /api/v1/buckets/{bucket}/governance/protection
PUT /api/v1/buckets/{bucket}/governance/protection
```

Provider mapping:

- AWS: Object Ownership, later Object Lock
- GCS: retention and bucket lock
- Azure: immutability, soft delete, versioning when available
- OCI: retention rules

#### 5. Versioning

```http
GET /api/v1/buckets/{bucket}/governance/versioning
PUT /api/v1/buckets/{bucket}/governance/versioning
```

#### 6. Encryption

```http
GET /api/v1/buckets/{bucket}/governance/encryption
PUT /api/v1/buckets/{bucket}/governance/encryption
```

#### 7. Lifecycle

```http
GET /api/v1/buckets/{bucket}/governance/lifecycle
PUT /api/v1/buckets/{bucket}/governance/lifecycle
POST /api/v1/buckets/{bucket}/governance/lifecycle/validate
```

#### 8. Sharing

```http
GET /api/v1/buckets/{bucket}/governance/sharing
PUT /api/v1/buckets/{bucket}/governance/sharing
```

Provider mapping:

- Azure: SAS policy guidance and stored access policy support
- OCI: pre-authenticated request support
- AWS/GCS: later if signed-share workflows move into bucket scope

#### 9. Raw Advanced Policy

Keep and rename the existing API contract conceptually:

```http
GET    /api/v1/buckets/{bucket}/advanced/raw-policy
PUT    /api/v1/buckets/{bucket}/advanced/raw-policy
DELETE /api/v1/buckets/{bucket}/advanced/raw-policy
POST   /api/v1/buckets/{bucket}/advanced/raw-policy/validate
```

This is a better long-term contract than continuing to make `/policy` mean different things for different providers.

### Bucket Create API Extension

Bucket create should accept optional secure defaults.

```json
{
  "name": "media-prod",
  "region": "ap-northeast-2",
  "defaults": {
    "publicExposure": "private",
    "versioning": "enabled",
    "defaultEncryption": "provider_managed",
    "uniformAccess": true,
    "blockPublicAccess": true
  }
}
```

Rules:

- unsupported defaults are rejected with field-specific reasons
- default values should be provider-aware
- first UI release can keep this optional and fall back to post-create application

## OpenAPI Changes

Required changes:

- add governance schemas
- keep existing `/policy` contract for migration only
- add capability schemas for governance feature states
- update generated frontend types

Suggested schema groups:

- `BucketGovernanceView`
- `BucketAccessView`
- `BucketPublicExposureView`
- `BucketProtectionView`
- `BucketVersioningView`
- `BucketEncryptionView`
- `BucketLifecycleView`
- `BucketSharingView`
- `BucketGovernanceCapabilityState`

### OpenAPI Change Order

Apply changes in this order to avoid breaking generated clients and existing `/policy` consumers.

1. Add shared governance schemas first.
   Scope:
   - `BucketGovernanceCapabilityState`
   - `BucketGovernanceCapabilities`
   - `BucketGovernanceView`
   - section-level read models
2. Add provider-neutral request schemas for the Phase 1 AWS controls.
   Scope:
   - `BucketPublicExposurePutRequest`
   - `BucketAccessPutRequest`
   - `BucketVersioningPutRequest`
   - `BucketEncryptionPutRequest`
3. Add new governance read endpoints before changing any existing route semantics.
   Scope:
   - `GET /buckets/{bucket}/governance`
   - `GET` endpoints for each new subresource
4. Add new governance write endpoints for AWS MVP.
   Scope:
   - `PUT /buckets/{bucket}/governance/public-exposure`
   - `PUT /buckets/{bucket}/governance/access`
   - `PUT /buckets/{bucket}/governance/versioning`
   - `PUT /buckets/{bucket}/governance/encryption`
5. Regenerate frontend OpenAPI types and update the typed API client immediately after the new routes land.
6. Keep existing `/buckets/{bucket}/policy` routes unchanged during the first migration wave.
7. Only after the new controls UI ships, reclassify `/policy` in docs and UI as `advanced`.
8. Extend `BucketCreateRequest` with optional secure defaults after the AWS typed controls stabilize.

### OpenAPI Phase 1 AWS Schemas

Recommended minimal Phase 1 AWS write models:

```yaml
BucketPublicExposurePutRequest:
  type: object
  required: [mode, blockPublicAccess]
  properties:
    mode:
      type: string
      enum: [private, public]
    blockPublicAccess:
      type: object
      required: [blockPublicAcls, ignorePublicAcls, blockPublicPolicy, restrictPublicBuckets]
      properties:
        blockPublicAcls: { type: boolean }
        ignorePublicAcls: { type: boolean }
        blockPublicPolicy: { type: boolean }
        restrictPublicBuckets: { type: boolean }

BucketAccessPutRequest:
  type: object
  properties:
    objectOwnership:
      type: string
      enum: [bucket_owner_enforced, bucket_owner_preferred, object_writer]

BucketVersioningPutRequest:
  type: object
  required: [status]
  properties:
    status:
      type: string
      enum: [enabled, suspended]

BucketEncryptionPutRequest:
  type: object
  required: [mode]
  properties:
    mode:
      type: string
      enum: [sse_s3, sse_kms]
    kmsKeyId:
      type: string
```

## Backend Architecture

### Current Limitation

The current switch-based policy handling is not sustainable for broader governance support:

- [`backend/internal/api/handlers_bucket_policy.go`](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_bucket_policy.go#L115)
- [`backend/internal/s3policy/s3policy.go`](/home/homelab/Downloads/project/s3desk/backend/internal/s3policy/s3policy.go#L32)
- [`backend/internal/gcsiam/gcsiam.go`](/home/homelab/Downloads/project/s3desk/backend/internal/gcsiam/gcsiam.go#L35)
- [`backend/internal/azureacl/azureacl.go`](/home/homelab/Downloads/project/s3desk/backend/internal/azureacl/azureacl.go#L35)

### Proposed Adapter Split

Create provider adapters by concern, not by one giant policy package.

Suggested package structure:

- `backend/internal/bucketgov/types.go`
- `backend/internal/bucketgov/service.go`
- `backend/internal/bucketgov/validate.go`
- `backend/internal/bucketgov/aws_access.go`
- `backend/internal/bucketgov/aws_public_exposure.go`
- `backend/internal/bucketgov/aws_versioning.go`
- `backend/internal/bucketgov/aws_encryption.go`
- `backend/internal/bucketgov/aws_lifecycle.go`
- `backend/internal/bucketgov/gcs_access.go`
- `backend/internal/bucketgov/gcs_public_exposure.go`
- `backend/internal/bucketgov/gcs_protection.go`
- `backend/internal/bucketgov/azure_access.go`
- `backend/internal/bucketgov/azure_sharing.go`
- `backend/internal/bucketgov/oci_access.go`
- `backend/internal/bucketgov/oci_sharing.go`

Service interface:

```go
type BucketGovernanceProvider interface {
    GetGovernance(ctx context.Context, profile models.ProfileSecrets, bucket string) (bucketgov.View, error)
    GetAccess(ctx context.Context, profile models.ProfileSecrets, bucket string) (bucketgov.AccessView, error)
    PutAccess(ctx context.Context, profile models.ProfileSecrets, bucket string, req bucketgov.PutAccessRequest) error
    GetProtection(ctx context.Context, profile models.ProfileSecrets, bucket string) (bucketgov.ProtectionView, error)
    PutProtection(ctx context.Context, profile models.ProfileSecrets, bucket string, req bucketgov.PutProtectionRequest) error
}
```

The service layer should own:

- capability filtering
- normalized error mapping
- provider-specific warnings
- read-model composition for the frontend

## UI Information Architecture

### Replace

- one `Policy` modal

### With

- one `Bucket controls` entry point
- one page or large drawer with provider-aware sections
- one advanced raw policy editor tab where supported

### Recommended IA

#### Entry

Buckets table actions:

- `Controls`
- `Advanced policy` only when raw policy is supported

#### Bucket Controls Screen

Common top summary:

- provider
- bucket name
- security posture badge
- warnings

Tabs or sections:

1. `Access`
2. `Exposure`
3. `Protection`
4. `Versioning`
5. `Encryption`
6. `Lifecycle`
7. `Sharing`
8. `Advanced`

### Rendering Rules

- render sections from backend capabilities, not from frontend hardcoded provider checks
- use provider-aware field groups inside a common section shell
- show unsupported reasons inline per section
- keep advanced JSON editors behind a secondary tab

### Example Mapping

#### AWS S3

- Access: raw bucket policy, object ownership
- Exposure: Block Public Access
- Versioning
- Encryption
- Lifecycle
- Advanced: raw bucket policy JSON

#### GCS

- Access: IAM bindings, etag
- Exposure: Public Access Prevention
- Protection: Uniform bucket-level access, retention
- Versioning
- Lifecycle
- Advanced: raw IAM JSON only if retained for power users

#### Azure

- Access: public access level
- Sharing: stored access policies
- Protection: later immutability, soft delete
- Versioning

#### OCI

- Exposure: visibility
- Sharing: pre-authenticated requests
- Protection: retention
- Versioning

## Preset Strategy

Current presets are policy-only: [`frontend/src/pages/buckets/policyPresets.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/policyPresets.ts#L40)

Replace with governance presets:

- `secure-private`
- `public-static-content`
- `application-readwrite`
- `readonly-share`
- `retention-protected`

Preset behavior:

- map to multiple sections, not one JSON blob
- mark fields that require confirmation
- show provider-specific diffs before apply

## Migration Strategy

### Phase 0

- keep current `/policy` working
- add new governance read models
- map old UI to the old API

### Historical Phase 1

- shipped `Bucket controls` UI for AWS S3 first
- kept the raw policy modal available as an advanced path

### Historical Phase 2

- shipped GCS and Azure typed sections
- demoted old provider-specific policy flows behind the governance modal where possible

### Historical Phase 3

- shipped OCI native typed sections
- kept `/policy` as an advanced-only path where raw policy still makes sense

### Current Phase 4

- finish real-provider validation
- close the remaining provider-specific UX gaps
- decide whether any direct `/policy` entry points should be further reduced after validation

## Phase Plan

| Phase | Scope | Backend | Frontend | Tests | Current status |
| --- | --- | --- | --- | --- | --- |
| 1 | Domain model and capability split | Add governance types and capability states | No major UI change | Unit tests for capability resolution | Shipped |
| 2 | AWS S3 typed controls | Add public exposure, ownership, versioning, encryption endpoints | Add `Bucket controls` screen for AWS | Contract tests and live AWS or MinIO-compatible tests where applicable | Shipped |
| 3 | GCS typed controls | Add IAM view, uniform access, public access prevention, versioning | Add GCS controls UI | Static and live GCS tests | Shipped, with IAM conditions still using JSON fragments |
| 4 | Azure typed controls | Add public access, stored access policies, versioning hooks | Add Azure controls UI | Static and live Azure tests | Shipped, with legal hold still read-only |
| 5 | OCI native controls | Add visibility, PAR, retention, versioning | Add OCI-specific sections | OCI smoke and contract tests | Shipped, with PAR replacement still delete-and-recreate |
| 6 | Create-time secure defaults | Extend bucket create request and backend application flow | Add defaults in create bucket flow | End-to-end create-and-verify tests | Not started |

## Backend Issue List

Use these as the initial backend execution backlog.

Current status snapshot:

- shipped: `BG-BE-01` through `BG-BE-11`
- open: `BG-BE-12`
- additional post-rollout validation work now lives in [BUCKET_GOVERNANCE_LIVE_VALIDATION.md](BUCKET_GOVERNANCE_LIVE_VALIDATION.md)

| ID | Title | Purpose | Main files | Depends on | Done when |
| --- | --- | --- | --- | --- | --- |
| BG-BE-01 | Add governance core types | Introduce normalized governance models and fine-grained capability states. | `backend/internal/models/models.go`, new `backend/internal/bucketgov/types.go` | none | Models compile, OpenAPI targets are clear, no behavior change yet |
| BG-BE-02 | Expand provider capability model | Replace coarse policy booleans with governance capability states in `/meta` and profile-effective capabilities. | `backend/internal/api/profile_capabilities.go`, `backend/internal/models/models.go`, `backend/internal/api/handlers_meta_test.go` | BG-BE-01 | `/meta` exposes new governance capability map with reasons |
| BG-BE-03 | Add governance service and provider registry | Create the core service that resolves provider adapters and builds normalized bucket governance views. | new `backend/internal/bucketgov/service.go`, new `backend/internal/bucketgov/registry.go` | BG-BE-01 | Handlers can request a governance view without switch-heavy logic |
| BG-BE-04 | Add governance summary endpoint | Ship `GET /buckets/{bucket}/governance` for AWS MVP with normalized read model. | `backend/internal/api/api.go`, new `backend/internal/api/handlers_bucket_governance.go`, `openapi.yml` | BG-BE-02, BG-BE-03 | AWS bucket returns summary view with capability map and section payloads |
| BG-BE-05 | Implement AWS public exposure adapter | Support S3 Block Public Access read/write. | new `backend/internal/bucketgov/aws_public_exposure.go` | BG-BE-03 | GET/PUT public exposure works and maps provider errors cleanly |
| BG-BE-06 | Implement AWS access adapter | Support S3 Object Ownership and advertise raw policy advanced support. | new `backend/internal/bucketgov/aws_access.go`, existing `backend/internal/s3policy/s3policy.go` | BG-BE-03 | GET/PUT access returns object ownership state and advanced policy affordance |
| BG-BE-07 | Implement AWS versioning adapter | Support S3 bucket versioning read/write. | new `backend/internal/bucketgov/aws_versioning.go` | BG-BE-03 | GET/PUT versioning supports `enabled` and `suspended` |
| BG-BE-08 | Implement AWS encryption adapter | Support default bucket encryption read/write for `sse_s3` and `sse_kms`. | new `backend/internal/bucketgov/aws_encryption.go` | BG-BE-03 | GET/PUT encryption returns mode and optional KMS key id |
| BG-BE-09 | Normalize governance validation and error mapping | Add request validation and field-level reasons for unsupported settings. | new `backend/internal/bucketgov/validate.go`, API handler helpers | BG-BE-05, BG-BE-06, BG-BE-07, BG-BE-08 | Invalid requests fail with stable API errors and actionable detail fields |
| BG-BE-10 | Add Phase 1 backend tests | Add contract tests and targeted live coverage for new AWS endpoints. | new `backend/internal/api/handlers_bucket_governance_test.go`, related bucketgov tests | BG-BE-04 through BG-BE-09 | New handlers have unit tests and at least one live happy-path matrix |
| BG-BE-11 | Add AWS lifecycle adapter | Add lifecycle only after the rest of AWS MVP stabilizes. | new `backend/internal/bucketgov/aws_lifecycle.go` | BG-BE-10 | Lifecycle rules can be read and updated with explicit validation |
| BG-BE-12 | Extend bucket create with secure defaults | Allow create-time governance defaults once the typed controls are stable. | `backend/internal/models/models.go`, `backend/internal/api/handlers_buckets.go`, `openapi.yml` | BG-BE-05 through BG-BE-10 | Bucket create can optionally apply supported defaults without breaking current clients |

### Backend Priority

- historical Phase 1 AWS MVP: `BG-BE-01` through `BG-BE-10`
- historical Phase 1.1: `BG-BE-11`
- current open backlog: `BG-BE-12`

## Frontend Issue List

Use these as the initial frontend execution backlog.

Current status snapshot:

- shipped: `BG-FE-01` through `BG-FE-11`
- open: `BG-FE-12`
- provider-specific UX refinement now continues outside the original phase table

| ID | Title | Purpose | Main files | Depends on | Done when |
| --- | --- | --- | --- | --- | --- |
| BG-FE-01 | Regenerate governance types and client methods | Add typed client support for governance endpoints. | `frontend/src/api/openapi.ts`, `frontend/src/api/types.ts`, `frontend/src/api/client.ts` | OpenAPI schema merge | Client exposes governance read/write methods with typed payloads |
| BG-FE-02 | Expand capability normalization | Teach the frontend how to consume governance capability states from `/meta` and profiles. | `frontend/src/lib/providerCapabilities.ts` | BG-BE-02 | UI can gate each section independently with provider reason text |
| BG-FE-03 | Add bucket controls entry point | Replace the single `Policy` mental model with a `Controls` entry point on the buckets page. | `frontend/src/pages/BucketsPage.tsx` | BG-FE-01, BG-FE-02 | Buckets UI can open typed controls without removing old advanced policy access |
| BG-FE-04 | Add bucket controls shell | Add the common page or drawer shell for provider-aware governance sections. | new `frontend/src/pages/buckets/BucketControlsPage.tsx` or `BucketControlsDrawer.tsx` | BG-FE-03 | Shared shell renders summary, warnings, tabs, and save flows |
| BG-FE-05 | Implement AWS public exposure section | Add UI for S3 Block Public Access flags and safety warnings. | new `frontend/src/pages/buckets/controls/AwsPublicExposureSection.tsx` | BG-FE-04 | User can view and update all four BPA flags |
| BG-FE-06 | Implement AWS access section | Add UI for Object Ownership and advanced raw policy entry point. | new `frontend/src/pages/buckets/controls/AwsAccessSection.tsx`, existing `BucketPolicyModal.tsx` | BG-FE-04 | User can manage object ownership and still reach raw policy editing |
| BG-FE-07 | Implement AWS versioning section | Add UI for enabling and suspending bucket versioning. | new `frontend/src/pages/buckets/controls/AwsVersioningSection.tsx` | BG-FE-04 | Versioning state round-trips correctly |
| BG-FE-08 | Implement AWS encryption section | Add UI for default encryption mode and optional KMS key input. | new `frontend/src/pages/buckets/controls/AwsEncryptionSection.tsx` | BG-FE-04 | Encryption state round-trips correctly with local validation |
| BG-FE-09 | Reclassify old policy modal as advanced | Keep the current raw editor, but move it behind an advanced affordance. | `frontend/src/pages/buckets/BucketPolicyModal.tsx`, `frontend/src/pages/BucketsPage.tsx` | BG-FE-06 | Raw policy editing still works without being the default UI |
| BG-FE-10 | Add frontend test coverage for AWS controls | Add component, capability, and end-to-end tests for the new screen. | new bucket control tests, `frontend/tests/*` | BG-FE-05 through BG-FE-09 | AWS controls have unit coverage and at least one end-to-end happy path |
| BG-FE-11 | Add AWS lifecycle section | Add lifecycle UI after the AWS MVP is stable. | new `frontend/src/pages/buckets/controls/AwsLifecycleSection.tsx` | BG-FE-10 | Lifecycle rules are editable in a typed flow |
| BG-FE-12 | Add create-bucket defaults UI | Extend bucket creation flow with secure default toggles. | `frontend/src/pages/buckets/BucketModal.tsx` | BG-BE-12, BG-FE-10 | New bucket modal can apply provider-aware defaults |

### Frontend Priority

- historical Phase 1 AWS MVP: `BG-FE-01` through `BG-FE-10`
- historical Phase 1.1: `BG-FE-11`
- current open backlog: `BG-FE-12`

## Phase 1 AWS MVP Spec

Phase 1 is the first typed governance release. It should be intentionally smaller than full AWS parity.

### Scope

Target provider:

- `aws_s3` required

Optional capability-gated support:

- `s3_compatible` where the adapter confirms support

In scope:

- governance summary
- S3 Block Public Access
- Object Ownership
- bucket versioning
- default bucket encryption
- advanced raw bucket policy editing preserved

Out of scope:

- lifecycle editing
- Object Lock
- replication
- logging and metrics configuration
- intelligent tiering
- create-time secure defaults
- provider-side recommendation engines

### Phase 1 AWS Endpoints

Required new routes:

```http
GET /api/v1/buckets/{bucket}/governance
GET /api/v1/buckets/{bucket}/governance/public-exposure
PUT /api/v1/buckets/{bucket}/governance/public-exposure
GET /api/v1/buckets/{bucket}/governance/access
PUT /api/v1/buckets/{bucket}/governance/access
GET /api/v1/buckets/{bucket}/governance/versioning
PUT /api/v1/buckets/{bucket}/governance/versioning
GET /api/v1/buckets/{bucket}/governance/encryption
PUT /api/v1/buckets/{bucket}/governance/encryption
```

Existing route kept for compatibility:

```http
GET    /api/v1/buckets/{bucket}/policy
PUT    /api/v1/buckets/{bucket}/policy
DELETE /api/v1/buckets/{bucket}/policy
POST   /api/v1/buckets/{bucket}/policy/validate
```

### Phase 1 AWS UI

Buckets page actions:

- `Controls`
- `Advanced policy`

Controls screen sections:

1. `Exposure`
   Scope:
   - all four Block Public Access flags
   - one-click secure preset to turn all four on
   - warning when any public access guard is off
2. `Access`
   Scope:
   - Object Ownership selector
   - advanced raw policy shortcut
   - explanation that ACL-free ownership is preferred
3. `Versioning`
   Scope:
   - current status
   - enable or suspend actions
4. `Encryption`
   Scope:
   - current mode
   - `SSE-S3` and `SSE-KMS`
   - optional KMS key input when `SSE-KMS` is selected
5. `Advanced`
   Scope:
   - launch existing raw policy editor

### Phase 1 AWS UX Rules

- `Controls` is the default entry point for AWS buckets
- `Advanced policy` is secondary and labeled as advanced
- the screen must show capability reasons when a section is unavailable
- each section should have local validation before sending write requests
- each section should show provider warnings when the chosen state is less secure than the recommended default

### Phase 1 AWS Security Defaults

Recommended preset shown in UI:

- Block Public Access: all four flags `true`
- Object Ownership: `bucket_owner_enforced`
- Versioning: `enabled`
- Encryption: `sse_s3` minimum, encourage `sse_kms` when the environment has a managed key policy

### Phase 1 AWS Acceptance Criteria

- an `aws_s3` profile shows a `Controls` action on the buckets page
- `GET /governance` returns a normalized summary for an AWS bucket
- the user can read and update S3 Block Public Access from the UI
- the user can read and update Object Ownership from the UI
- the user can read and update versioning from the UI
- the user can read and update default encryption from the UI
- the existing raw policy editor still works for advanced users
- provider capability gating prevents unsupported controls from rendering for non-AWS providers
- backend and frontend tests cover at least one successful round-trip per Phase 1 section

### Phase 1 AWS Exit Criteria

Phase 1 AWS MVP is complete when:

- backend issues `BG-BE-01` through `BG-BE-10` are done
- frontend issues `BG-FE-01` through `BG-FE-10` are done
- OpenAPI has been regenerated and committed
- old `/policy` routes remain operational
- the controls screen is stable enough to become the primary AWS bucket management entry point

### Phase 1 AWS Follow-ups

Next AWS steps after MVP:

- lifecycle rules
- object lock
- create-time secure defaults
- risk scoring or configuration posture summaries

## Suggested File-Level Changes

Backend:

- `backend/internal/models/models.go`
- `backend/internal/api/profile_capabilities.go`
- `backend/internal/api/api.go`
- `backend/internal/api/handlers_buckets.go`
- `openapi.yml`
- new `backend/internal/bucketgov/*`

Frontend:

- `frontend/src/lib/providerCapabilities.ts`
- `frontend/src/api/client.ts`
- `frontend/src/api/openapi.ts`
- `frontend/src/pages/BucketsPage.tsx`
- replace or reduce `frontend/src/pages/buckets/BucketPolicyModal.tsx`
- add `frontend/src/pages/buckets/BucketControlsPage.tsx` or `BucketControlsDrawer.tsx`

Tests:

- `backend/internal/api/*go`
- `frontend/src/pages/buckets/__tests__/*`
- `frontend/tests/bucket-governance-live.spec.ts`

## Risks

- trying to unify all providers into one write schema will recreate the current problem
- S3-compatible providers may report partial support, so capability discovery must be strict
- OCI native should not be forced into AWS semantics
- create-time secure defaults may require multi-step apply flows for some providers

## Recommendation

Start with AWS S3 typed controls while keeping raw policy editing intact.

That sequence gives:

- the strongest immediate security improvement
- the clearest UI model
- the best base for GCS and Azure adaptation

After AWS, move to GCS and Azure. OCI native should remain a separate track because its governance model is structurally different from S3 policy editing.
