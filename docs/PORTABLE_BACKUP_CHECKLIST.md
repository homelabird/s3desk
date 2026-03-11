# Portable Backup / Import Checklist

This checklist is the execution view of [PORTABLE_BACKUP_DESIGN.md](PORTABLE_BACKUP_DESIGN.md).

It tracks the work required to support database-neutral backup/import, with `sqlite -> postgres` as the first target path.

## Phase 0. Scope and contract

- [ ] Freeze the first supported migration path as `sqlite -> postgres`
- [ ] Keep current `full` and `cache_metadata` bundle kinds unchanged
- [ ] Introduce a new bundle kind `portable`
- [ ] Define whether v1 supports only `replace` and `dry_run`
- [ ] Define which local assets are portable in v1 (`thumbnails` only by default)

## Phase 1. Portable manifest and archive format

- [ ] Add `bundleKind=portable`
- [ ] Add `formatVersion`
- [ ] Add `sourceDbBackend`
- [ ] Add `sourceSchemaVersion`
- [ ] Add per-entity counts and checksums
- [ ] Add optional asset metadata for thumbnails
- [ ] Add archive writer support for `data/*.jsonl`
- [ ] Ensure portable bundles never contain `data/s3desk.db`

## Phase 2. Export implementation

### P2-1. Profiles

- [ ] Export `profiles`
- [ ] Export `profile_connection_options`
- [ ] Verify encrypted profile data is serializable without backend-specific assumptions

### P2-2. Operational state

- [ ] Export `jobs`
- [ ] Export `upload_sessions`
- [ ] Export `upload_multipart_uploads`
- [ ] Decide whether incomplete upload state is included by default or behind an option

### P2-3. Cache and user state

- [ ] Export `object_index`
- [ ] Export `object_favorites`
- [ ] Export optional thumbnail assets

### P2-4. Export verification

- [ ] Add entity count verification before archive close
- [ ] Add entity checksum generation
- [ ] Add export-time summary in the manifest

## Phase 3. Import preflight

- [ ] Add `POST /api/v1/server/import-portable/preview`
- [ ] Parse manifest without writing data
- [ ] Validate `formatVersion`
- [ ] Validate destination DB backend support
- [ ] Validate destination schema migration state
- [ ] Validate `ENCRYPTION_KEY` presence when encrypted fields exist
- [ ] Validate disk space for optional asset extraction
- [ ] Return preflight warnings and blockers in a structured report

## Phase 4. Import implementation

### P4-1. Core DB import order

- [ ] Import `profiles`
- [ ] Import `profile_connection_options`
- [ ] Import `jobs`
- [ ] Import `upload_sessions`
- [ ] Import `upload_multipart_uploads`
- [ ] Import `object_index`
- [ ] Import `object_favorites`

### P4-2. Import modes

- [ ] Implement `replace`
- [ ] Implement `dry_run`
- [ ] Explicitly reject unsupported `merge` until it exists

### P4-3. Transaction and rollback behavior

- [ ] Define transaction boundaries for DB entities
- [ ] Fail fast on checksum or decrypt errors
- [ ] Ensure partial imports cannot be reported as success

## Phase 5. Post-import verification

- [ ] Add per-entity imported counts
- [ ] Add per-entity skipped/failed counts
- [ ] Add checksum verification status
- [ ] Add encrypted-field readability verification
- [ ] Add post-import health check
- [ ] Return a machine-readable import report

## Phase 6. API surface

- [ ] Add `GET /api/v1/server/backup?scope=portable`
- [ ] Add optional `includeThumbnails` control
- [ ] Add optional `confidentiality=clear|encrypted` support for portable bundles
- [ ] Add `POST /api/v1/server/import-portable`
- [ ] Add OpenAPI schema for portable manifest/import result types
- [ ] Generate frontend API types from the updated OpenAPI spec

## Phase 7. UI surface

- [ ] Distinguish `Full backup`, `Cache + metadata backup`, and `Portable backup`
- [ ] Add `Portable import` entry point in settings
- [ ] Surface `dry_run` preview results before destructive import
- [ ] Surface import verification report after completion
- [ ] Make unsupported backend combinations explicit in the UI

## Phase 8. Testing

### P8-1. Backend unit and integration coverage

- [ ] Portable manifest encode/decode tests
- [ ] Portable export entity coverage tests
- [ ] Portable import preflight tests
- [ ] Portable import replace-mode tests
- [ ] Encrypted portable bundle tests

### P8-2. Backend migration path tests

- [ ] sqlite source fixture -> portable export
- [ ] portable import -> postgres target
- [ ] post-import verification assertions

### P8-3. UI tests

- [ ] Settings UI shows portable backup/import distinctly from sqlite backup
- [ ] Dry-run preview shows blockers and warnings
- [ ] Successful import shows verification report

## Phase 9. Documentation and rollout

- [ ] Update runbook with portable migration guidance
- [ ] Update release gate to require evidence for `sqlite -> postgres` if portable import ships
- [ ] Document supported and unsupported portable asset classes
- [ ] Add example migration workflow to docs

## First release cut

The first implementation should not try to solve every backend permutation.

Recommended v1 release bar:

- [ ] `sqlite -> postgres` portable export/import works
- [ ] `replace` and `dry_run` are supported
- [ ] thumbnails are the only portable asset class
- [ ] import report is machine-readable and surfaced in UI
- [ ] same-backend sqlite restore remains unchanged
