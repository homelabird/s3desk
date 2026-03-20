# Codebase Quality Review - 2026-03-19

## Scope

- Review focus:
  - quality gate depth
  - security-sensitive backend validation depth
  - `Objects` frontend maintainability
- Review basis:
  - repository structure
  - current verification scripts
  - current frontend and backend hotspots
- This is an engineering follow-up note, not an operator or release document.

## High-Level Assessment

The repository has good baseline signals:

- backend tests exist in meaningful volume
- frontend unit and Playwright coverage exist
- release and CI docs are unusually explicit

The main quality risks are concentrated in three areas:

1. standard local verification is shallower than the real browser-facing risk surface
2. security-sensitive backend paths rely on limited static analysis depth
3. `Objects` frontend styling is too concentrated in one CSS module for safe long-term iteration

## Improvement Priorities

### Priority 1: Align the standard quality gate with real browser-facing risk

#### Problem

`./scripts/check.sh` is the nominal local release gate, but it currently stops at:

- backend `go vet` and `go test`
- frontend lint, unit tests, and build

That means browser regressions can still slip through while the standard local gate is green. Browser-facing coverage exists, but it lives outside the standard check path in the dedicated frontend E2E workflow.

#### Why this is first

- this gap affects every frontend change, not just `Objects`
- it creates false confidence in the "main" verification command
- the repository is UI-heavy enough that a pure unit/build gate is not sufficient

#### Recent note

- A concrete frontend test-stability example is documented in [PROFILES_PAGE_TEST_STABILIZATION_NOTE_2026-03-20.md](/home/homelab/Downloads/project/s3desk/notes/PROFILES_PAGE_TEST_STABILIZATION_NOTE_2026-03-20.md).
- That note tracks a real `vitest` warning to `antd` `message.destroy()` cleanup outside `act(...)`, which is exactly the kind of frontend quality signal that is easy to miss without disciplined test ownership.

#### Success criteria

- the standard local check path includes at least one thin browser smoke layer
- frontend contributors can run a single standard command and catch common browser regressions before CI
- CI and local commands remain aligned enough that failures are reproducible

### Priority 2: Break up `Objects` styling ownership

#### Problem

`frontend/src/pages/objects/objects.module.css` is large and shared across many `Objects` components. It currently mixes:

- layout and pane rules
- toolbar and breadcrumb rules
- list and grid rules
- drawer and overlay rules
- global search layout rules
- mobile breakpoint overrides

This creates a single change surface for unrelated UI concerns. The recent mobile responsive work had to touch that file directly because too much behavior is concentrated there.

#### Why this is second

- `Objects` is the most layout-complex page in the frontend
- responsive regressions are already concentrated there
- CSS ownership is the current maintainability bottleneck even when product logic is otherwise stable

#### Success criteria

- `Objects` styles are split by functional area instead of one global module
- mobile-specific fixes can be made in the local component area without reopening unrelated list or pane rules
- Playwright mobile coverage remains green after the split

### Priority 3: Increase backend static and safety analysis depth

#### Problem

The backend currently relies on a relatively light standard gate:

- `gofmt`
- `go vet`
- `go test`

That is useful, but it is not deep enough for all security-sensitive or concurrency-sensitive code paths. Example categories include:

- TLS configuration and certificate handling
- provider auth and remote API behavior
- upload, jobs, and background lifecycle concurrency

#### Why this is third

- the current codebase already has meaningful backend test coverage
- the main immediate regressions have been browser-facing, not backend crash regressions
- this should still follow quickly because the repository includes security-sensitive storage integrations

#### Success criteria

- at least one deeper backend verification layer is added beyond `go vet`
- security-sensitive exceptions are easier to audit intentionally
- backend concurrency regressions become harder to miss before CI

## `Objects` Style Split Refactor Scope

### Current hotspot

Primary hotspot:

- `frontend/src/pages/objects/objects.module.css`

This stylesheet is imported from many places, including:

- `frontend/src/pages/ObjectsPageScreen.tsx`
- `frontend/src/pages/objects/ObjectsLayout.tsx`
- `frontend/src/pages/objects/ObjectsPagePanes.tsx`
- `frontend/src/pages/objects/ObjectsTreePanel.tsx`
- `frontend/src/pages/objects/ObjectsDetailsPanel.tsx`
- `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx`
- `frontend/src/pages/objects/ObjectsListContent.tsx`
- `frontend/src/pages/objects/ObjectsListControls.tsx`
- `frontend/src/pages/objects/ObjectsListRow.tsx`
- `frontend/src/pages/objects/ObjectsToolbar.tsx`
- `frontend/src/pages/objects/ObjectsPageHeader.tsx`

