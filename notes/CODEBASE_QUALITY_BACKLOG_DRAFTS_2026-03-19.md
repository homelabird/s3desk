# Codebase Quality Backlog Drafts - 2026-03-19

Derived from:

- `notes/CODEBASE_QUALITY_REVIEW_2026-03-19.md`

This file contains tracker-ready issue drafts plus a narrower phase breakdown for the first `Objects` CSS split.

## Issue Draft 1

### Title

Align the standard local quality gate with browser-facing risk

### Priority

- `P1`

### Problem

The standard local verification command, `./scripts/check.sh`, is treated as the main quality gate but does not currently include any browser smoke coverage.

Current gap:

- backend checks run
- frontend lint, unit, and build checks run
- browser-facing Playwright coverage exists, but only outside the main local gate

This means UI regressions can survive a green local standard check.

### Proposed Change

- add one thin browser smoke command to the standard local verification path
- keep the full Playwright suites outside `check.sh`
- align local and CI command naming so failures are easy to reproduce

### Suggested Implementation

- add a frontend script such as `npm run test:e2e:smoke`
- wire that script into `./scripts/check.sh`
- keep `npm run test:e2e:core` and `npm run test:e2e:mobile-responsive` as separate deeper suites

### Acceptance Criteria

- `./scripts/check.sh` runs one browser smoke layer
- the smoke layer covers app boot plus at least one authenticated shell flow
- contributors can reproduce the CI smoke failure locally with one documented command
- the full Playwright suite remains outside the default local gate

### Out of Scope

- full mobile responsive suite inside `check.sh`
- full cross-browser matrix inside `check.sh`
- long-running live-provider E2E inside `check.sh`

### Suggested Owner

- shared frontend/layout owner
- CI/workflow owner

## Issue Draft 2

### Title

Split `Objects` CSS ownership - phase 1 shell and search extraction

### Priority

- `P1`

### Problem

`frontend/src/pages/objects/objects.module.css` is acting as a shared style authority for too many unrelated concerns:

- page shell
- panes and drawers
- toolbar and header controls
- filters and global search
- list and grid rendering
- mobile breakpoint overrides

That coupling makes every responsive fix higher-risk than it should be.

### Refined Phase 1 Goal

Do not try to split all `Objects` styling in the first pass.

Phase 1 should only isolate the most layout-sensitive and mobile-sensitive areas:

1. shell and pane layout
2. overlay sheet sizing
3. toolbar/header stacking
4. filters and global search layout

List and grid presentation should remain in `objects.module.css` until phase 2.

### New Files in Phase 1

- `frontend/src/pages/objects/ObjectsShell.module.css`
- `frontend/src/pages/objects/ObjectsSearch.module.css`

### Existing Files to Update in Phase 1

Shell and pane ownership:

- `frontend/src/pages/ObjectsPageScreen.tsx`
- `frontend/src/pages/objects/ObjectsLayout.tsx`
- `frontend/src/pages/objects/ObjectsPagePanes.tsx`
- `frontend/src/pages/objects/ObjectsTreePanel.tsx`
- `frontend/src/pages/objects/ObjectsDetailsPanel.tsx`
- `frontend/src/pages/objects/ObjectsOverlaySheet.tsx`

Toolbar and header ownership:

- `frontend/src/pages/objects/ObjectsPageHeader.tsx`
- `frontend/src/pages/objects/ObjectsToolbar.tsx`

Search ownership:

- `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx`
- `frontend/src/pages/objects/ObjectsFiltersDrawer.tsx`

### Existing Files Explicitly Deferred to Phase 2

- `frontend/src/pages/objects/ObjectsListContent.tsx`
- `frontend/src/pages/objects/ObjectsListRow.tsx`
- `frontend/src/pages/objects/ObjectsListControls.tsx`
- `frontend/src/pages/objects/ObjectsListHeader.tsx`
- `frontend/src/pages/objects/useObjectsObjectGridRenderer.tsx`
- `frontend/src/pages/objects/useObjectsPrefixGridRenderer.tsx`

### Patch Breakdown for Phase 1

#### Patch Slice A: shell extraction

- create `ObjectsShell.module.css`
- move page shell, pane container, drawer container, and overlay sizing rules
- update shell-related components to import the new module
- keep temporary compatibility classes in `objects.module.css` only if needed to avoid a broad first diff

#### Patch Slice B: toolbar and header extraction

- move breadcrumb/header/toolbar layout rules that affect stacking and compact layouts
- wire `ObjectsPageHeader.tsx` and `ObjectsToolbar.tsx` to the new shell module or a header section within it
- avoid renaming stable component APIs during the same patch

#### Patch Slice C: search extraction

- create `ObjectsSearch.module.css`
- move global search drawer, search form, filter layout, and result action responsiveness rules
- update `ObjectsGlobalSearchDrawer.tsx` and `ObjectsFiltersDrawer.tsx`
- keep table/list rendering logic unchanged

#### Patch Slice D: compatibility cleanup

- remove only the migrated classes from `objects.module.css`
- leave list/grid rules in place
- do not attempt full class name cleanup in the same series

### Acceptance Criteria

- `objects.module.css` no longer owns shell and search layout as the primary source of truth
- `ObjectsShell.module.css` and `ObjectsSearch.module.css` exist and are used by the targeted components
- mobile drawer and global search behavior remains covered by the existing `Objects` mobile Playwright spec
- phase 1 does not change list/grid rendering behavior outside necessary import rewiring

### Non-Goals

- redesigning `Objects`
- renaming every CSS class for consistency only
- refactoring action logic and CSS ownership together
- converting list/grid styling in the same pass

### Suggested Owner

- shared frontend/layout owner
- `Objects` UI owner

## Issue Draft 3

### Title

Add deeper backend static and safety analysis in CI

### Priority

- `P2`

### Problem

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

### Proposed Change

- keep the local default gate practical
- add deeper backend analysis in CI first
- explicitly audit exceptions rather than allowing them to blend into the codebase

### Suggested Implementation

- add a CI backend static-analysis step using `staticcheck`
- add a CI backend security-analysis step using `gosec` or equivalent
- inventory and justify current suppressions or explicit exceptions

### Acceptance Criteria

- CI runs at least one deeper Go static-analysis tool beyond `go vet`
- CI runs at least one Go security-focused analysis tool
- existing suppressions are reviewed and documented intentionally
- failures are reported as a distinct backend quality signal

### Out of Scope

- blocking every local contributor on heavyweight security scanning
- broad backend refactors before the analysis tooling lands

### Suggested Owner

- backend owner
- release gate or CI owner

## Recommended Backlog Order

1. issue 1: align the standard local quality gate with browser-facing risk
2. issue 2: split `Objects` CSS ownership - phase 1 shell and search extraction
3. issue 3: add deeper backend static and safety analysis in CI

## Short Execution Note

The phase 1 `Objects` CSS split should be intentionally narrower than the earlier broad recommendation.

The safe first pass is:

- shell
- panes
- overlays
- toolbar stacking
- filters
- global search

The unsafe first pass is:

- shell plus list plus grid plus actions plus class renaming

Keep phase 1 small enough that existing mobile responsive coverage can validate it without opening a second refactor front.
