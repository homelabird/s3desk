# Bundle Optimization Roadmap

This doc tracks what we know from `npm run build:analyze` and what we plan to change to keep initial load fast while keeping the UI stable.

## How To Measure

1. `cd frontend && npm run build:analyze`
2. `node scripts/bundle_report.js frontend/dist/stats.json frontend/dist/bundle-report.md`

Artifacts:
- `frontend/dist/stats.html`
- `frontend/dist/stats.json`
- `frontend/dist/bundle-report.md`

## Current Baseline (bundle-report.md)

Key numbers to watch (local build, 2026-02-14):
- `vendor-ui` (antd + rc-*): about `~228 kB gzip`
- `vendor-tanstack-virtual` (`@tanstack/react-virtual`): about `~4.8 kB gzip` (excluded from `/profiles` HTML preload)
- `initial JS (index.html)`: about `~85 kB gzip` (no `vendor-ui` / react-query on the initial `/profiles` entry)

Notes:
- We intentionally keep antd + rc-* together in `vendor-ui` to avoid cross-chunk circular init ordering issues (TDZ runtime crashes).
- That means meaningful `vendor-ui` reduction comes primarily from removing/replacing specific antd/rc features, not from splitting chunks.
- Ant Design ships a large barrel export (`import { Button } from 'antd'`). To avoid unused heavy widgets sneaking into the bundle via that barrel, we patch antd exports in `frontend/patches/antd+6.1.0.patch`.

## Priority Targets (Top Offenders)

| Priority | Target (from stats) | Where It Comes From (code) | Proposed Change | Expected Outcome |
|---:|---|---|---|---|
| P0 | `/profiles` initial entry pulling `vendor-ui` | `frontend/src/App.tsx`, `frontend/src/LightApp.tsx`, `frontend/src/FullApp.tsx` | **Done:** Keep `/profiles` on a lightweight shell and lazy-load FullApp/antd only when leaving `/profiles` or when query params are present | Faster first paint on `/profiles` and smaller initial JS |
| P1 | `@rc-component/table` | Formerly: antd `Table` in Jobs/Buckets/Profiles/Policy/GlobalSearch | **Done:** Replace antd `Table` usages with native tables + lightweight virtualization where needed | Removes rc-table from `vendor-ui` |
| P1 | `@rc-component/tree` | Formerly: antd `DirectoryTree`, plus antd Table filter tree-mode | **Done:** Replace tree UI with a minimal in-house component; patch antd FilterDropdown tree-mode | Removes rc-tree from `vendor-ui` |
| P1 | `@rc-component/picker` (`DatePicker/TimePicker/Calendar`) | antd barrel export pulling picker stack | **Done:** Avoid picker widgets and patch antd exports so picker modules don’t enter the bundle | Keeps picker stack out of `vendor-ui` |
| P2 | `@rc-component/form` (useForm, Field) | `frontend/src/pages/profiles/ProfileModal.tsx`, many modals/hooks | For simple dialogs, use native `<form>` + controlled inputs; keep antd Form only where it adds real value | Long-term `vendor-ui` shrink; less form magic to debug |
| P2 | `@ant-design/icons` | Widely imported across pages/components | Replace hot-path icons with inline SVGs (local) or a tiny icon set | Smaller `vendor-ui`, fewer icon-related modules |

## Guardrails

- `scripts/bundle_report.js` soft budgets (warnings only):
  - `BUNDLE_BUDGET_VENDOR_UI_GZIP_KB` default: `300`
  - `BUNDLE_BUDGET_INITIAL_JS_GZIP_KB` default: `160`
