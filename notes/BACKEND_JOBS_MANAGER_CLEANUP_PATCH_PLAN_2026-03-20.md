# `jobs manager` Cleanup Patch Plan

## Goal

Reduce the remaining orchestration density in [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go) without reopening already-stable splits such as queue, maintenance, runtime, transfer execution, rclone engine, or connectivity.

This plan assumes the current split files remain the ownership boundaries:

- [`manager_queue.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_queue.go)
- [`manager_maintenance.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_maintenance.go)
- [`manager_runtime.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_runtime.go)
- [`manager_transfer_execution.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_execution.go)
- [`manager_transfer_totals.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_totals.go)
- [`manager_rclone_engine.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_rclone_engine.go)
- [`manager_rclone_config.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_rclone_config.go)
- [`manager_connectivity.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_connectivity.go)

## Remaining Cleanup Target

The remaining work is not another large split. It is a shell cleanup pass focused on responsibilities that are still likely co-located in [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go):

- dispatch and transfer-type routing
- state transition and publish helpers
- constructor wiring and dependency grouping
- file-local helper placement and import cleanup

## Patch Strategy

Use small slices with compile-safe boundaries. Do not mix behavior changes with ownership changes.

## Slice 1: State transition helpers

### Intent

Move helper logic that updates job state and publishes progress or terminal state into one file.

### Target file

- new: [`manager_state_transitions.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_state_transitions.go)

### Pull from

- [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go)

### Candidate content

- helpers that:
  - set running, completed, failed, or canceled state
  - assemble status payloads for publish/broadcast
  - persist final state before publish
  - normalize final error text or terminal metadata

### Acceptance

- `manager.go` no longer owns terminal/running state helper bodies
- no change to public `Manager` API

### Validation

- `go test ./internal/jobs`

## Slice 2: Dispatch and orchestration routing

### Intent

Separate “which execution path should run” from “how a transfer executes”.

### Target file

- new: [`manager_dispatch.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_dispatch.go)

### Pull from

- [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go)

### Candidate content

- helpers that:
  - switch on job kind or transfer kind
  - choose sync vs copy/move vs delete flow
  - map provider or job metadata into executor calls
  - enforce routing guards before execution

### Acceptance

- `manager.go` keeps top-level lifecycle entrypoints only
- routing branches live in one file instead of being mixed with constructor/lifecycle code

### Validation

- `go test ./internal/jobs`

## Slice 3: Constructor and dependency wiring cleanup

### Intent

Make the shell file hold only `Manager` definition, constructor, and lifecycle entrypoints. Move dependency assembly helpers into a single support file if they are still embedded in [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go).

### Target file

- new: [`manager_wiring.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_wiring.go)

### Pull from

- [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go)

### Candidate content

- helper constructors
- option normalization
- event bus / publisher setup helpers
- clock, filesystem, process-runner, or repo dependency defaults

### Acceptance

- `manager.go` reads like an entry shell
- dependency setup is grouped and readable

### Validation

- `go test ./internal/jobs`

## Slice 4: File ownership cleanup

### Intent

Finalize ownership after slices 1 through 3 land.

### Files

- [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go)
- all `manager_*.go` files in the same package

### Work

- remove dead imports
- move helper comments to the owning file
- normalize file headers and grouping
- keep one responsibility block per file

### Acceptance

- `manager.go` stays as thin shell plus exported lifecycle entrypoints
- no duplicated private helpers remain across split files

### Validation

- `go test ./internal/jobs`
- `go test ./...`

## Recommended Commit Order

1. `refactor(jobs): extract manager state transition helpers`
2. `refactor(jobs): extract manager dispatch routing`
3. `refactor(jobs): extract manager dependency wiring`
4. `refactor(jobs): thin manager shell and clean imports`

## Out of Scope

- queue semantics changes
- runtime behavior changes
- transfer engine behavior changes
- rclone config format changes
- API contract changes

## Done Condition

The cleanup is complete when:

- [`manager.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go) is primarily shell/lifecycle code
- private helpers are grouped by ownership instead of historical proximity
- `go test ./internal/jobs` and `go test ./...` remain green
