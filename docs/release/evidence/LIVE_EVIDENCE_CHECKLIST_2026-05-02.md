# Live Evidence Checklist - 2026-05-02

This checklist captures the live evidence still required by the current changed file set. Do not record API tokens, authorization header values, cookie token values, backup passwords, access keys, secret keys, service account JSON, private keys, or signed URL signatures in committed evidence.

## Current Status

- Status: `blocked`
- Provider evidence required: `aws`, `gcs`, `azure`, `oci`, `minio`, `ceph`
- Reverse-proxy smoke evidence required: `yes`
- Backup-portable smoke evidence required: `yes`
- Latest preflight result: blocked; rechecked on 2026-05-02, and all provider and reverse-proxy required variables were still missing in the local environment.
- Latest strict evidence audit: blocked for `0.21v-rc3`; no provider, reverse-proxy, or backup-portable evidence files were detected.
- Final gate for current candidate: `python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc3`
- Latest local candidate check: `python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc3` exits blocked until the provider, reverse-proxy, and backup-portable evidence targets below are recorded.

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

Current `0.21v-rc3` evidence targets:

- `docs/release/evidence/provider-live-aws-0.21v-rc3.md`
- `docs/release/evidence/provider-live-gcs-0.21v-rc3.md`
- `docs/release/evidence/provider-live-azure-0.21v-rc3.md`
- `docs/release/evidence/provider-live-oci-0.21v-rc3.md`
- `docs/release/evidence/provider-live-minio-0.21v-rc3.md`
- `docs/release/evidence/provider-live-ceph-0.21v-rc3.md`

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
Evidence containing suspected secrets, authorization header values, cookie token values, backup passwords, access key identifiers or assignments, or signed URL signatures is rejected by `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>`; replace flagged values with `<redacted>`. Any rejected evidence blocks release readiness even when matching pass evidence exists.

## Reverse Proxy Smoke

Record reverse-proxy evidence using [REVERSE_PROXY_SMOKE_TEMPLATE.md](REVERSE_PROXY_SMOKE_TEMPLATE.md), or generate it directly from `scripts/deploy_smoke.sh`.

Current `0.21v-rc3` evidence target:

- `docs/release/evidence/reverse-proxy-smoke-0.21v-rc3.md`

Generic final-candidate target pattern:

- `docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md`

Required preflight:

```bash
python3 scripts/check_live_evidence_env.py --scope reverse-proxy
```

Smoke command:

```bash
DEPLOY_BASE_URL=https://s3desk.example.com DEPLOY_API_TOKEN=... DEPLOY_PROFILE_ID=... DEPLOY_SMOKE_BUCKET=... DEPLOY_SMOKE_OBJECT_KEY=... DEPLOY_RELEASE_CANDIDATE=<tag-or-sha> DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md bash ./scripts/deploy_smoke.sh
```

Current `0.21v-rc3` smoke command:

```bash
DEPLOY_BASE_URL=https://s3desk.example.com DEPLOY_API_TOKEN=... DEPLOY_PROFILE_ID=... DEPLOY_SMOKE_BUCKET=... DEPLOY_SMOKE_OBJECT_KEY=... DEPLOY_RELEASE_CANDIDATE=0.21v-rc3 DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-0.21v-rc3.md bash ./scripts/deploy_smoke.sh
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

## Backup Portable Smoke

Record backup-portable evidence using [BACKUP_PORTABLE_SMOKE_TEMPLATE.md](BACKUP_PORTABLE_SMOKE_TEMPLATE.md) after running the portable backup/restore smoke scripts against disposable targets.

Current `0.21v-rc3` evidence target:

- `docs/release/evidence/backup-portable-smoke-0.21v-rc3.md`

Generic final-candidate target pattern:

- `docs/release/evidence/backup-portable-smoke-<tag-or-sha>.md`

Smoke command:

```bash
bash scripts/run_portable_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_smoke.sh && bash scripts/run_portable_sqlite_to_postgres_smoke.sh
```

Successful backup-portable evidence must include a pass/success `Backup portable smoke` value. Accepted success values are `pass`, `passed`, `success`, `succeeded`, `ok`, or a `pass ...` phrase.
Backup-portable evidence must fill `S3Desk commit SHA or release tag` with the release tag or commit SHA used for validation; blank, `unknown`, or `<tag-or-sha>` values are rejected.
Backup-portable evidence filename must replace `<tag-or-sha>` with the release tag or commit SHA used for validation.
Backup-portable evidence must include sanitized `Source database`, `Target database`, `Export workflow`, `Import workflow`, `Verification workflow`, and `Staged restore target` values.
Backup-portable evidence must include a `## Smoke Results` section with pass/success result lines for:

- `bash scripts/run_portable_failure_smoke.sh: pass/success`
- `bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh: pass/success`
- `bash scripts/run_portable_postgres_to_sqlite_smoke.sh: pass/success`
- `bash scripts/run_portable_sqlite_to_postgres_smoke.sh: pass/success`

Evidence containing backup passwords, API tokens, database credentials, encryption keys, provider secrets, or private keys is rejected by `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>`; keep only sanitized workflow and verification details.

## Review Gate

After all provider, reverse-proxy, and backup-portable evidence files are recorded, run:

```bash
python3 scripts/report_release_scope.py --base 0.21v-rc3 --head HEAD --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit
python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --format checklist --require-candidate-id --candidate-id 0.21v-rc3
python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc3
```

The release remains blocked until `--strict` reports `ready`.
