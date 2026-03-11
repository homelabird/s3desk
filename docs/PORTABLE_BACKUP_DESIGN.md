# Portable Backup / Import Design

This document defines the design for a database-neutral backup and import flow that can move S3Desk state between `sqlite` and `postgres`.

## Why this exists

The current in-product backup and restore flow is intentionally sqlite-oriented.

- [handlers_server_backup.go](../backend/internal/api/handlers_server_backup.go) exports `data/s3desk.db` directly into the archive.
- Restore stages a `DATA_DIR` snapshot and expects the destination server to start with `DB_BACKEND=<manifest.DBBackend>`.

That is appropriate for:

- sqlite host recovery
- sqlite-to-sqlite migration
- cache and thumbnail reuse

It is not sufficient for:

- sqlite backup -> postgres restore
- postgres backup -> sqlite restore
- database-neutral migration guarantees

Those cases require a logical export/import path owned by the application rather than a raw database file copy.

## Goals

- Support `sqlite -> postgres` migration with deterministic application-level import.
- Support future `postgres -> sqlite` and `postgres -> postgres` logical migrations.
- Keep backup archives database-neutral and versioned.
- Produce import verification output that makes success auditable.

## Non-goals

- Replacing native Postgres disaster recovery.
- Streaming live replication between backends.
- Zero-downtime cutover.
- Backing up provider-side object data.

## Success guarantee model

S3Desk can only reasonably claim a successful `sqlite -> postgres` restore if all of the following happen:

1. The source data is exported in a logical, versioned format.
2. The target Postgres schema is migrated before import begins.
3. Import runs through a deterministic application-owned importer.
4. Entity counts and archive checksums are verified after import.
5. Encrypted values are readable with the destination `ENCRYPTION_KEY`.
6. The destination instance passes a post-import health check.

Without those conditions, the best the product can offer is a best-effort migration, not a guaranteed restore.

## Archive model

Portable backup must be separate from the current sqlite snapshot bundle.

Recommended bundle kinds:

- `full`
  - current sqlite `DATA_DIR` backup
- `cache_metadata`
  - current sqlite DB + thumbnails path
- `portable`
  - new logical export format

Portable archive should remain a `tar.gz` for consistency with the existing backup surface.

### Portable archive layout

```text
manifest.json
data/profiles.jsonl
data/profile_connection_options.jsonl
data/jobs.jsonl
data/upload_sessions.jsonl
data/upload_multipart_uploads.jsonl
data/object_index.jsonl
data/object_favorites.jsonl
assets/thumbnails/...
```

Notes:

- `assets/thumbnails/` is optional but useful for cache reuse.
- `logs`, `artifacts`, and `staging` should not be part of the portable logical bundle.
- The bundle should never contain `data/s3desk.db`.

## Entities to export

Current schema source:

- [db.go](../backend/internal/db/db.go)

### Required logical entities

1. `profiles`
2. `profile_connection_options`
3. `jobs`
4. `upload_sessions`
5. `upload_multipart_uploads`
6. `object_index`
7. `object_favorites`

### Entity notes

#### `profiles`

Fields currently include:

- `id`
- `name`
- `provider`
- `config_json`
- `secrets_json`
- `endpoint`
- `public_endpoint`
- `region`
- `force_path_style`
- `preserve_leading_slash`
- `tls_insecure_skip_verify`
- `access_key_id`
- `secret_access_key`
- `session_token`
- `created_at`
- `updated_at`

This table is required first because most later tables reference `profile_id`.

#### `profile_connection_options`

Fields:

- `profile_id`
- `schema_version`
- `options_enc`
- `created_at`
- `updated_at`

This is required for encrypted/advanced per-profile connection options.

#### `jobs`

Fields:

- `id`
- `profile_id`
- `type`
- `status`
- `payload_json`
- `progress_json`
- `error`
- `error_code`
- `created_at`
- `started_at`
- `finished_at`

Treat this as historical operational state. Import should preserve it, but failed historical jobs should not block restore.

#### `upload_sessions`

Fields:

- `id`
- `profile_id`
- `bucket`
- `prefix`
- `mode`
- `staging_dir`
- `bytes_tracked`
- `expires_at`
- `created_at`

These may be stale at restore time. Import policy should allow them to be skipped or normalized if their local filesystem state is absent.

#### `upload_multipart_uploads`

Fields:

- `upload_id`
- `profile_id`
- `path`
- `bucket`
- `object_key`
- `s3_upload_id`
- `chunk_size`
- `file_size`
- `created_at`
- `updated_at`

These are resume-oriented records and are inherently fragile across environments. Import should support them, but portable restore may choose to import them only when `assets/staging` is present and compatible.

#### `object_index`

Fields:

- `profile_id`
- `bucket`
- `object_key`
- `size`
- `etag`
- `last_modified`
- `indexed_at`

This is a strong candidate for portable import because rebuilding it can cost object-storage calls.

#### `object_favorites`

Fields:

- `profile_id`
- `bucket`
- `object_key`
- `created_at`

Small, cheap, and important for preserving user-visible state.

## Export order

Recommended export order:

1. `profiles`
2. `profile_connection_options`
3. `jobs`
4. `upload_sessions`
5. `upload_multipart_uploads`
6. `object_index`
7. `object_favorites`
8. optional `assets/thumbnails`

Rationale:

- `profiles` must exist before any table keyed by `profile_id`.
- `profile_connection_options` depends directly on `profiles`.
- The remaining entities also depend on `profiles`, but not on each other via foreign keys.

