# Objects CSS Final Remaining Scope - 2026-03-19

## Goal

Document what still intentionally remains in `frontend/src/pages/objects/objects.module.css` after phase 1 and phase 2 extraction, and define the final cleanup scope without mixing in new behavior changes.

## Current State

Ownership already moved out of `objects.module.css`:

- shell and pane layout
- overlay sizing
- header and toolbar stacking
- filters and global search
- list surface wrappers
- list controls and breadcrumbs
- virtual list row and header layout
- grid card layout

`objects.module.css` should now be treated as the residual file for concerns that were explicitly out of scope for phase 2 or still cross-cut multiple remaining `Objects` subfeatures.

## Ownership Decisions Confirmed After Details Extraction Start

### `panelHeader` / `panelBody`

Decision:

- move them fully into shared shell ownership

Reasoning:

- they are pane-chrome primitives, not details-specific presentation
- current consumers are the tree pane and details pane
- keeping them in the residual stylesheet would leave cross-pane structural styling in the wrong place

Recommended target:

- `frontend/src/pages/objects/ObjectsShell.module.css`

Constraint:

- move only the shared header/body chrome rules
- keep `detailsBody` in `ObjectsDetails.module.css`

### `previewModal*`

Decision:

- treat them as dead selectors and remove them

Reasoning:

- repository search did not find any live component importing or referencing `previewModalBody`, `previewModalLoading`, or `previewModalImage`
- migrating unused preview-modal selectors into an image-viewer module would preserve dead CSS instead of reducing ownership ambiguity

Cleanup rule:

- delete the `previewModal*` selectors in the residual dead-rule sweep
- only create image-viewer ownership for classes that still have a concrete live component consumer

## Remaining Live Areas

### 1. Details and metadata presentation

Keep in the residual file until a dedicated details split is scheduled:

- object details content layout
- metadata rows and labels
- details action presentation
- path/value wrapping rules used by details content
- `detailsBody` and other details-section styling still referenced by details-oriented components

Recommended future target:

- `frontend/src/pages/objects/ObjectsDetails.module.css`

### 2. Bucket picker and location-selection UI

Still belongs to the residual file for now:

- bucket picker layout
- bucket picker rows and current-state styling
- inline bucket picker actions
- empty and loading presentation for bucket selection

Recommended future target:

- `frontend/src/pages/objects/ObjectsBucketPicker.module.css`

### 3. Favorites pane

Keep together until favorites gets its own extraction pass:

- `favoritesPane`
- `favoritesList`
- `favoritesEmptyState`
- `favoritesEmptyHint`
- `favoritesItem*`
- `favoritesStar`

Recommended future target:

- `frontend/src/pages/objects/ObjectsFavorites.module.css`

### 4. Image viewer and media preview surface

Still intentionally local to the residual stylesheet:

- `imageViewer*`
- modal body sizing for large preview
- stage, loading, fallback, and thumbnail overlay presentation

Recommended future target:

- `frontend/src/pages/objects/ObjectsImageViewer.module.css`

### 5. Shared thumbnail helpers not yet normalized

A small set of thumbnail helpers still remains and should be normalized before a final split:

- `objectThumbnailPlaceholderLabel`
- `listThumbnailFrame`
- `listThumbnailButton`

These helpers should move with the component family that truly owns them. If they are shared between row thumbnails and larger preview affordances, split them into a small shared thumbnail module instead of leaving them in the residual file.

Recommended future target:

- `frontend/src/pages/objects/ObjectsThumbnailPrimitives.module.css`

## Residual Dead or Transitional Rules To Remove

The file still likely contains selectors that are no longer the source of truth after the module split. These should be removed in the final cleanup pass once ownership is confirmed stable.

Expected transitional leftovers:

- responsive `.page` gap overrides that now belong to shell ownership
- responsive `toolbar*`, `panelHeader`, `panelBody`, and `resizeHandle` adjustments that now belong to `ObjectsShell.module.css`
- any selector block that only exists to support already-migrated list or grid ownership

Rule for this cleanup:

- remove dead selectors only after the owning component imports no longer reference the old module
- do not mix dead-rule cleanup with functional or visual changes

## Final Cleanup Scope

The final non-phase2 cleanup should be split into these passes:

1. residual dead-rule sweep
- remove stale media-query overrides now owned by `ObjectsShell.module.css`
- remove any stale selectors left behind by phase 1 and phase 2 migration

2. details extraction
- move details-specific classes into `ObjectsDetails.module.css`
- keep details behavior and rendering unchanged

3. favorites extraction
- move favorites pane classes into `ObjectsFavorites.module.css`
- keep favorites data and action wiring unchanged

4. image viewer extraction
- move `imageViewer*` classes into `ObjectsImageViewer.module.css`
- keep preview behavior unchanged

5. bucket picker and thumbnail helper normalization
- move bucket picker classes into `ObjectsBucketPicker.module.css`
- either colocate thumbnail helpers with their owner or create a small shared thumbnail module

6. residual file deletion check
- if `objects.module.css` becomes empty or only contains intentionally shared primitives, either delete it or rename the remainder to a clearly scoped module

## Suggested Write Scope For Final Cleanup

Files likely involved in the remaining cleanup:

- `frontend/src/pages/objects/objects.module.css`
- `frontend/src/pages/objects/ObjectsDetailsPanel.tsx`
- details-oriented `Objects` subcomponents that still reference metadata/detail classes
- bucket picker related `Objects` subcomponents
- favorites-related `Objects` subcomponents
- image preview / large preview related `Objects` subcomponents
- thumbnail helper consumers

## Guardrails

- do not re-open list/grid/search ownership in the final cleanup
- do not change drawer behavior, pane behavior, or responsive breakpoints as part of residual extraction
- keep each remaining area in its own patch so regressions are easy to localize
- re-run `frontend/tests/objects-mobile-responsive.spec.ts` after each residual extraction slice
- only run broader `@mobile-responsive` coverage after the residual cleanup settles

## Update After Bucket Picker And Thumbnail Helper Extraction

Completed since the earlier draft:

- bucket picker ownership moved to `frontend/src/pages/objects/ObjectsBucketPicker.module.css`
- thumbnail helper ownership moved to `frontend/src/pages/objects/ObjectsThumbnailPrimitives.module.css`
- dead selector `listThumbnailButton` removed instead of migrated because no live consumer remained

## Residual Scope Now

`frontend/src/pages/objects/objects.module.css` should now be treated as a much smaller residual file.

Remaining expected live scope is limited to:

- shared pane primitives that are still intentionally common across `Objects` subfeatures and have not yet been relocated
- any remaining preview or alert helper selectors that still have concrete consumers in the `Objects` surface
- any transient compatibility selector that is still referenced by a live component after the current split

Completed extractions now out of residual scope:

- shell and pane layout
- overlay sizing
- header and toolbar stacking
- filters and global search
- list surface wrappers
- list controls and breadcrumbs
- virtual list row and header layout
- grid card layout
- details presentation
- favorites pane
- image viewer
- bucket picker
- thumbnail primitives

## Next Cleanup Rule

Before touching `objects.module.css` again:

- confirm the next candidate selector still has a live consumer
- if it is owned by a single component family, move it to that family module
- if it has no live consumer, delete it instead of migrating it
