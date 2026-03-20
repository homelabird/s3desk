# Docs

Keep this folder small. The retained docs are the operator and release references
that need to stay close to the codebase.

- [RUNBOOK.md](RUNBOOK.md): deployment, backup, restore, reverse-proxy, and incident operations
- [TESTING.md](TESTING.md): local checks, live smoke flows, and CI-facing test commands
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
