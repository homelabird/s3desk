# Visual QA Checklist

Use this checklist after the UI/UX design audit changes are built and run in a browser.

## Required Modes

- Light theme
- Dark theme
- Desktop width, at least `1280px`
- Tablet width, around `768px`
- Mobile width, around `390px`

## Core Screens

- Login/token entry
- Initial profile selection and light app profile list
- Main app shell with sidebar and top header
- Buckets list
- Bucket create modal
- Bucket policy modal
- Bucket governance modal
- Profiles list
- Profile create/edit modal
- Objects browser list view
- Objects browser grid view
- Objects bucket picker
- Objects details drawer/panel
- Objects global search drawer
- Objects image viewer
- Uploads page
- Upload source sheet
- Jobs page
- Jobs logs drawer
- Settings page
- Backup drawer and transfer queue rows

## Required States

- Empty state
- Loading state
- Error state
- Warning state
- Disabled controls
- Focus-visible controls
- Hovered row/card/menu item
- Selected navigation item
- Selected table/list row
- Selected object grid card
- Active tab
- Modal/sheet/popover open above content

## Acceptance Checks

- Current page and current navigation item are obvious within two seconds.
- Primary action and destructive action are visually distinct.
- Selected rows/cards have more than pale background color; accent edge or strong border is visible.
- Dense lists and tables have scannable row separation without overpowering content.
- Section headers and table headers are visually distinct from body content.
- Secondary text is readable in both themes without opacity-only styling.
- Empty/loading states look intentional and do not disappear into the page background.
- Warning and error states remain recognizable without relying only on color hue.
- Modals, drawers, sheets, menus, and popovers clearly separate from the background page.
- Ant Design components and custom CSS modules share the same surface hierarchy.

## Regression Watchpoints

- Primary buttons in dark mode must keep readable text contrast.
- Sidebar active item must remain readable in both themes.
- Object browser virtual rows must not lose row boundaries after scrolling.
- Sticky table headers must not blend into body rows.
- Image viewer fallback and loading overlays must remain visible over media content.
- Mobile cards must not look like a flat list of text separated only by hairlines.
- Focus rings must be visible but not mistaken for selected state.

## Evidence To Capture

- Screenshot set for light desktop core screens.
- Screenshot set for dark desktop core screens.
- Mobile screenshots for login, objects, jobs, settings, and uploads.
- Playwright screenshots from `npm run test:e2e:design-audit`.
- Notes for any screen where hierarchy, contrast, or action priority is still ambiguous.

## Completion Link

- Record final validation status in `docs/DESIGN_AUDIT_IMPLEMENTATION_STATUS.md` before considering the design audit complete.
- Record command and manual QA evidence in `docs/DESIGN_AUDIT_VALIDATION_LOG.md`.
- `npm run validate:design-audit` can populate command evidence automatically; manual visual QA still needs human review notes.
