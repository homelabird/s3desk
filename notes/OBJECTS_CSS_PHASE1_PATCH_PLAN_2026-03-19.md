# Objects CSS Phase 1 Patch Plan - 2026-03-19

## Goal

Split the first `Objects` styling pass into a small, reviewable series.

Phase 1 scope:

- shell
- panes
- overlay sizing
- toolbar and header stacking
- filters
- global search

Deferred to phase 2:

- list rendering
- grid rendering
- row presentation
- broad class-name cleanup

## New Files

- [ ] `frontend/src/pages/objects/ObjectsShell.module.css`
- [ ] `frontend/src/pages/objects/ObjectsSearch.module.css`

## Compatibility Rule

- [ ] keep `frontend/src/pages/objects/objects.module.css` during phase 1
- [ ] remove only classes that are fully migrated
- [ ] do not move list or grid styling in this pass

## Patch Slice A - Shell and Pane Extraction

### `frontend/src/pages/objects/ObjectsShell.module.css`

- [ ] add page shell container rules
- [ ] add pane layout rules
- [ ] add tree/details panel container rules
- [ ] add overlay sheet sizing rules
- [ ] add shell-level responsive breakpoints used by pane and overlay layout

### `frontend/src/pages/ObjectsPageScreen.tsx`

- [ ] switch shell-level imports needed for top-level page container classes
- [ ] keep component structure unchanged

### `frontend/src/pages/objects/ObjectsLayout.tsx`

- [ ] switch layout container classes to `ObjectsShell.module.css`
- [ ] keep layout logic unchanged

### `frontend/src/pages/objects/ObjectsPagePanes.tsx`

- [ ] switch pane wrapper classes to `ObjectsShell.module.css`
- [ ] keep pane composition unchanged

### `frontend/src/pages/objects/ObjectsTreePanel.tsx`

- [ ] move tree panel shell and drawer sizing classes to `ObjectsShell.module.css`
- [ ] leave tree content styling in place if not required for shell extraction

### `frontend/src/pages/objects/ObjectsDetailsPanel.tsx`

- [ ] move details panel shell and drawer sizing classes to `ObjectsShell.module.css`
- [ ] leave details content styling in place if not required for shell extraction

### `frontend/src/pages/objects/ObjectsOverlaySheet.tsx`

- [ ] move overlay container and viewport-fit classes to `ObjectsShell.module.css`
- [ ] keep overlay interaction logic unchanged

## Patch Slice B - Header and Toolbar Extraction

### `frontend/src/pages/objects/ObjectsPageHeader.tsx`

- [ ] move header layout and stacking classes to `ObjectsShell.module.css`
- [ ] preserve existing control order

### `frontend/src/pages/objects/ObjectsToolbar.tsx`

- [ ] move toolbar grouping and compact stacking classes to `ObjectsShell.module.css`
- [ ] keep action wiring unchanged

## Patch Slice C - Search Extraction

### `frontend/src/pages/objects/ObjectsSearch.module.css`

- [ ] add filters drawer container rules
- [ ] add global search drawer sizing rules
- [ ] add search form layout rules
- [ ] add filter-wrap and action-wrap responsive rules
- [ ] add result action responsiveness rules
- [ ] add search-specific mobile breakpoints

### `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx`

- [ ] switch global search layout classes to `ObjectsSearch.module.css`
- [ ] keep query, result, and action logic unchanged
- [ ] do not restructure result rendering in phase 1

### `frontend/src/pages/objects/ObjectsFiltersDrawer.tsx`

- [ ] switch filter drawer layout classes to `ObjectsSearch.module.css`
- [ ] keep filter state logic unchanged

## Patch Slice D - Controlled Cleanup

### `frontend/src/pages/objects/objects.module.css`

- [ ] delete only migrated shell classes
- [ ] delete only migrated search classes
- [ ] retain list, grid, and row styling
- [ ] retain any temporary compatibility classes still used by deferred files

## Explicitly Deferred Files

- [ ] `frontend/src/pages/objects/ObjectsListContent.tsx`
- [ ] `frontend/src/pages/objects/ObjectsListRow.tsx`
- [ ] `frontend/src/pages/objects/ObjectsListControls.tsx`
- [ ] `frontend/src/pages/objects/ObjectsListHeader.tsx`
- [ ] `frontend/src/pages/objects/useObjectsObjectGridRenderer.tsx`
- [ ] `frontend/src/pages/objects/useObjectsPrefixGridRenderer.tsx`

## Review Guardrails

- [ ] do not combine CSS extraction with action-logic refactors
- [ ] do not rename stable component props during this pass
- [ ] do not redesign the page while moving styles
- [ ] keep each patch slice reviewable on its own

## Validation Targets After Phase 1

- [ ] `frontend/tests/objects-mobile-responsive.spec.ts`
- [ ] `frontend/src/pages/objects/__tests__/ObjectsListRow.test.tsx` only if imports are touched indirectly
- [ ] `frontend/src/pages/objects/__tests__/useObjectsPrefixGridRenderer.test.tsx` only if imports are touched indirectly
