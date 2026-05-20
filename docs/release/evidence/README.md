# Release Evidence

Use this directory for intentional release evidence that should be reviewed with a release candidate.

Root-local screenshots, exploratory Playwright notes, and temporary smoke artifacts are ignored by default. Preserve evidence here only when it is meant to be part of release review.

Audit whether the current changed files require live evidence:

```bash
python3 scripts/check_release_evidence.py
python3 scripts/check_release_evidence.py --format checklist
python3 scripts/check_release_evidence.py --strict
python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>
```

The audit reports provider-live, reverse-proxy, and backup-portable evidence requirements from the current changed file set. Markdown and checklist output print the suggested provider scopes, missing provider scopes, preflight commands, env-template commands, provider test commands, smoke commands, target evidence filenames, reverse-proxy route-level expected statuses, non-status check expectations, backup-portable smoke commands and per-script smoke results, and final gate commands for the required evidence. `--strict` exits non-zero when required evidence is missing. Add `--require-candidate-id --candidate-id <tag-or-sha>` before final approval when the release candidate is known; this rejects evidence whose `S3Desk commit SHA or release tag` does not match the candidate being released, and fails fast if the candidate identifier is omitted. Provider-live evidence must cover every suggested provider scope, include a supported `Provider name`, include non-placeholder bucket/profile/feature/command metadata, include non-placeholder provider-native console or CLI confirmation on success, include a non-placeholder `S3Desk commit SHA or release tag`, and use an `Actual outcome` pass/success result rather than failed or blocked. Reverse-proxy evidence must also include a non-placeholder `S3Desk commit SHA or release tag`, sanitized base URL/profile/bucket/object metadata, each required smoke check result, and the same pass/success semantics for `Reverse-proxy smoke`. Backup-portable evidence must include a non-placeholder `S3Desk commit SHA or release tag`, sanitized source/target database and workflow metadata, staged restore target details, pass/success semantics for `Backup portable smoke`, and a pass/success result for each portable smoke script in `## Smoke Results`. Evidence files with missing or unsupported provider names, missing provider metadata, missing candidate identifiers, mismatched candidate identifiers, placeholder candidate identifiers, placeholder evidence filenames, missing reverse-proxy smoke metadata, missing backup-portable smoke metadata or per-script results, suspected API tokens, authorization headers, cookie token values, provider credential assignments, access key identifiers or assignments, account keys, service account JSON, private keys, backup passwords, or signed URL signatures are rejected and must be corrected before release approval. Any rejected evidence blocks release readiness even when other matching pass evidence exists.

Use `--format json` when release automation needs the same remediation data without parsing Markdown. Each requirement includes structured command and metadata fields such as `preflight_command`, `env_template_command`, `evidence_targets` or `evidence_target`, `required_metadata`, `required_metadata_fields`, and the relevant provider test, reverse-proxy smoke command, or backup-portable smoke command. Reverse-proxy requirements also include `required_check_fields`, `check_status_expectations`, and `check_result_expectations` so automation can verify HTTP status coverage and URL-root result coverage without parsing prose. Backup-portable requirements include `required_check_fields` so automation can verify the per-script smoke result lines. When `--candidate-id <tag-or-sha>` is provided, remediation evidence targets and the reverse-proxy smoke command use that concrete candidate identifier instead of the `<tag-or-sha>` placeholder. The top-level `final_gate_commands` object includes the strict release-scope and release-evidence commands for the final candidate gate.

For the current release-candidate workspace, use [LIVE_EVIDENCE_CHECKLIST_2026-05-02.md](LIVE_EVIDENCE_CHECKLIST_2026-05-02.md) as the operator checklist before rerunning the strict evidence gate.

Checklist drift is guarded by:

```bash
python3 scripts/check_release_evidence_checklist.py
```

When `--candidate-id` is omitted, the checklist sync uses the latest versioned section in `CHANGELOG.md`.
For committed-candidate comparisons, pass the same `--base <base-tag-or-sha> --head <candidate-tag-or-sha>`
pair used with `check_release_evidence.py` and `check_release_readiness.py`.

## Backup Portable Smoke

