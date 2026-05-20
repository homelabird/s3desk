# Provider Live Validation Evidence

- Provider name:
- Bucket or container name:
- Profile identifier:
- S3Desk commit SHA or release tag:
- Exact feature tested:
- Command or manual workflow used:
- Actual outcome:
- API response body on failure:
- Provider-native console or CLI confirmation on success:
- Reviewer:
- Date:

## Notes

- Use disposable buckets or containers.
- Use non-production credentials.
- Use one of the supported provider names: AWS S3, GCS, Azure Blob, OCI Object Storage, MinIO, or Ceph.
- Fill `Bucket or container name`, `Profile identifier`, `Exact feature tested`, `Command or manual workflow used`, and `Provider-native console or CLI confirmation on success`; blank or placeholder values are rejected.
- Use `pass`, `passed`, `success`, `succeeded`, `ok`, or a `pass ...` phrase for a successful `Actual outcome`.
- Do not include provider secrets, API tokens, backup passwords, access keys, private keys, raw credential files, or signed URL signatures.
- Use `<redacted>` for any credential, token, or signature value that must be referenced for reviewer context.
- Replace `S3Desk commit SHA or release tag` with the release tag or commit SHA used for validation.
