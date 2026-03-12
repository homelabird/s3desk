# Release Gate

This document defines the minimum bar for calling a S3Desk build releasable.

## Minimum Release Checklist

All of the following must be true:

1. The working tree is clean except for intentional release metadata changes.
2. [openapi.yml](../openapi.yml) and generated frontend schema stay in sync.
3. Backend build passes.
4. Frontend typecheck passes.
5. The standard local verification pass is green:
   - `./scripts/check.sh`
6. Any changed feature area has matching automated coverage updated in the same change.
7. Any provider-facing governance change has live validation evidence attached before release.
8. Any backup/restore change includes a staged restore smoke note in the release summary or runbook update.
9. Deployment-facing changes keep safe defaults:
   - no placeholder remote token exposure
   - no relaxed remote binding by default
10. Any auth, browser-download, or reverse-proxy-sensitive change has a recorded reverse-proxy smoke result before release.

## Required Evidence

Attach or record these before release approval:

- commit SHA
- planned version or tag
- verification command results
- changed docs, if operator behavior changed
- screenshots or API bodies for any live validation failures

## Automated Enforcement

The repository keeps a lightweight automated gate for the documentation side of release readiness:

- local command: `./scripts/check_release_gate.sh`
- included in the standard local verification pass: `./scripts/check.sh`
- CI workflow: `Release Gate`

This automated check enforces that:

- `CHANGELOG.md` still carries the current required known limitations
- the live validation runbook still exposes the required evidence fields
- the release gate and testing docs still expose the expected sections

It does not replace the actual live-provider validation pass.

## Provider Change Gate

If a change touches bucket governance, provider capabilities, profile auth, or object-provider behavior, release readiness is blocked until the relevant live pass is recorded in [BUCKET_GOVERNANCE.md](BUCKET_GOVERNANCE.md).

Minimum evidence per affected provider:

- provider name
- bucket or container used
- profile identifier
- feature tested
- actual outcome
- API failure body on error
- provider-native confirmation on success

If a provider was not revalidated, the release is not ready unless the release notes explicitly say the provider change is unvalidated and the release is intentionally internal-only.

## Deployment Smoke Gate

If a change touches any of the following:

- WebSocket or SSE auth
- `download-proxy`
- browser-facing signed download URLs
- `EXTERNAL_BASE_URL`
- `ALLOWED_HOSTS` or reverse-proxy deployment docs

then release readiness is blocked until a reverse-proxy smoke pass is recorded.

Minimum reverse-proxy smoke:

1. `GET /healthz` through the reverse proxy
2. authenticated `GET /api/v1/meta` through the reverse proxy
3. `POST /api/v1/realtime-ticket` through the reverse proxy
4. `GET /api/v1/buckets/{bucket}/objects/download-url?proxy=true` returns a browser-facing URL rooted at the expected external base URL

## Release Notes Requirements

Every release note set must include:

1. user-visible changes
2. operationally relevant changes
3. known limitations that still apply

For the current codebase, these unsupported or partial behaviors must be called out when relevant:

- Azure legal hold is surfaced but remains read-only in S3Desk.
- Azure immutability editing requires ARM credentials in addition to storage credentials.
- OCI PAR edits are implemented as delete-and-recreate, not true in-place mutation.
- OCI PAR access URIs are only fully available at creation time and must be copied then.
- AWS typed governance does not cover Object Lock.
- In-product backup and staged restore are sqlite `DATA_DIR` workflows, not a Postgres disaster-recovery mechanism.

## Blockers

Release is blocked if any of the following is true:

- local verification is red
- OpenAPI drift is unresolved
- provider-facing changes lack required live evidence
- docs are stale for an operator-visible behavior change
- release notes omit a still-relevant unsupported case

## Fast Approval Path

A change can use the fast path only if all of the following are true:

- docs-only or copy-only change, or
- internal refactor with no runtime behavior change, and
- no provider behavior, auth flow, backup flow, or deployment default changed

Fast path still requires a clean OpenAPI state and passing local checks if touched files affect compiled code.
