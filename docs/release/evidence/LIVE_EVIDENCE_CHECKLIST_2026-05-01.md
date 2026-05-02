# Live Evidence Checklist - 2026-05-01

This checklist captures the live evidence still required by the current changed file set. Do not record API tokens, authorization header values, cookie token values, access keys, secret keys, service account JSON, private keys, or signed URL signatures in committed evidence.

## Current Status

- Status: `blocked`
- Provider evidence required: `aws`, `gcs`, `azure`, `oci`, `minio`, `ceph`
- Reverse-proxy smoke evidence required: `yes`
- Latest preflight result: blocked; rechecked on 2026-05-01, and all provider and reverse-proxy required variables were still missing in the local environment.
- Latest strict evidence audit: blocked for `rc1`; no provider or reverse-proxy evidence files were detected.
- Final gate for current candidate: `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id rc1`
- Latest local candidate check: `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id rc1` exits blocked until the provider and reverse-proxy evidence targets below are recorded.

## Preflight

Run the full environment preflight without printing secret values:

```bash
python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --scope reverse-proxy
```

Generate a local shell template for missing variables:

```bash
python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --scope reverse-proxy --format env-template
```

Keep filled templates local. They contain secrets and must not be committed.

## Provider Live Validation

Record one evidence file per provider using [PROVIDER_LIVE_VALIDATION_TEMPLATE.md](PROVIDER_LIVE_VALIDATION_TEMPLATE.md).

Current `rc1` evidence targets:

- `docs/release/evidence/provider-live-aws-rc1.md`
- `docs/release/evidence/provider-live-gcs-rc1.md`
- `docs/release/evidence/provider-live-azure-rc1.md`
- `docs/release/evidence/provider-live-oci-rc1.md`
- `docs/release/evidence/provider-live-minio-rc1.md`
- `docs/release/evidence/provider-live-ceph-rc1.md`

Generic final-candidate target pattern:

- `docs/release/evidence/provider-live-aws-<tag-or-sha>.md`
- `docs/release/evidence/provider-live-gcs-<tag-or-sha>.md`
- `docs/release/evidence/provider-live-azure-<tag-or-sha>.md`
- `docs/release/evidence/provider-live-oci-<tag-or-sha>.md`
- `docs/release/evidence/provider-live-minio-<tag-or-sha>.md`
- `docs/release/evidence/provider-live-ceph-<tag-or-sha>.md`

Run the provider validation suite after setting only the provider variables needed for each scope:

```bash
cd backend && go test ./internal/api -run '^(TestLiveValidationAwsS3|TestLiveValidationGcpGcs|TestLiveValidationAzureBlob|TestLiveValidationOciObjectStorage|TestLiveValidationMinioS3Compatible|TestLiveValidationCephS3Compatible)$' -count=1
```

Successful provider evidence must include a pass/success `Actual outcome` value. Accepted success values are `pass`, `passed`, `success`, `succeeded`, `ok`, or a `pass ...` phrase.
Each provider evidence file must fill `Provider name` with the supported provider that was validated: AWS S3, GCS, Azure Blob, OCI Object Storage, MinIO, or Ceph.
Each provider evidence file must include non-placeholder `Bucket or container name`, `Profile identifier`, `Exact feature tested`, `Command or manual workflow used`, and `Provider-native console or CLI confirmation on success` values for release review.
Each provider evidence file must fill `S3Desk commit SHA or release tag` with the release tag or commit SHA used for validation; blank or `<tag-or-sha>` values are rejected.
Each provider evidence filename must replace `<tag-or-sha>` with the release tag or commit SHA used for validation.
Evidence containing suspected secrets, authorization header values, cookie token values, access key identifiers or assignments, or signed URL signatures is rejected by `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>`; replace flagged values with `<redacted>`. Any rejected evidence blocks release readiness even when matching pass evidence exists.

## Reverse Proxy Smoke

Record reverse-proxy evidence using [REVERSE_PROXY_SMOKE_TEMPLATE.md](REVERSE_PROXY_SMOKE_TEMPLATE.md), or generate it directly from `scripts/deploy_smoke.sh`.

Current `rc1` evidence target:

- `docs/release/evidence/reverse-proxy-smoke-rc1.md`

Generic final-candidate target pattern:

- `docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md`

Required preflight:

```bash
python3 scripts/check_live_evidence_env.py --scope reverse-proxy
```

Smoke command:

```bash
DEPLOY_RELEASE_CANDIDATE=<tag-or-sha> DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md bash ./scripts/deploy_smoke.sh
```

Current `rc1` smoke command:

```bash
DEPLOY_RELEASE_CANDIDATE=rc1 DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-rc1.md bash ./scripts/deploy_smoke.sh
```

Successful reverse-proxy evidence must include a pass/success `Reverse-proxy smoke` value. Accepted success values are `pass`, `passed`, `success`, `succeeded`, `ok`, or a `pass ...` phrase.
Reverse-proxy evidence must fill `S3Desk commit SHA or release tag` with the release tag or commit SHA used for validation; blank, `unknown`, or `<tag-or-sha>` values are rejected. `scripts/deploy_smoke.sh` writes this field from `DEPLOY_RELEASE_CANDIDATE`, defaulting to the current git commit SHA when that variable is unset.
Reverse-proxy evidence filename must replace `<tag-or-sha>` with the release tag or commit SHA used for validation.
Reverse-proxy evidence must include sanitized `Base URL`, `Expected external base URL`, `Profile identifier`, `Bucket`, `Object key`, and all smoke check result lines from the `## Checks` section in `REVERSE_PROXY_SMOKE_TEMPLATE.md`. Generated evidence records `HTTP 200` for healthz, meta, download-url, and HEAD checks, and `HTTP 201` for realtime-ticket creation; other recorded HTTP statuses are rejected. The `## Expected Statuses` section is reference material only and does not satisfy evidence requirements by itself.

Expected statuses:

- GET `/healthz`: `200`
- Authenticated GET `/api/v1/meta`: `200`
- POST `/api/v1/realtime-ticket?transport=ws`: `201`
- GET `/api/v1/buckets/{bucket}/objects/download-url?proxy=true`: `200`
- Signed proxy URL root matches expected external base URL: URL-root match, no HTTP status
- HEAD signed proxy URL: `200`

Evidence containing suspected API tokens, authorization header values, cookie token values, or signed proxy URL signatures is rejected by `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>`; keep only sanitized route/base URL details. Any rejected evidence blocks release readiness even when matching pass evidence exists.

## Review Gate

After all provider and reverse-proxy evidence files are recorded, run:

```bash
python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all
python3 scripts/check_release_evidence.py --format checklist --require-candidate-id --candidate-id rc1
python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id rc1
```

The release remains blocked until `--strict` reports `ready`.
