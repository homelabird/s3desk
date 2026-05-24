# Design Token Usage

This guide keeps S3Desk UI changes consistent after the UI/UX design audit.

## Surface Tokens

- Use `--s3d-color-bg-page` or `--s3d-gradient-page` for the application background.
- Use `--s3d-color-bg-card` for stable content containers.
- Use `--s3d-color-bg-elevated` for floating controls, popovers, menus, modal panels, and focused cards.
- Use `--s3d-gradient-section` for section headers, table headers, and sticky structural bars.
- Use `--s3d-gradient-surface` for major cards, page sections, modal panels, and list containers.
- Avoid using plain `--s3d-color-bg` for data-dense cards unless the card already has a strong border, accent edge, or shadow.

## Border Tokens

- Use `--s3d-color-border-soft` only for internal row dividers and secondary separators.
- Use `--s3d-color-border` for normal cards, inputs, tables, and section boundaries.
- Use `--s3d-color-border-strong` for app chrome, modal panels, table/list containers, and floating surfaces.
- Use `--s3d-color-border-dashed` for empty states, upload zones, and placeholder containers.

## Text Tokens

- Use `--s3d-color-text` for primary labels and row content.
- Use `--s3d-color-text-secondary` for helper text that still needs to be read.
- Use `--s3d-color-text-muted` for placeholders, timestamps, and lower-priority metadata.
- Do not reduce helper text visibility with opacity. Choose a semantic text token instead.

## State Tokens

- Use `--s3d-color-primary-bg` plus an accent edge for selected rows, selected cards, and active workflow blocks.
- Use `--s3d-color-focus` and `--s3d-color-focus-ring` for keyboard focus and active controls.
- Use `--s3d-color-warning-bg`, `--s3d-color-warning-border`, and `--s3d-color-warning-text` together for warning states.
- Use `--s3d-color-error-bg`, `--s3d-color-error-border`, and `--s3d-color-error-dark` together for error states.
- Do not communicate selected, warning, or error states with pale background color alone.

## Layout Guidance

- Dense tables and virtual lists need both row separators and a stronger container boundary.
- Mobile cards should not rely only on top borders; give them a card background or selected/error accent edge.
- Popovers, dropdowns, modals, drawers, and sheets must have elevated backgrounds, strong borders, and shadows.
- First-run, login, and profile setup surfaces should use the same hierarchy as the main app so users do not experience a visual reset.

## Review Checklist

- Can a user identify the current page, current nav item, selected rows, and primary action within two seconds?
- Does secondary text remain readable without opacity hacks?
- Are warning and error states recognizable without color-only assumptions?
- Do light and dark themes preserve the same hierarchy?
- Do Ant Design components and custom CSS modules use the same surface and border hierarchy?

## Verification

- Use `docs/VISUAL_QA_CHECKLIST.md` for browser review before treating broad design-audit work as complete.
- Use `docs/DESIGN_CONTRAST_MATRIX.md` to confirm token pairings and non-color cues during implementation review.
- Use `npm run check:design` to run the static design checks together.
- Use `npm run check:design-audit` as an advisory scan for recurring low-contrast or flat-surface CSS patterns.
- Use `npm run check:design-contrast` as an advisory contrast calculation for tracked token pairs.
- Do not mark the audit complete from code inspection alone; the surface hierarchy must be checked in rendered light and dark UI.
