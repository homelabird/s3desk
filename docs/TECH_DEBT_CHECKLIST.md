# Technical Debt Checklist

This checklist is the execution view of [TECH_DEBT.md](TECH_DEBT.md).

It intentionally tracks only the currently open round.

## Priority 0

### P0-1. Real-provider live validation

- [ ] Run the documented AWS S3 pass
- [ ] Run the documented GCS pass
- [ ] Run the documented Azure Blob pass
- [ ] Run the documented OCI Object Storage pass
- [ ] Attach evidence to the release decision path

### P0-2. Hardened remote deployment template

- [x] Add a remote or production deployment template distinct from local-build
- [x] Keep local-build explicitly loopback-only and local-only
- [x] Update the runbook and root README to point operators at the hardened template

### P0-3. Staged restore cleanup and coordination

- [x] Add restore-root coordination for stage, list, and delete flows
- [x] Remove automatic destructive cleanup from request-serving paths
- [x] Move cleanup to an explicit admin action or background maintenance path

### P0-4. Thumbnail, preview, and proxy service boundaries

- [x] Extract preview transport selection out of request handlers
- [x] Extract thumbnail generation orchestration out of request handlers
- [x] Extract remote media fetch policy out of request handlers
- [x] Keep regression coverage focused on image, GIF, MP4, MKV, cache-hit, and proxy-skip paths

### P0-5. Backup bundle security and restore preflight

- [x] Add bundle authenticity or signing support
- [ ] Add optional bundle confidentiality or encryption support
- [x] Add disk-space or restore-size preflight before staging
- [x] Expose structured restore validation results in API and UI

## Priority 1

### P1-1. Remove remaining shell-backed fake `rclone` tests

- [x] Replace shell-backed connectivity API tests with process seams
- [x] Replace shell-backed buckets API tests with process seams
- [x] Replace shell-backed objects API tests with process seams
- [x] Replace shell-backed multipart failure tests with process seams
- [x] Replace shell-backed cloud smoke helpers where feasible

### P1-2. Cache `rclone` resolution and version probing

- [x] Add a cached resolver for `ResolveRclonePath`
- [x] Add a cached or throttled compatibility probe for `EnsureRcloneCompatible`
- [x] Define invalidation rules for config or binary changes

### P1-3. Bucket policy and bucket creation modal modularization

- [x] Split provider-specific bucket policy sections out of `BucketPolicyModal`
- [x] Split provider-specific bucket creation sections out of `BucketModal`
- [x] Extract shared provider form helpers used by both modals

### P1-4. Postgres backup capability surface

- [ ] Expose backup capability by DB backend in the API or runtime metadata
- [ ] Reflect capability state directly in the settings UI
- [ ] Make unsupported Postgres restore paths impossible to misread as supported

### P1-5. Release gate enforcement in CI

- [ ] Add a CI or scripted check for release-note known limitations
- [ ] Add a CI or scripted check for required live validation evidence references
- [ ] Tie release approval steps to the documented release gate

## Priority 2

### P2-1. Replace mutable global test hooks with stricter runners

- [ ] Move API-layer process seams away from mutable package globals
- [ ] Move jobs-layer process seams away from mutable package globals
- [ ] Keep test injection possible without widening runtime state further

### P2-2. Narrow bucket governance backend interfaces further

- [ ] Introduce narrower section-oriented capability interfaces
- [ ] Pass richer profile or bucket context into validation helpers
- [ ] Reduce adapter-wide churn when adding or changing one provider section

### P2-3. Cost and restore observability thresholds

- [ ] Define operator thresholds for thumbnail cache miss behavior
- [ ] Define operator thresholds for staged restore buildup and cleanup
- [ ] Document dashboard or alert expectations in the runbook

## Current Sequence

1. P0-1 real-provider live validation
2. P0-5 optional bundle confidentiality or encryption support
3. P1-4 Postgres backup capability surface
4. P1-5 release gate enforcement in CI
5. P2-1 replace mutable global test hooks with stricter runners
6. P2-2 narrow bucket governance backend interfaces further
7. P2-3 cost and restore observability thresholds
