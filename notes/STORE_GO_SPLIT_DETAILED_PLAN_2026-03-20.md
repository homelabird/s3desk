# `store.go` Split Detailed Plan

## Goal

- Reduce [store.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go) ownership from one large mixed file into smaller files with clear write scopes.
- Keep the exported `Store` API stable during phase 1 so callers do not need to change.
- Split by responsibility first, not by line count.

## Current Status

- Phase 1 complete:
  - [store_upload_sessions.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_upload_sessions.go)
- Phase 2 complete:
  - [store_profiles.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_profiles.go)
- Phase 3 complete:
  - [store_profile_secrets.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_profile_secrets.go)
- Phase 4 complete:
  - [store.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go) is now the thin shell
  - [store_helpers.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_helpers.go) owns shared store helpers

## Original Responsibility Map

### Core store shell

- `Store`
- `Options`
- `Ping`

### Profile decoding and secret shaping

- `azureProfileConfig`
- `azureProfileSecrets`
- `gcpProfileConfig`
- `gcpProfileSecrets`
- `ociObjectStorageProfileConfig`
- `profileFromRow`

### Profile CRUD and encryption maintenance

- `CreateProfile`
- `EnsureProfilesEncrypted`
- `ListProfiles`
- `GetProfile`
- `GetProfileSecrets`
- `UpdateProfile`
- `DeleteProfile`

### Upload session persistence

- `UploadSession`
- `MultipartUpload`
- `CreateUploadSession`
- `SetUploadSessionStagingDir`
- `GetUploadSession`
- `AddUploadSessionBytes`
- `GetMultipartUpload`
- `UpsertMultipartUpload`
- `ListMultipartUploads`
- `DeleteMultipartUpload`
- `DeleteMultipartUploadsBySession`
- `UploadSessionExists`
- `ListUploadSessionsByProfile`
- `DeleteUploadSession`
- `ListExpiredUploadSessions`

## Final File Map

- [store.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go)
  - `Store`
  - `Options`
  - `New`
  - `Ping`
- [store_helpers.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_helpers.go)
  - `normalizeProfileProvider`
  - `isS3LikeProvider`
  - `boolToInt`
- [store_upload_sessions.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_upload_sessions.go)
  - upload session persistence
- [store_profiles.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_profiles.go)
  - profile CRUD and read APIs
- [store_profile_secrets.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_profile_secrets.go)
  - provider-specific profile shaping
  - secret decode rules
  - encryption maintenance

## Phase Order

## Phase 1: Extract upload persistence first

### Why first

- The upload block is already self-contained.
- It has minimal overlap with profile encryption logic.
- It gives the cleanest line-count reduction with the lowest regression risk.

### New file

- `backend/internal/store/store_upload_sessions.go`

### Move into this file

- `UploadSession`
- `MultipartUpload`
- `CreateUploadSession`
- `SetUploadSessionStagingDir`
- `GetUploadSession`
- `AddUploadSessionBytes`
- `GetMultipartUpload`
- `UpsertMultipartUpload`
- `ListMultipartUploads`
- `DeleteMultipartUpload`
- `DeleteMultipartUploadsBySession`
- `UploadSessionExists`
- `ListUploadSessionsByProfile`
- `DeleteUploadSession`
- `ListExpiredUploadSessions`

### Keep in `store.go`

- `Store`
- `Options`
- `Ping`
- all profile-related types and methods

### Acceptance

- `Store` public method set remains unchanged.
- `go test ./internal/store` passes.
- Any upload-session call sites remain untouched.

## Phase 2: Extract profile read/write shell

### New file

- `backend/internal/store/store_profiles.go`

### Move into this file

- `CreateProfile`
- `ListProfiles`
- `GetProfile`
- `GetProfileSecrets`
- `UpdateProfile`
- `DeleteProfile`

### Keep adjacent helper ownership local

- If a helper is only used by profile CRUD, move it with the CRUD methods.
- If a helper is used by both CRUD and encryption maintenance, keep it out until phase 3.

### Main constraint

- Do not mix encryption migration work into this phase.
- Keep SQL shape and transaction flow unchanged.

## Phase 3: Extract profile normalization and encryption maintenance

### New file

- `backend/internal/store/store_profile_secrets.go`

### Move into this file

- `azureProfileConfig`
- `azureProfileSecrets`
- `gcpProfileConfig`
- `gcpProfileSecrets`
- `ociObjectStorageProfileConfig`
- `profileFromRow`
- `EnsureProfilesEncrypted`

### Why separate from profile CRUD

- This block mixes provider-specific shaping, secret decode rules, and maintenance migration logic.
- It will continue changing for security work even when CRUD flows are stable.

### Guardrail

- Keep secret redaction and encryption behavior byte-for-byte identical in phase 3.
- No schema changes in this phase.

## Phase 4: Leave a thin shell in `store.go`

### Target final ownership for `store.go`

- `Store`
- `Options`
- `Ping`
- file-level constructor/bootstrap code only

### Non-goal

- Do not invent a new package layout yet.
- Keep everything under `backend/internal/store/` until the split settles.

## Commit Plan

### Commit 1

- `refactor(store): extract upload session persistence`

### Commit 2

- `refactor(store): extract profile CRUD methods`

### Commit 3

- `refactor(store): extract profile secret shaping and encryption maintenance`

### Commit 4

- `refactor(store): leave thin store shell`

## Review Checklist

- No SQL text changes unless the phase explicitly requires it.
- No transaction boundary changes in the extraction commit.
- No caller changes for `Store` methods.
- No renamed exported types in phase 1 to phase 3.
- Keep provider-specific secret decode tests close to the extracted file in follow-up work.

## Suggested Validation Per Phase

- `go test ./internal/store`
- `go test ./...`

## Validation Status

- `go test ./internal/store`: passed after phase 3
- `go test ./...`: passed after the split sequence
