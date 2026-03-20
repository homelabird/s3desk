# Codebase Improvement Backlog Drafts

Date: `2026-03-19`

## Linked summary

- One-page summary:
  - [CODEBASE_REFACTOR_QUALITY_SUMMARY_2026-03-20.md](/home/homelab/Downloads/project/s3desk/notes/CODEBASE_REFACTOR_QUALITY_SUMMARY_2026-03-20.md)
- Stability note:
  - [STABLE_ZONES_2026-03-20.md](/home/homelab/Downloads/project/s3desk/notes/STABLE_ZONES_2026-03-20.md)

## Current status update

- Completed:
  - local quality gate alignment
  - backend static security gate
  - backend store split
  - backend jobs manager shell cleanup
  - frontend API client post-split cleanup
  - buckets policy modal split
  - profiles modal section split
- Active follow-up focus:
  - targeted frontend test support consolidation only when new repeated sub-facade mock patterns appear
- Deprioritized from immediate-next work:
  - backend `store` follow-up refactor
  - backend `jobs manager` shell cleanup
  - frontend `API client` shell cleanup
  - frontend `Buckets` / `Profiles` monolith split kickoff
  - backend `manager_transfer_execution.go` split until feature-growth triggers it
  - frontend `BucketModal` split work, which is now complete

## Issue 1

### Title

`Align local quality gate with browser-risk checks`

### Priority

`High`

### Labels

- `quality`
- `ci`
- `frontend`
- `testing`

### Summary

The default local quality gate does not cover the same browser-risk surface that CI enforces for frontend behavior.

### Problem

- [`scripts/check.sh:66`](/home/homelab/Downloads/project/s3desk/scripts/check.sh:66) runs backend verification only through `go vet` and `go test`.
- [`scripts/check.sh:110`](/home/homelab/Downloads/project/s3desk/scripts/check.sh:110) runs frontend verification through `check:openapi`, `lint`, `test:unit`, and `build`.
- Browser regressions are enforced separately in CI through [`frontend-e2e.yml:105`](/home/homelab/Downloads/project/s3desk/.github/workflows/frontend-e2e.yml:105) and [`frontend-e2e.yml:145`](/home/homelab/Downloads/project/s3desk/.github/workflows/frontend-e2e.yml:145).
- This means a contributor can get a clean local `check.sh` result while still shipping UI regressions that are only caught later in GitHub Actions.

### Proposed change

- Split the local gate into explicit modes such as `fast` and `full`.
- Keep the existing fast path for iteration.
- Add at least one browser-level smoke path to the full gate.
- Document the mapping between local commands and required CI checks.
- Keep short notes for test-stability findings when warnings trace back to framework cleanup behavior instead of product logic.
- Recent example: [PROFILES_PAGE_TEST_STABILIZATION_NOTE_2026-03-20.md](/home/homelab/Downloads/project/s3desk/notes/PROFILES_PAGE_TEST_STABILIZATION_NOTE_2026-03-20.md).

### Acceptance criteria

- There is a documented local command that approximates required PR checks.
- `check.sh` or an adjacent wrapper makes the distinction between fast and full validation explicit.
- Frontend browser-risk coverage is no longer CI-only.

### Non-goals

- Running the entire live E2E suite locally by default.
- Replacing the existing dedicated Playwright workflows.

### Suggested owner

- Shared frontend/platform owner

### Current status

- Completed
- `check.sh` now has `fast` / `full`
- `full` includes browser smoke
- local command mapping is documented

## Issue 2

### Title

`Add static security and vulnerability scanning to the backend quality path`

### Priority

`High`

### Labels

- `quality`
- `security`
- `backend`
- `ci`

### Summary

The backend quality path is missing dedicated static security scanning and vulnerability checks.

### Problem

- TLS verification bypass is intentionally supported in [`backend/internal/profiletls/config.go:21`](/home/homelab/Downloads/project/s3desk/backend/internal/profiletls/config.go:21) through `//nolint:gosec`.
- Current default validation in [`scripts/check.sh:69`](/home/homelab/Downloads/project/s3desk/scripts/check.sh:69) is limited to `go vet` and `go test`.
- There is no evidence of `gosec`, `staticcheck`, or `govulncheck` wired into the default repo scripts or workflows.
- Security-sensitive exceptions therefore risk becoming permanent without review pressure.

