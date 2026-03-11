# Portable Backup / Import Checklist

This checklist is the execution view of [PORTABLE_BACKUP_DESIGN.md](PORTABLE_BACKUP_DESIGN.md).

It tracks the work required to support database-neutral backup/import, with `sqlite -> postgres` and `postgres -> sqlite` as the validated release paths.

## Phase 0. Scope and contract

- [x] Freeze the first supported migration paths as `sqlite -> postgres` and `postgres -> sqlite`
- [x] Keep current `full` and `cache_metadata` bundle kinds unchanged
- [x] Introduce a new bundle kind `portable`
- [x] Define whether v1 supports only `replace` and `dry_run`
- [x] Define which local assets are portable in v1 (`thumbnails` only by default)

## Phase 1. Portable manifest and archive format

- [x] Add `bundleKind=portable`
- [x] Add `formatVersion`
- [x] Add `sourceDbBackend`
- [x] Add `sourceSchemaVersion`
- [x] Add per-entity counts and checksums
- [x] Add optional asset metadata for thumbnails
- [x] Add archive writer support for `data/*.jsonl`
- [x] Ensure portable bundles never contain `data/s3desk.db`

## Phase 2. Export implementation

### P2-1. Profiles

- [x] Export `profiles`
- [x] Export `profile_connection_options`
- [x] Verify encrypted profile data is serializable without backend-specific assumptions

### P2-2. Operational state

- [x] Export `jobs`
- [x] Export `upload_sessions`
- [x] Export `upload_multipart_uploads`
- [x] Decide whether incomplete upload state is included by default or behind an option

### P2-3. Cache and user state

- [x] Export `object_index`
- [x] Export `object_favorites`
- [x] Export optional thumbnail assets

### P2-4. Export verification

- [x] Add entity count verification before archive close
- [x] Add entity checksum generation
- [x] Add export-time summary in the manifest

## Phase 3. Import preflight

- [x] Add `POST /api/v1/server/import-portable/preview`
- [x] Parse manifest without writing data
- [x] Validate `formatVersion`
- [ ] Validate destination DB backend support
- [ ] Validate destination schema migration state
- [x] Validate `ENCRYPTION_KEY` presence when encrypted fields exist
- [x] Validate disk space for optional asset extraction
- [x] Return preflight warnings and blockers in a structured report

## Phase 4. Import implementation

### P4-1. Core DB import order

- [x] Import `profiles`
- [x] Import `profile_connection_options`
- [x] Import `jobs`
- [x] Import `upload_sessions`
- [x] Import `upload_multipart_uploads`
- [x] Import `object_index`
- [x] Import `object_favorites`

### P4-2. Import modes

- [x] Implement `replace`
- [x] Implement `dry_run`
- [ ] Explicitly reject unsupported `merge` until it exists

### P4-3. Transaction and rollback behavior

- [x] Define transaction boundaries for DB entities
- [x] Fail fast on checksum or decrypt errors
- [x] Ensure partial imports cannot be reported as success

## Phase 5. Post-import verification

- [x] Add per-entity imported counts
- [x] Add per-entity skipped/failed counts
- [x] Add checksum verification status
- [x] Add encrypted-field readability verification
- [ ] Add post-import health check
- [x] Return a machine-readable import report

## Phase 6. API surface

- [x] Add `GET /api/v1/server/backup?scope=portable`
- [x] Add optional `includeThumbnails` control
- [x] Add optional `confidentiality=clear|encrypted` support for portable bundles
- [x] Add `POST /api/v1/server/import-portable`
- [x] Add OpenAPI schema for portable manifest/import result types
- [ ] Generate frontend API types from the updated OpenAPI spec

## Phase 7. UI surface

- [x] Distinguish `Full backup`, `Cache + metadata backup`, and `Portable backup`
- [x] Add `Portable import` entry point in settings
- [x] Surface `dry_run` preview results before destructive import
- [x] Surface import verification report after completion
- [x] Make unsupported backend combinations explicit in the UI

## Phase 8. Testing

### P8-1. Backend unit and integration coverage

- [x] Portable manifest encode/decode tests
- [x] Portable export entity coverage tests
- [x] Portable import preflight tests
- [x] Portable import replace-mode tests
- [x] Encrypted portable bundle tests

### P8-2. Backend migration path tests

- [x] sqlite source fixture -> portable export
- [x] portable import -> postgres target
- [x] post-import verification assertions

### P8-3. UI tests

- [x] Settings UI shows portable backup/import distinctly from sqlite backup
- [x] Dry-run preview shows blockers and warnings
- [x] Successful import shows verification report

## Phase 9. Documentation and rollout

- [x] Update runbook with portable migration guidance
- [ ] Update release gate to require evidence for `sqlite -> postgres` and `postgres -> sqlite` if portable import ships
- [x] Document supported and unsupported portable asset classes
- [x] Add example migration workflow to docs

## First release cut

The first implementation should not try to solve every backend permutation.

Recommended v1 release bar:

- [x] `sqlite -> postgres` portable export/import works
- [x] `postgres -> sqlite` portable export/import works
- [x] `replace` and `dry_run` are supported
- [x] thumbnails are the only portable asset class
- [x] import report is machine-readable and surfaced in UI
- [x] same-backend sqlite restore remains unchanged
