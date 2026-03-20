# Mobile UX Audit

This audit started as the follow-up backlog after the app-shell scrolling fix.
It now doubles as a status document that shows which mobile-friendly UI/UX
improvements have already landed and which lower-risk follow-ups still remain.
It is based on code inspection of the frontend layouts, shared components,
responsive breakpoints, existing mobile smoke coverage, and browser/platform
constraints that are already handled in the frontend.

## Scope

- frontend shell and shared responsive components
- `Profiles`, `Buckets`, `Objects`, `Uploads`, `Jobs`, and `Settings`
- mobile viewport behavior, touch targets, action density, modal sizing, and
  visual scanning
- evidence-backed support expectations for the tested responsive/browser
  scenarios already covered in the repo, not a blanket certification for every
  browser shell or device posture

## Existing Coverage

- `frontend/playwright.config.ts` runs `frontend/tests/mobile-smoke.spec.ts` on
  `mobile-iphone-13` and `mobile-pixel-7`; the iPhone project keeps iPhone
  viewport/UA emulation but runs on Chromium for Linux portability
- `frontend/tests/mobile-smoke.spec.ts` verifies core mobile rendering, touch
  target sizing, responsive search/filter affordances, phone-safe dialogs, and
  the app-shell scroll container without horizontal overflow
- `frontend/tests/responsive-lists.spec.ts` verifies compact list/table
  switching for key pages at desktop, tablet, and extra-small widths
- the audit notes below come from code inspection of shared layouts, tabs,
  compact cards, dialogs, sheets, and page-level mobile states
- `frontend/src/lib/deviceFs.ts`,
  `frontend/src/pages/uploads/uploadsFileSelection.ts`, and
  `frontend/tests/uploads-folder.spec.ts` already encode browser/platform
  constraints such as `showDirectoryPicker`, `webkitdirectory`, and secure
  context requirements
- `lighthouserc.js` already enforces accessibility and best-practices scoring

Taken together, this is strong evidence for responsive behavior and routine UI
flows in mainstream desktop and handset browser contexts that resemble the
current Playwright projects and the audited layouts below. It is not a blanket
guarantee for every embedded webview, every landscape or foldable posture,
every zoom or text-scaling combination, or browser APIs that are not
universally available across browsers and platforms.

## Status Snapshot

- Completed: shared touch targets, horizontal tabs, modal/sheet phone sizing,
  safe-area handling, jobs mobile filters, metadata readability, and
  uploads/settings small-breakpoint tuning
- Mostly completed: compact-card action density and mobile search/filter
  discoverability now work better, with a small amount of optional polish still
  available
- Remaining optional follow-up: a stronger very-narrow-screen tab fallback,
  reducing reliance on compact-card `More` menus, and a first-use indexed
  search hint if user feedback still points to discoverability gaps

## Completed and Mostly Completed Areas

### 1. Increase touch target sizes in shared mobile controls

- `frontend/src/components/NativeSelect.module.css`
- `frontend/src/components/OverlaySheet.module.css`
- `frontend/src/FullAppInner.module.css`

Status: completed

The shell still relies on compact controls in places that are frequently tapped
on phones: header actions, the profile selector, and drawer close buttons. Some
of these controls are sized closer to desktop density than the 44x44 touch
target expectation that works better on mobile.

Recommended follow-up:

- raise mobile button/select minimum heights to at least `44px`
- increase hit area around `OverlaySheet` close actions
- avoid reducing inter-button gaps too aggressively in the mobile header

### 2. Improve horizontal tab discoverability and tap comfort

- `frontend/src/components/appTabs.module.css`
- `frontend/src/pages/SettingsPage.tsx`

Status: completed, with a very-narrow-screen alternate tab fallback still
optional

The tab UI can scroll horizontally on narrow screens, but the component does
not provide a strong affordance that more tabs exist off-screen. Combined with
compact padding, this can make tab navigation feel hidden or fiddly on phones.

Recommended follow-up:

- increase tab padding on mobile
- add stronger overflow affordance for horizontally scrollable tabs
- consider a dropdown or segmented alternative for very narrow screens

### 3. Reduce cramped action groups in compact card layouts

- `frontend/src/pages/profiles/ProfilesTable.tsx`
- `frontend/src/pages/ProfilesPage.module.css`
- `frontend/src/pages/BucketsPage.tsx`
- `frontend/src/pages/BucketsPage.module.css`

Status: mostly completed, with `More`-menu reliance still available as optional
polish

Profiles and buckets already switch to compact cards, but their action rows
still rely on wrapped button groups. On smaller phones, the button group can
become visually dense and secondary actions become harder to discover.

Recommended follow-up:

- stack action buttons vertically below an extra-small breakpoint
- keep the primary action full width
- reduce the need to open a `More` menu for routine mobile actions

### 4. Make modal and sheet sizing more phone-safe

