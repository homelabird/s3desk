# Technical Debt

This document tracks the highest-impact engineering debt currently visible in S3Desk.

It is intentionally biased toward issues that can cause security regressions, operational mistakes, data loss, runaway storage cost, or high-change-rate maintenance pain.

## Priority 0

### 1. Deployment defaults are too easy to misuse

- Risk:
  - A local-only compose file can be reused as if it were production-ready.
  - Weak defaults such as `ALLOW_REMOTE=true` and `API_TOKEN=change-me` are easy to leave in place.
- Evidence:
  - [docker-compose.local-build.yml](/home/homelab/Downloads/project/s3desk/docker-compose.local-build.yml)
  - [README.md](/home/homelab/Downloads/project/s3desk/README.md)
- Why it matters:
  - This is the fastest path to an accidental remote exposure.
- Next action:
  - Split local/dev and deploy-ready examples more clearly.
  - Fail startup when `API_TOKEN` is a known placeholder in remote mode.
  - Make `ALLOW_REMOTE` opt-in in deployment-oriented examples.

### 2. OpenAPI generation discipline is weak

- Risk:
  - Generated frontend API types can drift from the source schema.
  - Manual edits to generated files can be lost or silently conflict with later regeneration.
- Evidence:
  - [openapi.yml](/home/homelab/Downloads/project/s3desk/openapi.yml)
  - [openapi.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/openapi.ts)
  - [package.json](/home/homelab/Downloads/project/s3desk/frontend/package.json)
- Why it matters:
  - API mismatches create high-noise failures across the settings, governance, backup, and objects flows.
- Next action:
  - Treat [openapi.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/openapi.ts) as generated-only.
  - Add a CI drift check that runs `npm run gen:openapi` and fails on differences.
  - Keep all API shape changes rooted in [openapi.yml](/home/homelab/Downloads/project/s3desk/openapi.yml).

### 3. Objects preview/thumbnail/download behavior is too concentrated

- Risk:
  - The same user-visible flow now spans thumbnail generation, server cache manifests, download proxy decisions, partial video range fallback, React Query reuse, and client-side cache reuse.
  - Small edits can create regressions in unrelated preview paths.
- Evidence:
  - [handlers_thumbnails.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_thumbnails.go)
  - [download_proxy.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/download_proxy.go)
  - [handlers_objects.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_objects.go)
  - [ObjectThumbnail.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectThumbnail.tsx)
  - [useObjectPreview.ts](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/useObjectPreview.ts)
  - [thumbnailCache.ts](/home/homelab/Downloads/project/s3desk/frontend/src/lib/thumbnailCache.ts)
  - [thumbnailRequestQueue.ts](/home/homelab/Downloads/project/s3desk/frontend/src/lib/thumbnailRequestQueue.ts)
- Why it matters:
  - This is a high-traffic surface and also the main cost-control path for object storage access.
- Next action:
  - Split policy, transport, and cache responsibilities more clearly.
  - Add focused regression coverage around image, GIF, MP4, MKV, cache hit, and proxy-skip cases.

### 4. Backup/restore strategy does not match the default compose deployment story

- Risk:
  - The UI exposes `Full backup` and `Cache + metadata backup`, but backup export currently supports sqlite-backed servers only.
  - The common local-build compose path uses Postgres.
- Evidence:
  - [handlers_server_backup.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_server_backup.go)
  - [handlers_server_restores.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_server_restores.go)
  - [ServerSettingsSection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/settings/ServerSettingsSection.tsx)
  - [docker-compose.local-build.yml](/home/homelab/Downloads/project/s3desk/docker-compose.local-build.yml)
- Why it matters:
  - Operators can assume the visible restore UX covers their actual deployment shape when it may not.
- Next action:
  - Clarify sqlite-only scope in UI and docs.
  - Decide whether Postgres gets an export/import path or whether backup guidance stays external-only for that backend.
  - Add cleanup policy and visibility for staged restores.

## Priority 1

### 5. Frontend input and persisted-state hardening is incomplete

- Risk:
  - Very large search input, persisted malformed values, or expensive highlight patterns can degrade runtime behavior.
  - Folder upload currently tends to gather too much material in memory before transfer starts.
- Evidence:
  - [useObjectsSearchState.ts](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/useObjectsSearchState.ts)
  - [useObjectsGlobalSearchState.ts](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/useObjectsGlobalSearchState.ts)
  - [useSearchHighlight.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/useSearchHighlight.tsx)
  - [useLocalStorageState.ts](/home/homelab/Downloads/project/s3desk/frontend/src/lib/useLocalStorageState.ts)
  - [useSessionStorageState.ts](/home/homelab/Downloads/project/s3desk/frontend/src/lib/useSessionStorageState.ts)
  - [deviceFs.ts](/home/homelab/Downloads/project/s3desk/frontend/src/lib/deviceFs.ts)
  - [useObjectsUploadFolder.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/useObjectsUploadFolder.tsx)