### Proposed change

- Add `staticcheck`, `gosec`, and `govulncheck` to the backend quality path.
- Maintain a short review list of intentional suppressions such as `//nolint:gosec`.
- Fail CI on newly introduced security findings unless explicitly suppressed with justification.

### Acceptance criteria

- The repo has a documented backend static-analysis command.
- CI runs static security analysis on backend changes.
- Existing suppressions are discoverable and justified.

### Non-goals

- Removing support for insecure TLS profiles.
- Blocking all releases on transient upstream vulnerability feed issues.

### Suggested owner

- Backend/platform owner

### Current status

- Completed
- `check.sh full` now runs:
  - `staticcheck`
  - `gosec`
  - `govulncheck`

## Issue 3

### Title

`Split backend jobs manager by responsibility`

### Priority

`High`

### Labels

- `backend`
- `refactor`
- `jobs`
- `maintainability`

### Summary

`backend/internal/jobs/manager.go` has accumulated queueing, maintenance, transfer execution, rclone orchestration, and connectivity diagnostics in one file.

### Problem

- The file is about `2024` lines.
- Queue/runtime entry points begin around [`manager.go:530`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:530).
- Transfer execution paths fan out from [`manager.go:710`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:710) through many `runTransfer*` functions.
- Rclone execution and config writing live around [`manager.go:1627`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1627) and [`manager.go:1764`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1764).
- Connectivity testing sits in the same file around [`manager.go:1818`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1818).

### Proposed change

- Keep `Manager` as the public orchestration type.
- Move queue logic, maintenance cleanup, transfer execution, rclone integration, and connectivity diagnostics into focused files.
- Preserve existing behavior and tests while reducing edit blast radius.

### Acceptance criteria

- `manager.go` is reduced to orchestration and shared coordination responsibilities.
- Transfer and connectivity logic have separate files.
- Behavior is unchanged from the API surface perspective.

### Non-goals

- Changing job payload formats.
- Rewriting transfer semantics.

### Suggested owner

- Backend jobs owner

### Current status

- Completed
- `manager.go` is now a thin shell and no longer the active backend hotspot
- Remaining optional follow-up is limited to feature-growth areas such as:
  - [`manager_transfer_execution.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_execution.go)
  - only if transfer behavior continues to expand

## Issue 4

### Title

`Split backend store by domain instead of keeping profiles and uploads in one file`

### Priority

`Medium`

### Labels

- `backend`
- `refactor`
- `store`
- `maintainability`

### Summary

`backend/internal/store/store.go` currently mixes profile normalization, secret handling, and upload-session persistence.

### Problem

- The file is about `1320` lines.
- Profile CRUD starts around [`store.go:215`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go:215) and update logic grows substantially by [`store.go:791`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go:791).
- Upload-session persistence begins around [`store.go:1137`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go:1137).
- Changes to one domain increase review load and regression risk in unrelated paths.

### Proposed change

- Split profile CRUD and normalization from upload-session persistence.
- Keep shared row decoding and low-level DB helpers centralized only where reuse is real.
- Maintain the existing exported `Store` API during the split.

### Acceptance criteria

- Profiles and uploads no longer share one implementation file.
- The exported `Store` contract remains stable.
- The internal organization matches domain boundaries.

### Non-goals

- Replacing GORM.
- Changing database schema as part of the split.

### Suggested owner

- Backend data/storage owner

### Current status

- Completed
- `store.go` has been reduced to a thin shell
- profiles, uploads, secret shaping, and shared helpers now live in separate files
- This item is no longer the next hotspot

## Issue 5

### Title

`Split frontend API client transport, error, and domain concerns`

### Priority

`Medium`

### Labels

- `frontend`
- `refactor`
- `api`
- `maintainability`

### Summary

`frontend/src/api/client.ts` currently holds transport concerns, retry logic, error normalization, upload helpers, and domain-specific API methods in one file.

### Problem

- The file is about `1698` lines.
- Transport and retry helpers are visible around [`client.ts:1543`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts:1543) and [`client.ts:1579`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts:1579).
- Error normalization sits around [`client.ts:1503`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts:1503) and [`client.ts:1666`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts:1666).
- Upload helpers are mixed in near the top around [`client.ts:185`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts:185).
- This makes every client change pay the cost of a monolithic module review.

### Proposed change

- Split transport, retry, error parsing, and domain clients into separate modules.
- Keep a stable top-level `APIClient` facade for callers.
- Move upload-specific helpers and per-domain request builders closer to their domains.

### Acceptance criteria

- `client.ts` becomes a small facade or barrel.
- Transport/retry/error code is isolated and unit-testable.
- Domain API methods are grouped by area such as profiles, buckets, objects, jobs, and uploads.

### Non-goals

- Replacing the fetch-based transport.
- Changing generated OpenAPI types.

### Suggested owner

- Frontend platform owner

### Current status

- Completed
- `client.ts` is now a thin facade and no longer the active frontend platform hotspot
- Remaining optional follow-up is limited to:
  - [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts)
  - broader adoption of [`mockApiClient.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/test/mockApiClient.ts)

