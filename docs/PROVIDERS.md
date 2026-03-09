# Providers

S3Desk uses `rclone` underneath. A provider is considered supported when S3Desk exposes the required profile fields and the backend reports the relevant capabilities.

## Support Matrix

| Provider | Tier | Notes |
| --- | --- | --- |
| AWS S3 | Tier 1 | Standard AWS S3 support |
| S3-compatible | Tier 1 | For MinIO, Ceph RGW, and similar systems |
| Azure Blob Storage | Tier 1 | Container operations are surfaced as bucket-like flows in the UI |
| Google Cloud Storage | Tier 1 | Full core workflow support |
| OCI Object Storage | Tier 2 | Native OCI backend with lower automation coverage |

## Bucket Governance Support

Section status terms used below:

- `Typed`: provider-native controls are exposed directly in the governance modal.
- `Partial`: the section exists, but some fields remain raw JSON, provider-limited, or read-only.
- `Unsupported`: the current client does not expose that governance section for the provider.

| Provider | Access | Public exposure | Protection | Versioning | Encryption | Lifecycle | Sharing | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AWS S3 | Typed | Typed | Unsupported | Typed | Typed | Typed | Unsupported | Advanced raw bucket policy editing remains available. Object Lock is not part of the typed flow yet. |
| S3-compatible | Partial | Unsupported | Unsupported | Partial | Partial | Partial | Unsupported | Support is intentionally conservative because capability coverage varies across targets. |
| Azure Blob Storage | Partial | Typed | Partial | Typed | Unsupported | Unsupported | Unsupported | Stored access policies are still edited as raw JSON. Immutability editing requires Azure ARM credentials. Legal hold is surfaced but not released from this client. |
| Google Cloud Storage | Partial | Typed | Partial | Typed | Unsupported | Unsupported | Unsupported | IAM bindings are still edited as JSON. Uniform bucket-level access and retention are typed. |
| OCI Object Storage | Unsupported | Typed | Typed | Typed | Unsupported | Unsupported | Typed | Bucket visibility, multi-rule retention, and PAR create/delete are typed. Existing PARs are immutable in-place and must be deleted/recreated to change. |

## Common Profile Expectations

- `name`: human-readable label used in the UI
- `provider`: backend type
- `endpoint`: required for S3-compatible targets
- `region`: required where the provider expects it
- credentials: provider-specific access keys, tokens, or connection settings

Provider-specific requirements that matter in practice:

- Azure Blob: when `useEmulator=true` and `endpoint` is empty, S3Desk resolves the default emulator endpoint to `http://azurite:10000/<account>`.
- Azure Blob immutability editing: add `subscriptionId`, `resourceGroup`, `tenantId`, `clientId`, and `clientSecret` to the profile. Without them, immutability stays visible but read-only.
- GCS: `projectNumber` is required on profiles. Bucket list/create/delete and benchmark flows depend on it.
- GCS anonymous mode: IAM policy management is supported only when the profile has credentials, or when anonymous mode is paired with a custom endpoint that explicitly allows unauthenticated access.
- OCI Object Storage: the native backend requires `region`, `namespace`, and `compartment`.
- OCI Object Storage PARs: the full pre-authenticated request URL is only returned at create time. Existing PARs can be listed and deleted, but changing one requires delete + recreate.
- Azure Blob and GCS empty folders rely on explicit zero-byte `folder/` markers, with `rclone` directory markers enabled as a compatibility backstop.

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
- Use `oci_object_storage` when you need OCI namespace/compartment-aware access instead of the S3 compatibility layer
- OCI Object Storage empty folders are backed by hidden zero-byte marker objects so they remain visible after refresh without surfacing as normal files in object listings
- Azure Blob and GCS `Create folder` writes a zero-byte `folder/` marker object, and the generated `rclone` config also enables `directory_markers = true`
- Prefer Tier 1 providers when you need the most tested path, but OCI Object Storage now has smoke coverage for bucket CRUD, connectivity/benchmark flows, and folder marker visibility
