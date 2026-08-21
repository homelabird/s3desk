# Live Evidence Checklist - 2026-08-21

This checklist records the external evidence still required for `0.21v-rc4`. Do not commit credentials, tokens, signed URL signatures, backup passwords, or private keys.

## Current Status

- Status: `blocked`
- Provider evidence required: `aws`, `gcs`, `azure`, `oci`, `minio`, `ceph`
- Reverse-proxy smoke evidence required: `yes`
- Backup-portable smoke evidence required: `yes`
- Backup-portable smoke evidence status: `satisfied`
- Final gate: `python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc4`

## Preflight

```bash
python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph
python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --format env-template
python3 scripts/check_live_evidence_env.py --scope reverse-proxy
python3 scripts/check_live_evidence_env.py --scope reverse-proxy --format env-template
```

Keep filled environment templates local.

## Provider Live Validation

Use [PROVIDER_LIVE_VALIDATION_TEMPLATE.md](PROVIDER_LIVE_VALIDATION_TEMPLATE.md) and record one sanitized evidence file per provider:

- `docs/release/evidence/provider-live-aws-0.21v-rc4.md`
- `docs/release/evidence/provider-live-gcs-0.21v-rc4.md`
- `docs/release/evidence/provider-live-azure-0.21v-rc4.md`
- `docs/release/evidence/provider-live-oci-0.21v-rc4.md`
- `docs/release/evidence/provider-live-minio-0.21v-rc4.md`
- `docs/release/evidence/provider-live-ceph-0.21v-rc4.md`

```bash
cd backend && go test ./internal/api -run '^(TestLiveValidationAwsS3|TestLiveValidationGcpGcs|TestLiveValidationAzureBlob|TestLiveValidationOciObjectStorage|TestLiveValidationMinioS3Compatible|TestLiveValidationCephS3Compatible)$' -count=1
```

Each file must identify the provider, candidate, profile, bucket or container, exact feature, command or workflow, provider-native confirmation, and pass outcome without secrets.

## Reverse Proxy Smoke

Use [REVERSE_PROXY_SMOKE_TEMPLATE.md](REVERSE_PROXY_SMOKE_TEMPLATE.md) or generate:

```bash
DEPLOY_BASE_URL=https://s3desk.example.com DEPLOY_API_TOKEN=... DEPLOY_PROFILE_ID=... DEPLOY_SMOKE_BUCKET=... DEPLOY_SMOKE_OBJECT_KEY=... DEPLOY_RELEASE_CANDIDATE=0.21v-rc4 DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-0.21v-rc4.md bash ./scripts/deploy_smoke.sh
```

Evidence target: `docs/release/evidence/reverse-proxy-smoke-0.21v-rc4.md`

Expected results:

- GET `/healthz`: `200`
- Authenticated GET `/api/v1/meta`: `200`
- POST `/api/v1/realtime-ticket?transport=ws`: `201`
- GET `/api/v1/buckets/{bucket}/objects/download-url?proxy=true`: `200`
- Signed proxy URL root matches expected external base URL
- HEAD signed proxy URL: `200`

## Backup Portable Smoke

Use [BACKUP_PORTABLE_SMOKE_TEMPLATE.md](BACKUP_PORTABLE_SMOKE_TEMPLATE.md) and record `docs/release/evidence/backup-portable-smoke-0.21v-rc4.md`.

Recorded evidence: [backup-portable-smoke-0.21v-rc4.md](backup-portable-smoke-0.21v-rc4.md).

```bash
bash scripts/run_portable_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_smoke.sh && bash scripts/run_portable_sqlite_to_postgres_smoke.sh
```

The sanitized evidence must include:

- bash scripts/run_portable_failure_smoke.sh: pass/success
- bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh: pass/success
- bash scripts/run_portable_postgres_to_sqlite_smoke.sh: pass/success
- bash scripts/run_portable_sqlite_to_postgres_smoke.sh: pass/success

## Review Gate

```bash
python3 scripts/report_release_scope.py --base 0.21v-rc3 --head HEAD --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit
python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --format checklist --require-candidate-id --candidate-id 0.21v-rc4
python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc4
```

The release remains blocked until the strict evidence gate reports `ready`.