## Import order

Recommended import order:

1. preflight
2. target schema migration
3. `profiles`
4. `profile_connection_options`
5. `jobs`
6. `upload_sessions`
7. `upload_multipart_uploads`
8. `object_index`
9. `object_favorites`
10. optional thumbnail asset extraction
11. post-import verification

### Preflight requirements

Importer must check:

1. archive `bundleKind == portable`
2. `formatVersion` is supported
3. destination DB backend is known
4. destination schema migrations are current
5. `ENCRYPTION_KEY` is present when encrypted fields exist
6. import mode is explicit:
   - `replace`
   - `merge`
   - `dry_run`

### Import transaction strategy

Recommended:

- Run DB entity import inside a transaction when practical.
- Use a separate asset extraction phase for thumbnails.
- If large object-index imports make one transaction too expensive, chunk per entity type but still provide an all-or-nothing mode when possible.

## Conflict policy

Portable import needs an explicit conflict mode.

Recommended modes:

### `replace`

- Destination tables in portable scope are truncated in dependency-safe order.
- Imported rows become authoritative.
- Best fit for host migration.

### `merge`

- Existing rows remain.
- Matching primary keys are updated or skipped according to entity rules.
- Higher risk of semantic ambiguity.

### `dry_run`

- No data is written.
- Manifest, counts, encryption readiness, and conflict summaries are produced.

For the first implementation, `replace` plus `dry_run` is enough. `merge` can wait.

## Manifest draft

```json
{
  "formatVersion": 1,
  "bundleKind": "portable",
  "createdAt": "2026-03-11T12:00:00Z",
  "appVersion": "0.21v-rc1",
  "sourceDbBackend": "sqlite",
  "sourceSchemaVersion": 1,
  "payloadCompression": "tar.gz",
  "entities": {
    "profiles": { "count": 3, "sha256": "..." },
    "profile_connection_options": { "count": 3, "sha256": "..." },
    "jobs": { "count": 42, "sha256": "..." },
    "upload_sessions": { "count": 2, "sha256": "..." },
    "upload_multipart_uploads": { "count": 1, "sha256": "..." },
    "object_index": { "count": 1200, "sha256": "..." },
    "object_favorites": { "count": 18, "sha256": "..." }
  },
  "assets": {
    "thumbnails": { "fileCount": 240, "sha256": "..." }
  },
  "encryption": {
    "payloadEncrypted": true,
    "keyMode": "server_encryption_key"
  }
}
```

## API draft

### Export

#### `GET /api/v1/server/backup?scope=portable`

Returns a portable logical bundle.

Optional query parameters:

- `confidentiality=clear|encrypted`
- `includeThumbnails=true|false`

Behavior:

- Works for both sqlite and postgres source deployments.
- Does not include `s3desk.db`.

### Import

#### `POST /api/v1/server/import-portable`

Request:

- multipart bundle upload
- optional import mode:
  - `replace`
  - `dry_run`

Response draft:

```json
{
  "ok": true,
  "result": {
    "bundleKind": "portable",
    "mode": "replace",
    "sourceDbBackend": "sqlite",
    "targetDbBackend": "postgres",
    "stagingDir": "/data/restores/portable-20260311-120000",
    "preflight": {
      "schemaReady": true,
      "encryptionReady": true,
      "spaceReady": true
    },
    "imported": {
      "profiles": 3,
      "profile_connection_options": 3,
      "jobs": 42,
      "upload_sessions": 2,
      "upload_multipart_uploads": 1,
      "object_index": 1200,
      "object_favorites": 18
    },
    "verification": {
      "entityChecksumsVerified": true,
      "postImportHealthCheckPassed": true
    },
    "warnings": []
  }
}
```

### Preview

#### `POST /api/v1/server/import-portable/preview`

Purpose:

- parse manifest
- validate compatibility
- return counts/conflicts
- do not write

This is useful for UI-driven migration readiness checks before a destructive import.

## Filesystem handling

Portable restore should separate database-neutral state from local cache.

### Safe to include

- thumbnails

### Avoid in v1

- logs
- staging
- artifacts

Reason:

- They are environment-specific.
- They are not required for cross-backend correctness.
- They complicate “guaranteed restore” claims.

## Encryption and secrets

Portable import must explicitly check encrypted fields.

Sensitive fields:

- `profiles.secrets_json`
- `profile_connection_options.options_enc`

Importer must fail fast when:

- encrypted values are present
- and the destination `ENCRYPTION_KEY` cannot decrypt them

That failure must happen during preflight or early import, not halfway through a partial restore.

## Verification report

A successful portable import should emit a machine-readable report with:

- source backend
- target backend
- per-entity exported count
- per-entity imported count
- per-entity skipped/updated/conflicted count
- checksum verification result
- thumbnail asset restore result
- final health-check result

Without this report, “successful” remains ambiguous.

## Rollout plan

### Phase 1

- Add manifest and portable export writer
- Add `preview` endpoint
- Support `replace` and `dry_run`
- Support `sqlite -> postgres`

### Phase 2

- Support `postgres -> postgres`
- Support `postgres -> sqlite`
- Add merge mode only if operators actually need it

### Phase 3

- Add UI workflow for portable migration
- Add live integration tests for sqlite-to-postgres migration

## Recommended product wording

In the UI and docs, keep these concepts separate:

- `Full backup`
  - sqlite host recovery
- `Cache + metadata backup`
  - sqlite cache reuse
- `Portable backup`
  - cross-backend logical migration

Those should never be presented as the same feature.
