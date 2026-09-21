# Object density and navigation

This frontend change builds on the SeaweedFS-unified source archive. It does not
modify the backend, provider endpoints, Compose stacks, credentials, databases,
object data, or existing SeaweedFS/performance changes.

## Grid contract

`frontend/src/pages/objects/objectsGridLayout.ts` owns container-based geometry.
At a **measured object-list width of 760 CSS pixels or more**, the grid has at
least eight columns. At 280–759 pixels it has at least four. Larger lists can
show more columns; very narrow embeds below 280 pixels are allowed fewer.
Browser zoom and operating-system scaling affect the CSS viewport, so “100%”
alone is not a viewport-size specification. The default 1280px-and-wider desktop
layouts are covered by the new application-level Playwright cases in both simple
and advanced modes, including an open details preference.

The target card width is 100px (rather than the old desktop minimum of 210px).
The explicit eight/four-column rules can make cards narrower than this target.
A single target avoids losing columns at the narrow/compact breakpoint when the
list grows. Padding/gap are 4px for narrow lists and 6px otherwise. Geometry is
read from the actual list container, not `window.innerWidth`, so app-sidebar,
folder-tree and details-pane changes reflow the grid. A newly docked pane may
consume part of the width freed by closing app navigation.

Grid media areas are 64px regular, 56px compact, and 44px narrow; thumbnails are
48px regular/compact and 32px narrow. File/folder glyphs use the existing 28px
icon token. Titles retain two lines and a full-name title attribute. File size
is visible on narrow screens; the modified timestamp is hidden only there.

A thumbnail opens the existing large-preview dialog. The filename/size button
selects the object and exposes `aria-pressed`; it is separate from the preview
button and menu. On touch layouts, the favorite action remains in the menu
instead of consuming another button-width on each card. Grid virtualization is
retained. Measurements are invalidated when columns regroup; fallback positions
also use the same scroll margin as measured rows.

## List contract

The default wide row estimate/minimum is 44px (previously 72px); compact rows
are 52px (previously 60px). List thumbnails are 28px wide-mode / 24px compact-mode.
Rows are minimum-sized, not clipped to a fixed height: enlarged fonts or other
content may require more space and the virtualizer measures that height.
Compact filenames and size/date metadata share a text stack inside the same
selection button instead of adding another row below the favorite control.

Mobile/coarse-pointer actions retain at least 44x44px targets. Scoped rules take
precedence over the global 48px touch minimum without reducing controls elsewhere.
They do not depend on the CSS chunk load order. Compact inline Preview is omitted
where the menu already provides that action. Wide touch layouts may be taller
than 44px to preserve their touch targets.

## Left navigation

The header hamburger is always present. At desktop breakpoints it toggles the
192px app sidebar to zero width; the hidden navigation children are removed to
avoid focusable links in an invisible pane. The state uses the existing safe
`useLocalStorageState` helper under `appSidebarCollapsed`, defaults to expanded,
and accepts only boolean `true` as collapsed. Storage failures do not prevent
in-memory toggling. The state belongs to `useFullAppShellState`, passed through
the existing controller/view-model boundary.

On mobile, the same button opens/closes the existing navigation sheet. Its
mobile state is independent of the saved desktop preference. The existing
sheet owns dismissal and focus behavior. Moving into desktop width closes an
open mobile sheet so it does not unexpectedly reappear on rotation. Labels,
`aria-expanded`, and `aria-controls` track the appropriate desktop/mobile target.

## Validation and reproduction

The delivery evidence distinguishes an isolated source/CSS check from the app:

* The pure layout helper was strictly type-checked with preinstalled TypeScript
  5.8.3 and executed across 3,568 cases, including every integer list width from
  280 to 3840px, non-decreasing column counts, invalid inputs and resize recovery.
* 40 isolated Chromium combinations cover ten viewports, grid/list, and two
  touch-rule load orders. They use production TSX-derived DOM and production CSS,
  but structural React/AntD stubs and a synthetic surrounding layout. They are
  **not full-application, real-device or SeaweedFS E2E evidence**.
* Seventeen synchronous source-level sidebar state/prop-wiring checks passed;
  these do not replace React lifecycle, focus or browser integration tests.
* CSS tokens, import-cycle checks, changed-file syntax checks and tracked token
  contrast checks passed. Design-pattern scanning remains advisory, with existing
  findings. Import scanning used the preinstalled TypeScript resolver.
* Full `npm run build` and Vitest could not run successfully: dependency download
  is unavailable in this environment and dependencies are not cached. Application
  Playwright tests and visual baseline regeneration have **not** been run.
  The delivered PNGs are clearly marked isolated fixtures, not app snapshots.

The checked-in unit and application browser tests cover layout math, sidebar
persistence/invalid preferences, independent mobile state, compact metadata,
preview isolation, eight-column desktop layouts, reflow, and mobile targets.
On a supported Node 22 environment with dependency access:

```bash
cd frontend
npm ci --no-audit --no-fund
npm run build
npm run test:unit -- \
  src/pages/objects/__tests__/objectsGridLayout.test.ts \
  src/pages/objects/__tests__/ObjectsListRow.test.tsx \
  src/pages/objects/__tests__/ObjectsListContent.test.tsx \
  src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx \
  src/__tests__/useFullAppShellState.test.tsx \
  src/__tests__/useFullAppController.test.tsx \
  src/__tests__/FullAppInner.smoke.test.tsx
npx playwright install chromium
npx playwright test tests/objects-layout-density.spec.ts --project=chromium
npx playwright test tests/objects-mobile-responsive.spec.ts \
  --project=mobile-iphone-13 --project=mobile-pixel-7
```

Inspect intentional visual differences before updating snapshots in the normal
visual-test workflow. Do not replace app screenshots with the isolated fixtures.
The existing dependency lock requires a sufficiently recent Node 22 patch
version (the available Node 22.16.0 produced a react-router engine warning).
