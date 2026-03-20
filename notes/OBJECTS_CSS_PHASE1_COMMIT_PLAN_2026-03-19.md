# Objects CSS Phase 1 Commit Plan - 2026-03-19

Derived from:

- `notes/OBJECTS_CSS_PHASE1_PATCH_PLAN_2026-03-19.md`
- `notes/CODEBASE_QUALITY_BACKLOG_DRAFTS_2026-03-19.md`

This file turns the phase 1 `Objects` CSS split into a commit-by-commit execution order.

## Phase 1 Target

Move only these concerns out of `frontend/src/pages/objects/objects.module.css`:

- shell
- panes
- overlay sizing
- header and toolbar stacking
- filters
- global search

Do not move in phase 1:

- list rendering
- grid rendering
- row presentation
- broad class renaming

## Commit 1

### Suggested Title

`refactor(objects): extract shell and pane layout styles`

### Goal

Create the first dedicated shell stylesheet and move only shell, pane, and overlay-sizing ownership into it.

### Files

New file:

- `frontend/src/pages/objects/ObjectsShell.module.css`

Updated files:

- `frontend/src/pages/ObjectsPageScreen.tsx`
- `frontend/src/pages/objects/ObjectsLayout.tsx`
- `frontend/src/pages/objects/ObjectsPagePanes.tsx`
- `frontend/src/pages/objects/ObjectsTreePanel.tsx`
- `frontend/src/pages/objects/ObjectsDetailsPanel.tsx`
- `frontend/src/pages/objects/ObjectsOverlaySheet.tsx`
- `frontend/src/pages/objects/objects.module.css`

### Scope Rules

- move page shell container rules
- move pane wrapper rules
- move tree/details panel shell sizing rules
- move overlay sheet sizing and viewport-fit rules
- keep component structure unchanged
- keep tree/details content styling in `objects.module.css` if not required for shell extraction

### Do Not Include

- header or toolbar stacking changes
- filters or global search rules
- list/grid class cleanup

## Commit 2

### Suggested Title

`refactor(objects): extract header and toolbar responsive layout`

### Goal

Move header and toolbar stacking rules into the shell stylesheet without touching action logic.

### Files

Updated files:

- `frontend/src/pages/objects/ObjectsPageHeader.tsx`
- `frontend/src/pages/objects/ObjectsToolbar.tsx`
- `frontend/src/pages/objects/ObjectsShell.module.css`
- `frontend/src/pages/objects/objects.module.css`

### Scope Rules

- move header layout rules
- move breadcrumb and toolbar grouping layout rules
- move compact/mobile stacking rules used by header and toolbar
- preserve control order and event wiring

### Do Not Include

- search drawer rules
- filter form rules
- list/grid styles
- prop or action refactors

## Commit 3

### Suggested Title

`refactor(objects): extract filters and global search styles`

### Goal

Introduce a search-specific stylesheet and move filter/search layout ownership into it.

### Files

New file:

- `frontend/src/pages/objects/ObjectsSearch.module.css`

Updated files:

- `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx`
- `frontend/src/pages/objects/ObjectsFiltersDrawer.tsx`
- `frontend/src/pages/objects/objects.module.css`

### Scope Rules

- move filters drawer layout rules
- move global search drawer sizing rules
- move search form wrapping and mobile action layout rules
- move search-specific responsive breakpoints
- keep result rendering logic unchanged

### Do Not Include

- list/table rendering redesign
- result row component changes
- search state or query logic changes

## Commit 4

### Suggested Title

`refactor(objects): remove migrated shell and search compatibility styles`

### Goal

Clean up `objects.module.css` after the first three commits have moved ownership successfully.

### Files

Updated files:

- `frontend/src/pages/objects/objects.module.css`
- any phase-1 component file still importing removed classes, only if needed for cleanup

### Scope Rules

- remove only classes already migrated to `ObjectsShell.module.css`
- remove only classes already migrated to `ObjectsSearch.module.css`
- keep list/grid/row styles in place
- keep temporary compatibility classes only where still needed by deferred files

### Do Not Include

- new functional behavior
- new responsive design changes beyond cleanup
- list/grid extraction

## Optional Commit 5

### Suggested Title

`test(objects): align responsive coverage with css module split`

### Goal

Use only if import-path or class-level assertions require test-side adjustments after the split.

### Files

- `frontend/tests/objects-mobile-responsive.spec.ts`
- `frontend/src/pages/objects/__tests__/ObjectsListRow.test.tsx`
- `frontend/src/pages/objects/__tests__/useObjectsPrefixGridRenderer.test.tsx`

### Scope Rules

- test-only updates
- no product code changes
- only include if the first four commits create legitimate test fallout

## Review Strategy

### Recommended PR grouping

Two safe options:

1. one PR with 4 commits
   - best when the reviewer wants the full phase 1 context together
2. two PRs
   - PR 1: commits 1 and 2
   - PR 2: commits 3 and 4

### Recommendation

Prefer one PR with 4 commits unless commit 3 reveals more search-specific churn than expected.

## Guardrails

- do not mix action logic refactors into these commits
- do not rename classes just for aesthetics
- do not touch deferred list/grid files unless a direct import dependency forces it
- do not expand into a broader `Objects` redesign during phase 1

## Deferred to Phase 2

- `frontend/src/pages/objects/ObjectsListContent.tsx`
- `frontend/src/pages/objects/ObjectsListRow.tsx`
- `frontend/src/pages/objects/ObjectsListControls.tsx`
- `frontend/src/pages/objects/ObjectsListHeader.tsx`
- `frontend/src/pages/objects/useObjectsObjectGridRenderer.tsx`
- `frontend/src/pages/objects/useObjectsPrefixGridRenderer.tsx`

## Start Here

If implementation begins immediately, start with commit 1 only.

Commit 1 is the lowest-risk slice because it:

- has clear file ownership
- isolates shell concerns from content concerns
- reduces future merge conflict risk for the remaining phase 1 work
