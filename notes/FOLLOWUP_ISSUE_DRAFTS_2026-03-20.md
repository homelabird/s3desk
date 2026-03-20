# Follow-up Issue Drafts

## Issue 1

### Title

`refactor(frontend): split clientSubFacades by domain family`

### Labels

- `frontend`
- `refactor`
- `api`

### Summary

Split [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts) into smaller family-level modules so future API growth does not concentrate all facade wiring in one file.

### Problem

The frontend API client was already split into domain modules, transport layers, contracts, and sub-facades. The remaining large composition point is [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts). It is not an immediate blocker, but it is now the largest remaining file in the API composition layer and is the most likely future source of review churn as new endpoints are added.

### Proposed change

- Introduce family-level facade files:
  - `clientFacadeDeps.ts`
  - `clientCoreFacades.ts`
  - `clientStorageFacades.ts`
  - `clientTransferFacades.ts`
- Keep [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts) as a thin composer/barrel
- Preserve the existing `client.server/*`, `client.profiles/*`, `client.buckets/*`, `client.objects/*`, `client.uploads/*`, `client.jobs/*` public shape

### Acceptance criteria

- Public API shape remains unchanged
- `clientSubFacades.ts` becomes a thin composition file
- `npm run lint && npm run typecheck` passes
- `npx vitest run` passes

### Not in scope

- Endpoint behavior changes
- Transport retry policy changes
- Domain module rewrites

## Issue 2

### Title

`chore(backend): monitor and split manager_transfer_execution on growth trigger`

### Labels

- `backend`
- `refactor`
- `jobs`

### Summary

Do not immediately split [`manager_transfer_execution.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_execution.go), but track explicit growth conditions that should trigger the next extraction.

### Problem

The `jobs` package shell cleanup is complete, and ownership in [`manager_transfer_execution.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_execution.go) is currently clear. Additional splitting now would create churn without much immediate value. The file should be reopened only when it grows beyond the current stable boundary.

### Proposed change

- Treat this as a guardrail issue rather than an immediate refactor
- Reopen the split only when one of the following happens:
  - the file grows beyond roughly `700-800` lines
  - a new transfer family is added
  - merge conflicts or review churn around this file become frequent
- When triggered, split by execution family rather than by arbitrary helper count

### Acceptance criteria

- Guard conditions are documented and agreed on
- No code churn is introduced until a trigger is met
- The issue can be closed or escalated based on future growth

### Not in scope

- Immediate extraction work
- Transfer behavior changes
- Rclone engine changes