- Why it matters:
  - These failures are noisy, user-visible, and can be hard to recover from without clearing browser state.
- Next action:
  - Add search length and complexity guards.
  - Validate and clamp storage-backed settings on load.
  - Rework folder collection into bounded or streaming batches.

### 6. Presigned URL and base URL trust boundaries need stricter validation

- Risk:
  - Browser-side preview and presign flows rely on URLs that are not aggressively validated before use.
- Evidence:
  - [useObjectPreview.ts](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/useObjectPreview.ts)
  - [ObjectsPresignModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsPresignModal.tsx)
  - [baseUrl.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/baseUrl.ts)
  - [client.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts)
- Why it matters:
  - These paths cross trust boundaries between local UI, API host, and storage endpoints.
- Next action:
  - Enforce scheme and host validation before `fetch`, `window.open`, or direct preview usage.
  - Distinguish local API URLs from third-party storage URLs in client helpers.

### 7. Bucket governance is functionally rich but structurally heavy

- Risk:
  - Provider-specific behavior is accumulating in large shared code paths.
  - Future changes will become slower and more failure-prone if capabilities, validation, rendering, and mutation remain tightly coupled.
- Evidence:
  - [BucketGovernanceModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketGovernanceModal.tsx)
  - [service.go](/home/homelab/Downloads/project/s3desk/backend/internal/bucketgov/service.go)
  - [registry.go](/home/homelab/Downloads/project/s3desk/backend/internal/bucketgov/registry.go)
  - [validate.go](/home/homelab/Downloads/project/s3desk/backend/internal/bucketgov/validate.go)
  - [capabilities.go](/home/homelab/Downloads/project/s3desk/backend/internal/bucketgov/capabilities.go)
- Why it matters:
  - Governance flows are now one of the most provider-sensitive parts of the product.
- Next action:
  - Split frontend provider sections into smaller units.
  - Keep backend capability, normalization, and mutation logic more isolated by provider.

## Priority 2

### 8. External process coupling makes tests less portable and less precise

- Risk:
  - Thumbnail, stream, upload, and job tests still lean heavily on fake external command behavior.
  - OS-specific skips reduce confidence outside the main Linux path.
- Evidence:
  - [handlers_thumbnails_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_thumbnails_test.go)
  - [download_stream_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/download_stream_test.go)
  - [handlers_uploads_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_uploads_test.go)
  - [handlers_jobs_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_jobs_test.go)
- Why it matters:
  - Regressions in command assembly and fallback logic are expensive to diagnose after release.
- Next action:
  - Add narrower unit seams around command construction and policy selection.
  - Reduce platform-specific skips by mocking execution earlier in the stack.

### 9. Staged restore lifecycle is only partially managed

- Risk:
  - Restores can be staged and deleted, but lifecycle policy, disk usage visibility, and operator guidance are still thin.
- Evidence:
  - [handlers_server_restores.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_server_restores.go)
  - [ServerSettingsSection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/settings/ServerSettingsSection.tsx)
  - [RUNBOOK.md](/home/homelab/Downloads/project/s3desk/docs/RUNBOOK.md)
- Why it matters:
  - Restore staging is safety-critical and can silently consume storage over time.
- Next action:
  - Show staged restore size and age more clearly.
  - Document operator cleanup and cutover steps in the runbook.
  - Consider TTL-based cleanup or an explicit retention policy.

### 10. Release readiness still depends too much on human memory

- Risk:
  - Live validation and provider-specific verification exist as documents, but not yet as hard release gates.
- Evidence:
  - [BUCKET_GOVERNANCE_LIVE_VALIDATION.md](/home/homelab/Downloads/project/s3desk/docs/BUCKET_GOVERNANCE_LIVE_VALIDATION.md)
  - [BUCKET_GOVERNANCE_REMAINING_WORK.md](/home/homelab/Downloads/project/s3desk/docs/BUCKET_GOVERNANCE_REMAINING_WORK.md)
  - [TESTING.md](/home/homelab/Downloads/project/s3desk/docs/TESTING.md)
- Why it matters:
  - The project now has enough provider- and media-specific behavior that informal validation is no longer sufficient.
- Next action:
  - Define a minimal release checklist tied to concrete tests, live validation evidence, and known unsupported cases.

## Candidate Issue Order

1. Deployment default hardening
2. OpenAPI generation discipline and CI drift checks
3. Objects preview/thumbnail pipeline refactor
4. Backup/restore scope clarification and staged restore lifecycle
5. Frontend input and persisted-state hardening
6. Presigned URL/base URL validation hardening
7. Bucket governance modularization
8. External process abstraction for test portability
9. Release gate definition and live validation evidence policy
