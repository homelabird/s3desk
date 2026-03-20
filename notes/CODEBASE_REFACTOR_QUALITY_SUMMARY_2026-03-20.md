# Codebase Refactor and Quality Summary

Date: `2026-03-20`

## Executive summary

The highest-risk structural hotspots that existed at the start of this pass have been addressed.

Completed areas:

- local quality gate alignment
- backend static security gate
- backend `store` split
- backend `jobs manager` shell cleanup
- frontend `API client` split and cleanup
- `Objects` CSS ownership split and mobile responsive verification
- `BucketPolicyModal` split
- profile modal section split
- `BucketModal` split
- `mockApiClient` rollout for the current small-test candidate set

The codebase is in a materially better state than it was before this refactor pass.

## What changed materially

## Quality gate and validation

- [`check.sh`](/home/homelab/Downloads/project/s3desk/scripts/check.sh) now has explicit `fast` and `full` modes.
- `full` includes:
  - backend static analysis
  - frontend browser smoke
- backend static security checks now include:
  - `staticcheck`
  - `gosec`
  - `govulncheck`

## Backend structure

### `store`

- [`store.go`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go) is now a thin shell.
- ownership moved into:
  - [`store_upload_sessions.go`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_upload_sessions.go)
  - [`store_profiles.go`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_profiles.go)
  - [`store_profile_secrets.go`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_profile_secrets.go)
  - [`store_helpers.go`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_helpers.go)

### `jobs manager`

- [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go) is now a shell-oriented file instead of the old implementation dump.
- package ownership is now explicit across:
  - queue
  - maintenance
  - runtime
  - state transitions
  - dispatch
  - transfer execution
  - transfer totals
  - rclone engine/config
  - connectivity
  - wiring
  - job-type helpers

## Frontend structure

### `API client`

- [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts) is now a thin facade.
- transport, retry, errors, headers, contracts, and domain modules are split out.
- the preferred shape is stable:
  - `client.server.*`
  - `client.profiles.*`
  - `client.buckets.*`
  - `client.objects.*`
  - `client.uploads.*`
  - `client.jobs.*`

### Large screen/module cleanup

- [`BucketPolicyModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx) was split into shell/query/state/validation/diff/mutations/footer pieces.
- [`profileModalSectionContent.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx) is now an aggregator rather than the old builder monolith.
- [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx) now delegates:
  - provider default serialization
  - provider default section shell
  - region/reset helper logic

### Objects/mobile work

- `Objects` styling ownership was split into focused CSS modules.
- mobile responsive coverage now exists across:
  - `Objects`
  - `Jobs`
  - `Uploads`
  - `Profiles`
  - `Buckets`
  - `Settings`
  - `Login`

## Test support

- [`mockApiClient.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/test/mockApiClient.ts) now covers the current small-test candidate set where sub-facade mocks were repeating.
- page-level integration tests that intentionally spy on `APIClient.prototype` remain separate by design.

## Validation status

This refactor pass was repeatedly validated with combinations of:

- `go test ./internal/store`
- `go test ./internal/jobs`
- `go test ./...`
- `npm run lint && npm run typecheck`
- `npx vitest run`
- targeted `vitest`
- targeted Playwright mobile suites
- `./scripts/check.sh fast`
- `./scripts/check.sh full`

## Short hotspot reevaluation

There is no longer a single urgent structural hotspot comparable to the original `store`, `jobs manager`, `API client`, `BucketPolicyModal`, or profile modal builder problems.

Current ranking:

### Priority 1

- [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts)

Reason:

- it is now the largest remaining file in the API facade area
- not urgent
- only worth splitting if domain count or review churn grows

### Priority 2

- [`manager_transfer_execution.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_execution.go)

Reason:

- still large
- ownership is already clear
- should stay on hold unless transfer feature growth forces another split

### Priority 3

- opportunistic test-support cleanup only

Reason:

- remaining work is mostly incremental ergonomics
- not a structural blocker

## Recommendation

Do not force another large refactor immediately.

The correct next move is:

1. keep the current structure stable
2. only reopen the remaining candidates when new feature work causes real growth pressure
3. spend the next refactor budget on concrete product changes, not proactive slicing
