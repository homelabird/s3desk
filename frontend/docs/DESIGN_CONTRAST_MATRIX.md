# Design Contrast Matrix

Use these token pairings during implementation and visual QA. The goal is not to calculate every possible contrast ratio in code review; the goal is to avoid unsafe combinations that made the previous UI hierarchy hard to read.

## Safe Default Pairings

| UI role | Background token | Text token | Border token |
| --- | --- | --- | --- |
| Page body | `--s3d-color-bg-page` or `--s3d-gradient-page` | `--s3d-color-text` | none |
| Major card | `--s3d-gradient-surface` | `--s3d-color-text` | `--s3d-color-border` or `--s3d-color-border-strong` |
| Section/table header | `--s3d-gradient-section` | `--s3d-color-text` or `--s3d-color-text-secondary` | `--s3d-color-border` |
| Input/select/picker | `--s3d-color-bg-input` | `--s3d-color-text` | `--s3d-color-border-input` |
| Floating surface | `--s3d-color-bg-elevated` or `--s3d-gradient-surface` | `--s3d-color-text` | `--s3d-color-border-strong` |
| Code/preview surface | `--s3d-color-bg-code` | `--s3d-color-text` | `--s3d-color-border-strong` |
| Disabled control | `--s3d-color-bg-disabled` | `--s3d-color-text-muted` | `--s3d-color-border` |

## State Pairings

| State | Background token | Text token | Required non-color cue |
| --- | --- | --- | --- |
| Selected item | `--s3d-color-primary-bg` or `--s3d-color-primary-light` | `--s3d-color-text` | Accent edge or strong border |
| Hovered item | `--s3d-color-primary-bg` mixed with card surface | `--s3d-color-text` or `--s3d-color-primary` | Border or shadow change |
| Focused control | existing surface | existing text token | `--s3d-color-focus-ring` |
| Warning | `--s3d-color-warning-bg` | `--s3d-color-warning-text` | Warning border or accent edge |
| Error | `--s3d-color-error-bg` | `--s3d-color-error-dark` | Error border or accent edge |
| Success | `--s3d-color-success-bg` | `--s3d-color-success-text` | Status icon, label, or border |

## Avoid These Pairings

- `--s3d-color-text-muted` on `--s3d-color-bg-disabled` for critical instructions.
- `--s3d-color-text-secondary` with additional `opacity` for helper text.
- `--s3d-color-primary` text on saturated primary backgrounds.
- State communicated only by pale background fill.
- Data tables using `--s3d-color-border-soft` for the outer container.
- Popovers or drawers using plain `--s3d-color-bg` without strong border and shadow.
- Warning/error content without text labels, icons, borders, or accent edges.

## Manual QA Notes

- If a compact element is repeated in a table, list, tree, or grid, prefer semantic text tokens over opacity.
- If a user must choose between safe/default and advanced/risky paths, add an accent edge to both paths.
- If a component is floating above another surface, it must look elevated in both light and dark themes.
- If a card contains operational state, give the status a non-color cue so it remains understandable in screenshots and low-quality displays.

## Automated Advisory Check

- Run `npm run check:design-contrast` to calculate contrast ratios for the tracked token pairs in `src/index.css`.
- The check is advisory by default and prints findings without failing.
- Use `node ./scripts/check-design-contrast.mjs --fail-on-findings` when a strict failure mode is needed.
