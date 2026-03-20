# Codebase Improvement GitHub Issue Bodies

Date: `2026-03-19`

## Issue 1

### Title

`Align local quality gate with browser-risk checks`

### Suggested labels

- `quality`
- `ci`
- `frontend`
- `testing`

### Body

## Summary

The default local quality gate does not cover the same browser-risk surface that CI enforces for frontend behavior.

## Problem

- [`scripts/check.sh:66`](/home/homelab/Downloads/project/s3desk/scripts/check.sh:66) only verifies backend through `go vet` and `go test`.
- [`scripts/check.sh:110`](/home/homelab/Downloads/project/s3desk/scripts/check.sh:110) only verifies frontend through `check:openapi`, `lint`, `test:unit`, and `build`.
- Browser regressions are enforced later in CI through [`frontend-e2e.yml:105`](/home/homelab/Downloads/project/s3desk/.github/workflows/frontend-e2e.yml:105) and [`frontend-e2e.yml:145`](/home/homelab/Downloads/project/s3desk/.github/workflows/frontend-e2e.yml:145).

## Proposed change

- Split local validation into explicit `fast` and `full` paths.
- Keep the current fast iteration path.
- Add at least one browser-level Playwright smoke path to the full gate.
- Document which local command maps to required PR checks.

## Acceptance criteria

- There is a documented local command that approximates required PR checks.
- The distinction between fast and full validation is explicit.
- Frontend browser-risk coverage is no longer CI-only.

## Non-goals

- Running the full live E2E suite locally by default.
- Replacing dedicated Playwright workflows.

## Issue 2

### Title

`Add static security and vulnerability scanning to the backend quality path`

### Suggested labels

- `quality`
- `security`
- `backend`
- `ci`

### Body

## Summary

The backend quality path is missing static security scanning and vulnerability checks.

## Problem

- [`backend/internal/profiletls/config.go:21`](/home/homelab/Downloads/project/s3desk/backend/internal/profiletls/config.go:21) intentionally allows `InsecureSkipVerify` through `//nolint:gosec`.
- [`scripts/check.sh:69`](/home/homelab/Downloads/project/s3desk/scripts/check.sh:69) currently stops at `go vet` and `go test`.
- There is no repo-level evidence that `gosec`, `staticcheck`, or `govulncheck` are part of the default validation path.

## Proposed change

- Add `staticcheck`, `gosec`, and `govulncheck` to the backend validation path.
- Maintain a short suppression review list for intentional exceptions.
- Fail CI on newly introduced findings unless a justified suppression exists.

## Acceptance criteria

- The repo has a documented backend static-analysis command.
- CI runs static security analysis on backend changes.
- Existing suppressions are discoverable and justified.

## Non-goals

- Removing support for insecure TLS profiles.
- Blocking releases on transient vulnerability-feed failures.

## Issue 3

### Title

`Split backend jobs manager by responsibility`

### Suggested labels

- `backend`
- `refactor`
- `jobs`
- `maintainability`

### Body

## Summary

`backend/internal/jobs/manager.go` currently owns queueing, maintenance, transfer execution, rclone integration, and connectivity diagnostics in one file.

## Problem

- Queue and runtime entrypoints are mixed into the same file as transfer implementations.
- Transfer execution starts around [`manager.go:710`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:710).
- Rclone integration sits around [`manager.go:1627`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1627).
- Connectivity diagnostics sit around [`manager.go:1818`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1818).

## Proposed change

- Keep `Manager` as the public type.
- Move queue logic, maintenance cleanup, transfer execution, rclone integration, and connectivity diagnostics into focused files.
- Land the split in small behavior-preserving patches.

## Acceptance criteria

- `manager.go` is reduced to orchestration and shared coordination.
- Transfer and connectivity logic live in separate files.
- API behavior is unchanged.

## Non-goals

- Changing job payload formats.
- Rewriting transfer semantics.

## Issue 4

### Title

`Split backend store by domain instead of keeping profiles and uploads in one file`

### Suggested labels

- `backend`
- `refactor`
- `store`
- `maintainability`

### Body

## Summary

`backend/internal/store/store.go` currently mixes profile CRUD, normalization, secret handling, and upload-session persistence.

## Problem

- Profile CRUD begins around [`store.go:215`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go:215).
- Profile update logic grows substantially by [`store.go:791`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go:791).
- Upload-session persistence begins around [`store.go:1137`](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go:1137).

## Proposed change

- Split profile CRUD and normalization from upload-session persistence.
- Keep the exported `Store` API stable during the refactor.
- Keep shared low-level helpers only where reuse is real.

## Acceptance criteria

- Profiles and uploads no longer share one implementation file.
- The exported `Store` contract remains stable.
- Internal organization matches domain boundaries.

## Non-goals

- Replacing GORM.
- Changing database schema as part of the split.

## Issue 5

### Title

`Split frontend API client transport, error, and domain concerns`

### Suggested labels

- `frontend`
- `refactor`
- `api`
- `maintainability`

### Body

## Summary

`frontend/src/api/client.ts` currently holds transport logic, retry logic, error normalization, upload helpers, and domain-specific API methods in one file.

## Problem

- Upload helpers are mixed into the same file near [`client.ts:185`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts:185).
- Error normalization sits around [`client.ts:1503`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts:1503) and [`client.ts:1666`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts:1666).
- Retry and timeout transport helpers live around [`client.ts:1543`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts:1543) and [`client.ts:1579`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts:1579).

## Proposed change

- Split transport, retry, error parsing, and domain clients into separate modules.
- Keep a stable top-level `APIClient` facade for callers.
- Move upload-specific helpers closer to the upload domain.

## Acceptance criteria

- `client.ts` becomes a small facade or barrel.
- Transport and error logic are independently testable.
- Domain API methods are grouped by area.

## Non-goals

- Replacing the fetch-based transport.
- Changing generated OpenAPI types.

## Issue 6

### Title

`Refactor large frontend screen modules after Objects: buckets and profiles`

### Suggested labels

- `frontend`
- `refactor`
- `buckets`
- `profiles`

### Body

## Summary

After the `Objects` split work, the next frontend maintainability hotspots are the bucket policy editor flow and the profile modal section builder.

## Problem

- [`BucketPolicyModal.tsx:71`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx:71) and [`BucketPolicyModal.tsx:150`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx:150) mix fetch, shell, and editor responsibilities.
- Diff generation is embedded in [`BucketPolicyModal.tsx:1227`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx:1227).
- [`profileModalSectionContent.tsx:95`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx:95), [`profileModalSectionContent.tsx:336`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx:336), and [`profileModalSectionContent.tsx:552`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx:552) keep multiple section builders in one file.

## Proposed change

- Split bucket policy shell, provider-specific editors, validation/diff helpers, and action orchestration.
- Split profile modal sections by concern: connection, credentials, advanced, and security.
- Extract visually significant inline presentation helpers.

## Acceptance criteria

- The largest remaining frontend page modules are reduced in size and responsibility count.
- Provider-specific policy logic is isolated from the bucket dialog shell.
- Profile modal sections are organized by concern instead of one builder file.

## Non-goals

- Reworking bucket policy UX.
- Changing profile form semantics.