## Issue 6

### Title

`Refactor large frontend screen modules after Objects: buckets and profiles`

### Priority

`Medium`

### Labels

- `frontend`
- `refactor`
- `buckets`
- `profiles`

### Summary

After the `Objects` split work, the next frontend maintainability hotspots are the bucket policy editor flow and the profile modal section builder.

### Problem

- [`BucketPolicyModal.tsx:71`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx:71) and [`BucketPolicyModal.tsx:150`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx:150) show fetch/shell/editor responsibilities in one file.
- Diff generation is still embedded in [`BucketPolicyModal.tsx:1227`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx:1227).
- [`profileModalSectionContent.tsx:95`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx:95), [`profileModalSectionContent.tsx:336`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx:336), and [`profileModalSectionContent.tsx:552`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx:552) show one builder file owning multiple modal sections.
- The repo already paid the cost of this pattern once in `Objects`.

### Proposed change

- Split bucket policy shell, provider-specific editors, validation/diff helpers, and action orchestration.
- Split profile modal sections by domain such as connection, credentials, advanced, and security.
- Extract inline presentation helpers where they are reused or visually significant.

### Acceptance criteria

- The largest remaining frontend page modules are reduced in size and responsibility count.
- Provider-specific policy logic is isolated from the bucket dialog shell.
- Profile modal sections are organized by concern instead of one builder file.

### Non-goals

- Reworking bucket policy UX.
- Changing profile form semantics.

### Suggested owner

- Frontend product owner

### Current status

- Completed for the original target scope
- [`BucketPolicyModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx) and [`profileModalSectionContent.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx) are no longer the active large-module hotspots

## Re-evaluated next hotspots

### Priority 1

- [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx)
- Reason:
  - still about `258` lines
  - owns provider-specific secure-default composition and create-flow wiring

### Current status

- Completed
- Provider default serialization, provider section shell, and state/reset helpers were extracted
- [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx) is no longer the immediate-next hotspot

### Priority 2

- [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts)
- Reason:
  - now about `392` lines
  - not a blocker, but it is the largest remaining file in the API client area
  - hold unless domain count or review churn grows

### Priority 3

- [`manager_transfer_execution.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_execution.go)
- Reason:
  - about `558` lines
  - acceptable for now because ownership is clear
  - becomes relevant only if transfer feature growth continues

## Test-support consolidation status

- Completed for the current candidate set
- [`mockApiClient.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/test/mockApiClient.ts) is now used in:
  - objects preview/thumbnail tests
  - objects presign/prefetch tests
  - jobs mutation/log/upload-detail tests
  - bucket policy/governance tests
  - sidebar backup action tests
- Remaining work is opportunistic adoption, not an active backlog item
