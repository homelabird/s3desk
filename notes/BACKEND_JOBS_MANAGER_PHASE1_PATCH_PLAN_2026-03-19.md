# Backend Jobs Manager Phase 1 Patch Plan

Date: `2026-03-19`

## Phase 1 goal

Extract maintenance and queue logic out of [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go) first, with minimal behavior change.

## Phase 1 target files

- [manager.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go)
- `backend/internal/jobs/manager_queue.go`
- `backend/internal/jobs/manager_maintenance.go`

## Phase 1 slice A

### Title

`Extract queue state helpers into manager_queue.go`

### Scope

Move only queue-related methods:

- [`QueueStats`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:558)
- [`Enqueue`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:568)
- [`enqueueBlocking`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:582)
- [`Cancel`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:607)
- [`dequeue`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:625)
- [`removeQueued`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:646)
- [`setQueueDepth`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:667)

### Write checklist

- Add `manager_queue.go` with package `jobs`.
- Move queue-related methods without renaming them.
- Keep `Manager` fields untouched.
- Keep imports in `manager.go` and `manager_queue.go` minimal after the move.

### Exclude

- `Run`
- `runJob`
- transfer methods
- maintenance cleanup methods

## Phase 1 slice B

### Title

`Extract maintenance loop and cleanup helpers into manager_maintenance.go`

### Scope

Move only maintenance-related methods:

- [`RunMaintenance`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:298)
- [`cleanupExpiredUploadSessions`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:319)
- [`cleanupOrphanArtifacts`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:341)
- [`cleanupOldJobs`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:347)
- [`cleanupExpiredJobLogs`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:379)
- [`cleanupOrphanJobLogs`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:431)
- [`cleanupOrphanJobArtifacts`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:476)
- [`cleanupOrphanStagingDirs`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:507)

### Write checklist

- Add `manager_maintenance.go` with package `jobs`.
- Move the methods as-is.
- Keep log messages unchanged.
- Keep cleanup ordering unchanged.
- Keep any shared private helpers in the new file only if they are maintenance-specific.

### Exclude

- queue helpers
- `Run`
- `RecoverAndRequeue`
- transfer or connectivity logic

## Phase 1 slice C

### Title

`Shrink manager.go to constructor and lifecycle entrypoints`

### Scope

Keep only these responsibilities in `manager.go` after slices A and B:

- [`NewManager`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:123)
- [`RecoverAndRequeue`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:237)
- [`Run`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:530)
- shared types, constants, and fields still used across files

### Write checklist

- Remove moved code from `manager.go`.
- Reconcile imports after extraction.
- Keep file ordering readable: types, constructor, lifecycle.

### Exclude

- any runtime transfer extraction
- any rclone extraction
- any connectivity extraction

## Recommended commit order

1. `refactor(jobs): move queue helpers into manager_queue.go`
2. `refactor(jobs): move maintenance helpers into manager_maintenance.go`
3. `refactor(jobs): reduce manager.go to lifecycle entrypoints`

## Review guardrails

- No method renames in phase 1.
- No signature changes in phase 1.
- No behavioral cleanup mixed into extraction commits.
- If imports become noisy, clean them in the same slice that caused the move.

## Expected result after phase 1

- `manager.go` becomes materially smaller.
- Queue and maintenance edits stop colliding in the same file.
- Phase 2 can focus on runtime orchestration without reopening queue cleanup code.
