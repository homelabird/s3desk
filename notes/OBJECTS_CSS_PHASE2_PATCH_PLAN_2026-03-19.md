# Objects CSS Phase 2 Patch Plan - 2026-03-19

## Goal

Split the remaining `Objects` list and grid styling out of `frontend/src/pages/objects/objects.module.css` after phase 1 shell and search extraction.

Phase 2 scope:

- list surface wrappers
- list controls and breadcrumb layout
- selection bar and list header wrappers
- virtualized row layout and row interaction styling
- grid card layout and card-state styling
- list/grid responsive breakpoints that only affect these areas

Not in phase 2:

- tree pane styling
- details pane styling
- favorites and image viewer styling
- bucket picker styling
- search drawer styling already moved in phase 1
- action logic, DnD logic, virtualization logic, or renderer behavior changes

## Proposed New Files

- `frontend/src/pages/objects/ObjectsListView.module.css`
- `frontend/src/pages/objects/ObjectsGridCards.module.css`

## Compatibility Rules

- keep `frontend/src/pages/objects/objects.module.css` during phase 2 until each class family is fully migrated
- do not mix CSS extraction with object interaction refactors
- keep class ownership split by component responsibility, not by arbitrary line ranges
- preserve current responsive behavior while moving styles

## Ownership Split

### `ObjectsListView.module.css`

Own list-surface and list-row concerns:

- `listPane`
- `listTop`
- `dropZoneCard`
- `selectionBar`
- `listHeaderRow`
- `listScroller`
- `listGridBase`
- `listGridCompact`
- `listGridWide`
- `listHeaderGrid`
- `listRow*`
- `virtualListContent`
- `virtualListFooter`
- `listFooterAction`
- `listEmptyState`
- `listEmptyLoading`
- `breadcrumb*`
- `listControls*`
- list-only responsive rules touching the classes above

### `ObjectsGridCards.module.css`

Own grid-card concerns:

- `gridContent`
- `gridFooter`
- `gridCardShell`
- `gridCardDropTarget`
- `gridCard`
- `gridCardSelected`
- `gridCardDropActive`
- `gridCardTopRow`
- `gridCardTopActions`
- `gridCardCheckboxWrap`
- `gridCardMedia`
- `gridCardMediaFolder`
- `gridCardMediaPlaceholder`
- `gridCardPreviewFrame`
- `gridCardPreviewButton`
- `gridCardDeferredPreviewButton`
- `gridCardFolderIcon`
- `gridCardFileIcon`
- `gridCardBody`
- `gridCardBodyActions`
- `gridCardTitle`
- `gridCardMetaLine`
- `listThumbnailDeferredHint`
- grid-only responsive rules touching the classes above

## Patch Slice A - List Surface and Controls Extraction

### `frontend/src/pages/objects/ObjectsListView.module.css`

- [ ] add list pane wrappers and scroll container rules
- [ ] add selection bar and list header wrapper rules
- [ ] add breadcrumb layout rules
- [ ] add list controls location, sort, toggle, and compact footer rules
- [ ] move list-only responsive rules for compact footer, header padding, and control stacking

### `frontend/src/pages/objects/ObjectsListPane.tsx`

- [ ] switch wrapper imports to `ObjectsListView.module.css`
- [ ] keep component structure unchanged

### `frontend/src/pages/objects/ObjectsListControls.tsx`

- [ ] switch breadcrumb and control layout imports to `ObjectsListView.module.css`
- [ ] keep control order and event wiring unchanged

### `frontend/src/pages/objects/objects.module.css`

- [ ] retain list and grid row/card styles until later slices land
- [ ] remove only list-surface and list-controls classes after imports move cleanly

## Patch Slice B - Virtual List Rows and Header Extraction

### `frontend/src/pages/objects/ObjectsListView.module.css`

- [ ] add base grid templates for compact and wide list layouts
- [ ] add row shell, selected, drag/drop, and compact meta rules
- [ ] add menu alignment and metric-cell rules
- [ ] add empty-state and virtual-footer rules

### `frontend/src/pages/objects/ObjectsListHeader.tsx`

- [ ] switch header grid imports to `ObjectsListView.module.css`
- [ ] keep sort button structure unchanged

### `frontend/src/pages/objects/ObjectsListRow.tsx`

- [ ] switch row and menu-related imports to `ObjectsListView.module.css`
- [ ] preserve row semantics, keyboard handling, and menu wiring

### `frontend/src/pages/objects/ObjectsListContent.tsx`

- [ ] switch virtual-list and empty-state imports to `ObjectsListView.module.css`
- [ ] leave grid-card imports on `objects.module.css` until slice C lands

### `frontend/src/pages/objects/__tests__/ObjectsListRow.test.tsx`

- [ ] touch only if CSS module import changes require test updates

## Patch Slice C - Grid Card Extraction

### `frontend/src/pages/objects/ObjectsGridCards.module.css`

- [ ] add grid container and footer rules
- [ ] add base card shell, hover, selected, and drop-target rules
- [ ] add media frame, placeholder, and preview-state rules
- [ ] add title, meta, and action-row rules
- [ ] move grid-only mobile breakpoints for card width, gap, and media height

### `frontend/src/pages/objects/useObjectsObjectGridRenderer.tsx`

- [ ] switch object-card imports to `ObjectsGridCards.module.css`
- [ ] keep card behavior and menu wiring unchanged

### `frontend/src/pages/objects/useObjectsPrefixGridRenderer.tsx`

- [ ] switch prefix-card imports to `ObjectsGridCards.module.css`
- [ ] preserve DnD behavior and menu wiring

### `frontend/src/pages/objects/ObjectsListContent.tsx`

- [ ] switch grid container imports to `ObjectsGridCards.module.css`
- [ ] keep grid rendering flow unchanged

### `frontend/src/pages/objects/__tests__/useObjectsPrefixGridRenderer.test.tsx`

- [ ] touch only if CSS module import changes require test updates

## Patch Slice D - Controlled Cleanup

### `frontend/src/pages/objects/objects.module.css`

- [ ] remove migrated `listControls*` and `breadcrumb*` classes
- [ ] remove migrated `listGrid*`, `listRow*`, and `virtualList*` classes
- [ ] remove migrated `grid*` classes
- [ ] keep unrelated `favorites*`, `details*`, `imageViewer*`, and bucket-picker classes in place
- [ ] keep any temporary compatibility classes only if still referenced by deferred code

## Recommended File Order

1. `ObjectsListView.module.css`
2. `ObjectsListPane.tsx`
3. `ObjectsListControls.tsx`
4. `ObjectsListHeader.tsx`
5. `ObjectsListRow.tsx`
6. `ObjectsListContent.tsx`
7. `ObjectsGridCards.module.css`
8. `useObjectsObjectGridRenderer.tsx`
9. `useObjectsPrefixGridRenderer.tsx`
10. `objects.module.css`

## Review Guardrails

- do not change virtualization offsets or row height calculation
- do not redesign card markup while moving styles
- do not convert inline upload-drop overlay styling in `ObjectsListSection.tsx` during this pass
- keep list-view and grid-view ownership separate so later regressions are easier to localize
- prefer temporary dual imports over risky bulk cleanup until each slice is proven stable

## Validation Targets After Phase 2

- [ ] `frontend/tests/objects-mobile-responsive.spec.ts`
- [ ] `frontend/src/pages/objects/__tests__/ObjectsListRow.test.tsx`
- [ ] `frontend/src/pages/objects/__tests__/useObjectsPrefixGridRenderer.test.tsx`
- [ ] any broader `@mobile-responsive` rerun only after phase 2 cleanup is complete
