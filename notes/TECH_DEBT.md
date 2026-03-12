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
  - [BUCKET_GOVERNANCE.md](../docs/BUCKET_GOVERNANCE.md)
  - [RELEASE_GATE.md](../docs/RELEASE_GATE.md)
  - [PROVIDERS.md](../docs/PROVIDERS.md)
- Why it matters:
  - Typed governance flows are now one of the most provider-sensitive areas of the product.
- Next action:
  - Run the documented live validation pass.
  - Attach evidence per affected provider before release.

### 2. Backup bundle confidentiality is now covered by optional encrypted payloads, but key management remains intentionally simple

- Risk:
  - Payload corruption is detectable, restore staging performs disk-space preflight, and operators can now export encrypted bundles that keep the payload encrypted at rest outside the source host.
  - The confidentiality model is still intentionally simple: it reuses the current ENCRYPTION_KEY and does not yet cover key rotation, per-bundle passphrases, or detached signatures.
- Evidence:
  - [handlers_server_backup.go](../backend/internal/api/handlers_server_backup.go)
  - [handlers_server_restores.go](../backend/internal/api/handlers_server_restores.go)
  - [ServerSettingsSection.tsx](../frontend/src/pages/settings/ServerSettingsSection.tsx)
  - [RUNBOOK.md](../docs/RUNBOOK.md)
- Current status:
  - Addressed by adding `confidentiality=encrypted` backup exports, encrypted `payload.enc` bundle entries, restore-time decryption validation, and UI controls for selecting encrypted bundle downloads when ENCRYPTION_KEY is configured.
- Why it matters:
  - Backup archives contain high-value local state such as the database and thumbnails, so confidentiality had to become an explicit option before the backup surface could be considered mature.
- Next action:
  - Keep the encrypted bundle path stable.
  - Revisit stronger key-management and provenance models later only if operator requirements move beyond the current ENCRYPTION_KEY-based workflow.

## Priority 1

### 3. Postgres backup capability is documented, but not exposed as a first-class product capability

- Risk:
  - The current behavior is explained in docs, but the product surface still relies mostly on warning copy.
  - Operators can still overestimate what in-product backup covers.
- Evidence:
  - [handlers_server_backup.go](../backend/internal/api/handlers_server_backup.go)
  - [ServerSettingsSection.tsx](../frontend/src/pages/settings/ServerSettingsSection.tsx)
  - [RUNBOOK.md](../docs/RUNBOOK.md)
- Current status:
  - Addressed by exposing `capabilities.serverBackup` in `/api/v1/meta` and driving the settings UI from that capability surface instead of inferring support from `dbBackend` alone.
- Why it matters:
  - Backup capability should be explicit and machine-readable, not only explained in text.
- Next action:
  - Expose backup capability by backend type and reflect it directly in the UI.

### 4. Release gate rules are documented, but not enforced by CI yet

- Risk:
  - The current release gate can still be bypassed by omission.
  - Live validation and known-limitations requirements are not automatically checked.
- Evidence:
  - [RELEASE_GATE.md](../docs/RELEASE_GATE.md)
  - [TESTING.md](../docs/TESTING.md)
  - [check.sh](../scripts/check.sh)
- Current status:
  - Addressed by `scripts/check_release_gate.sh`, inclusion in [check.sh](../scripts/check.sh), and the GitHub Actions [release-gate.yml](../.github/workflows/release-gate.yml) workflow.
- Why it matters:
  - Release readiness should not depend only on human memory once provider behavior becomes this broad.
- Next action:
  - Keep the required limitation list and evidence fields aligned as release policy evolves.

## Priority 2

### 5. Test seams still rely on mutable global hooks in production code

- Risk:
  - Testability improved, but the current seam model uses mutable globals.
  - This increases parallel-test fragility and keeps test concerns visible in runtime code paths.
- Evidence:
  - [process_testhooks.go](../backend/internal/api/process_testhooks.go)
  - [process_testhooks.go](../backend/internal/jobs/process_testhooks.go)
- Current status:
  - Addressed by replacing direct package-level hook variable access with internal test-hook registries and setter helpers in both API and jobs layers.
- Why it matters:
  - The current approach is useful as an intermediate step, but not ideal as a long-term boundary.
- Next action:
  - Keep future test seams behind the same internal registry pattern unless a larger runner-injection refactor is justified.

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
  - Keep future section work aligned to the section-oriented interfaces and validation context already introduced.

### 7. Cost and restore observability still lack operator thresholds

- Risk:
  - Metrics exist, but the runbook does not yet define what counts as abnormal cache miss rate, restore buildup, or object-storage cost pressure.
- Evidence:
  - [metrics.go](../backend/internal/metrics/metrics.go)
  - [RUNBOOK.md](RUNBOOK.md)
- Why it matters:
  - Observability is less useful if operators do not know when to act.
- Next action:
  - Keep the runbook thresholds aligned with the actual metrics emitted as cache and restore behavior evolves.

## Candidate Issue Order

1. Execute real-provider live validation
2. Execute remaining live validation and then reassess whether backup key-management needs a second pass
