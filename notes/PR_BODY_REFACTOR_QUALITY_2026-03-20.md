## Summary

This PR bundles the recent codebase cleanup work into a single reviewable stack.

### Included changes

- Update demo stack host defaults and remote-access environment wiring
- Split backend `jobs` internals into focused files for runtime, dispatch, wiring, state transitions, connectivity, transfer execution, and rclone helpers
- Split backend `store` internals into focused files for upload sessions, profiles, profile secrets, and shared helpers
- Modularize the frontend API client into domain modules, transport layers, contracts, and sub-facades
- Refactor the `Objects` screen by extracting page CSS ownership and object-flow helpers into smaller modules
- Refactor `BucketPolicyModal`, `BucketModal`, and profile modal section builders into smaller coordinator/helper modules
- Add mobile responsive E2E coverage, local smoke gates, issue/PR templates, and planning notes

## Commit breakdown

- `8765a0d` `chore: update demo stack host defaults`
- `59c498a` `refactor(backend): split jobs and store internals`
- `1b6d7b7` `refactor(frontend): modularize api client and test facades`
- `04c28cc` `refactor(objects): split page styles and object flows`
- `a3a79dd` `refactor(frontend): split bucket and profile modal flows`
- `80eeeaa` `test: add mobile responsive suite and local smoke gates`
- `305ce52` `docs: add refactor and quality planning notes`

## Validation

### Passed earlier during the refactor sequence

- `go test ./internal/jobs`
- `go test ./internal/store`
- `go test ./...`
- `npm run lint && npm run typecheck`
- `npx vitest run`
- `npm run test:e2e:mobile-responsive`
- `npm run test:e2e:smoke`

### Current status

- `./scripts/check.sh full`
  - currently fails on `gofmt`
  - affected files:
    - `backend/internal/jobs/manager.go`
    - `backend/internal/jobs/manager_wiring.go`

## Review guidance

### Suggested review order

1. Demo/environment defaults
2. Backend `jobs` and `store` splits
3. Frontend API client split
4. `Objects` refactor
5. `Buckets` and `Profiles` refactors
6. Mobile responsive test and quality-gate changes
7. Notes and planning docs

### Main risk areas

- API client facade wiring regression across existing call sites
- `Objects` CSS ownership changes affecting layout edge cases
- Bucket/profile modal coordinator extraction changing save/reset flows
- Local `check.sh full` now enforcing stricter backend security and static-analysis gates
