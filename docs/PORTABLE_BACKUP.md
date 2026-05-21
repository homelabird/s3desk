# Portable Backup

This document covers the database-neutral backup/import path used to move
S3Desk state between `sqlite` and `postgres`.

## Scope

S3Desk exposes three backup scopes:

- `Full backup`: sqlite-backed `DATA_DIR` snapshot for same-backend recovery
- `Cache + metadata backup`: lighter sqlite snapshot plus selected local assets
- `Portable backup`: logical export/import path for backend-neutral migration

Only `Portable backup` is meant for `sqlite <-> postgres` migration.

## Current Support

Validated migration paths:

- `sqlite -> postgres`
- `postgres -> sqlite`

Validated portable features:

- `dry_run` preview and `replace` import
- encrypted payloads via `confidentiality=encrypted`
- password-protected encrypted bundles
- thumbnail asset copy
- non-empty `upload_sessions`
- non-empty `upload_multipart_uploads`

Portable bundles currently carry:

- `profiles`
- `profile_connection_options`
- `jobs`
- `upload_sessions`
- `upload_multipart_uploads`
- `upload_objects`
- `object_index`
- `object_index_replacements`
- `object_favorites`
- optional thumbnail assets

Encrypted portable bundles write `payload.enc` with the versioned `v2`
payload format: PBKDF2-SHA256 key derivation, a per-bundle salt, and
AES-256-GCM chunk authentication. Restore/import continues to accept legacy
encrypted bundles that only have `payloadEncryptionIv` metadata.

## Migration Workflow

1. Export a portable backup from the source server.
2. Run portable preview on the destination server.
3. Resolve blockers such as missing `ENCRYPTION_KEY`, password mismatch, or disk pressure for thumbnails.
4. Run the real portable import.
5. Verify imported counts and destination health before cutover.

For encrypted portable bundles, export uses the `X-S3Desk-Backup-Password`
request header, while restore and portable import use the multipart `password`
field (or the matching UI password input). A non-empty supplied password takes
precedence over the destination `ENCRYPTION_KEY`. Use the same password on
import when the bundle was exported with one; leave the password blank when the
bundle was encrypted with the server key.

## Validation Commands

Bidirectional smoke:

```bash
bash scripts/run_portable_sqlite_to_postgres_smoke.sh
bash scripts/run_portable_postgres_to_sqlite_smoke.sh
```

Encrypted and password-protected smoke:

```bash
PORTABLE_BUNDLE_CONFIDENTIALITY=encrypted \
PORTABLE_BUNDLE_PASSWORD=operator-secret \
bash scripts/run_portable_sqlite_to_postgres_smoke.sh

PORTABLE_BUNDLE_CONFIDENTIALITY=encrypted \
PORTABLE_BUNDLE_PASSWORD=operator-secret \
bash scripts/run_portable_postgres_to_sqlite_smoke.sh
```

Failure-path smoke:

```bash
bash scripts/run_portable_failure_smoke.sh
bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh
```

These failure flows cover:

- wrong password
- destination `ENCRYPTION_KEY` mismatch
- missing destination `ENCRYPTION_KEY`
- partial thumbnail copy warnings after successful DB import

## Current Limits

- Portable backup is a migration feature, not a Postgres disaster-recovery replacement.
- In-product `Full backup` and `Cache + metadata backup` still target sqlite `DATA_DIR` workflows.
- Portable import currently assumes `replace` semantics for imported entities.
- Thumbnail assets are the only portable local asset class in the current implementation.
- Same-backend sqlite restore remains the path for raw sqlite snapshot recovery.

For operational cutover details, see [RUNBOOK.md](RUNBOOK.md). For concrete test
commands, see [TESTING.md](TESTING.md).