- `frontend/src/components/DialogModal.module.css`
- `frontend/src/pages/objects/ObjectsPresignModal.tsx`
- `frontend/src/pages/objects/ObjectsNewFolderModal.tsx`
- `frontend/src/pages/jobs/CreateJobModal.tsx`
- `frontend/src/pages/profiles/ProfileModal.tsx`

Status: completed

Several flows use fixed dialog widths or full-height mobile sheets. The current
responsive handling is functional, but still leaves room for improvement on
very short viewports, narrow phones, and soft-keyboard scenarios.

Recommended follow-up:

- prefer viewport-relative modal widths on small screens
- tune mobile modal padding and max-height below `360px` width
- add safe-area-aware footer spacing for bottom sheets

### 5. Improve safe-area handling for sticky and floating surfaces

- `frontend/src/FullAppInner.module.css`
- `frontend/src/components/PopoverSurface.module.css`
- `frontend/src/components/OverlaySheet.module.css`

Status: completed

The recent shell fix added bottom inset padding to the main scroll region, but
other sticky and floating surfaces still use standard viewport offsets. This
can leave banners, popovers, and sheet chrome feeling tight against notches or
home-indicator areas.

Recommended follow-up:

- apply safe-area-aware spacing to sticky banners and surface paddings
- use safer width calculations for popovers near the viewport edge
- verify iPhone notch and Android gesture-navigation behavior visually

### 6. Simplify dense Jobs filters on phone widths

- `frontend/src/pages/jobs/JobsToolbar.tsx`
- `frontend/src/pages/jobs/JobsToolbar.module.css`

Status: completed

Jobs exposes useful filtering and health summaries, but the mobile layout still
packs a large number of controls into a small area. The information remains
available, yet scanning and manipulating those controls on phones is more
expensive than it should be.

Recommended follow-up:

- collapse advanced filters into a dedicated mobile filter surface
- reduce health card density below a smaller breakpoint such as `480px`
- keep the primary search action visually prominent

### 7. Improve text wrapping and metadata readability in compact cards

- `frontend/src/pages/ProfilesPage.module.css`
- `frontend/src/pages/BucketsPage.module.css`
- `frontend/src/pages/jobs/JobsMobileList.tsx`

Status: completed

Compact cards are a good mobile direction, but metadata sections still depend
heavily on two-column grids and long values. Endpoints, error details, and
bucket metadata can become harder to scan on narrow screens.

Recommended follow-up:

- move metadata grids to one column sooner on very small screens
- apply consistent long-text wrapping rules
- tighten spacing while preserving readable line-height

### 8. Clarify mobile search and filter discoverability

- `frontend/src/pages/jobs/JobsToolbar.tsx`
- `frontend/src/pages/objects/ObjectsPageScreen.tsx`
- `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx`

Status: mostly completed, with an explicit first-use indexed-search hint still
optional

Desktop layouts expose search and filtering more explicitly than mobile
layouts. On phones, some of that power is still present but hidden behind
compact controls or drawers, which makes discoverability weaker.

Recommended follow-up:

- ensure mobile toolbars keep a clearly visible search/filter affordance
- use labels or icons that make the drawer entry points obvious
- consider a first-use hint for global search on the objects page

### 9. Tune uploads and settings layouts for smaller breakpoints

- `frontend/src/pages/UploadsPage.module.css`
- `frontend/src/pages/UploadsPage.tsx`
- `frontend/src/pages/settings/AccessSettingsSection.tsx`
- `frontend/src/pages/SettingsPage.tsx`

Status: completed

Uploads and settings already collapse toward single-column layouts, but field
grouping and tab density can still feel desktop-first on smaller devices.

Recommended follow-up:

- add an extra-small breakpoint for uploads summary/control spacing
- stack compact input/button combinations vertically when width is limited
- verify settings tabs remain easy to navigate without hidden overflow

## Remaining Optional Follow-up Items

- consider a dropdown or segmented fallback if horizontally scrollable tabs
  still feel hidden on very narrow phones
- reduce reliance on `More` menus for routine compact-card actions where a
  clear always-visible secondary action would improve mobile flows
- revisit a first-use global-search hint only if indexed search remains hard to
  discover after the current label/callout updates

## If More Mobile Polish Is Needed

1. shared touch targets (`NativeSelect`, header buttons, drawer close controls)
2. tabs and action-group density (`AppTabs`, profile/bucket mobile cards)
3. modal/sheet phone sizing and safe-area handling
4. jobs mobile filter simplification
5. page-level readability refinements for uploads, settings, and metadata cards

## Suggested Validation

- rerun `frontend/tests/mobile-smoke.spec.ts` on both mobile projects
- rerun `frontend/tests/responsive-lists.spec.ts`
- capture screenshots for iPhone-style and Android-style mobile viewports
- run Lighthouse accessibility checks against the mobile flows that change
