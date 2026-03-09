# Providers

S3Desk uses `rclone` underneath. A provider is considered supported when S3Desk exposes the required profile fields and the backend reports the relevant capabilities.

## Support Matrix

| Provider | Tier | Notes |
| --- | --- | --- |
| AWS S3 | Tier 1 | Standard AWS S3 support |
| S3-compatible | Tier 1 | For MinIO, Ceph RGW, and similar systems |
| Azure Blob Storage | Tier 1 | Container operations are surfaced as bucket-like flows in the UI |
| Google Cloud Storage | Tier 1 | Full core workflow support |
| OCI S3-compatible | Tier 2 | Uses an S3-compatible endpoint |
| OCI Object Storage | Tier 2 | Native OCI backend with lower automation coverage |

## Common Profile Expectations

- `name`: human-readable label used in the UI
- `provider`: backend type
- `endpoint`: required for S3-compatible targets
- `region`: required where the provider expects it
- credentials: provider-specific access keys, tokens, or connection settings

Provider-specific requirements that matter in practice:

- Azure Blob: when `useEmulator=true` and `endpoint` is empty, S3Desk resolves the default emulator endpoint to `http://azurite:10000/<account>`.
- GCS: `projectNumber` is required on profiles. Bucket list/create/delete and benchmark flows depend on it.
- GCS anonymous mode: IAM policy management is supported only when the profile has credentials, or when anonymous mode is paired with a custom endpoint that explicitly allows unauthenticated access.
- OCI Object Storage: the native backend requires `region`, `namespace`, and `compartment`.

## Capability Model

The UI reads base provider capability flags from `/meta`, then applies profile-specific effective capabilities returned by profile APIs.

Core capability groups:

- Bucket/container CRUD
- Object CRUD
- Transfer jobs
- Policy management
- Presigned upload flows
- Direct upload support

If a capability is unavailable, the UI hides or disables the action and shows the reason returned by the backend. Profiles can also include validation issues for legacy or incomplete configuration that needs user action.

## Practical Guidance

- Use `aws_s3` for standard AWS accounts
- Use `s3_compatible` when you must provide a custom S3 endpoint
- Use `oci_s3_compat` only when your OCI environment is intentionally exposed through an S3-compatible endpoint
- Use `oci_object_storage` when you need OCI namespace/compartment-aware access instead of the S3 compatibility layer
- Prefer Tier 1 providers when you need the most tested path, but OCI Object Storage now has smoke coverage for bucket CRUD and connectivity/benchmark flows
