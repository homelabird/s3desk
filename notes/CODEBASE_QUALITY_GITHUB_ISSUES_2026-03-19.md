# Codebase Quality GitHub Issue Bodies - 2026-03-19

This file rewrites the backlog drafts into copy-ready GitHub issue bodies.

## Issue 1

### Suggested Title

`Align the standard local quality gate with browser-facing risk`

### Suggested Labels

- `frontend`
- `quality`
- `ci`
- `testing`

### Suggested Body

## Summary

`./scripts/check.sh` is treated as the standard local quality gate, but it does not currently include any browser smoke coverage.

Today the main local check covers:

- backend `go vet` and `go test`
- frontend lint, unit tests, and build

Browser-facing Playwright coverage exists, but only outside the standard local check path. That means UI regressions can survive a green `./scripts/check.sh`.

## Problem

This gap creates false confidence in the main verification command.

Current state:

- contributors can pass the standard local check without exercising a browser
- browser regressions are caught later in CI
- reproducing the CI failure path is less obvious than it should be

## Proposed Change

- add one thin browser smoke command to the standard local verification path
- keep the full Playwright suites outside `./scripts/check.sh`
- align local and CI command naming so failures are easy to reproduce

## Suggested Implementation

- add a frontend script such as `npm run test:e2e:smoke`
- wire that script into `./scripts/check.sh`
- keep `npm run test:e2e:core` and `npm run test:e2e:mobile-responsive` as deeper, separate suites

## Acceptance Criteria

- [ ] `./scripts/check.sh` runs one browser smoke layer
- [ ] the smoke layer covers app boot plus at least one authenticated shell flow
- [ ] contributors can reproduce the CI smoke failure locally with one documented command
- [ ] the full Playwright suites remain outside the default local gate

## Out of Scope

- full mobile responsive suite inside `./scripts/check.sh`
- full cross-browser matrix inside `./scripts/check.sh`
- long-running live-provider E2E inside `./scripts/check.sh`

## Suggested Owners

- shared frontend/layout owner
- CI/workflow owner

## References

- `notes/CODEBASE_QUALITY_REVIEW_2026-03-19.md`
- `notes/CODEBASE_QUALITY_BACKLOG_DRAFTS_2026-03-19.md`

---

## Issue 2

### Suggested Title

`Split Objects CSS ownership - phase 1 shell and search extraction`

### Suggested Labels

- `frontend`
- `objects`
- `refactor`
- `responsive`

### Suggested Body

## Summary

`frontend/src/pages/objects/objects.module.css` currently acts as the main style authority for too many unrelated concerns.

It mixes:

- page shell
- panes and drawers
- toolbar and header controls
- filters and global search
- list and grid rendering
- mobile breakpoint overrides

That coupling makes each responsive fix in `Objects` higher-risk than it should be.

## Problem

The `Objects` page is already the most layout-complex area in the frontend. Styling ownership is too centralized, so small layout changes require edits in a broad shared CSS module.

Recent mobile responsive work had to touch this file directly because too much behavior is concentrated there.

## Refined Phase 1 Goal

Do not split all `Objects` styling in the first pass.

Phase 1 should isolate only the most layout-sensitive and mobile-sensitive areas:

1. shell and pane layout
2. overlay sheet sizing
3. toolbar and header stacking
4. filters and global search layout

List and grid presentation should remain in `objects.module.css` until phase 2.

## Proposed Files

New files:

- `frontend/src/pages/objects/ObjectsShell.module.css`
- `frontend/src/pages/objects/ObjectsSearch.module.css`

Files to update in phase 1:

- `frontend/src/pages/ObjectsPageScreen.tsx`
- `frontend/src/pages/objects/ObjectsLayout.tsx`
- `frontend/src/pages/objects/ObjectsPagePanes.tsx`
- `frontend/src/pages/objects/ObjectsTreePanel.tsx`
- `frontend/src/pages/objects/ObjectsDetailsPanel.tsx`
- `frontend/src/pages/objects/ObjectsOverlaySheet.tsx`
- `frontend/src/pages/objects/ObjectsPageHeader.tsx`
- `frontend/src/pages/objects/ObjectsToolbar.tsx`
- `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx`
- `frontend/src/pages/objects/ObjectsFiltersDrawer.tsx`

Files explicitly deferred to phase 2:

- `frontend/src/pages/objects/ObjectsListContent.tsx`
- `frontend/src/pages/objects/ObjectsListRow.tsx`
- `frontend/src/pages/objects/ObjectsListControls.tsx`
- `frontend/src/pages/objects/ObjectsListHeader.tsx`
- `frontend/src/pages/objects/useObjectsObjectGridRenderer.tsx`
- `frontend/src/pages/objects/useObjectsPrefixGridRenderer.tsx`

## Acceptance Criteria

- [ ] `objects.module.css` no longer owns shell and search layout as the primary source of truth
- [ ] `ObjectsShell.module.css` exists and is used by shell and pane components
- [ ] `ObjectsSearch.module.css` exists and is used by filters and global search components
- [ ] phase 1 does not change list or grid rendering behavior outside required import rewiring
- [ ] existing `Objects` mobile responsive coverage remains green after the split

## Non-Goals

- redesigning `Objects`
- renaming every CSS class for consistency only
- refactoring action logic and CSS ownership together
- converting list and grid styling in the same pass

## Suggested Owners

- shared frontend/layout owner
- `Objects` UI owner

## References

- `notes/CODEBASE_QUALITY_REVIEW_2026-03-19.md`
- `notes/CODEBASE_QUALITY_BACKLOG_DRAFTS_2026-03-19.md`

---

## Issue 3

### Suggested Title

`Add deeper backend static and safety analysis in CI`

### Suggested Labels

- `backend`
- `quality`
- `ci`
- `security`

### Suggested Body

## Summary

The backend standard gate is useful but shallow for a storage product with:

- TLS configuration paths
- provider credential handling
- background jobs
- upload orchestration

Current default verification relies primarily on:

- `gofmt`
- `go vet`
- `go test`

That is not enough for stronger confidence in security-sensitive and concurrency-sensitive paths.

## Problem

The codebase includes security-sensitive and lifecycle-heavy backend areas, but the current deeper analysis story is limited.

This makes it too easy for:

- risky patterns to survive until later review
- suppressions to accumulate without strong visibility
- concurrency-sensitive regressions to be caught later than necessary

## Proposed Change

- keep the default local gate practical
- add deeper backend analysis in CI first
- explicitly audit exceptions rather than letting them blend into the codebase

## Suggested Implementation

- add a CI backend static-analysis step using `staticcheck`
- add a CI backend security-analysis step using `gosec` or equivalent
- inventory and justify current suppressions or explicit exceptions

## Acceptance Criteria

- [ ] CI runs at least one deeper Go static-analysis tool beyond `go vet`
- [ ] CI runs at least one Go security-focused analysis tool
- [ ] existing suppressions are reviewed and documented intentionally
- [ ] failures surface as a distinct backend quality signal

## Out of Scope

- blocking every local contributor on heavyweight security scanning
- broad backend refactors before the analysis tooling lands

## Suggested Owners

- backend owner
- release gate or CI owner

## References

- `notes/CODEBASE_QUALITY_REVIEW_2026-03-19.md`
- `notes/CODEBASE_QUALITY_BACKLOG_DRAFTS_2026-03-19.md`
