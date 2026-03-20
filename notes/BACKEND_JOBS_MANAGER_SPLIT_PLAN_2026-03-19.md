# Backend Jobs Manager Split Plan

Date: `2026-03-19`

## Current status

- The main file split is complete.
- The package is now separated into:
  - `manager_queue.go`
  - `manager_maintenance.go`
  - `manager_runtime.go`
  - `manager_transfer_execution.go`
  - `manager_transfer_totals.go`
  - `manager_rclone_engine.go`
  - `manager_rclone_config.go`
  - `manager_connectivity.go`
- Follow-up cleanup is also complete:
  - `manager_state_transitions.go`
  - `manager_dispatch.go`
  - `manager_wiring.go`
  - `manager_job_types.go`
- Backend validation passed after the split:
  - `go test ./internal/jobs`
  - `go test ./...`
- The shell file is now materially reduced:
  - [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go) is about `217` lines
  - job-type helpers, dispatch, recovery/requeue, and wiring defaults no longer live there

## Cleanup result

- [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go) is now effectively the shell:
  - `Manager` type
  - constructor
  - lifecycle entrypoints
- The previous follow-up cleanup target is complete.

## Goal

Reduce the size and responsibility count of [`backend/internal/jobs/manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go) without changing the exported `Manager` behavior.

## Current responsibility map

Confirmed from function layout:

- Construction and top-level lifecycle
  - [`manager.go:123`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:123)
  - [`manager.go:237`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:237)
  - [`manager.go:530`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:530)
- Maintenance and cleanup
  - [`manager.go:298`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:298)
  - [`manager.go:319`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:319)
  - [`manager.go:341`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:341)
  - [`manager.go:347`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:347)
  - [`manager.go:379`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:379)
  - [`manager.go:431`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:431)
  - [`manager.go:476`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:476)
  - [`manager.go:507`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:507)
- Queue state and dispatch
  - [`manager.go:558`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:558)
  - [`manager.go:568`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:568)
  - [`manager.go:582`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:582)
  - [`manager.go:607`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:607)
  - [`manager.go:625`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:625)
  - [`manager.go:646`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:646)
  - [`manager.go:667`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:667)
- Job execution entrypoint and progress persistence
  - [`manager.go:710`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:710)
  - [`manager.go:934`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:934)
  - [`manager.go:944`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:944)
  - [`manager.go:964`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:964)
  - [`manager.go:982`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:982)
- Transfer implementations
  - [`manager.go:990`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:990)
  - [`manager.go:1041`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1041)
  - [`manager.go:1072`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1072)
  - [`manager.go:1116`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1116)
  - [`manager.go:1201`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1201)
  - [`manager.go:1233`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1233)
  - [`manager.go:1265`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1265)
  - [`manager.go:1308`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1308)
  - [`manager.go:1351`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1351)
  - [`manager.go:1485`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1485)
  - [`manager.go:1556`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1556)
- Transfer totals helpers
  - [`manager.go:1369`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1369)
  - [`manager.go:1379`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1379)
  - [`manager.go:1388`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1388)
  - [`manager.go:1416`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1416)
  - [`manager.go:1457`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1457)
  - [`manager.go:1471`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1471)
- Rclone orchestration
  - [`manager.go:1627`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1627)
  - [`manager.go:1650`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1650)
  - [`manager.go:1764`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1764)
- Connectivity diagnostics
  - [`manager.go:1777`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1777)
  - [`manager.go:1791`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1791)
  - [`manager.go:1806`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1806)
  - [`manager.go:1818`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1818)
  - [`manager.go:1864`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1864)
  - [`manager.go:1870`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:1870)

## Target file layout

- `backend/internal/jobs/manager.go`
  - `Manager` type
  - constructor
  - top-level lifecycle entrypoints
  - coordination helpers shared across subdomains
- `backend/internal/jobs/manager_queue.go`
  - queue depth
  - enqueue/dequeue
  - cancel/remove queued
- `backend/internal/jobs/manager_maintenance.go`
  - maintenance loop
  - orphan/expired cleanup
- `backend/internal/jobs/manager_runtime.go`
  - `runJob`
  - finalize/persist progress
  - shared job execution dispatch
- `backend/internal/jobs/manager_transfer.go`
  - `runTransfer*` entrypoints
  - move/copy/delete/sync dispatch
- `backend/internal/jobs/manager_transfer_totals.go`
  - object/byte total calculation helpers
- `backend/internal/jobs/manager_rclone.go`
  - `runRclone*`
  - config writing
- `backend/internal/jobs/manager_connectivity.go`
  - connectivity probing
  - benchmark response helpers

## Phase plan

## Phase 1

Move maintenance and queue code first.

Why:

- Lowest behavioral risk.
- Minimal coupling to transfer logic.
- Immediate reduction of file size.

Write scope:

- `manager.go`
- `manager_queue.go`
- `manager_maintenance.go`

## Phase 2

Move runtime orchestration and progress persistence.

Why:

- It is central but still smaller-risk than transfer execution.
- It clarifies what remains as pure transfer behavior.

Write scope:

- `manager.go`
- `manager_runtime.go`

## Phase 3

Move transfer implementations and totals helpers.

Why:

- This is the largest behavioral cluster.
- Keeping totals helpers near transfer code reduces mental jumps.

Write scope:

- `manager.go`
- `manager_transfer.go`
- `manager_transfer_totals.go`

## Phase 4

Move rclone and connectivity logic.

Why:

- These are clearly separable integration concerns.
- They are natural future ownership boundaries.

Write scope:

- `manager.go`
- `manager_rclone.go`
- `manager_connectivity.go`

## Guardrails

- Keep the package name unchanged.
- Do not change exported `Manager` methods during the split.
- Prefer moving existing code with minimal logic edits.
- Land moves in small reviewable patches rather than one giant refactor.

## Acceptance target

- `manager.go` becomes the orchestration entry file instead of the implementation dump.
- New responsibilities are obvious from filenames alone.
- Future edits to transfer, queue, or connectivity logic do not require touching unrelated sections.

## Status against acceptance target

- Completed
- The acceptance target for the shell cleanup has been met.

## Optional future work

### Option 1: split transfer execution by transfer family

- Only if transfer feature work continues.
- Candidate target:
  - [`manager_transfer_execution.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_execution.go)
- Possible sub-slices:
  - sync/delete
  - object copy/move
  - batch/prefix copy/move

### Option 2: keep the current package map stable

- This is the preferred default.
- There is no immediate backend hotspot inside the `jobs` shell anymore.

## Recommended next slice

- Do not keep treating `jobs manager` shell cleanup as an active backlog item.
- If backend cleanup resumes, reevaluate `manager_transfer_execution.go` as a feature-growth hotspot rather than a shell problem.