Use [BACKUP_PORTABLE_SMOKE_TEMPLATE.md](BACKUP_PORTABLE_SMOKE_TEMPLATE.md) when backup, restore, portable bundle, or staged restore paths change. Keep one sanitized evidence record for the release candidate.

Run the portable smoke scripts against disposable targets:

```bash
bash scripts/run_portable_failure_smoke.sh
bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh
bash scripts/run_portable_postgres_to_sqlite_smoke.sh
bash scripts/run_portable_sqlite_to_postgres_smoke.sh
```

Record the result at:

```bash
docs/release/evidence/backup-portable-smoke-<tag-or-sha>.md
```

Backup-portable evidence must include sanitized `Source database`, `Target database`, `Export workflow`, `Import workflow`, `Verification workflow`, `Staged restore target`, `S3Desk commit SHA or release tag`, pass/success `Backup portable smoke`, and pass/success result lines for all four portable smoke scripts in `## Smoke Results`. Do not include backup passwords, API tokens, database credentials, encryption keys, provider secrets, or private keys.

## Reverse Proxy Smoke

Preflight the environment without printing secret values:

```bash
python3 scripts/check_live_evidence_env.py --scope reverse-proxy
python3 scripts/check_live_evidence_env.py --scope reverse-proxy --format env-template
```

Preflight reports only set/missing status. Blank and placeholder values are treated as missing.

Generate reverse-proxy smoke evidence with:

```bash
DEPLOY_BASE_URL=https://s3desk.example.com \
DEPLOY_API_TOKEN=... \
DEPLOY_PROFILE_ID=... \
DEPLOY_SMOKE_BUCKET=... \
DEPLOY_SMOKE_OBJECT_KEY=... \
DEPLOY_RELEASE_CANDIDATE=<tag-or-sha> \
DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md \
  bash ./scripts/deploy_smoke.sh
```

Required variables:

- `DEPLOY_BASE_URL` or `DEPLOY_HEALTHCHECK_URL`
- `DEPLOY_API_TOKEN`
- `DEPLOY_PROFILE_ID`
- `DEPLOY_SMOKE_BUCKET`
- `DEPLOY_SMOKE_OBJECT_KEY`

Optional variables:

- `DEPLOY_EXPECTED_EXTERNAL_BASE_URL`
- `DEPLOY_CURL_INSECURE`
- `DEPLOY_SMOKE_RETRIES`
- `DEPLOY_SMOKE_DELAY_SECONDS`
- `DEPLOY_SMOKE_EVIDENCE_FILE`
- `DEPLOY_RELEASE_CANDIDATE`

The smoke covers:

- `GET /healthz`
- authenticated `GET /api/v1/meta`
- `POST /api/v1/realtime-ticket?transport=ws`
- `GET /api/v1/buckets/{bucket}/objects/download-url?proxy=true`
- `HEAD` against the returned signed proxy URL

Reverse-proxy evidence must include sanitized `Base URL`, `Expected external base URL`, `Profile identifier`, `Bucket`, `Object key`, and all smoke check result lines from the `## Checks` section in `REVERSE_PROXY_SMOKE_TEMPLATE.md`. Generated evidence records `HTTP 200` for healthz, meta, download-url, and HEAD checks, and `HTTP 201` for realtime-ticket creation; other recorded HTTP statuses are rejected. `Signed proxy URL root` must match `Expected external base URL` or record a pass/success result for that check. The `## Expected Statuses` section is reference material only and does not satisfy evidence requirements by itself.
Do not include API tokens, authorization header values, cookie token values, backup passwords, or provider secrets in evidence files.
Do not include full signed URLs with query signatures; record only the external base URL, route shape, or a redacted URL.
Fill `S3Desk commit SHA or release tag` with the release tag or commit SHA used for validation; do not leave it blank or as `<tag-or-sha>`.
Replace `<tag-or-sha>` in evidence filenames with the release tag or commit SHA before final approval.
If the evidence checker reports a rejected evidence finding, replace the flagged value with `<redacted>` or fill the missing candidate identifier, then rerun `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>`.
Use `pass`, `passed`, `success`, `succeeded`, `ok`, or a `pass ...` phrase for successful `Reverse-proxy smoke` values.

## Provider Live Validation

