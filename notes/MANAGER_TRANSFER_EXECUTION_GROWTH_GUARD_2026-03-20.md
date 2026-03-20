# `manager_transfer_execution.go` Growth Guard

Date: `2026-03-20`

## Current state

- Target file:
  - [`manager_transfer_execution.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_execution.go)
- Approximate size:
  - about `558` lines

## Decision

- Do not split now.
- Treat this as a feature-growth hotspot, not an active cleanup bug.

## Why it is acceptable to hold

- Ownership is clear:
  - this file already owns transfer execution
- The `jobs` shell cleanup is complete:
  - [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go) is no longer the hotspot
- Current review cost is acceptable because related transfer paths are still grouped together

## Trigger conditions for reopening

Reopen this split only when one or more of these becomes true:

- the file grows beyond about `700` to `800` lines
- a new transfer family is added
  - for example archive/export/import families that are not copy/move/sync/delete
- repeated merge conflicts occur in transfer execution work
- review scope repeatedly mixes unrelated transfer modes
- dedicated tests or helpers start clustering by transfer family rather than by shared execution concerns

## If reopened, preferred split

### File 1

- `manager_transfer_sync_delete.go`
- scope:
  - sync local/staging/S3
  - delete prefix

### File 2

- `manager_transfer_object_ops.go`
- scope:
  - copy object
  - move object

### File 3

- `manager_transfer_batch_ops.go`
- scope:
  - copy batch
  - move batch
  - copy prefix
  - move prefix

### Keep separate

- [`manager_transfer_totals.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_totals.go)
- [`manager_rclone_engine.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_rclone_engine.go)

## Validation if reopened

- `go test ./internal/jobs`
- `go test ./...`

## Recommendation now

- Hold
- Do not spend refactor budget here until transfer feature growth actually forces it
