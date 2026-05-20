# Backup Portable Smoke Evidence

- S3Desk commit SHA or release tag:
- Source database:
- Target database:
- Export workflow:
- Import workflow:
- Verification workflow:
- Staged restore target:
- Backup portable smoke:

## Smoke Results

Record the pass/success result for each command run against the candidate without including backup passwords, API tokens, database credentials, or encryption keys:

- bash scripts/run_portable_failure_smoke.sh:
- bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh:
- bash scripts/run_portable_postgres_to_sqlite_smoke.sh:
- bash scripts/run_portable_sqlite_to_postgres_smoke.sh:

## Review Notes

- `S3Desk commit SHA or release tag` must match the final candidate tag or commit SHA.
- `Source database` and `Target database` must name the validated database pair, such as `sqlite -> postgres` or `postgres -> sqlite`.
- `Export workflow`, `Import workflow`, and `Verification workflow` must describe the sanitized smoke path and verification result.
- `Staged restore target` must identify the disposable target environment, not a production database.
- Use `pass`, `passed`, `success`, `succeeded`, `ok`, or a `pass ...` phrase for successful `Backup portable smoke` values.
- Each smoke result line must use `pass`, `passed`, `success`, `succeeded`, `ok`, or a `pass ...` phrase.
- Do not include API tokens, authorization headers, cookie token values, backup passwords, provider secrets, database passwords, encryption keys, or private keys.
