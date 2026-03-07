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

## Capability Model

The UI reads capability flags from `/meta` and enables or disables features accordingly.

Core capability groups:

- Bucket/container CRUD
- Object CRUD
- Transfer jobs
- Policy management
- Presigned upload flows
- Direct upload support

If a capability is unavailable, the UI hides or disables the action and shows the reason returned by the backend.

## Practical Guidance

- Use `aws_s3` for standard AWS accounts
- Use `s3_compatible` when you must provide a custom S3 endpoint
- Use `oci_s3_compat` only when your OCI environment is intentionally exposed through an S3-compatible endpoint
- Use OCI native `authProvider` values only from the supported OCI SDK set: `user_principal`, `instance_principal`, or `resource_principal`
- Prefer Tier 1 providers when you need the most tested path

## Best-Practice Review Notes

- **AWS S3**: direct SDK operations now keep TLS 1.2 as the minimum and can apply profile-level custom CA / mTLS settings, matching the stricter paths already used elsewhere in the backend.
- **Google Cloud Storage**: authenticated access is based on a service account JSON key; anonymous access is intentionally limited to explicit custom endpoints such as emulators.
- **Azure Blob Storage**: direct REST operations use TLS 1.2 minimum by default and support profile TLS overrides for custom CA / mTLS scenarios.
- **OCI Object Storage**: native OCI profiles now validate `authProvider` against the supported OCI SDK auth modes before saving or rendering the rclone configuration.
