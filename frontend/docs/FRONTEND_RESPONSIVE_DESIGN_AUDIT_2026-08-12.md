# Frontend Responsive Design Audit

Date: 2026-08-12

## Objective

Evaluate the current frontend design across representative viewport sizes, themes, data densities, and interaction states; record evidence-backed gaps before applying improvements.

## Evidence Reviewed

- Current rendered snapshots for Objects, Profiles, Buckets, Uploads, Transfers, login, settings, jobs, dialogs, drawers, empty states, and dark-mode search
- Responsive source ownership in the app shell and page-level CSS modules
- `90` responsive workflow tests across the iPhone 13 and Pixel 7 projects
- `43` focused visual and accessibility tests across design-audit, overlay, and dark-theme scenarios
- Existing desktop (`1280`/`1440`), tablet (`768`), mobile (`390`), and selected narrow-mobile (`320`) geometry assertions

## Overall Assessment

The frontend has a consistent visual system, clear primary actions, usable mobile cards, stable outer-scroll ownership, readable light/dark contrast, and strong dialog/drawer behavior. No critical horizontal-overflow, unreachable-action, or inaccessible-overlay defect was reproduced.

The remaining work is targeted rather than a redesign. The main product-facing issue is the Objects desktop control hierarchy; the main verification issue is that narrow-mobile and dark mobile data-page states are underrepresented in the visual baseline.

## Findings

### F-01 — Objects desktop controls are visually misaligned

Severity: Medium

- At wide desktop widths, the current-folder search is vertically centered against a control group that wraps to two rows.
- The filter trigger is labelled `View` even though it uses a filter icon and opens filtering/view options; mobile already uses the clearer `Filters` label.
- This makes the highest-density workflow slower to scan and creates avoidable desktop/mobile terminology drift.

Planned improvement:

- Top-align the desktop control row.
- Use `Filters` consistently in advanced mode.
- Add a rendered geometry assertion for search/filter alignment.

### F-02 — Narrow-mobile Objects controls consume the first viewport

Severity: Medium

- Functional tests cover selected `320px` workflows, including login, jobs, settings, object overlays, and image preview.
- The design-audit snapshots begin at `390px` for full app pages, so regressions in the combined app header, page title, location controls, and first data row at `320px` would not have a dedicated visual baseline.
- A new `320 x 568` capture reproduced four full-width filter/search/list/grid buttons stacked vertically, leaving only the border of the first data row visible in the initial viewport.

Planned improvement:

- Keep the controls touch-safe but arrange them as two two-column rows.
- Add a `320 x 568` Objects shell snapshot with viewport-overflow and first-content assertions.

### F-03 — Dark mobile data-page coverage is too narrow

Severity: Low validation gap

- Dark-mode screenshots cover the Objects desktop shell and search drawer.
- Mobile data cards, badges, primary/secondary actions, and the compact app header are not represented together in a dark visual baseline.

Planned improvement:

- Add a dark mobile Profiles snapshot because it combines compact navigation, status badges, connection metadata, card boundaries, and row actions.

## Confirmed Strengths

- Profiles and Buckets switch between desktop tables and mobile cards without duplicate or nested vertical scrollers.
- Long object keys truncate or wrap without producing horizontal page overflow.
- Core overlays remain operable at narrow widths and preserve reachable close and footer actions.
- Mobile touch targets and settings tab reachability are covered at `320px` where risk is highest.
- Upload destination controls remain in the first mobile viewport, and the primary source-selection action remains visible before files are selected.
- Light/dark tokens provide clear surface, border, selected, and focus-state hierarchy in the reviewed fixtures.

## Acceptance Criteria For This Follow-up

- Objects desktop search and filter controls begin on the same visual row.
- Advanced-mode filter terminology is consistent between desktop and compact layouts.
- Narrow-mobile Objects filter/search and list/grid controls occupy no more than two rows.
- The design-audit suite includes full-page `320px` shell and dark mobile data-card evidence.
- Responsive, visual, accessibility, type, lint, and production-build gates remain green.

## Improvements Applied

- Top-aligned the wide Objects control row and renamed the advanced filter trigger from `View` to `Filters`.
- Replaced the `320px` four-row Objects control stack with two touch-safe two-column rows.
- Added desktop search/filter geometry proof and guarded visual setup against lazy-toolbar capture races.
- Added `320 x 568` Objects shell and dark mobile Profiles visual baselines.

## Post-change Validation

- `90/90` responsive workflow tests passed across the iPhone 13 and Pixel 7 projects.
- `29/29` full `@visual` regression scenarios passed.
- `45/45` focused design-audit, overlay accessibility, and dark-theme accessibility scenarios passed.
- Focused Objects control unit tests passed (`4/4`).
- Typecheck, full lint, CSS-token checks, import-cycle checks, design contrast checks, and production build passed.
- The advisory design-pattern scan still reports generic review prompts for intentional transparent controls, opacity, compact radii, and flat primitives; none was promoted to a defect without rendered evidence.

## Proof Boundary

The fixtures prove frontend layout and interaction behavior with deterministic mocked data. They do not prove production-scale provider content, authenticated deployment behavior, browser engines outside the configured Chromium projects, or device-specific safe-area behavior on physical hardware.
