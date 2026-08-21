# Backup Portable Smoke Evidence

- S3Desk commit SHA or release tag: 0.21v-rc4
- Source database: disposable SQLite and PostgreSQL fixtures
- Target database: disposable PostgreSQL and SQLite restore targets
- Export workflow: repository Compose smoke exported logical portable bundles from each source fixture
- Import workflow: dry-run preview and replace import into the opposite database backend
- Verification workflow: entity checksums, imported record counts, thumbnail restoration, and post-import health checks passed
- Staged restore target: isolated `s3desk-portable-smoke` and `s3desk-portable-failure` Compose projects with disposable volumes
- Backup portable smoke: passed

## Smoke Results

- bash scripts/run_portable_failure_smoke.sh: passed
- bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh: passed
- bash scripts/run_portable_postgres_to_sqlite_smoke.sh: passed
- bash scripts/run_portable_sqlite_to_postgres_smoke.sh: passed

## Review Notes

- Executed against the `0.21v-rc4` candidate worktree on 2026-08-21.
- Success-path imports verified SQLite to PostgreSQL and PostgreSQL to SQLite portability.
- Failure-path runs verified wrong-password rejection, encryption-key mismatch blocking, and asset-copy warning behavior.
- Each smoke project removed its containers and disposable volumes after completion.
