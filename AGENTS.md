# S3Desk Agent Guide

## Repository Map

- `backend/`: Go API, jobs, persistence, provider integrations, and runtime wiring.
- `frontend/`: React application, generated API types, unit tests, and Playwright suites.
- `openapi.yml`: public API source of truth. Regenerate `frontend/src/api/openapi.ts`; do not hand-edit it.
- `charts/`, `compose/`, `deploy/`, `k8s/`: deployment owners.
- `scripts/`: checked-in validation, release, and operational workflows.
- `docs/README.md`: current documentation map. Treat dated reports in `notes/` as context, not current truth.

## Working Rules

- Preserve unrelated dirty-worktree changes. Inspect the current owner and its callers before editing.
- Prefer the existing script, component, helper, or platform feature over a parallel abstraction.
- Keep API shape changes aligned across `openapi.yml`, backend behavior/tests, and generated frontend types/tests.
- Keep credentials, tokens, signed URLs, private keys, and backup passwords out of output and committed evidence.
- Do not turn local, emulator, render, or mock success into provider, deployment, real-device, or release proof.
- External mutation, deployment, publication, tag creation, and force updates require an explicit user request.

## Validation

- Run the smallest focused check that covers the changed owner first.
- Use `./scripts/check.sh fast` for a broad non-browser repository check.
- Use `./scripts/check.sh full` for the full local gate, including browser smoke.
- A passing `./scripts/check_ci_pair.sh` is only the minimal CI pair; it excludes bundle-budget and Playwright lanes.
- Report commands actually run, their outcome, and any unexecuted environment-dependent gate separately.

## Project Skills

- `$s3desk-backend`: Go API, jobs, store, provider, OpenAPI, and backend runtime changes.
- `$s3desk-frontend`: React UI, state ownership, accessibility, responsive behavior, and browser tests.
- `$s3desk-live-evidence`: provider, reverse-proxy, portable-backup, and deployment evidence.
- `$s3desk-release`: changelog, tags, GitHub Releases, candidate scope, and release readiness.

Load only the skills relevant to the request. Their referenced repository docs and scripts are the maintained source of truth.