Use [PROVIDER_LIVE_VALIDATION_TEMPLATE.md](PROVIDER_LIVE_VALIDATION_TEMPLATE.md) when provider-facing bucket behavior changes. Keep one evidence record per affected provider.

Preflight the relevant provider environment without printing secret values:

```bash
python3 scripts/check_live_evidence_env.py --scope aws
python3 scripts/check_live_evidence_env.py --scope gcs
python3 scripts/check_live_evidence_env.py --scope azure
python3 scripts/check_live_evidence_env.py --scope oci
python3 scripts/check_live_evidence_env.py --scope minio
python3 scripts/check_live_evidence_env.py --scope ceph
python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --format env-template
```

Preflight reports only set/missing status. Blank and placeholder values are treated as missing.

Run live provider validation from `backend/` after setting the relevant provider variables:

```bash
S3DESK_LIVE_AWS_BUCKET=... \
S3DESK_LIVE_AWS_REGION=... \
S3DESK_LIVE_AWS_ACCESS_KEY_ID=... \
S3DESK_LIVE_AWS_SECRET_ACCESS_KEY=... \
  go test ./internal/api -run '^TestLiveValidationAwsS3$' -count=1
```

Provider-specific required variables:

- AWS S3: `S3DESK_LIVE_AWS_BUCKET`, `S3DESK_LIVE_AWS_REGION`, `S3DESK_LIVE_AWS_ACCESS_KEY_ID`, `S3DESK_LIVE_AWS_SECRET_ACCESS_KEY`
- GCS: `S3DESK_LIVE_GCS_BUCKET`, `S3DESK_LIVE_GCS_SERVICE_ACCOUNT_JSON`, `S3DESK_LIVE_GCS_PROJECT_NUMBER`
- Azure Blob: `S3DESK_LIVE_AZURE_CONTAINER`, `S3DESK_LIVE_AZURE_ACCOUNT_NAME`, `S3DESK_LIVE_AZURE_ACCOUNT_KEY`
- OCI Object Storage: `S3DESK_LIVE_OCI_BUCKET`, `S3DESK_LIVE_OCI_REGION`, `S3DESK_LIVE_OCI_NAMESPACE`, `S3DESK_LIVE_OCI_COMPARTMENT`, `S3DESK_LIVE_OCI_ENDPOINT`
- MinIO S3-compatible: `S3DESK_LIVE_MINIO_BUCKET`, `S3DESK_LIVE_MINIO_ENDPOINT`, `S3DESK_LIVE_MINIO_REGION`, `S3DESK_LIVE_MINIO_ACCESS_KEY_ID`, `S3DESK_LIVE_MINIO_SECRET_ACCESS_KEY`
- Ceph S3-compatible: `S3DESK_LIVE_CEPH_BUCKET`, `S3DESK_LIVE_CEPH_ENDPOINT`, `S3DESK_LIVE_CEPH_REGION`, `S3DESK_LIVE_CEPH_ACCESS_KEY_ID`, `S3DESK_LIVE_CEPH_SECRET_ACCESS_KEY`

Do not commit provider secrets. Record only provider name, sanitized bucket/profile identifiers, exact feature tested, test command or manual workflow, provider-native console or CLI confirmation on success, release tag or commit SHA, result, and any non-secret endpoint or region details needed for review. `Provider name` must identify one of the supported provider scopes: AWS S3, GCS, Azure Blob, OCI Object Storage, MinIO, or Ceph. `Bucket or container name`, `Profile identifier`, `Exact feature tested`, `Command or manual workflow used`, and `Provider-native console or CLI confirmation on success` must be present and non-placeholder. If you need to cite a signed URL, redact the signature, credential, and token query values. If you need to cite a command that uses provider credentials such as `*_ACCESS_KEY_ID`, replace the value with `<redacted>`. Fill `S3Desk commit SHA or release tag` with the release tag or commit SHA used for validation; do not leave it blank or as `<tag-or-sha>`. Replace `<tag-or-sha>` in evidence filenames with the release tag or commit SHA before final approval. If the evidence checker reports a rejected evidence finding, replace the flagged value with `<redacted>` or fill the missing candidate identifier, then rerun `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>`.
Use `pass`, `passed`, `success`, `succeeded`, `ok`, or a `pass ...` phrase for successful `Actual outcome` values.
