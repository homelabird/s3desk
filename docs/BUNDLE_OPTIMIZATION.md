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

Key numbers to watch:
- `vendor-ui` (antd + rc-*): about `~270 kB gzip`
- `initial JS (index.html)`: about `~106 kB gzip` (no `vendor-ui` on the initial `/profiles` entry)

Notes:
- We intentionally keep antd + rc-* together in `vendor-ui` to avoid cross-chunk circular init ordering issues (TDZ runtime crashes).
- That means meaningful `vendor-ui` reduction comes primarily from removing/replacing specific antd/rc features, not from splitting chunks.

## Priority Targets (Top Offenders)

| Priority | Target (from stats) | Where It Comes From (code) | Proposed Change | Expected Outcome |
|---:|---|---|---|---|
| P0 | `/profiles` initial entry pulling `vendor-ui` | `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/App.tsx` -> `frontend/src/FullApp*` | Keep `/profiles` lightweight shell and lazy-load FullApp/antd only when leaving `/profiles` or when query params are present | Major reduction in initial JS and faster first paint on `/profiles` |
| P1 | `@rc-component/table` (`Table.js`, table selection hooks) | `frontend/src/pages/JobsPage.tsx`, `frontend/src/pages/BucketsPage.tsx`, `frontend/src/pages/ProfilesPage.tsx`, `frontend/src/pages/buckets/BucketPolicyModal.tsx`, `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx` | Gradually replace antd `Table` with a lightweight table/list (plain HTML, or TanStack table if we need sorting/virtualization) | Shrinks `vendor-ui` by removing rc-table and related code paths |
| P1 | `@rc-component/tree` (`Tree.js`) | Formerly `frontend/src/pages/objects/ObjectsTreeView.tsx`, `frontend/src/components/LocalPathBrowseModal.tsx` (now removed). Remaining source: antd `Table` filter dropdown (tree-mode) imports `antd/tree`, which pulls `@rc-component/tree`. | Keep the app on a minimal in-house tree UI; to fully remove `@rc-component/tree`, either patch antd `Table` to lazy-load tree-mode filters or replace antd `Table` hot paths. | Shrinks `vendor-ui` and reduces complex tree behaviors/bugs |
| P2 | `@rc-component/form` (useForm, Field) | `frontend/src/pages/profiles/ProfileModal.tsx`, many modals/hooks | For simple dialogs, use native `<form>` + controlled inputs; keep antd Form only where it adds real value | Long-term `vendor-ui` shrink; less form magic to debug |
| P2 | `@ant-design/icons` | Widely imported across pages/components | Replace hot-path icons with inline SVGs (local) or a tiny icon set | Smaller `vendor-ui`, fewer icon-related modules |

## Guardrails

- `scripts/bundle_report.js` soft budgets (warnings only):
  - `BUNDLE_BUDGET_VENDOR_UI_GZIP_KB` default: `300`
  - `BUNDLE_BUDGET_INITIAL_JS_GZIP_KB` default: `160`