The actual import surface is wider than this list, but these are the first files that should define the split.

### Refactor goal

Reduce style coupling by moving from one broad CSS module to area-owned CSS modules.

### Recommended target split

Keep `ObjectsDialogs.module.css` as-is. Split `objects.module.css` into at least these areas:

1. `ObjectsShell.module.css`
   - page shell
   - pane layout
   - tree/details panel container rules
   - overlay sheet sizing
   - responsive shell breakpoints
2. `ObjectsToolbar.module.css`
   - page header
   - breadcrumb and bucket picker layout
   - toolbar actions
   - compact/mobile control stacking
3. `ObjectsList.module.css`
   - list header
   - list rows
   - list/grid shared cells
   - thumbnails and grid cards
4. `ObjectsSearch.module.css`
   - filters drawer
   - global search drawer
   - search form layout
   - search result list/table responsiveness

If needed, leave a very small compatibility layer in `objects.module.css` only during migration. The end state should not keep it as the main style authority.

### Initial write scope

Phase 1 should stay limited to these files:

- `frontend/src/pages/ObjectsPageScreen.tsx`
- `frontend/src/pages/objects/ObjectsLayout.tsx`
- `frontend/src/pages/objects/ObjectsPagePanes.tsx`
- `frontend/src/pages/objects/ObjectsTreePanel.tsx`
- `frontend/src/pages/objects/ObjectsDetailsPanel.tsx`
- `frontend/src/pages/objects/ObjectsOverlaySheet.tsx`
- `frontend/src/pages/objects/ObjectsPageHeader.tsx`
- `frontend/src/pages/objects/ObjectsToolbar.tsx`
- `frontend/src/pages/objects/ObjectsListControls.tsx`
- `frontend/src/pages/objects/ObjectsListContent.tsx`
- `frontend/src/pages/objects/ObjectsListRow.tsx`
- `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx`
- `frontend/src/pages/objects/ObjectsFiltersDrawer.tsx`

Phase 1 should not try to clean up every `Objects` import. The first goal is to isolate the most mobile-sensitive layout areas.

### Migration order

1. extract shell and drawer rules first
2. extract global search and filters second
3. extract list and grid rules third
4. remove leftover compatibility classes only after Playwright mobile coverage stays stable

### Do not do this in the first pass

- do not rename every class for aesthetics only
- do not rewrite component structure and CSS ownership in the same change
- do not mix action-logic refactors with style extraction
- do not convert the page to a design-system rewrite during the CSS split

### Validation target after the split

- `tests/objects-mobile-responsive.spec.ts`
- any affected `Objects` unit tests that render list rows or grid cards

## Minimal Additional Quality Gate Proposal for `check.sh`

### Goal

Strengthen the standard local gate without turning `./scripts/check.sh` into a full slow E2E pipeline.

### Proposed minimum additions

1. add a thin browser smoke command to the standard check path
   - preferred shape:
     - new frontend script such as `npm run test:e2e:smoke`
   - purpose:
     - catch route boot, shell, auth, and obvious browser regressions that unit tests cannot catch
2. add backend race detection to the standard backend test pass
   - preferred shape:
     - `go test -race ./...`
   - purpose:
     - increase confidence around jobs, uploads, realtime, and background workflow code

### Recommended staged rollout

#### Stage 1

Update `check.sh` to include:

- backend:
  - `go vet ./...`
  - `go test ./...`
  - `go test -race ./...`
- frontend:
  - existing lint, unit, and build checks
  - one small browser smoke command

#### Stage 2

After the smoke path is stable, align CI naming and local naming around the same scripts:

- `npm run test:e2e:core`
- `npm run test:e2e:mobile-responsive`
- `npm run test:e2e:smoke`

#### Stage 3

Keep deeper security scanning outside `check.sh` if needed, but add it somewhere explicit:

- CI-only `gosec` or equivalent security scan
- CI-only deeper Go static analysis such as `staticcheck`

This keeps the local standard gate practical while still closing the current analysis gap.

### Why these additions are the minimum useful step

- they address the biggest current blind spots directly
- they do not require turning the main local gate into the full Playwright suite
- they preserve the idea that `./scripts/check.sh` is the single most important verification command

## Recommended Execution Order

1. add the thin browser smoke command and race pass proposal to the engineering backlog
2. split `Objects` shell and search CSS ownership first
3. add deeper backend static/security analysis in CI after the standard gate is stable

## Short Conclusion

The codebase is not low quality. The main problem is that quality controls and ownership boundaries are uneven:

- the standard gate is shallower than the real UI risk
- backend safety analysis is lighter than the domain deserves
- `Objects` style ownership is too centralized

Fix those three areas in that order before broad cleanup work.
