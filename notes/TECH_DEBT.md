# Technical Debt

This document tracks the highest-impact active engineering debt currently visible in S3Desk.

The recent slices closed deployment default hardening, OpenAPI drift discipline, hardened remote deployment templates, staged restore coordination, the main thumbnail/preview/proxy boundary extraction, and the first backup integrity pass with restore preflight and HMAC-backed authenticity checks.

This round tracks what is still meaningfully open.

## Priority 0

### 1. Real-provider live validation has not been executed yet

- Risk:
  - The bucket governance surface changed across AWS S3, GCS, Azure Blob, OCI, MinIO, and Ceph without attached real-cloud evidence.
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
  - The confidentiality model is still intentionally simple: it uses the current ENCRYPTION_KEY or an operator-supplied export password and does not yet cover key rotation or detached signatures.
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

### 3. Postgres backup capability is exposed, but operator workflow still needs release evidence

- Risk:
  - The product surface now exposes backup capability by backend type, but release evidence still needs to show the sqlite and postgres operator paths.
  - Operators can still overestimate what in-product backup covers if evidence is not kept current with the capability UI.
- Evidence:
  - [handlers_server_backup.go](../backend/internal/api/handlers_server_backup.go)
  - [ServerSettingsSection.tsx](../frontend/src/pages/settings/ServerSettingsSection.tsx)
  - [RUNBOOK.md](../docs/RUNBOOK.md)
- Current status:
  - Addressed by exposing `capabilities.serverBackup` in `/api/v1/meta` and driving the settings UI from that capability surface instead of inferring support from `dbBackend` alone.
- Why it matters:
  - Backup capability should be explicit and machine-readable, not only explained in text.
- Next action:
  - Keep the capability UI and release evidence aligned when backup behavior changes.

### 4. Release gate is enforced, but live evidence remains external

- Risk:
  - CI now runs the repository release gate, but live provider and reverse-proxy validation still depends on attaching evidence files for the candidate.
  - Evidence content can still go stale if the checklist and checker scopes diverge.
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
  - Endpoint lookup test hooks now guard set, restore, and read access with a package-local mutex so shuffled or future parallel endpoint-validation tests do not race on resolver stubs.
  - Guarded HTTP client tests now cover hostnames that resolve to metadata IPs, remote-mode IPv4/IPv6 loopback/link-local IPs, CNAME to blocked metadata hosts, or remote-mode localhost CNAMEs for both dial-time and redirect-time rejection.
  - Shared endpoint validator tests now directly cover remote-mode localhost CNAME rejection, remote-mode IPv6 loopback/link-local resolution, and TLS skip-verify IPv6 private/public host policy.
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

### 7. Cost and restore observability thresholds are defined, but need to stay aligned

- Risk:
  - Metrics and working thresholds now exist, but stale thresholds can create either alert fatigue or missed incidents as cache, restore, and provider behavior evolves.
- Evidence:
  - [metrics.go](../backend/internal/metrics/metrics.go)
  - [RUNBOOK.md](../docs/RUNBOOK.md)
- Current status:
  - Addressed by documenting warm-cache reuse, thumbnail latency, download-proxy stat fallback, object-storage operation/error/latency pressure, and staged restore count/age/size thresholds in the runbook.
- Why it matters:
  - Observability is less useful if operators do not know when to act, and thresholds are only useful while they match the metrics emitted by the service.
- Next action:
  - Keep the runbook thresholds aligned with the actual metrics emitted as cache and restore behavior evolves.

## Candidate Issue Order

1. Execute real-provider live validation
2. Execute remaining live validation and then reassess whether backup key-management needs a second pass
