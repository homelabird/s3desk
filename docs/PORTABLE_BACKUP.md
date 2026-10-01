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

Supported migration paths:

- `sqlite -> postgres`
- `postgres -> sqlite`

Portable features:

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

Encrypted portable bundles write `payload.enc` with the versioned `v3`
payload format: PBKDF2-SHA256 key derivation, a per-bundle salt,
AES-256-GCM chunk authentication, and a separate KDF-derived HMAC key that
authenticates the complete manifest. A clear manifest cannot verify password
candidates with a raw password HMAC. Restore/import continues to accept legacy
v2 bundles and older encrypted bundles that only have `payloadEncryptionIv`
metadata. Previously exported password-protected bundles retain their old
password-verifier weakness; re-export them as v3 and use a strong password.

## Migration Workflow

1. Pause writes on both servers and finish or cancel local staging uploads and active jobs, then export a portable backup. Direct/presigned upload metadata remains portable. Keep independent source and destination backups and their keys.
2. Run portable preview on the destination server.
3. Resolve blockers such as missing `ENCRYPTION_KEY`, password mismatch, or disk pressure for thumbnails.
4. Run the real portable import.
5. Retain the returned recovery paths and verify imported counts, assets, provider access, and destination health before cutover.

For encrypted portable bundles, export uses the `X-S3Desk-Backup-Password`
request header, while restore and portable import use the multipart `password`
field (or the matching UI password input). A non-empty supplied password takes
precedence over the destination `ENCRYPTION_KEY`. Use the same password on
import when the bundle was exported with one; leave the password blank when the
bundle was encrypted with the server key.

## Trust and Import Results

Restore and portable preview/import reject unsigned bundles by default. Only
for a bundle obtained through a trusted operator channel, explicitly select
“I trust this unsigned backup” or submit multipart `allowUnsigned=true`.
Remote snapshot restore accepts the same choice in its JSON request.
This does not bypass a bad signature, and the response warns that authenticity
was not verified. A checksum alone does not establish authenticity.

Portable preview blocks local staging upload sessions because their files are
not included. Keep the source volume until those uploads finish or are canceled,
then export again. Full/Cache snapshot bundles use snapshot restore; Portable
bundles use portable import, including bundles fetched from remote storage.

Import `status` is `ready` or `blocked` before replacement and `complete` or
`partial` afterward. Thumbnail files are copied to a directory on the target
filesystem before database replacement. If preparation fails, the database and
existing thumbnails remain untouched. A later swap or verification failure
returns `partial` after the database commit. Review warnings, keep the previous
backup, and recover thumbnails before cutover. `assetRecoveryDir`, when present,
identifies previous thumbnails retained after a failed filesystem rollback.
A database ping does not prove provider access or upload resumption.

Every actual import saves the destination's nine existing entities and thumbnails
to `DATA_DIR/import-recovery/import-*/before.tar.gz` before deleting rows. The
preimage is read inside the replacement transaction. PostgreSQL replacement uses
Serializable isolation and may fail on concurrent changes; pause ordinary writes
before import rather than automatically retrying a destructive replacement.
Destination local staging sessions and queued/running jobs block replacement.

The response exposes `recoveryDir` and `recoveryBundlePath`. Recovery files are
private; the bundle is encrypted with the destination `ENCRYPTION_KEY` when set.
Without that key, it is clear and unsigned, so restoring it requires deliberate
unsigned trust. File and parent-directory synchronization must succeed before DB
deletion. Recovery creation failure preserves destination rows.

`operation.json` identifies the input by `incomingPayloadSha256` and records
`commit_unknown` before replacement, then
`database_committed` and the final `complete` or `partial` result. A lost HTTP
response or interrupted operation requires inspection of this record and the
current database before retrying. Missing or nonterminal records do not establish
whether a commit occurred. Recording failure after commit returns `partial`;
it cannot undo the DB commit. The server does not automatically replay or roll
back interrupted imports. The UI invalidates its preview as soon as import is
attempted. A lost response requires inspection before obtaining a new preview
and retrying.

To undo an import, preserve the current state, keep writes paused, and preview and
import that operation's `before.tar.gz` with the destination key. This restores
Portable entities and thumbnails, without reversing provider object changes,
schema migration, or environment configuration. Rollback creates a separate
recovery operation. Successful imports retain their recovery directories; restore
cleanup does not delete them. Remove old recovery directories manually after
independent backups and cutover checks succeed. Store a copy off-host if recovery
must survive loss of the destination disk.

For failure scenarios and cutover/failback procedures, see
[the failure analysis](BACKUP_RESTORE_FAILURE_ANALYSIS.ko.md).

## Validation Commands

The smoke fixture cancels its local staging upload before export and retains
presigned upload and multipart metadata. The following commands create isolated
Compose deployments and must be rerun to establish migration evidence for this
version; local unit and mock browser checks do not establish it.

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
- thumbnail preparation failure before database replacement, preserving the destination

Remote non-loopback deployments fail startup when `ENCRYPTION_KEY` is missing;
the in-product missing-key preflight remains covered by backend API tests.

## Current Limits

- Portable backup is a migration feature, not a Postgres disaster-recovery replacement.
- In-product `Full backup` and `Cache + metadata backup` still target sqlite `DATA_DIR` workflows.
- Portable import currently assumes `replace` semantics for imported entities.
- Thumbnail assets are the only portable local asset class in the current implementation.
- Same-backend sqlite restore remains the path for raw sqlite snapshot recovery.

For operational cutover details, see [RUNBOOK.md](RUNBOOK.md). For concrete test
commands, see [TESTING.md](TESTING.md).
