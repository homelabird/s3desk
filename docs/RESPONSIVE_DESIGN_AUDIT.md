# Responsive Design Audit

This note identifies the work still needed to raise the responsive-design quality of the current S3Desk frontend. It is based on the current layout shell, page modules, and drawer/modal patterns in `frontend/src`.

## Current strengths

The frontend already has a good foundation:

- `frontend/src/FullAppInner.tsx` uses Ant Design breakpoints and swaps between desktop sider navigation and mobile drawer navigation.
- `frontend/src/pages/ProfilesPage.module.css`, `frontend/src/pages/BucketsPage.module.css`, and `frontend/src/pages/jobs/JobsTableSection.module.css` already provide mobile card layouts under smaller breakpoints.
- `frontend/src/pages/profiles/ProfileModal.module.css` collapses multi-column form layouts into a single column on smaller screens.
- `frontend/src/pages/objects/objects.module.css` consistently uses `min-width: 0`, text ellipsis, and responsive docking breakpoints for the tree/details panes.

Those patterns mean the project is not starting from zero. The remaining work is mostly about consistency, small-screen edge cases, and systematic verification.

## Recommended work items

### 1. Define and verify a clear breakpoint matrix

The code currently centers most responsive behavior around `768px`, `992px`, and `1200px`, but the project still needs an explicit verification pass for:

- 320px to 480px phones
- 640px to 768px large phones / small tablets
- 992px tablet-to-desktop transition
- 1200px+ docked objects layout

Recommended action:

- Use the existing page shells and smoke tests as a checklist and verify each major route at those widths before changing styles.

### 2. Tighten mobile navigation and top-bar behavior

The app shell is already responsive, but the remaining work is to make the small-screen navigation experience more polished and predictable.

Relevant files:

- `frontend/src/FullAppInner.tsx`
- `frontend/src/FullAppInner.module.css`

Recommended action:

- Verify the left navigation drawer on 320px to 375px widths so its width, padding, and menu density remain comfortable.
- Verify the header action cluster when profile selection, transfers, theme toggle, settings, and logout all compete for space.
- Confirm drawer-open, route-change, and keyboard-focus behavior on touch devices.

### 3. Standardize drawers and modals for small screens

There are multiple drawer-based workflows across the app, but they do not appear to share one mobile sizing rule.

Relevant files include:

- `frontend/src/components/SettingsDrawer.tsx`
- `frontend/src/components/transfers/TransfersDrawer.tsx`
- `frontend/src/pages/jobs/JobsDetailsDrawer.tsx`
- `frontend/src/pages/jobs/JobsLogsDrawer.tsx`
- `frontend/src/pages/objects/ObjectsFiltersDrawer.tsx`
- `frontend/src/pages/objects/ObjectsBucketPicker.tsx`
- `frontend/src/pages/profiles/ProfileModal.tsx`

Recommended action:

- Review each drawer/modal for viewport width and height limits on phones.
- Ensure footer actions remain visible without awkward nested scrolling.
- Align placement choices (`left`, `right`, `bottom`) with the content density and touch ergonomics of each workflow.

### 4. Finish the mobile story for dense data views

The main responsive risk is in the high-density pages where tables, virtual lists, or grid views still have more states than the simpler pages.

Relevant files:

- `frontend/src/pages/jobs/jobsVirtualTable.module.css`
- `frontend/src/pages/jobs/JobsTableSection.tsx`
- `frontend/src/pages/objects/objects.module.css`
- `frontend/src/pages/ProfilesPage.module.css`
- `frontend/src/pages/BucketsPage.module.css`

Recommended action:

- Verify the jobs page at narrow widths so sticky columns, virtual scrolling, and action cells do not create overflow or clipping.
- Verify the objects page in both list and grid modes, especially around pane docking, item density, and long object keys.
- Confirm that every dense desktop table has a clear small-screen fallback instead of relying on horizontal scrolling.

### 5. Audit long text, overflow, and wrapping edge cases

The code already uses ellipsis and `overflow-wrap` in many places, but this still needs a cross-page audit for the longest realistic values.

Examples to verify:

- Bucket names
- Object keys and prefixes
- Job IDs and error messages
- Provider/profile labels

Recommended action:

- Check that truncation never hides critical actions.
- Add targeted wrapping rules only where current ellipsis behavior is not sufficient.
- Verify that chips, badges, and metadata grids remain readable under narrow widths.

### 6. Audit touch targets and control spacing

A layout can technically fit on mobile while still feeling cramped to use.

Recommended action:

- Check icon-only buttons, inline row actions, menu triggers, and checkbox controls against mobile touch-target expectations.
- Verify spacing between adjacent destructive/secondary actions in cards, drawers, and toolbars.
- Prefer using existing Ant Design sizing props or existing CSS spacing tokens instead of introducing one-off measurements.

### 7. Add a repeatable responsive QA checklist

To keep responsive quality from regressing, the project needs an explicit validation routine tied to its major routes.

Recommended action:

- Verify `Profiles`, `Buckets`, `Objects`, `Uploads`, `Jobs`, and `Settings` in portrait and landscape mobile layouts.
- Include both light and dark mode during manual QA.
- Exercise empty, loading, error, and populated states rather than checking only the happy path.
- Reuse the existing frontend smoke/e2e coverage where possible, and add targeted UI tests only for future responsive regressions that are hard to catch manually.

## Suggested implementation order

1. App shell, header, and navigation drawer
2. Shared drawer/modal sizing rules
3. Jobs and objects dense-layout fixes
4. Long-text and touch-target cleanup
5. Repeatable responsive QA pass across all major routes

## Definition of done

Responsive-design completeness should be considered meaningfully improved when:

- Every major route works without clipped actions or forced horizontal scrolling on common phone widths.
- Dense pages have a deliberate mobile layout, not just a reduced desktop layout.
- Drawers and modals fit within the viewport and keep primary actions accessible.
- Long identifiers and error text remain readable.
- Manual QA has been completed across the main breakpoints and both themes.
