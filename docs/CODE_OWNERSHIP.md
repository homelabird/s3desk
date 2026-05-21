# Code Ownership

`.github/CODEOWNERS` is the machine-readable review map. This document explains
the same boundaries in contributor-facing terms.

## Ownership Areas

- Backend runtime and API: `backend/`, `openapi.yml`
- Frontend application and browser tests: `frontend/`, `lighthouserc.js`
- CI, release, and deployment policy: `.github/`, `scripts/`, `charts/`,
  `compose/`, `deploy/`, `k8s/`, `docs/release/`
- Dependency and license evidence: `THIRD_PARTY_NOTICES.md`, `third_party/`,
  `LICENSE*`

## Review Expectations

- API shape changes need backend, frontend, and OpenAPI review together.
- Provider credential, auth, backup/restore, and local path changes need a
  security-oriented review.
- Workflow, release, and deployment changes need release-gate evidence or an
  explicit note explaining why the normal gate is not applicable.
- Browser-facing backend changes should keep the `Frontend E2E` `browser_facing`
  filter broad enough to run required browser lanes.
