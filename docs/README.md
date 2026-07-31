# Docs

Keep this folder small. The retained docs are the operator and release references
that need to stay close to the codebase.

- [RUNBOOK.md](RUNBOOK.md): deployment, backup, restore, reverse-proxy, and incident operations
- [TESTING.md](TESTING.md): local checks, focused reproduction script usage (`./scripts/repro_backend_focus.sh`), the minimal CI pair wrapper (`./scripts/check_ci_pair.sh`) including workflow lint but excluding bundle-budget and Playwright lanes, explicit bundle-budget guidance, browser-test lane split and geometry-guard rules, reviewer quick-check guidance, repo-local `actionlint` installation plus workflow lint, and CI-facing test commands
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md): backend package boundaries, handler rules, and extension checklist for job/provider work
- [CODE_OWNERSHIP.md](CODE_OWNERSHIP.md): reviewer ownership boundaries that mirror `.github/CODEOWNERS`
- [FRONTEND_STATE_BOUNDARIES.md](FRONTEND_STATE_BOUNDARIES.md): where auth state, API client state, `FullApp` shell state, and page shell/controller/composition layers belong after the provider split
- [RELEASE_GATE.md](RELEASE_GATE.md): minimum release bar and required evidence
- [PROVIDERS.md](PROVIDERS.md): provider support matrix and operator-facing capability notes
- [PORTABLE_BACKUP.md](PORTABLE_BACKUP.md): portable backup/import scope, workflow, validation, and limits
- [BUCKET_GOVERNANCE.md](BUCKET_GOVERNANCE.md): shipped governance scope, live validation workflow, and remaining gaps
- [MOBILE_UX_AUDIT.md](MOBILE_UX_AUDIT.md): prioritized mobile-friendly UI/UX audit findings and follow-up focus areas
- [WEBVIEW_COMPATIBILITY.md](WEBVIEW_COMPATIBILITY.md): browser and embedded-webview support boundaries plus operator validation guidance
- [WEBVIEW_QA_TEST_CASES.md](WEBVIEW_QA_TEST_CASES.md): operator-facing QA cases for exact webview host-shell validation

Supporting assets that still live under `docs/`:

- `ci/*.env.example`
- `S3Desk.postman_collection.json`
- `S3Desk.insomnia_collection.json`
- `grafana/*.json`

Reports and audit indexes:

- [../notes/INDEX.md](../notes/INDEX.md): engineering notes, project quality reports, and frontend design reports
- [../frontend/docs/UI_UX_CURRENT_FINDINGS_2026-07-31.md](../frontend/docs/UI_UX_CURRENT_FINDINGS_2026-07-31.md): current UI/UX findings snapshot for the July 31, 2026 frontend worktree
- [../frontend/docs/UI_UX_OPTIMIZATION_REPORT_2026-07-31.md](../frontend/docs/UI_UX_OPTIMIZATION_REPORT_2026-07-31.md): code optimization and design improvement report for the July 31, 2026 frontend worktree
- [CODEBASE_SUBAGENT_GAP_REPORT_2026-05-21.md](CODEBASE_SUBAGENT_GAP_REPORT_2026-05-21.md): current sub-agent gap audit and applied improvements
- [CODEBASE_FINAL_QUALITY_REPORT_2026-04-30.md](CODEBASE_FINAL_QUALITY_REPORT_2026-04-30.md): final codebase quality review snapshot
- [FRONTEND_FINAL_QUALITY_REPORT_2026-04-29.md](FRONTEND_FINAL_QUALITY_REPORT_2026-04-29.md): retained frontend quality snapshot
- [CODEBASE_SUBAGENT_GAP_REPORT_2026-04-24.md](CODEBASE_SUBAGENT_GAP_REPORT_2026-04-24.md): retained sub-agent gap analysis snapshot
- [RELEASE_SCOPE_AUDIT_2026-04-30.md](RELEASE_SCOPE_AUDIT_2026-04-30.md): release-scope inventory and staging guard audit

Related repository test helpers:

- `scripts/repro_backend_focus.sh`
- `scripts/check_ci_pair.sh`

Release-prep documents:

- [release/PR_BODY.md](release/PR_BODY.md): current PR body draft for the active quality/refactor rollout, including browser lane and workflow-lint evidence wording
- [release/DEPLOYMENT_CHECKLIST.md](release/DEPLOYMENT_CHECKLIST.md): pre-deploy checklist for remote/realtime/upload hardening changes, including browser lane and workflow-lint verification
- [release/evidence/README.md](release/evidence/README.md): provider-live, reverse-proxy, and backup-portable release evidence commands, templates, metadata requirements, and final gate checks
- [release/REMAINING_STRUCTURE_DEBT.md](release/REMAINING_STRUCTURE_DEBT.md): one-page follow-up debt priority list
