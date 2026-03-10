# Technical Debt Checklist

Execution order follows [TECH_DEBT.md](TECH_DEBT.md).

The goal of this checklist is to turn the debt register into a concrete work queue.

## Priority 0

### P0-1. Deployment default hardening

- [x] Reject placeholder `API_TOKEN` values when remote access is enabled on a non-loopback bind
- [x] Make local/dev examples clearly local-only
- [x] Split or clarify local-build vs deploy-ready compose guidance
- [x] Normalize remote access guidance across [README.md](../README.md) and [RUNBOOK.md](RUNBOOK.md)

### P0-2. OpenAPI generation discipline

- [x] Treat [openapi.ts](../frontend/src/api/openapi.ts) as generated-only
- [x] Add a drift check for `npm run gen:openapi`
- [x] Document the allowed API schema edit path: `openapi.yml -> gen:openapi`

### P0-3. Objects preview/thumbnail pipeline refactor

- [x] Centralize frontend thumbnail failure policy and preview transport decisions
- [x] Separate policy, transport, and cache responsibilities
- [x] Reduce preview/thumbnail/proxy branching complexity
- [x] Add regression coverage for image, GIF, MP4, MKV, cache-hit, and proxy-skip cases

### P0-4. Backup/restore scope alignment

- [x] Clarify sqlite-only backup scope in UI and docs
- [x] Decide and document the Postgres backup story
- [x] Improve staged restore lifecycle guidance and cleanup policy

## Priority 1

### P1-1. Frontend input and persisted-state hardening

- [x] Add search length and complexity limits
- [x] Validate/clamp localStorage and sessionStorage state on load
- [x] Rework folder upload collection to reduce memory spikes

### P1-2. Presigned URL and base URL validation

- [x] Add scheme/host/path validation before browser-side preview and open flows
- [x] Separate local API URL rules from third-party storage URL rules

### P1-3. Bucket governance modularization

- [ ] Split provider-specific frontend sections into smaller components
- [ ] Reduce coupling between capability, validation, and mutation logic on the backend

## Priority 2

### P2-1. External process abstraction for tests

- [ ] Add smaller seams around `rclone` and `ffmpeg` execution
- [ ] Reduce platform-specific test skips

### P2-2. Staged restore lifecycle management

- [x] Show staged restore age/size more clearly
- [x] Document cleanup and cutover steps in the runbook
- [x] Consider retention or TTL cleanup for stale staged restores

### P2-3. Release gate definition

- [ ] Define a minimal release checklist
- [ ] Tie live validation evidence to release readiness
- [ ] Track known unsupported cases explicitly in release notes

## Current Sequence

1. P0-1 deployment default hardening
2. P0-2 OpenAPI generation discipline
3. P0-3 objects preview/thumbnail pipeline refactor
4. P0-4 backup/restore scope alignment
5. P1-1 frontend input and persisted-state hardening
