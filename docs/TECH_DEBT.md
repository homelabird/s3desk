# Technical Debt

This document tracks the highest-impact active engineering debt currently visible in S3Desk.

The recent slices closed deployment default hardening, OpenAPI drift discipline, hardened remote deployment templates, staged restore coordination, the main thumbnail/preview/proxy boundary extraction, and the first backup integrity pass with restore preflight and HMAC-backed authenticity checks.

This round tracks what is still meaningfully open.

## Priority 0

### 1. Real-provider live validation has not been executed yet

- Risk:
  - The bucket governance surface changed across AWS S3, GCS, Azure Blob, and OCI without attached real-cloud evidence.
  - Release confidence is limited until provider-native behavior is revalidated.
- Evidence:
  - [BUCKET_GOVERNANCE_LIVE_VALIDATION.md](BUCKET_GOVERNANCE_LIVE_VALIDATION.md)
  - [RELEASE_GATE.md](RELEASE_GATE.md)
  - [PROVIDERS.md](PROVIDERS.md)
- Why it matters:
  - Typed governance flows are now one of the most provider-sensitive areas of the product.
- Next action:
  - Run the documented live validation pass.
  - Attach evidence per affected provider before release.

### 2. Backup bundle confidentiality is still the main remaining gap after integrity, signature, and preflight improvements

- Risk:
  - Payload corruption is detectable, restore staging performs disk-space preflight, and signed bundles can now be authenticated with the matching ENCRYPTION_KEY.
  - Bundle contents are still stored in cleartext, so archive confidentiality remains weak when files leave the source host.
- Evidence:
  - [handlers_server_backup.go](../backend/internal/api/handlers_server_backup.go)
  - [handlers_server_restores.go](../backend/internal/api/handlers_server_restores.go)
  - [ServerSettingsSection.tsx](../frontend/src/pages/settings/ServerSettingsSection.tsx)
  - [RUNBOOK.md](RUNBOOK.md)
- Why it matters:
  - Backup archives contain high-value local state such as the database and thumbnails.
- Next action:
  - Add optional archive confidentiality or encryption support.
  - Keep the new signature and restore validation path stable while extending it to stronger provenance guarantees later.

## Priority 1

### 3. Postgres backup capability is documented, but not exposed as a first-class product capability

- Risk:
  - The current behavior is explained in docs, but the product surface still relies mostly on warning copy.
  - Operators can still overestimate what in-product backup covers.
- Evidence:
  - [handlers_server_backup.go](../backend/internal/api/handlers_server_backup.go)
  - [ServerSettingsSection.tsx](../frontend/src/pages/settings/ServerSettingsSection.tsx)
  - [RUNBOOK.md](RUNBOOK.md)
- Why it matters:
  - Backup capability should be explicit and machine-readable, not only explained in text.
- Next action:
  - Expose backup capability by backend type and reflect it directly in the UI.

### 4. Release gate rules are documented, but not enforced by CI yet

- Risk:
  - The current release gate can still be bypassed by omission.
  - Live validation and known-limitations requirements are not automatically checked.
- Evidence:
  - [RELEASE_GATE.md](RELEASE_GATE.md)
  - [TESTING.md](TESTING.md)
  - [check.sh](../scripts/check.sh)
- Why it matters:
  - Release readiness should not depend only on human memory once provider behavior becomes this broad.
- Next action:
  - Add CI or scripted checks for release-note requirements and validation evidence presence.

## Priority 2

### 5. Test seams still rely on mutable global hooks in production code

- Risk:
  - Testability improved, but the current seam model uses mutable globals.
  - This increases parallel-test fragility and keeps test concerns visible in runtime code paths.
- Evidence:
  - [process_testhooks.go](../backend/internal/api/process_testhooks.go)
  - [process_testhooks.go](../backend/internal/jobs/process_testhooks.go)
- Why it matters:
  - The current approach is useful as an intermediate step, but not ideal as a long-term boundary.
- Next action:
  - Replace global hooks with structured runner injection or isolate them behind stricter test-only boundaries.

### 6. Bucket governance backend interfaces are still broader than necessary

- Risk:
  - Validation and provider capabilities are better split than before, but the adapter model still carries broad section coverage and limited validation context.
- Evidence:
  - [registry.go](../backend/internal/bucketgov/registry.go)
  - [service.go](../backend/internal/bucketgov/service.go)
  - [service_helpers.go](../backend/internal/bucketgov/service_helpers.go)
  - [capability_support.go](../backend/internal/bucketgov/capability_support.go)
- Why it matters:
  - Future provider work will be cleaner if section capabilities and validation inputs are more targeted.
- Next action:
  - Evolve toward narrower section-oriented interfaces and richer validation context.

### 7. Cost and restore observability still lack operator thresholds

- Risk:
  - Metrics exist, but the runbook does not yet define what counts as abnormal cache miss rate, restore buildup, or object-storage cost pressure.
- Evidence:
  - [metrics.go](../backend/internal/metrics/metrics.go)
  - [RUNBOOK.md](RUNBOOK.md)
- Why it matters:
  - Observability is less useful if operators do not know when to act.
- Next action:
  - Document thresholds, dashboards, and alert conditions for cost and restore lifecycle signals.

## Candidate Issue Order

1. Execute real-provider live validation
2. Add optional backup bundle confidentiality or encryption
3. Expose Postgres backup capability explicitly in product surfaces
4. Enforce release gate rules in CI
5. Replace mutable global test hooks with stricter runners
6. Narrow bucket governance backend interfaces further
7. Define operator thresholds for cost and restore observability
