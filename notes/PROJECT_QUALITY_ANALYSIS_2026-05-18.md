# Project Quality Analysis - 2026-05-18

## Scope

This report summarizes the whole-project review requested for S3Desk. Five expert sub-agents reviewed separate ownership areas while the main agent integrated findings and applied the low-risk improvements that were safe to complete in this pass.

Reviewed areas:

- Backend/API/security
- Frontend/product quality
- CI/test/developer experience
- Deployment/operations
- Documentation/release hygiene

## Expert Sub-Agent Findings

### Backend/API/Security

- High: direct and staging upload byte limits are not reserved atomically across a full session. A robust fix needs store-level reservation semantics and concurrency tests.
- High: auth throttling can be weakened behind Caddy if client-supplied forwarded headers reach the backend as trusted loopback proxy headers.
- Medium: local destination authorization has a symlink time-of-check/time-of-use gap.
- Medium: profile export exposes raw provider secrets/TLS material through the normal export path.
- Low: several invalid query parameters silently fall back to defaults.

### Frontend/Product Quality

- Medium: `AppTabs` needed an explicit semantic role so real workspace tabs and action/editable tab strips do not share ambiguous ARIA behavior.
- Medium: object card layout exposed `grid` semantics without the full keyboard interaction model required for ARIA grids.
- Medium: `JobsLogsDrawer` still performs full log parsing/search work on every relevant render.
- Low: some E2E tests still rely on forced clicks or fixed sleeps.

### CI/Test/Developer Experience

- High: `Containerfile.local` used Go `1.24.11` while the repository toolchain is pinned to Go `1.25.9`.
- High: GitLab `check` can run `scripts/check.sh` without installing `staticcheck`, `gosec`, and `govulncheck`.
- High: README requirements were stale for Go and omitted local workflow validation dependencies.
- Medium: GitHub license audit was label-gated on pull requests even for dependency-scope changes.
- Medium: local release-scope classification treated `notes/` reports as uncategorized `other` files.

### Deployment/Operations

- High: the Istio upload gateway manifest uses very large buffering/timeouts that can amplify memory pressure.
- High: the GitLab runner namespace-admin manifest binds broad namespace permissions to the default service account.
- Medium: Helm production network policy defaults are permissive and do not isolate egress.
- Medium: demo Compose published services on all interfaces by default and enabled remote mode by default.
- Medium: the Caddy example did not explicitly overwrite forwarded client IP headers before proxying to the backend.

### Documentation/Release Hygiene

- High: design reports under `notes/` were not indexed and were classified as uncategorized release scope.
- High: the release-scope audit can drift whenever the dirty worktree changes, because the gate compares live status counts and unit tables.
- Medium: README and docs did not make current analysis/report locations easy to discover.
- Medium: Go toolchain documentation did not mention `Containerfile.local`.

## Improvements Applied

- Added explicit `semanticRole` handling to `AppTabs` and kept the object workspace selector on real tab semantics.
- Changed object card view semantics from ARIA `grid`/`row`/`gridcell` to `list`/`listitem`/`group`, matching the available keyboard model.
- Updated focused frontend tests for the tab and card semantics.
- Aligned `Containerfile.local` with Go `1.25.9`.
- Extended `scripts/check_go_toolchain.py` to validate both `Containerfile` and `Containerfile.local`.
- Added `scripts/install_backend_security_tools.sh` and reused it from GitHub Release Gate and GitLab `check`.
- Made GitHub license audit run automatically for dependency/license-scope path changes instead of requiring only a pull request label.
- Classified `notes/`, `deploy/`, `k8s/`, `Containerfile.local`, and the backend security tool installer into release units.
- Hardened the Caddy example to overwrite `X-Forwarded-For`, `X-Real-IP`, and `X-Forwarded-Proto`.
- Changed demo Compose defaults to bind MinIO and S3Desk to `127.0.0.1` and keep `DEMO_ALLOW_REMOTE`/`ALLOW_REMOTE` false unless explicitly enabled.
- Updated README requirements, release-gate docs, docs index, and notes index.

## Second Expert Pass

The follow-up pass used the same separated expert-review model and focused on gaps that remained after the first improvement set.

Additional findings:

- Backend/API: presigned multipart upload did not enforce `UPLOAD_MAX_BYTES`, while single-part presign did.
- Backend/API: upload session byte accounting still needs store-level atomic reservation for concurrent uploads.
- Frontend/Product: object mobile E2E still asserted the old `grid` accessibility contract, and object card groups exposed invalid `aria-selected`.
- Frontend/Product: object modal labeling, busy-close handling, jobs log line numbering, and mobile target sizing need more follow-up.
- CI/Test/DevEx: reverse-proxy evidence detection missed `deploy/caddy/**`, `scripts/Caddyfile`, and `k8s/s3desk-caddy.yaml`.
- CI/Test/DevEx: GitLab security-scan rules did not include `Containerfile.local` and `deploy/**`.
- CI/Test/DevEx: workflow validation depended on PyYAML without a guaranteed CI install path.
- Deployment/Ops: Caddy header hardening was not mirrored in all checked-in Caddy examples.
- Deployment/Ops: `.env.example` still advertised demo remote bind defaults after Compose defaults were made loopback-only.
- Deployment/Ops: `helm registry login` used password command-line arguments.
- Docs/Release: release evidence is still pinned to `rc1` while changelog work has later release-candidate sections.
- Docs/Release: release-scope audit checking still ties a dated audit document to live dirty-worktree counts.

Additional improvements applied:

- Enforced `UPLOAD_MAX_BYTES` for presigned multipart upload requests and added a regression test.
- Updated object mobile E2E to assert the current `region` plus `list` semantics.
- Removed invalid `aria-selected` from object card `role="group"` elements.
- Mirrored forwarded-header overwrite into `scripts/Caddyfile` and `k8s/s3desk-caddy.yaml`.
- Aligned `.env.example` demo defaults with loopback bind and `DEMO_ALLOW_REMOTE=false`.
- Switched Helm registry login to `--password-stdin`.
- Added reverse-proxy evidence triggers for Caddy deploy paths and tests for those paths.
- Added `Containerfile.local` and `deploy/**` to GitLab Trivy/Gitleaks change rules.
- Made workflow-validator missing-PyYAML failures explicit and installed PyYAML in affected GitHub/GitLab paths.
- Stopped reporting missing dependency metadata in release-scope JSON when no dependency-scope files changed.
- Converted `notes/INDEX.md` links to relative paths and exposed the notes index from the root README.

## Third Expert Pass

The third pass re-ran the separated expert review after the second-pass fixes and targeted issues that were still demonstrably unsafe, stale, or failing.

Additional findings:

- Backend/API: object list/search/download-url numeric query parameters still accepted malformed integers by falling back to defaults.
- Backend/API: upload session creation silently accepted unknown non-empty `mode` values and used the server default.
- Backend/API: several remaining parameter and diagnostic-redaction issues need broader follow-up, including raw rclone/provider stderr sanitization and realtime optional boolean parsing.
- Frontend/Product: the object grid renderer unit test still expected stale `aria-selected` behavior after the card semantics change.
- Frontend/Product: object job dialogs lacked consistent programmatic labels and could still close or resubmit while a job action was pending.
- Frontend/Product: the folder tree new-folder action remained below touch-friendly target size in the compact drawer.
- CI/Test/DevEx: GitLab workflow and scan rules still missed some config-only security changes, and GitHub browser-facing path filters did not include every checked-in Caddy surface.
- CI/Test/DevEx: remaining GitLab registry login commands exposed credentials through process arguments.
- Deployment/Ops: `.env.example` reused `EXTERNAL_BASE_URL` for both remote and demo contexts, and test Compose published services on all interfaces.
- Deployment/Ops: Helm smoke pull-secret creation still placed the Harbor password in `kubectl` command arguments.
- Docs/Release: release evidence and gate defaults remain pinned to `rc1` while the latest changelog section is `0.21v-rc3`.
- Docs/Release: the Objects design report still described the superseded ARIA grid approach.

Additional improvements applied:

- Return HTTP 400 for malformed object `maxKeys`, search `limit`, download URL `expiresSeconds`, object-index `sampleLimit`, thumbnail `size`, local `limit`, job-list `limit`, and job-log `tailBytes`/`maxBytes` query values, with regression tests.
- Return HTTP 400 for unknown non-empty upload session `mode` values, with a regression test.
- Return HTTP 400 for malformed portable-backup `includeThumbnails` and out-of-range upload-presign `expiresSeconds`, with regression tests.
- Updated the object grid renderer unit test to assert selection through the checkbox and selected card class, not invalid `aria-selected`.
- Added stable labels/ids to object copy/move/delete/download/upload/presign dialog controls and read-only textareas.
- Disabled cancel/close and guarded submit handlers while object job dialogs are submitting.
- Increased compact folder-tree action targets to 40px and added an E2E geometry assertion for the new-folder button.
- Replaced several nonessential forced E2E clicks with visible/enabled assertions plus normal clicks.
- Added GitLab workflow and scan triggers for `.gitleaks.toml`, `.trivyignore`, `.golangci.*`, Go module notice inputs, `Containerfile.local`, and deploy paths.
- Switched remaining GitLab `podman`/`helm` registry logins to `--password-stdin`.
- Added `scripts/Caddyfile` and `k8s/s3desk-caddy.yaml` to GitHub browser-facing E2E path filters.
- Hardened reverse-proxy smoke URL-root validation by parsing the signed URL root, redacting query output on mismatch, and recording observed root evidence.
- Changed Helm Kubernetes smoke pull-secret creation to use a generated `.dockerconfigjson` secret instead of password arguments.
- Split demo `DEMO_EXTERNAL_BASE_URL` from remote `EXTERNAL_BASE_URL`, bound test Compose ports to loopback, qualified remote Compose images, and made `scripts/podman.sh run-port` loopback-only by default.
- Marked the stale Objects design report as superseded for card semantics, fixed the `notes/TECH_DEBT.md` runbook link, and exposed retained quality reports from `docs/README.md`.

## Fourth Expert Pass

The fourth pass re-ran the whole-project split review with five expert sub-agents and applied the additional low-risk fixes that were clear from the findings.

Additional findings:

- Backend/API: realtime `includeLogs` accepted malformed boolean values by falling back to defaults, staging chunk uploads could avoid the 10,000-part cap, and commit could still load expired upload sessions.
- Backend/API: direct/presigned upload byte accounting still needs transactional session-wide reservation; raw rclone/provider diagnostics still need central redaction before reaching API clients, job logs, or realtime streams.
- Frontend/Product: object grid cards exposed focusable group-style activation without a real interactive control contract, object workspace tabs used tab semantics without controlled panels, and jobs log output lacked a labelled/focusable scroll region.
- Frontend/Product: visible "Virtualized rows" copy exposed implementation details in the jobs drawer, and mobile/touch target consistency still needs a shared project-wide floor.
- CI/Test/DevEx: release evidence/readiness logic still depends on dirty `git status` instead of explicit base/head diffs; deploy readiness accepts `neutral`/`skipped` GitHub check conclusions; some release-policy and license-audit paths were missing CI triggers.
- Deployment/Ops: `scripts/compose.sh caddy` merged two full stack files instead of using the Caddy stack directly; remote Compose still allowed empty `ALLOWED_HOSTS`; OCI runtime sync wrote private key material with broad permissions.
- Deployment/Ops: Helm/Istio network-policy and gateway manifests still need a cluster-specific ingress/gateway contract, and raw Istio EnvoyFilter buffering/timeouts remain production-risky.
- Docs/Release: frontend docs had broken `../frontend/src/...` links, release evidence docs/gates still point at `rc1` while the latest changelog section is `0.21v-rc3`, and current release limitation checks are not section-aware.

Additional improvements applied:

- Return HTTP 400 for malformed realtime `includeLogs`, release realtime slots on that rejection, and cover the behavior with tests.
- Enforce the existing multipart 10,000-part ceiling for staging chunk uploads and add a regression test.
- Reject commit attempts for expired upload sessions and add a regression test.
- Changed object workspace editable tabs back to toolbar semantics until real panel ownership exists.
- Removed keyboard activation from non-interactive object card groups and exposed folder opening through a real button inside folder cards.
- Made the jobs log viewport a labelled, focusable region and removed visible "Virtualized rows" implementation copy from the drawer.
- Fixed the frontend UI operation feedback doc links from `../frontend/src/...` to `../src/...`.
- Added `scripts/generate_third_party_notices.py` to GitHub license-audit path filters and added release-policy docs to the GitLab workflow allowlist.
- Made `scripts/compose.sh caddy` use the Caddy stack file directly, required `ALLOWED_HOSTS` for remote Compose, tightened OCI runtime config/key permissions, and updated the README Helm quickstart to generate a non-placeholder API token.
- Synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after the fourth-pass changes.

## Fifth Expert Pass

The fifth pass re-ran the same whole-project expert split and focused on issues that remained after the fourth-pass fixes.

Additional findings:

- Backend/API: session-wide upload byte accounting is still bypassable without store-level atomic reservation, and raw provider/rclone diagnostics still need central redaction before API responses, job logs, realtime messages, and capture files.
- Backend/API: profile export still serializes provider credentials/TLS private material by default, local destination authorization still has a symlink TOCTOU window, and password-protected backup encryption still needs a versioned salted KDF/AEAD format.
- Frontend/Product: object-list keyboard shortcuts could react to bubbled key events from nested row controls, repeated object/prefix action buttons had indistinguishable accessible names, and the E2E geometry guard was failing on unannotated intentional geometry probes.
- Frontend/Product: filtered job logs still show visible-match indices rather than original log line numbers, and folder-tree touch targets still need a broader mobile floor.
- CI/Test/DevEx: release evidence/scope checks still rely on dirty `git status` rather than explicit base/head diffs, release evidence defaults still point at `rc1`, and browser E2E path filters missed the geometry-guard script.
- CI/Test/DevEx: `scripts/install_backend_security_tools.sh` installed Go tools to the default `GOBIN`, which could differ from the `.tools/go/bin` location checked by `scripts/check.sh`.
- Deployment/Ops: Kubernetes Caddy config lacked the security header block used by the Compose Caddy example; raw Istio upload gateway, GitLab runner RBAC, Helm `existingSecret`, production `latest` image, and NetworkPolicy examples still need deeper operator decisions.
- Docs/Release: PR template links from `.github/` resolved to the wrong relative paths, and the release-scope audit had to be re-synced after fifth-pass changes.

Additional improvements applied:

- `scripts/verify_release_readiness.sh` now requires required GitHub checks to conclude `success`; `neutral` and `skipped` no longer pass deploy readiness.
- Fixed `.github/pull_request_template.md` links to mobile checklist and release gate docs by using paths relative to `.github/`.
- Updated the stale `parseIntQueryClamped` comment so it matches the current invalid-value error behavior.
- Added `frontend/scripts/check-e2e-geometry-probes.mjs` to GitHub browser-facing E2E path filters.
- Made `scripts/install_backend_security_tools.sh` install to `${ROOT}/.tools/go/bin` by default, matching `scripts/check.sh` lookup behavior.
- Mirrored Caddy security headers into `k8s/s3desk-caddy.yaml`.
- Object-list shortcuts now ignore bubbled key events from nested interactive controls, with a regression test.
- Object and prefix action buttons now include the row/card display name in their accessible names across list and grid renderers, with tests updated.
- Added explicit `e2e-geometry-allow` justifications to intentional Playwright geometry probes so the geometry guard passes.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after fifth-pass changes.

## Sixth Expert Pass

The sixth pass re-ran the whole-project expert split and used implementation workers for isolated, low-risk fixes.

Additional findings:

- Backend/API: presigned single-part upload could bypass `UPLOAD_MAX_BYTES` when `size` was omitted, and negative `size` values were not rejected before presign handling.
- Backend/API: realtime `afterSeq`/`Last-Event-ID`, download-url `proxy`, and profile-export `download` still had malformed-value paths that could silently coerce to defaults.
- Frontend/Product: filtered job logs still rendered visible-match ordinals instead of source log line numbers.
- Frontend/Product: repeated row action labels outside Objects, shared mobile touch-target floors, and bucket policy row field labels still need broader accessibility cleanup.
- CI/Test/DevEx: release evidence triggers missed provider/proxy surfaces under `backend/internal/s3policy`, `backend/internal/rcloneconfig`, `backend/internal/profiletls`, and `backend/internal/ws`.
- CI/Test/DevEx: GitLab notice-only changes did not trigger the third-party notice job or workflow.
- Deployment/Ops: Helm `networkPolicy.ingress.extra` and `networkPolicy.egress.extra` rendered invalid YAML for user-supplied escape-hatch rules.
- Deployment/Ops: Helm `existingSecret` required-key handling, production `image.tag=latest`, raw Istio gateway scope, and GitLab runner RBAC still need deeper operator decisions.
- Docs/Release: release evidence/checklist defaults still point at `rc1`, changelog limitation checks are still not target-section-aware, and the release evidence README was under-indexed from `docs/README.md`.

Additional improvements applied:

- Presigned single-part uploads now require `size` when `UPLOAD_MAX_BYTES` is configured, reject negative `size`, and reject sizes above the configured max; multipart presign also rechecks file size against the same max.
- Realtime resume sequence, download-url `proxy`, and profile-export `download` now reject malformed values with HTTP 400 and regression tests.
- Filtered Jobs logs now preserve and render source line numbers while keeping the existing visible log string API for copy/download flows.
- Helm NetworkPolicy extra ingress/egress rules now render as valid YAML list items, with schema coverage and chart-check regression cases.
- Release evidence trigger detection now includes S3 policy, rclone config, profile TLS, and realtime websocket backend surfaces.
- GitLab workflow and third-party notice rules now include `THIRD_PARTY_NOTICES.md`.
- `docs/README.md` now links the release evidence README alongside the release-prep docs.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after sixth-pass changes.

## Seventh Expert Pass

The seventh pass re-ran the whole-project expert split and used parallel implementation workers for the frontend accessibility, Helm/operations, and release-evidence items that were safe to fix independently.

Additional findings:

- Backend/API: diagnostic redaction is still missing at output boundaries, profile export still serializes provider secrets and TLS material, upload byte accounting still needs atomic reservation, backup encryption still needs a versioned salted KDF/AEAD format, and local path authorization still has symlink/time-of-check gaps.
- Frontend/Product: repeated row action controls outside Objects still had generic accessible names, mobile touch target consistency remains incomplete, bucket-policy structured editor rows have ambiguous programmatic labels, and `JobsLogsDrawer` still does too much CPU work for very large logs.
- CI/Test/DevEx: generated reverse-proxy smoke evidence used a field name that did not match the checker, release evidence defaults still point at `rc1`, changelog limitation checks are not section-aware, and scope/evidence checks still depend on dirty-worktree status instead of explicit base/head diffs.
- Deployment/Ops: Helm `existingSecret` required values rendered optional secret refs, browser-facing production examples could still render `image.tag=latest`, GitLab remote smoke used a rejected placeholder token, and GitLab runner RBAC, raw Istio gateway scope, and production NetworkPolicy defaults still need operator-level decisions.
- Docs/Release: release-candidate docs remain split between `rc1` evidence defaults and later changelog sections, the latest release section omits `Known Limitations`, and stale report/audit/link index drift still needs periodic cleanup while the audit is tied to live dirty-worktree counts.

Additional improvements applied:

- `scripts/deploy_smoke.sh` now records generated reverse-proxy evidence with the checker-accepted `Signed proxy URL root` field, and `scripts/check_release_evidence_test.py` covers that generated evidence shape.
- Jobs, Buckets, and Transfers row action controls now include row-specific accessible names while keeping the visible labels stable, with focused frontend unit coverage.
- Helm required secret refs now render as non-optional when an API token, encryption key, or Postgres URL must exist in an `existingSecret`.
- Helm production and Istio values now use a `chart-app-version` tag sentinel instead of `latest`, and the Helm helper rejects browser-facing remote renders that still use `image.tag=latest`.
- `scripts/check_helm_chart.sh` now asserts required-secret optional flags, non-latest production/Istio renders, and the latest-image negative case.
- GitLab remote smoke no longer sends the rejected `API_TOKEN=change-me` placeholder.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after seventh-pass changes.

## Eighth Expert Pass

The eighth pass repeated the separated expert review and used bounded workers for backend compatibility, frontend policy-editor accessibility, release-gate consistency, and operations preflight checks.

Additional findings:

- Backend/API: diagnostic redaction, profile-export secret handling, atomic upload byte reservation, versioned backup crypto, and local symlink race hardening still require larger design work. A smaller compatibility gap remained where `download` and `proxy` optional booleans no longer accepted legacy truthy/falsey values such as `yes`.
- Frontend/Product: `JobsLogsDrawer` still does full-log CPU work before virtualization, and the mobile touch-target contract remains inconsistent across surfaces. Bucket policy structured editors still repeated generic field names such as `Role`, `Members`, `ID`, and `Permission` across rows.
- CI/Test/Release: the latest `0.21v-rc3` changelog section lacked `Known Limitations`, while the release gate checked the whole changelog and could pass on limitations from an older section. Browser-facing workflow filters also missed `backend/internal/ws/**` even though realtime changes are reverse-proxy-sensitive.
- Deployment/Ops: GitLab Helm negative rendering still needed `secrets.autoGenerateApiToken=false` to prove the missing-token failure path, and reverse-proxy live-evidence preflight treated `DEPLOY_API_TOKEN=change-me` as usable even though remote mode rejects placeholder tokens.
- Docs/Release: evidence/checklist defaults are still `rc1`-oriented while the latest changelog section is `0.21v-rc3`, and the dated scope audit remains tied to the live dirty worktree.

Additional improvements applied:

- Restored legacy optional boolean parsing for profile export `download` and object download URL `proxy`, while keeping malformed values as HTTP 400 errors.
- Clarified encrypted restore missing-secret errors so password-protected bundles mention backup password or `ENCRYPTION_KEY`, not only `ENCRYPTION_KEY`.
- Added row-scoped accessible names for GCS and Azure bucket policy structured editor fields and remove buttons in both desktop table and mobile card layouts.
- Wrapped the GCS public-read checkbox in a visible clickable label and increased its label target to a 44px floor.
- Added `Known Limitations` to the latest `0.21v-rc3` changelog section and changed the release gate to enforce those limitations against the latest versioned section.
- Added `backend/internal/ws/**` to browser-facing E2E workflow filters and pinned that path in the release gate.
- Fixed GitLab Helm negative rendering by disabling generated API tokens in the missing-token case.
- Treat `change-me` as a missing placeholder in live-evidence environment preflight, and generate per-job remote smoke API tokens in GitLab smoke jobs.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after eighth-pass changes.

## Ninth Expert Pass

The ninth pass resumed the interrupted expert split, collected the completed sub-agent findings, and used bounded workers for frontend responsive polish, backend portable-import compatibility wording, release-evidence hardening, and Helm/Istio render safety.

Additional findings:

- Backend/API: diagnostic redaction, profile-export secret policy, atomic upload byte reservation, backup crypto modernization, and local symlink race hardening remain larger contract/security changes. The quick compatibility gap was portable import still naming only `ENCRYPTION_KEY` in destination-key blockers.
- Frontend/Product: `JobsLogsDrawer` still does full-log CPU work before virtualization. The low-risk issues were stale Playwright selectors after row-contextual action labels, missing mobile list semantics for job cards, and transfer-row mobile buttons below the 44px touch-target floor.
- CI/Test/Release: candidate-specific evidence checks could still pass on mismatched provider/reverse-proxy filenames, reverse-proxy evidence could use status-free prose, and the release gate only syntax-checked one smoke script.
- Deployment/Ops: Istio VirtualService could render invalid YAML when enabled without hosts or gateways, and production/Istio example values could still resolve to a source-tree fallback image tag instead of a pinned release image.
- Docs/Release: the scope audit is still a live dirty-worktree document, and older rc1-oriented evidence/checklist notes remain historical context rather than current release proof.

Additional improvements applied:

- Updated Playwright job helpers and the jobs performance spec to target contextual job action labels, while keeping menu-action matching compatible with contextual accessible names.
- Added list/listitem semantics to mobile job cards and a mobile drawer readability regression test.
- Raised transfer-row mobile action buttons to a 44px minimum and aligned the uploads mobile responsive threshold.
- Updated portable import blockers and smoke checks to mention `BACKUP_ENCRYPTION_KEY or ENCRYPTION_KEY` for encrypted destination bundles.
- Hardened release evidence validation so provider-live and reverse-proxy smoke filenames must match the requested candidate, and reverse-proxy HTTP checks must include numeric success statuses.
- Changed the release gate to syntax-check every shell script under `scripts/`.
- Added Helm schema/template validation that fails Istio VirtualService renders without hosts or gateways.
- Updated production/Istio chart examples and chart docs to use explicit pinned image repository/tag placeholders instead of relying on the chart fallback tag.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after ninth-pass changes.

## Tenth Expert Pass

The tenth pass continued the deferred-work queue with parallel workers for Jobs log performance, backend diagnostic redaction, release-candidate derivation, and NetworkPolicy production guidance.

Additional findings:

- Backend/API: API response redaction can be handled centrally for rclone/provider diagnostics, but job log storage, realtime events, and capture files need separate output-boundary work.
- Frontend/Product: Jobs log parsing/search had avoidable repeated work in the drawer and state hook. Broadening search queries or replacing the active log array still requires a full scan, but narrowed-query refinements and row parsing can be made cheaper without changing UI behavior.
- CI/Test/Release: release readiness and checklist sync still defaulted to historical `rc1` even though the latest versioned changelog section is `0.21v-rc3`.
- Deployment/Ops: production NetworkPolicy examples needed concrete controller/gateway selector patterns and explicit escape hatches, while still avoiding a default egress lockout for object stores, IdPs, and external databases.

Additional improvements applied:

- Added a bounded Jobs log index path: log entries now carry normalized search/severity metadata, visible log state is built once per query, narrowed searches reuse the prior matched set, and the drawer parses only rendered virtual rows with a bounded cache.
- Added backend rclone/provider diagnostic redaction for API response details, covering common key/value secrets, Authorization/Cookie headers, signed URL query secrets, SAS signatures, private keys, API tokens, and password-like fields.
- Added a release-candidate helper that derives the default candidate from the latest versioned `CHANGELOG.md` section and wired readiness/checklist/release-gate checks to the derived value while preserving explicit `--candidate-id`.
- Updated the current live-evidence checklist from `rc1` to `0.21v-rc3` targets and commands.
- Clarified production NetworkPolicy examples with NGINX/Istio selector patterns, documented ingress/egress escape hatches, tightened schema keys for extra rules, and added Helm check coverage for selector and escape-hatch renders.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after tenth-pass changes.

## Eleventh Expert Pass

The eleventh pass focused on two remaining low-risk deferred areas: extending diagnostic redaction beyond API responses and removing fixed waits/forced clicks from nearby Playwright helpers and specs.

Additional findings:

- Backend/API and Jobs: API error redaction was centralized for rclone/provider details, but job log writes, realtime `job.log` messages, stdout JSON log emission, and unknown-rclone-error capture files still needed the same output-boundary redaction.
- Frontend/E2E: the common dialog/navigation helper still used short fixed sleeps for retry polling, the demo flow used `linger` sleeps between already-asserted states, and an Objects context-menu regression used a forced right-click even though the target can be asserted visible.

Additional improvements applied:

- Moved diagnostic redaction into `backend/internal/redact` and kept the API rclone helpers wired to the same redaction behavior.
- Applied diagnostic redaction to stored job log lines, realtime `job.log` payloads, optional stdout job log emission, rclone progress pipe output, and unknown-rclone-error capture files.
- Added backend tests for the shared redaction helper, API rclone/provider response redaction, job log/realtime redaction, and unknown-rclone capture redaction.
- Replaced helper fixed waits with locator visibility waits, removed demo-flow `linger` sleeps, and removed the remaining forced right-click in the covered Objects context-menu spec.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after eleventh-pass changes.

## Twelfth Expert Pass

The twelfth pass addressed the next backend storage-consistency item: session-wide byte reservation for direct and presigned upload flows.

Additional findings:

- Backend/API: direct chunk and presigned upload paths already had declared object sizes, but still persisted upload object metadata without atomically reserving the session byte budget.
- Backend/API: direct multipart form uploads only know their final size after streaming, so reservation failure needs a remote cleanup path rather than a pre-stream check.
- Backend/Store: replacement semantics need to reserve only the delta between the previous expected object size and the new expected object size, including concurrent writers for the same session.

Additional improvements applied:

- Added store-level upload object upsert with transactional session byte accounting, max-byte enforcement, replacement delta handling, and concurrent session-limit tests.
- Wired direct chunk uploads to reserve expected object bytes before remote multipart work, while keeping post-upload persistence idempotent.
- Wired direct multipart form persistence to the same reservation path and delete the just-streamed remote object if a concurrent reservation conflict exceeds the session limit.
- Wired presigned single-part, presigned multipart, and multipart completion paths to the shared byte-reservation helper.
- Added API coverage for presigned single-part session-limit rejection and kept the existing per-file max-byte rejection tests intact.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after twelfth-pass changes.

## Thirteenth Expert Pass

The thirteenth pass completed the nearby staging-upload byte-reservation work by making stale `bytesTracked` snapshots fail without leaving local staging artifacts behind.

Additional findings:

- Backend/API: staging multipart form uploads could still write a local file using stale request-time remaining bytes and only then discover that another writer had consumed the session budget.
- Backend/API: staging chunk uploads renamed the replacement chunk before updating byte accounting, making failed reservation rollback harder than necessary.
- Backend/Store: staging flows needed a session-level atomic delta reservation API that does not require upload-object metadata.

Additional improvements applied:

- Added `AddUploadSessionBytesWithinLimit` for atomic session byte delta updates with max-byte enforcement and concurrent overage tests.
- Changed staging chunk writes to write a temp file, reserve the byte delta, then rename into place; reservation failure removes the temp file and leaves byte accounting unchanged.
- Changed staging multipart form persistence to use the same reservation path and remove the just-written staging file when a stale snapshot would exceed the session budget.
- Added API regression tests for stale form/chunk byte snapshots that verify HTTP 413, unchanged tracked bytes, and no leftover staging file/temp file.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after thirteenth-pass changes.

## Fourteenth Expert Pass

The fourteenth pass addressed the remaining profile YAML export secret-handling item and the frontend save path needed to consume sanitized exports.

Additional findings:

- Backend/API: normal profile YAML export included provider credentials, session tokens, Azure/GCP private credential fields, and TLS private material by default.
- Frontend/Product: the profile YAML save path reused the create/import parser, so sanitized exports without `secretAccessKey` could not be saved back to an existing profile.
- API Contract: clients had no documented opt-in switch for full credential-inclusive YAML export.

Additional improvements applied:

- Profile YAML export now omits provider secret fields and the TLS block by default, while `includeSecrets=true` preserves the legacy full-fidelity export behavior for explicit operator workflows.
- Added strict `includeSecrets` query parsing so malformed values return HTTP 400 instead of silently changing export behavior.
- Updated OpenAPI and frontend API facades to expose the `includeSecrets` export option.
- Split frontend YAML parsing into create/import and update/save paths, allowing sanitized profile YAML to update an existing profile without re-entering omitted secrets.
- Added backend export-policy regressions and frontend parser/hook tests for sanitized update YAML.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after fourteenth-pass changes.

## Fifteenth Expert Pass

The fifteenth pass finished the frontend affordance around the new secret-redacted profile YAML export policy.

Additional findings:

- Frontend/Product: the Profile YAML modal still warned that every export contained credentials even though the backend now omits secrets by default.
- Frontend/Product: there was no explicit UI action for the new `includeSecrets=true` export path, so full credential migration depended on an API-only option.
- Frontend/Product: the import modal did not warn operators that pasted YAML can contain credentials from an external source.

Additional improvements applied:

- Added `Load with secrets` as an explicit danger action in the Profile YAML modal; it calls the export API with `{ includeSecrets: true }` and marks the draft as secret-inclusive.
- Changed the default Profile YAML modal alert to `Secrets omitted`, and only shows the credential/private-material warning after the secret-inclusive export is loaded.
- Added an import warning that YAML may contain credentials and should only come from trusted sources.
- Threaded `yamlIncludesSecrets` and `onYamlLoadSecrets` through the profile page state/dialog props and added hook coverage for the explicit secret-inclusive load path.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after fifteenth-pass changes.

## Sixteenth Expert Pass

The sixteenth pass reduced the local-path symlink authorization gap for local transfer jobs.

Additional findings:

- Backend/API: job-create validation allowed a `localPath` under an allowed root even when the selected path contained a symlink component that resolved back inside the allowed root.
- Backend/Jobs: the manager repeated allowed-root checks before rclone execution, but did not reject symlink components that could later be swapped or retargeted by another local actor.
- Backend/API: the local directory picker still displayed symlinked directories when they resolved under an allowed root, encouraging paths that the transfer guard should not accept.

Additional improvements applied:

- Added `backend/internal/localpath` with shared detection for symlink components below configured allowed local roots.
- Rejected symlinked local paths in job-create validation for local-to-S3 reads and S3-to-local create destinations.
- Rejected symlinked local paths again in the job manager immediately before local reads and after destination creation, so queued jobs cannot rely only on request-time validation.
- Stopped listing symlinked directories in the local directory picker, even when their target resolves under an allowed root.
- Added focused unit/API coverage for localpath guards, manager path guards, job-create rejection, and local directory listing behavior.
- Re-synced `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` to the current strict release-scope counts after sixteenth-pass changes.

## Seventeenth Expert Pass

The seventeenth pass removed the release-scope audit drift loop that forced the dated audit document to change after normal dirty-worktree iteration.

Additional findings:

- Docs/Release: `check_release_scope_audit.py` treated `docs/RELEASE_SCOPE_AUDIT_2026-04-30.md` as the live source of truth for current status counts and unit tables, even though the strict `report_release_scope.py` gate already validates the live worktree.
- Docs/Release: every subsequent code/test edit changed the live status count, requiring a historical audit document rewrite before release gate could pass.
- Docs/Release: the audit wording described top-level group and release-unit tables as current, making stale-but-dated context look like an active status source.

Additional improvements applied:

- Added a dynamic current-scope marker to the release-scope audit so the checker treats the dated audit as historical and leaves current status enforcement to the strict `report_release_scope.py` gate.
- Added `--enforce-current-snapshot` to `check_release_scope_audit.py` for legacy/manual checks that intentionally want dated audit counts and release-unit tables to match the current dirty worktree.
- Reworded the audit status, top-level group, and release-unit sections as historical reference snapshots with the live `report_release_scope.py` commands as the current source of truth.
- Added release-scope audit tests for dynamic marker behavior, required strict-command guidance, and the legacy enforced snapshot mode.

## Eighteenth Expert Pass

The eighteenth pass added explicit base/head release-scope comparison so release review can target a committed candidate instead of only the dirty worktree.

Additional findings:

- Docs/Release: `report_release_scope.py` only read `git status`, which made release-unit review hard to reproduce for an already committed candidate or tag comparison.
- Docs/Release: generated unit `path_list_command` and `stage_command` fields did not have a way to preserve a reviewed base/head comparison.
- Docs/Release: `docs/TESTING.md` documented dirty-worktree inventory but not committed release-candidate diff review.

Additional improvements applied:

- Added `--base <ref> --head <ref>` support to `report_release_scope.py`, backed by `git diff --name-status --find-renames`.
- Preserved base/head arguments in generated unit path-list and stage-command fields when the report runs in diff mode.
- Added tests for diff name-status parsing and base/head command generation.
- Documented the committed-candidate comparison workflow in `docs/TESTING.md`.

## Nineteenth Expert Pass

The nineteenth pass extended explicit base/head comparison to the release evidence and readiness gates.

Additional findings:

- Docs/Release: `check_release_evidence.py` still used only `git status`, so provider-live and reverse-proxy evidence requirements could not be evaluated against an already committed candidate diff.
- Docs/Release: `check_release_readiness.py` could not pass a base/head comparison through to strict release-scope and strict release-evidence checks.
- Docs/Release: final gate command guidance generated by release evidence always pointed back to dirty-worktree commands.

Additional improvements applied:

- Added `--base <ref> --head <ref>` support to `check_release_evidence.py`, backed by `git diff --name-status --find-renames`.
- Preserved base/head arguments in generated final gate commands for both release-scope and release-evidence checks.
- Added `--base <ref> --head <ref>` to `check_release_readiness.py` so strict scope and strict evidence use the same committed-candidate comparison.
- Documented committed-candidate evidence/readiness commands in `docs/TESTING.md` and `docs/RELEASE_GATE.md`.
- Added regression tests for evidence diff parsing, diff-scoped final gate commands, and readiness command propagation.

## Twentieth Expert Pass

The twentieth pass removed the remaining fixed two-second job polling waits from live Playwright specs.

Additional findings:

- Frontend/E2E: live jobs, image-preview, transfer-fallback, and API CRUD specs each carried a local `waitForJob` loop with `setTimeout(resolve, 2000)`.
- Frontend/E2E: the duplicated loops made future polling behavior changes easy to miss and kept fixed sleeps in live flows even after earlier helper cleanup.

Additional improvements applied:

- Added `frontend/tests/support/liveJobs.ts` with a shared `waitForLiveJob` helper based on Playwright `expect.poll`.
- Replaced duplicated fixed-delay job polling in `jobs-live-flow`, `objects-image-preview-live`, `transfers-live-fallback`, and `api-crud` specs with the shared helper.
- Preserved terminal job failure/cancel handling and timeout messages with the last observed status.

## Twenty-First Expert Pass

The twenty-first pass addressed the remaining backup payload crypto follow-up without breaking legacy encrypted bundle restores.

Additional findings:

- Backend/API: new encrypted full and portable backups still used a password-only SHA-256-derived AES-CTR key, with no per-bundle salt, versioning, or authenticated ciphertext framing.
- Backend/API: the payload HMAC did not bind future encryption metadata such as KDF, salt, nonce, or chunk size.
- Docs: portable-backup guidance did not describe the encrypted payload format or legacy restore compatibility.

Additional improvements applied:

- New encrypted full and portable backups now write `payload.enc` with versioned `v2` metadata, PBKDF2-SHA256, per-bundle salt/nonce, and AES-256-GCM chunk authentication.
- Restore and portable import now dispatch encrypted payload extraction by manifest encryption version, preserving legacy AES-CTR `payloadEncryptionIv` bundle support.
- Payload HMAC generation now binds v2 encryption metadata while retaining the previous HMAC shape for clear and legacy encrypted bundles.
- Added regression coverage for v2 manifest metadata, encrypted full restore, encrypted portable import, missing-secret errors, and encryption-metadata HMAC binding.
- Documented the v2 encrypted payload format in `docs/PORTABLE_BACKUP.md` and `docs/RUNBOOK.md`.

## Twenty-Second Expert Pass

The twenty-second pass closed the NetworkPolicy example ambiguity without changing the default opt-in policy model.

Additional findings:

- Deployment/Ops: `values-istio.yaml` enabled ingress NetworkPolicy but only allowed same-namespace sources, which can block a standard Istio ingress gateway running in `istio-system`.
- Deployment/Ops: chart docs documented ingress examples but did not give concrete egress allow-list examples for Postgres or external HTTPS destinations.
- Deployment/Ops: raw Istio manifests under `k8s/` needed an explicit note that they are operator references, not the default Helm install path.

Additional improvements applied:

- Updated `charts/s3desk/values-istio.yaml` so the sample NetworkPolicy allows the `istio-system` gateway pod selector on port `8080`.
- Added chart README egress examples for same-namespace Postgres and external HTTPS CIDR allow-lists, including the Kubernetes NetworkPolicy IP/selector limitation.
- Documented that raw Istio manifests must be scoped to the operator's gateway labels, namespace, and matching `networkPolicy.ingress.extra` rule before applying.

## Twenty-Third Expert Pass

The twenty-third pass reduced GitLab runner RBAC blast radius for Kubernetes smoke jobs.

Additional findings:

- Deployment/Ops: `k8s/gitlab-runner-namespace-admin.yaml` bound namespace create/delete and Helm smoke resource privileges to the `gitlab-runner/default` service account.
- Deployment/Ops: the namespace ClusterRole allowed `list` and `watch` on namespaces even though `scripts/helm_k8s_smoke.sh` only needs `get`, `create`, and cleanup `delete`.

Additional improvements applied:

- Added a dedicated `gitlab-runner-helm-smoke` service account for `helm_k8s_*` jobs.
- Rebound both the namespace ClusterRoleBinding and namespace RoleBinding from `default` to `gitlab-runner-helm-smoke`.
- Reduced the namespace ClusterRole verbs to `get`, `create`, and `delete`.
- Documented in the manifest header that the GitLab Runner Kubernetes executor for these jobs must use `serviceAccountName: gitlab-runner-helm-smoke`.

## Twenty-Fourth Expert Pass

The twenty-fourth pass broadened diagnostic redaction coverage for provider-specific secret shapes.

Additional findings:

- Backend/API: diagnostic redaction covered common access keys, tokens, signed URL parameters, and PEM private keys, but provider config names such as Azure SAS URLs, shared access signatures, B2 application keys, OCI key content, passphrases, and service-account credentials were not all recognized.
- Backend/API: escaped JSON credentials could leave an inner `\"private_key\":\"...\"` value visible after an outer credentials field was partially redacted.

Additional improvements applied:

- Added provider-specific secret key patterns for SAS URL/token, shared access signature, shared/application keys, key content, key-file passphrase, client certificate password, and service-account credentials.
- Added escaped JSON key redaction before normal key/value redaction so embedded credential JSON cannot leak inner private keys.
- Added regression coverage for provider-specific diagnostic strings and nested `DiagnosticDetails` fields while preserving useful non-secret context.

## Twenty-Fifth Expert Pass

The twenty-fifth pass closed staging chunk replacement byte accounting for already assembled final paths.

Additional findings:

- Backend/API: a same-path staging chunk replacement could count the previous assembled final file and the new replacement chunk parts at the same time, causing a valid replacement to hit `uploadMaxBytes` before commit.
- Backend/API: `tryAssembleChunkFile` could overwrite an existing final path without subtracting that previous final size from the upload session counter.

Additional improvements applied:

- Staging chunk uploads now release an existing assembled final file for the same relative path before reserving replacement chunk bytes.
- Chunk assembly now subtracts a pre-existing final file size before the final rename if that file is still present at assembly time.
- Added regression coverage for direct `tryAssembleChunkFile` replacement accounting and the HTTP staging chunk replacement flow.

## Twenty-Sixth Expert Pass

The twenty-sixth pass closed the local destination symlink TOCTOU gap for S3-to-local transfer jobs.

Additional findings:

- Backend/Jobs: `prepareLocalDestination` rejected symlink components before starting rclone, but rclone still received the mutable filesystem path. A local path could be swapped after preflight and before or during the child process.
- Backend/Jobs: rclone process options had no way to inherit pinned directory file descriptors for local destinations.

Additional improvements applied:

- Added Unix `openat`/`O_NOFOLLOW` directory pinning under allowed local roots so symlink components are rejected while opening each path segment.
- S3-to-local transfers now pass an inherited FD path such as `/proc/self/fd/3/` or `/dev/fd/3/` to rclone instead of the mutable destination pathname.
- Added regression coverage proving pinned directories keep writing to the originally opened directory after the original path is swapped, and that S3-to-local rclone invocation receives an inherited FD destination.

## Twenty-Seventh Expert Pass

The twenty-seventh pass made Istio upload route timeout behavior explicit in the chart and operator reference manifests.

Additional findings:

- Deployment/Ops: the Helm Istio VirtualService rendered only a route and left long-upload timeout intent implicit.
- Deployment/Ops: the raw dedicated upload gateway reference had Envoy buffer/idle-timeout tuning, but the VirtualService route did not explicitly match the no-timeout upload behavior.
- Deployment/Ops: the Helm validation script did not assert the Istio upload route timeout value.

Additional improvements applied:

- Added `istio.virtualService.timeout` to chart values with a default of `0s`, and rendered it into the VirtualService route.
- Set `timeout: 0s` in `k8s/istio-s3desk-upload-gw.yaml` and added a note that the raw buffer limit must be aligned with measured upload concurrency and memory headroom.
- Documented that finite Istio timeouts should only be set after testing them with `uploads.maxBytes`, concurrent uploads, gateway memory, and object-store latency.
- Extended `scripts/check_helm_chart.sh` to assert that the Istio values render the explicit `0s` timeout.

## Twenty-Eighth Expert Pass

The twenty-eighth pass removed the remaining Node-side fixed sleeps from the realtime overlay E2E flow.

Additional findings:

- Frontend/E2E: `jobs-realtime-overlays.spec.ts` used independent `setTimeout(..., 3000)` calls to mutate mock job API state before delayed WebSocket messages were emitted.
- Frontend/E2E: those sleeps made the test depend on relative timer ordering rather than the observable realtime event being delivered.

Additional improvements applied:

- Exposed test-side API state mutation hooks to the browser page and invoked them from the WebSocket mock immediately before emitting the realtime message.
- The completion and deletion overlay tests now tie API state changes to the same observable realtime message that drives the UI update.

## Twenty-Ninth Expert Pass

The twenty-ninth pass added first-class `AppTabs` support for externally controlled tab panels.

Additional findings:

- Frontend/Components: `AppTabs` could render internal `children` as a managed `tabpanel`, but there was no item-level way to connect a semantic tab to a panel rendered elsewhere.
- Frontend/Components: this made future object workspace tab semantics harder to restore without custom ARIA wiring outside the shared component.

Additional improvements applied:

- Added `panelId` to `AppTabItem` so tabs can expose `aria-controls` for externally controlled panels.
- Kept internal panel rendering for `children` unchanged while allowing external panel ids without rendering an empty internal panel.
- Added regression coverage for external panel wiring with `semanticRole="tabs"`.

## Thirtieth Expert Pass

The thirtieth pass broadened mobile touch-target coverage to the shared compact app header.

Additional findings:

- Frontend/E2E: mobile responsive coverage already checked object, jobs, transfer, upload, and bucket policy flows, but the shared compact header controls were not included in a 44px touch-target assertion.

Additional improvements applied:

- Added a mobile smoke geometry assertion for the compact header navigation button, profile selector, transfers button, and more-actions button.
- Verified the header target-size contract on both mobile iPhone 13 and Pixel 7 Playwright projects.

## Thirty-First Expert Pass

The thirty-first pass aligned release evidence checklist sync with the existing base/head comparison mode.

Additional findings:

- Release/Tooling: `report_release_scope.py`, `check_release_evidence.py`, and `check_release_readiness.py` already supported explicit `--base/--head` diff mode, but `check_release_evidence_checklist.py` always compared against dirty-worktree evidence output.
- Release/Docs: the checklist sync README did not explain how to validate a generated committed-candidate checklist.

Additional improvements applied:

- Added `--base` and `--head` to `check_release_evidence_checklist.py` and passed those values through to `check_release_evidence.py --format json`.
- Added validation for `--head` without `--base` and unit coverage for diff-scope command propagation.
- Documented that committed-candidate checklist sync should use the same `--base <base-tag-or-sha> --head <candidate-tag-or-sha>` pair as release evidence and readiness checks.

## Deferred Follow-Ups

These items are not safe as quick edits because they affect API contracts, storage consistency, or infrastructure authorization boundaries:

- Keep diagnostic redaction coverage current when new provider-specific secret formats or output surfaces are added.

## Validation

Commands run for this pass:

- `python3 scripts/report_release_scope_test.py`: passed.
- `python3 scripts/check_go_toolchain.py`: passed.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash -n scripts/install_backend_security_tools.sh`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `python3 -c 'import yaml; ...'`: parsed GitLab CI, demo Compose, and changed GitHub workflows successfully.
- `git diff --check`: passed.
- `npm --prefix frontend run test:unit -- src/components/__tests__/AppTabs.test.tsx src/pages/objects/__tests__/ObjectsListContent.test.tsx src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx src/pages/objects/__tests__/useObjectsPrefixGridRenderer.test.tsx`: 4 files / 9 tests passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.

Local note: `npm --prefix frontend --version` reported `10.9.7`; repository docs now call out `10.9.4` as the recommended check-script version.

Second-pass validation:

- `cd backend && go test ./internal/api -run TestExecuteMultipartRejectsUploadMaxBytes -count=1`: passed.
- `python3 scripts/report_release_scope_test.py`: passed.
- `python3 scripts/check_release_evidence_test.py`: passed.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/check_github_workflows.py`: passed.
- `python3 -c 'import yaml; ...'`: parsed GitLab CI, demo Compose, changed GitHub workflows, and `k8s/s3desk-caddy.yaml` successfully.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed.
- `git diff --check`: passed.

Third-pass validation:

- `cd backend && go test ./internal/api -count=1`: passed.
- `cd backend && go test ./internal/api -run 'Test(...)' -count=1`: targeted invalid-parameter regressions passed.
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx src/pages/objects/__tests__/ObjectsLocalDeviceModals.test.tsx`: 2 files / 6 tests passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `npm --prefix frontend run test:e2e -- tests/objects-smoke.spec.ts tests/objects-layout-density.spec.ts --project=chromium -g 'boots in simple mode|uses folder tree rows'`: 2 Chromium tests passed.
- `bash -n scripts/deploy_smoke.sh scripts/helm_k8s_smoke.sh scripts/podman.sh scripts/deploy_helm_release.sh scripts/install_backend_security_tools.sh`: passed.
- `python3 -c 'import yaml; ...'`: parsed GitLab CI, Compose files, frontend E2E workflow, and `k8s/s3desk-caddy.yaml` successfully.
- `python3 scripts/report_release_scope_test.py`: passed.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/check_release_evidence_test.py`: passed.
- `python3 scripts/check_github_workflows.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=187`, `deleted=0`, `untracked=13`, and `total status entries=200`.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Fourth-pass validation:

- `cd backend && go test ./internal/api -count=1`: passed.
- `npm --prefix frontend run test:unit -- src/components/__tests__/AppTabs.test.tsx src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx src/pages/objects/__tests__/useObjectsPrefixGridRenderer.test.tsx src/pages/jobs/__tests__/JobsLogsDrawer.test.tsx`: 4 files / 10 tests passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `npm --prefix frontend run test:e2e -- tests/objects-layout-density.spec.ts --project=chromium -g 'shows tab overflow affordance'`: 1 Chromium test passed.
- `npm --prefix frontend run test:e2e -- tests/objects-layout-density.spec.ts --project=chromium -g 'uses toolbar tabs, bucket picker, and navigation'`: 1 Chromium test passed.
- `bash -n scripts/sync_oci_runtime.sh scripts/compose.sh scripts/check_release_gate.sh scripts/verify_release_readiness.sh`: passed.
- `python3 -c 'import yaml; ...'`: parsed GitHub license-audit workflow, GitLab CI, and remote Compose files successfully.
- `python3 scripts/check_github_workflows.py`: passed.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=196`, `deleted=0`, `untracked=13`, and `total status entries=209`.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Fifth-pass validation:

- `cd backend && go test ./internal/api -count=1`: passed.
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsListKeydown.test.tsx src/pages/objects/__tests__/ObjectsListRow.test.tsx src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx src/pages/objects/__tests__/useObjectsPrefixGridRenderer.test.tsx`: 4 files / 14 tests passed.
- `npm --prefix frontend run check:e2e:geometry`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `bash -n scripts/verify_release_readiness.sh scripts/install_backend_security_tools.sh scripts/sync_oci_runtime.sh scripts/compose.sh`: passed.
- `python3 -c 'import yaml; ...'`: parsed frontend E2E workflow, license-audit workflow, GitLab CI, Kubernetes Caddy config, and remote Compose files successfully.
- `python3 scripts/check_github_workflows.py`: passed.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=210`, `deleted=0`, `untracked=13`, and `total status entries=223`.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Sixth-pass validation:

- `cd backend && go test ./internal/api -run 'Test(UploadPresignHTTPService|ExecutePresign|ExecuteSinglePart|ExecuteMultipartRejectsUploadMaxBytes|ParseRealtimeAfterSeq|ParseRealtimeIncludeLogs|PrepareRealtimeRequest|SubscribeRealtime|ObjectDownloadURLHTTPService|BuildObjectDownloadURLResponse|ProfileExportHTTPService|ExecutePreparedProfileExport|ExecuteExport)' -count=1`: passed.
- `cd backend && go test ./internal/api -count=1`: passed.
- `npm --prefix frontend run test:unit -- src/pages/jobs/__tests__/useJobsLogsState.test.tsx src/pages/jobs/__tests__/JobsLogsDrawer.test.tsx`: 2 files / 12 tests passed.
- `npm --prefix frontend run check:e2e:geometry`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `./scripts/check_helm_chart.sh`: passed.
- `python3 scripts/check_release_evidence_test.py`: 29 tests passed.
- `python3 -c 'import yaml; ...'`: parsed GitLab CI successfully.
- `python3 scripts/report_release_scope.py --format json --untracked-files all`: parsed successfully with `tracked changes=218`, `deleted=0`, `untracked=13`, and `total status entries=231`.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=218`, `deleted=0`, `untracked=13`, and `total status entries=231`.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Thirteenth-pass validation:

- `cd backend && gofmt -w internal/store/store_upload_sessions.go internal/store/upload_objects_test.go internal/api/handlers_uploads_chunks.go internal/api/handlers_uploads_reservation.go internal/api/handlers_uploads_staging.go internal/api/handlers_uploads_parts.go internal/api/handlers_uploads_staging_http_test.go`: passed.
- `cd backend && go test ./internal/store -run 'Test(AddUploadSessionBytesWithinLimit|UpsertUploadObjectWithByteLimit)' -count=1`: passed.
- `cd backend && go test ./internal/api -run 'TestUploadStagingHTTPService_(FormUploadRemovesFileWhenReservationExceedsLimit|ChunkUploadRemovesTempWhenReservationExceedsLimit|HandleStaging|ExecuteChunkRequest)' -count=1`: passed.
- `cd backend && go test ./internal/store ./internal/api ./internal/jobs ./internal/redact -count=1`: passed.
- `cd backend && go test ./... -count=1`: passed.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=262`, `deleted=0`, `untracked=22`, and `total status entries=284`.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Fourteenth-pass validation:

- `cd backend && gofmt -w internal/api/handlers_profiles_export.go internal/api/handlers_profiles_export_test.go`: passed.
- `cd backend && go test ./internal/api -run 'Test(ProfileExportHTTPService|WantsProfileExport|ExecutePreparedProfileExport|ExecuteExport)' -count=1`: passed.
- `npm --prefix frontend run test:unit -- src/pages/profiles/__tests__/profileYaml.test.ts src/pages/profiles/__tests__/useProfilesYamlImportExport.test.tsx`: 2 files / 10 tests passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `cd backend && go test ./... -count=1`: passed.
- `python3 scripts/report_release_scope.py --format json --untracked-files all`: parsed successfully with `tracked changes=270`, `deleted=0`, `untracked=22`, and `total status entries=292`.
- `python3 scripts/report_release_scope_test.py`: 13 tests passed.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=270`, `deleted=0`, `untracked=22`, and `total status entries=292`.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Fifteenth-pass validation:

- `npm --prefix frontend run test:unit -- src/pages/profiles/__tests__/useProfilesYamlImportExport.test.tsx src/pages/profiles/__tests__/profileYaml.test.ts`: 2 files / 11 tests passed.
- `npm --prefix frontend run test:unit -- src/pages/profiles/__tests__/useProfilesYamlImportExport.test.tsx src/pages/profiles/__tests__/ProfilesPageShell.test.tsx src/pages/profiles/__tests__/buildProfilesPageDialogsProps.test.ts src/pages/profiles/__tests__/buildProfilesPagePresentationProps.test.ts`: 4 files / 8 tests passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/report_release_scope.py --format json --untracked-files all`: parsed successfully with `tracked changes=276`, `deleted=0`, `untracked=22`, and `total status entries=298`.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=276`, `deleted=0`, `untracked=22`, and `total status entries=298`.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Sixteenth-pass validation:

- `cd backend && gofmt -w internal/localpath/guard.go internal/localpath/guard_test.go internal/jobs/manager_paths.go internal/jobs/manager_paths_test.go internal/api/handlers_jobs.go internal/api/handlers_jobs_test.go internal/api/handlers_local_http.go internal/api/handlers_local_http_test.go`: passed.
- `cd backend && go test ./internal/localpath ./internal/jobs ./internal/api -run 'Test(RejectSymlinkComponentsUnderRoots|EnsureLocalPathAllowedRejectsSymlinkComponentUnderAllowedRoot|PrepareLocalDestination|JobCreateRejectsLocalPath|LocalEntriesHTTPService_HandleListLocalEntries_ReturnsAllowedDirectoryChildrenOnly)' -count=1`: passed.
- `cd backend && go test ./internal/localpath ./internal/jobs ./internal/api -count=1`: passed.
- `cd backend && go test ./... -count=1`: passed.
- `python3 scripts/report_release_scope.py --format json --untracked-files all`: parsed successfully with `tracked changes=279`, `deleted=0`, `untracked=25`, and `total status entries=304`.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=279`, `deleted=0`, `untracked=25`, and `total status entries=304`.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Seventeenth-pass validation:

- `python3 scripts/check_release_scope_audit_test.py`: 9 tests passed.
- `python3 scripts/check_release_scope_audit.py`: passed in dynamic current-scope mode.
- `python3 scripts/check_release_scope_audit.py --enforce-current-snapshot`: intentionally reports the historical audit counts as drifted from the current dirty worktree.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=281`, `deleted=0`, `untracked=25`, and `total status entries=306`.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Eighteenth-pass validation:

- `python3 scripts/report_release_scope_test.py`: 16 tests passed.
- `python3 scripts/report_release_scope.py --base HEAD --head HEAD --format json`: passed with empty diff scope and `source.mode=git-diff`.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=281`, `deleted=0`, `untracked=25`, and `total status entries=306`.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.
- `cd backend && go test ./internal/api -count=1`: passed after investigating one non-reproducible full-suite `internal/api` failure.
- `cd backend && go test ./... -count=1`: passed on the follow-up full backend rerun.

Nineteenth-pass validation:

- `python3 scripts/check_release_evidence_test.py`: 35 tests passed.
- `python3 scripts/check_release_readiness_test.py`: 9 tests passed.
- `python3 scripts/check_release_readiness.py --candidate-id rc1 --base HEAD --head HEAD --skip-release-gate --format json`: passed with empty diff scope, strict release scope passed, strict release evidence passed, and `scope_source.mode=git-diff`.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=281`, `deleted=0`, `untracked=25`, and `total status entries=306`.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Twentieth-pass validation:

- `rg -n "new Promise\\(\\(resolve\\) => setTimeout\\(resolve, 2000\\)|waitForTimeout" frontend/tests -g '*.ts'`: no matches.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=284`, `deleted=0`, `untracked=26`, and `total status entries=310`.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Twenty-first-pass validation:

- `cd backend && go test ./internal/api -run 'Test(HandleRestoreServerBackup_StagesPasswordProtectedBundleWithMatchingPassword|HandleRestoreServerBackup_RejectsPasswordProtectedBundleWithoutPassword|HandleImportPortableBackup_EncryptedBundleImportsWithMatchingKey|HandleImportPortableBackup_PasswordProtectedBundleImportsWithMatchingPassword|ExtractEncryptedServerRestorePayload_RequiresBackupPasswordOrEncryptionKey|ExtractEncryptedPortablePayload_RequiresBackupPasswordOrDestinationKey|VerifyServerRestorePayloadSuccess|BuildServerBackupPayloadHMACIncludesEncryptionMetadata)' -count=1`: passed.
- `cd backend && go test ./internal/api -count=1`: passed.
- `cd backend && go test ./... -count=1`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=289`, `deleted=0`, `untracked=26`, and `total status entries=315`.
- `git diff --check`: passed.

Twenty-second-pass validation:

- `helm template s3desk ./charts/s3desk -f charts/s3desk/values-istio.yaml --set server.apiToken=test-token --set server.encryptionKey=test-encryption-key`: rendered the Istio NetworkPolicy ingress rule for the `istio-system` gateway selector on port `8080`.
- `./scripts/check_helm_chart.sh`: passed.

Twenty-third-pass validation:

- `python3 -c 'import yaml; ...'`: parsed `k8s/gitlab-runner-namespace-admin.yaml` as 5 YAML documents and confirmed both RBAC bindings target `gitlab-runner-helm-smoke`.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=290`, `deleted=0`, `untracked=26`, and `total status entries=316`.
- `git diff --check`: passed.

Twenty-fourth-pass validation:

- `cd backend && go test ./internal/redact ./internal/jobs ./internal/api -run 'TestDiagnostic|TestWriteJobLogRedacts|TestMaybeCaptureUnknownRcloneError' -count=1`: passed.
- `cd backend && go test ./internal/api -count=1`: passed on rerun after one non-reproducible full-suite `internal/api` failure.
- `cd backend && go test ./... -count=1`: passed on rerun.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=290`, `deleted=0`, `untracked=26`, and `total status entries=316`.
- `git diff --check`: passed.

Twenty-fifth-pass validation:

- `cd backend && gofmt -w internal/api/handlers_uploads_chunk_flows.go internal/api/handlers_uploads_staging.go internal/api/handlers_uploads_chunks.go internal/api/handlers_uploads_test.go internal/api/handlers_uploads_staging_http_test.go`: passed.
- `cd backend && go test ./internal/api -run 'Test(TryAssembleChunkFile_ReplacesExistingFinalAccounting|UploadStagingHTTPService_ChunkReplacementReleasesExistingFinalBytes|UploadStagingHTTPService_ChunkUploadRemovesTempWhenReservationExceedsLimit|UploadChunkAndCommitLifecycle)' -count=1`: passed.
- `cd backend && go test ./internal/api -count=1`: passed.
- `cd backend && go test ./... -count=1`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=291`, `deleted=0`, `untracked=26`, and `total status entries=317`.
- `git diff --check`: passed.

Twenty-sixth-pass validation:

- `cd backend && gofmt -w internal/localpath/pin_unix.go internal/localpath/pin_unix_test.go internal/jobs/local_pin_unix.go internal/jobs/local_pin_other.go internal/jobs/rclone_progress.go internal/jobs/process_testhooks.go internal/jobs/rclone_attempt.go internal/jobs/manager_transfer_execution.go internal/jobs/manager_paths_test.go`: passed.
- `cd backend && go test ./internal/localpath ./internal/jobs -run 'Test(OpenPinnedDirUnderRoots|RunTransferSyncS3ToLocalPinsDestinationForRclone|PrepareLocalDestination|EnsureLocalPathAllowed)' -count=1`: passed after normalizing symlink open errors that return `ENOTDIR`.
- `cd backend && go test ./internal/localpath ./internal/jobs ./internal/api -count=1`: passed.
- `cd backend && go test ./... -count=1`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=294`, `deleted=0`, `untracked=30`, and `total status entries=324`.
- `git diff --check`: passed.

Twenty-seventh-pass validation:

- `helm template s3desk ./charts/s3desk -f charts/s3desk/values-istio.yaml --set server.apiToken=test-token --set server.encryptionKey=test-encryption-key`: rendered the Istio VirtualService with `timeout: "0s"`.
- `python3 -c 'import yaml, pathlib; ...'`: parsed `k8s/istio-s3desk-upload-gw.yaml` as 5 YAML documents including `VirtualService` and `EnvoyFilter`.
- `./scripts/check_helm_chart.sh`: passed with the new Istio timeout assertion.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=296`, `deleted=0`, `untracked=30`, and `total status entries=326`.
- `git diff --check`: passed.

Twenty-eighth-pass validation:

- `npm run test:e2e -- tests/jobs-realtime-overlays.spec.ts --project=chromium -g 'logs drawer closes when realtime deletes the active job'`: 1 Chromium test passed.
- `npm run test:e2e -- tests/jobs-realtime-overlays.spec.ts --project=chromium -g 'details drawer refreshes into completed upload details after live status changes'`: 1 Chromium test passed.
- `npm run typecheck`: passed.
- `npm run check:e2e:geometry`: passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=297`, `deleted=0`, `untracked=30`, and `total status entries=327`.
- `git diff --check`: passed.

Twenty-ninth-pass validation:

- `npm run test:unit -- src/components/__tests__/AppTabs.test.tsx`: 1 file / 4 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=297`, `deleted=0`, `untracked=30`, and `total status entries=327`.
- `git diff --check`: passed.

Thirtieth-pass validation:

- `npm run check:e2e:geometry`: passed.
- `npm run typecheck`: passed.
- `npm run test:e2e -- tests/mobile-smoke.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7 -g 'dashboard header routes compact mobile actions through the overflow menu'`: 2 mobile project tests passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=298`, `deleted=0`, `untracked=30`, and `total status entries=328`.
- `git diff --check`: passed.

Thirty-first-pass validation:

- `python3 scripts/check_release_evidence_checklist_test.py`: 13 tests passed.
- `python3 scripts/check_release_readiness_test.py`: 9 tests passed.
- `python3 scripts/check_release_evidence_test.py`: 35 tests passed.
- `python3 scripts/check_release_evidence_checklist.py`: passed in current checklist mode.
- `python3 scripts/check_release_readiness.py --candidate-id 0.21v-rc3 --base HEAD --head HEAD --skip-release-gate --format json`: passed with empty diff scope and `scope_source.mode=git-diff`.
- `python3 scripts/check_release_evidence.py --base HEAD --head HEAD --format json --require-candidate-id --candidate-id 0.21v-rc3`: passed and emitted base/head final gate commands.
- `python3 scripts/check_release_evidence.py --base HEAD --head HEAD --format checklist --require-candidate-id --candidate-id 0.21v-rc3 > <tmp>; python3 scripts/check_release_evidence_checklist.py --candidate-id 0.21v-rc3 --base HEAD --head HEAD --checklist <tmp>`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=298`, `deleted=0`, `untracked=30`, and `total status entries=328`.
- `git diff --check`: passed.

Seventh-pass validation:

- `cd backend && go test ./internal/api -count=1`: passed.
- `npm --prefix frontend run test:unit -- src/pages/jobs/__tests__/JobsRowActions.test.tsx src/pages/jobs/__tests__/JobsRowActions.menu.test.tsx src/pages/jobs/__tests__/useJobsTableColumns.test.tsx src/pages/buckets/__tests__/BucketActions.test.tsx src/components/transfers/__tests__/TransferUploadRow.test.tsx src/components/transfers/__tests__/TransferDownloadRow.test.tsx`: 6 files / 14 tests passed.
- `npm --prefix frontend run check:e2e:geometry`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `./scripts/check_helm_chart.sh`: passed.
- `python3 scripts/check_release_evidence_test.py`: 30 tests passed.
- `python3 scripts/check_release_evidence_checklist_test.py`: 6 tests passed.
- `bash -n scripts/deploy_smoke.sh scripts/check_helm_chart.sh`: passed.
- `python3 -c 'import yaml; ...'`: parsed GitLab CI, production Helm values, and Istio Helm values successfully.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=227`, `deleted=0`, `untracked=14`, and `total status entries=241`.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Eighth-pass validation:

- `cd backend && go test ./internal/api -run 'Test(ProfileExportHTTPService|WantsProfileExportDownload|ObjectDownloadURLHTTPService|ParseDownloadProxyBool|ServerBackupHTTPService|ExtractEncryptedServerRestorePayload)' -count=1`: passed.
- `cd backend && go test ./internal/api -count=1`: passed on re-run.
- `npm --prefix frontend run test:unit -- src/pages/buckets/__tests__/BucketPolicyModal.test.tsx`: 1 file / 16 tests passed.
- `npm --prefix frontend run check:e2e:geometry`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/check_live_evidence_env_test.py`: 8 tests passed.
- `python3 scripts/report_release_scope_test.py`: 13 tests passed.
- `python3 scripts/check_release_evidence_test.py`: 30 tests passed.
- `python3 scripts/check_release_evidence_checklist_test.py`: 6 tests passed.
- `python3 scripts/check_release_readiness_test.py`: 6 tests passed.
- `./scripts/check_helm_chart.sh`: passed.
- `bash -n scripts/check_release_gate.sh scripts/deploy_smoke.sh scripts/check_helm_chart.sh`: passed.
- `python3 -c 'import yaml; ...'`: parsed GitLab CI, frontend E2E workflow, and production/Istio Helm values successfully.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=234`, `deleted=0`, `untracked=14`, and `total status entries=248`.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash ./scripts/check_github_workflows.sh`: passed.
- `DEPLOY_API_TOKEN=change-me ... python3 scripts/check_live_evidence_env.py --scope reverse-proxy --format json`: rejected the placeholder token as expected.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Ninth-pass validation:

- `cd backend && go test ./internal/api -count=1`: passed.
- `npm --prefix frontend run check:e2e:geometry`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=244`, `deleted=0`, `untracked=14`, and `total status entries=258`.
- `python3 scripts/check_release_evidence_test.py`: 33 tests passed.
- `python3 scripts/check_release_evidence_checklist_test.py`: 9 tests passed.
- `python3 scripts/check_release_readiness_test.py`: 6 tests passed.
- `python3 scripts/check_github_workflows.py`: passed.
- `python3 -m py_compile scripts/portable/run-failure-smoke.py`: passed.
- `./scripts/check_helm_chart.sh`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.
- Frontend worker checks also passed for focused Vitest job action/table tests, mobile Jobs/Uploads Playwright responsive specs on iPhone 13 and Pixel 7 projects, and the `PERF_TESTS=1` jobs logs drawer performance spec.

Tenth-pass validation:

- `cd backend && go test ./internal/api -count=1`: passed.
- `npm --prefix frontend run test:unit -- src/pages/jobs/__tests__/useJobsLogsState.test.tsx src/pages/jobs/__tests__/JobsLogsDrawer.test.tsx`: 2 files / 13 tests passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `npm --prefix frontend run check:e2e:geometry`: passed.
- `python3 scripts/release_candidate_test.py`: 4 tests passed.
- `python3 scripts/check_release_readiness_test.py`: 8 tests passed.
- `python3 scripts/check_release_evidence_checklist_test.py`: 11 tests passed.
- `python3 scripts/check_release_evidence_test.py`: 33 tests passed.
- `./scripts/check_helm_chart.sh`: passed.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=250`, `deleted=0`, `untracked=17`, and `total status entries=267`.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Eleventh-pass validation:

- `cd backend && go test ./internal/redact ./internal/jobs ./internal/api -count=1`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed, including CSS token and import-cycle checks.
- `npm --prefix frontend run check:e2e:geometry`: passed.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=254`, `deleted=0`, `untracked=20`, and `total status entries=274`.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

Twelfth-pass validation:

- `cd backend && gofmt -w internal/store/upload_objects.go internal/store/upload_objects_test.go internal/api/handlers_uploads_reservation.go internal/api/handlers_uploads_chunk_flows.go internal/api/handlers_uploads_direct.go internal/api/handlers_uploads_parts.go internal/api/handlers_uploads_presign_http.go internal/api/handlers_uploads_presign_http_test.go internal/api/handlers_uploads_multipart_http.go`: passed.
- `cd backend && go test ./internal/store -run 'TestUpsertUploadObjectWithByteLimit' -count=1`: passed.
- `cd backend && go test ./internal/api -run 'TestExecuteSinglePartRejectsSessionByteReservationOverLimit|TestExecuteSinglePartRejectsUploadMaxBytes|TestExecuteMultipartRejectsUploadMaxBytes' -count=1`: passed.
- `cd backend && go test ./internal/store ./internal/api ./internal/jobs ./internal/redact -count=1`: passed.
- `cd backend && go test ./... -count=1`: passed.
- `python3 scripts/check_release_scope_audit.py`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=259`, `deleted=0`, `untracked=22`, and `total status entries=281`.
- `python3 scripts/check_github_workflows.py`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Current Expert Sub-Agent Pass

This pass split the review across backend/security, frontend/UX, and DevOps/quality sub-agents, then applied low-risk fixes that were clear from the current dirty worktree.

### Additional Findings

- Backend/Security: rclone/provider diagnostic strings could still reach job failure messages, realtime payloads, connectivity response details, or late download-stream logs without central redaction.
- Backend/Security: `EnsureProfilesEncrypted` encrypted Azure `accountKey` but not Azure ARM `clientSecret` for existing profiles when encryption-at-rest was enabled after profile creation.
- Frontend/UX: object selection move and Jobs delete-job flows could be closed or submitted repeatedly while a request was pending, making destructive/background actions look canceled or duplicated.
- Frontend/UX: repeated `HelpTooltip` triggers exposed identical `Help` accessible names and did not connect the trigger to visible tooltip content with `aria-describedby`.
- DevOps/Quality: `.env.example` still carried a stale release tag and usable placeholder remote secrets; `.dockerignore` did not exclude local secrets/cache/artifacts from build context.
- DevOps/Quality: local `check.sh full` could skip Helm validation and only inspected tracked Go files for formatting, diverging from CI and missing untracked backend additions.

### Improvements Applied

- Redacted rclone/provider diagnostics in job error construction, failed-job finalization payloads/logs, profile connectivity details, and late download-stream warning fields.
- Extended Azure encryption migration to encrypt both `accountKey` and `clientSecret`, with a regression test that verifies stored ciphertext and decrypted readback.
- Blocked duplicate object move and Jobs delete submissions while pending, disabled close/cancel/form controls during pending state, and added focused regression tests.
- Added contextual `HelpTooltip` accessible labels and `aria-describedby` linkage for visible tooltip content; updated Jobs empty-state help labels.
- Updated `.env.example` to `0.21v-rc3`, blanked required remote secrets so compose fails until operators provide real values, and added `compose.sh` placeholder-secret rejection that also reads `.env`.
- Expanded `.dockerignore` to exclude local env files, repository metadata, caches, logs, artifacts, test reports, coverage, and dependency directories.
- Made `check.sh full` require Helm and changed backend `gofmt` coverage to all backend Go files, including untracked additions.
- Classified `.dockerignore` under the release gate/deploy unit so strict release-scope checks do not leave it in `other`.

### Remaining Limitations

- Final release readiness still needs real provider-live evidence and reverse-proxy smoke evidence for `0.21v-rc3`.
- GitHub-side Trivy/Gitleaks parity, pinned demo/portable MinIO images, non-Unix local destination pinning, and the stale mobile QA checklist remain follow-up work.

### Current-Pass Validation

- `cd backend && go test ./internal/jobs ./internal/api ./internal/store ./internal/redact -count=1`: passed.
- `cd backend && go test ./...`: passed.
- `npm run test:unit -- src/pages/objects/__tests__/useObjectsSelectionMove.test.tsx src/pages/jobs/__tests__/useJobsPageCreateFlows.test.tsx src/components/__tests__/HelpTooltip.test.tsx src/pages/jobs/__tests__/JobsCreateModalsState.test.tsx`: passed, 20 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `npm run check:e2e:geometry`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `API_TOKEN=replace-with-a-long-random-token POSTGRES_PASSWORD=replace-with-a-strong-db-password ./scripts/compose.sh remote config`: rejected placeholders as expected.
- `git diff --check`: passed.

## Second Current Expert Sub-Agent Pass

This pass split the review again across backend/security, frontend/accessibility, and DevOps/release readiness sub-agents. The pass focused on low-risk fixes that close concrete execution or release-quality gaps found after the previous cleanup.

### Additional Findings

- Backend/Security: direct multipart/form uploads computed remaining `UploadMaxBytes` from `0` instead of the current upload session bytes, so a near-limit session could still stream extra bytes to rclone/provider before cleanup.
- Backend/Security: direct upload `rcat` failures returned raw `err.Error()` in `details.error` and discarded stderr, leaving one upload path outside the common rclone diagnostic redaction behavior.
- Backend/Security: `/local/entries?path=...` followed symlink components before checking the allowed real path, while job creation rejects symlink components. This made local browsing policy looser than job execution policy.
- Frontend/Accessibility: several panel-backed `AppTabs` usages lacked named `tablist` landmarks, Jobs menu triggers did not expose `aria-haspopup`/`aria-expanded`, and nested menu lists used `group` rather than `menu`.
- Frontend/Docs: mobile responsive checklists for Objects, Jobs, Uploads, and Buckets did not reflect existing Playwright coverage, and operation-feedback docs pointed to old shell files rather than the current helper/wiring files.
- DevOps/Release: demo and portable smoke compose defaults still used floating MinIO images, and tracked `.env` could override the pinned defaults back to `latest`.
- DevOps/Release: demo compose had a server-policy conflict: the app binds `0.0.0.0:8080` inside the container, so defaulting `ALLOW_REMOTE=false` prevents startup even when the published host port is loopback-only.
- DevOps/Release: Helm smoke RBAC granted namespaced workload permissions only in `gitlab-runner`, but `helm_k8s_smoke.sh` creates dynamic namespaces.
- DevOps/Release: deploy scripts checked GitHub release/check-run status but did not directly run the strict release evidence/readiness guard required by the release docs.
- DevOps/CI: `api_integration` could run on compose/e2e runner changes without forcing `build_s3desk_image`, causing it to pull a commit image that might not exist.

### Improvements Applied

- Changed direct multipart/form upload preparation to compute remaining upload bytes from `us.Bytes`.
- Redacted direct upload `rcat` failure diagnostics with `redactRcloneDiagnostic(rcloneErrorMessage(err, stderr))`.
- Rejected symlink components in local entries requests after allowed-root validation, matching job path policy.
- Added backend regression tests for near-limit direct uploads, direct upload redaction, and local symlink browsing rejection.
- Added explicit `ariaLabel` values for Settings, Transfers, and bucket policy tablists.
- Added `aria-haspopup="menu"` and live `aria-expanded` state to Jobs top and row action menu triggers.
- Changed shared and Objects nested menu lists to `role="menu"` and marked submenu triggers with `aria-haspopup="menu"`, with focused unit coverage.
- Updated mobile responsive checklists to separate automated Playwright coverage from remaining manual QA items.
- Updated operation-feedback documentation to point at `profilesFeedback.ts`, `useProfilesPageMutations.ts`, and `bucketsFeedback.ts`.
- Pinned MinIO server/client defaults in `.env`, `.env.example`, demo compose, and portable smoke compose.
- Kept demo host publishing loopback by default while restoring `DEMO_ALLOW_REMOTE=true` so the container's internal wildcard bind is accepted.
- Added release-gate checks preventing `docker.io/minio/minio:latest` and `docker.io/minio/mc:latest` from returning to `.env`, `.env.example`, demo compose, or portable smoke compose.
- Switched Helm smoke workload RBAC to ClusterRole/ClusterRoleBinding so the dedicated CI service account can manage resources in dynamically created smoke namespaces.
- Connected `verify_release_readiness.sh` to `check_release_readiness.py --candidate-id <tag> --base <previous-tag> --head <tag> --skip-release-gate` before GitHub release/check-run checks.
- Added compose/e2e runner paths to `build_s3desk_image.rules` so `api_integration` does not run against a missing commit image.

### Remaining Limitations

- `0.21v-rc3` release readiness remains intentionally blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, plus reverse-proxy smoke evidence, is recorded.
- The historical `0.21v-rc2..0.21v-rc3` release scope still reports separate blockers outside this pass, including dependency notice metadata/snapshot mismatches and uncategorized `AGENTS.md` / `docker-compose-demo.yml` paths.
- Non-Unix local destination pinning and broader GitHub-side Trivy/Gitleaks parity remain follow-up work.

### Second-Pass Validation

- `cd backend && go test ./internal/api -run 'TestUploadDirectHTTPService_FormUpload|TestLocalEntriesHTTPService_HandleListLocalEntries_RejectsSymlinkPathInsideAllowedRoot' -count=1 -v`: passed.
- `cd backend && go test ./...`: passed.
- `npm run test:unit -- src/pages/jobs/__tests__/JobsToolbar.test.tsx src/pages/jobs/__tests__/JobsRowActions.test.tsx src/pages/jobs/__tests__/JobsRowActions.menu.test.tsx src/components/__tests__/MenuPopover.test.tsx src/pages/objects/__tests__/ObjectsMenuPopover.test.tsx`: passed, 22 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `npm run check:e2e:geometry`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `bash scripts/check_github_workflows.sh`: passed.
- `bash scripts/check_helm_chart.sh`: passed.
- `python3 scripts/check_go_toolchain.py`: passed with Go `1.25.9`.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed.
- `python3 scripts/report_release_scope_test.py`: passed, 16 tests.
- `python3 scripts/check_release_readiness_test.py`: passed, 9 tests.
- `./scripts/compose.sh demo config`: rendered pinned MinIO images, loopback host ports, and `ALLOW_REMOTE=true`.
- `python3 scripts/check_release_readiness.py --candidate-id 0.21v-rc3 --base 0.21v-rc2 --head 0.21v-rc3 --skip-release-gate`: failed as expected with missing provider/reverse-proxy evidence and historical scope blockers.
- `DEPLOY_RELEASE_BASE=0.21v-rc2 bash scripts/verify_release_readiness.sh 0.21v-rc3`: failed as expected before GitHub checks because strict readiness is blocked.
- `git diff --check`: passed.

## Third Current Expert Sub-Agent Pass

This pass split review across backend/security, frontend/accessibility, DevOps/release, and documentation/operations sub-agents. The implemented work focused on concrete P0/P1 defects that could affect release correctness, data safety, or browser behavior.

### Additional Findings

- Backend/Security: staging upload commits could enqueue rclone while `.chunks` parts or temporary files still existed, allowing internal chunk artifacts to be copied to the destination.
- Backend/Security: a late duplicate chunk could remove an already assembled final staged file before all replacement chunks had arrived.
- Backend/Security: upload temp file names were deterministic (`<target>.tmp`), so concurrent writes for the same path could clobber each other.
- Frontend/UX: copy, move, rename, new-folder, and device upload flows relied on pending render state only, leaving a same-tick duplicate-submit window.
- Frontend/UX: Jobs log polling reset offsets after log rotation/truncation but appended new entries to old entries.
- Frontend/Accessibility: compact Profiles cards lacked list/listitem semantics.
- DevOps/Release: release-scope and release-evidence diff parsing dropped rename/copy source paths, which could miss watched paths renamed away.
- DevOps/Release: diff-mode release-scope checklist/stage commands omitted `--base/--head`, making generated commands misleading for tag comparisons.
- DevOps/Deploy: remote compose deploy exported `DEPLOY_API_TOKEN` but did not pass the compose-facing `API_TOKEN` variable.
- Docs/Operations: backup export used `X-S3Desk-Backup-Password`, but CORS, OpenAPI, and frontend CORS notes did not document or allow the header.
- Docs/Release: provider evidence documentation still implied AWS/GCS/Azure/OCI only even though release readiness now requires MinIO and Ceph evidence for generic provider-sensitive changes.
- Quality Gate: `govulncheck` flagged the pinned Go `1.25.9` standard library for reachable `net` / `net/http` vulnerabilities fixed by Go `1.25.10`.
- Quality Gate: OpenAPI contract changes required regenerating the frontend OpenAPI types.
- Quality Gate: Profiles YAML page tests mocked create parsing only, while the save path now uses the update parser and current credential validation.

### Improvements Applied

- Added staging commit preflight checks that reject pending `.chunks` files and `*.tmp` artifacts before creating the rclone job.
- Added staging commit item validation for requested paths, regular-file status, and expected sizes.
- Added rclone exclude filters for `.chunks/**` and `*.tmp` artifacts as defense in depth during staging sync.
- Changed staging chunk retries to treat already assembled same-size final files as idempotent success instead of deleting the final file.
- Switched upload chunk/final temp writes to unique same-directory `os.CreateTemp` files before atomic rename.
- Added backend regression tests for pending staging chunk commit rejection and late duplicate chunk preservation.
- Added same-tick submit guards to object copy/move, prefix copy/move, rename, new-folder, and Jobs device upload creation.
- Reset Jobs log entries when the backend returns a lower `nextOffset`, preventing old and new logs from being mixed after rotation/truncation.
- Added compact Profiles list semantics with `role="list"` / `role="listitem"`.
- Fixed release-scope diff-mode checklist, manifest, path-list, and stage commands to preserve `--base <base> --head <head>`.
- Updated release-scope and release-evidence diff parsers to include both old and new paths for rename/copy entries.
- Expanded provider evidence triggers to include `openapi.yml`, profile secret storage, and rclone job/provider paths.
- Required `DEPLOY_API_TOKEN` for compose release deploys and exported it as compose `API_TOKEN` on the remote host.
- Added `X-S3Desk-Backup-Password` to backend CORS allow headers, `/server/backup` OpenAPI parameters, middleware coverage, and frontend CORS notes.
- Regenerated `frontend/src/api/openapi.ts` from `openapi.yml`.
- Updated the pinned Go toolchain to `1.25.10` across `backend/go.mod`, container images, GitHub Actions, GitLab CI, release docs, and the toolchain parity checker.
- Defaulted `scripts/check.sh` to `GOTOOLCHAIN=auto` when the caller has not explicitly set a toolchain mode, so local checks can use the pinned toolchain.
- Updated Profiles YAML page test mocks to cover both create and update YAML parsing paths.
- Updated technical debt, bucket governance, and README CI wording to match the current release gate and provider-evidence behavior.

### Remaining Limitations

- Runtime SSRF hardening still needs guarded dialers for provider control-plane clients and service-account token endpoints.
- Control-plane error bodies are still read without a shared bounded reader in several provider adapters.
- Object grid cards still need a dedicated keyboard activation path for full-card activation parity.
- Helm exposure hardening should also treat `LoadBalancer` / `NodePort` services with `server.allowRemote=true` as public exposure.
- `0.21v-rc3` release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, plus reverse-proxy smoke evidence, is recorded.

### Third-Pass Validation

- `cd backend && go test ./internal/api ./internal/jobs`: passed.
- `cd backend && go test ./...`: passed.
- `npm run test:unit -- src/pages/objects/__tests__/useObjectsSelectionMove.test.tsx src/pages/jobs/__tests__/useJobsPageCreateFlows.test.tsx src/pages/jobs/__tests__/useJobsLogsState.test.tsx src/pages/profiles/__tests__/ProfilesTable.test.tsx`: passed, 21 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/report_release_scope_test.py`: passed, 17 tests.
- `python3 scripts/check_release_evidence_test.py`: passed, 35 tests.
- `python3 scripts/check_release_readiness_test.py`: passed, 9 tests.
- `bash -n scripts/deploy_compose_release.sh`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `python3 scripts/report_release_scope.py --base 0.21v-rc3 --head HEAD --format checklist`: generated diff-mode commands preserving `--base 0.21v-rc3 --head HEAD`.
- `python3 scripts/check_release_evidence.py --candidate-id 0.21v-rc3 --base 0.21v-rc3 --head HEAD --format checklist`: blocked as expected with missing provider-live and reverse-proxy evidence, and generated final-gate commands preserving `--base 0.21v-rc3 --head HEAD`.
- `./scripts/check.sh`: passed, including OpenAPI validation, release gate, workflow/Helm checks, gofmt, backend tests, staticcheck/gosec/govulncheck, frontend lint, 945 Vitest tests, production build, browser smoke, and third-party notice check. It printed the existing npm version warning (`10.9.7` found, `10.9.4` recommended) but did not fail on it.
- `git diff --check`: passed.

## Fourth Current Expert Sub-Agent Pass

This pass re-ran split expert review across backend/security, frontend UX/accessibility, DevOps/release, and documentation/operations. The implemented work targeted issues that were either directly user-facing or could be closed with low-risk guardrails inside the current dirty tree.

### Additional Findings

- Frontend/Accessibility: object grid cards were mouse-clickable but lacked a primary keyboard-activatable body control.
- Frontend/Data Safety: device folder picker flows could enqueue downloads after the user changed API token, profile, bucket, or prefix while the picker was open.
- Frontend/Accessibility: compact/list row primary controls exposed the action but not the current selected state.
- Backend/Security: portable import could persist non-ULID job IDs, and job log/artifact/delete helpers later used job IDs in filesystem paths.
- Backend/Security: runtime SSRF protection remains write-time only, direct form uploads can still race around final object keys, and several provider control-plane clients still read upstream bodies without a shared cap.
- DevOps/Release: Helm production hardening treated Ingress/Istio as browser-facing but missed `LoadBalancer` and `NodePort` services.
- DevOps/CI: GitLab's SQLite release smoke started `ALLOW_REMOTE=true` without the required `ALLOWED_HOSTS` and `ALLOWED_LOCAL_DIRS`.
- DevOps/Release: release evidence docs allow a release tag or commit SHA, but the checker rejected evidence bodies containing the exact commit SHA for a tagged candidate.
- Docs/Operations: backup encryption docs did not clearly describe password-vs-`ENCRYPTION_KEY` precedence, Caddy runbook text implied a backend host bind that the Caddy compose stack does not publish, and secret-inclusive profile YAML export needed operator handling guidance.

### Improvements Applied

- Added a real object grid body button labelled `Select object ...`, reusing the existing grid card button styling and keeping preview/favorite/menu propagation isolated.
- Added scope-version guards to object device-download picker flows so delayed native picker results are ignored after API token/profile/bucket/prefix changes.
- Added `aria-pressed` state and clearer `Select object ...` labels to object list row primary controls.
- Rejected non-ULID job IDs during portable import and added safe job-resource path checks before log/artifact reads or delete cleanup.
- Updated OpenAPI backup/export/restore/import text to document `X-S3Desk-Backup-Password` precedence over destination encryption-key fallback, then regenerated frontend OpenAPI types.
- Added OpenAPI contract assertions for backup password header and restore/import password field descriptions.
- Updated the runbook for Caddy compose topology and profile YAML secret-export handling.
- Treated Helm `service.type=LoadBalancer` and `service.type=NodePort` as browser-facing when `server.allowRemote=true`; added external-base-URL host derivation into rendered `ALLOWED_HOSTS`.
- Added Helm render checks for `LoadBalancer` latest-image rejection and external host inclusion.
- Added required remote env variables to GitLab SQLite release smoke.
- Extended compose stack preflight to reject placeholder public host values such as `s3desk.example.com`.
- Allowed release evidence bodies to use the resolved commit SHA for a tagged candidate while keeping evidence filenames tied to the tag.

### Remaining Limitations

- Runtime SSRF still needs guarded dialers, redirect validation, startup/profile revalidation, and documented network egress controls for `rclone`.
- Direct form upload should be redesigned to reserve before final-key promotion, or stream to a temp key and promote after reservation succeeds.
- Provider control-plane adapters still need a shared bounded upstream body reader and OCI stdout/stderr caps.
- Object dialogs still default focus to Close instead of task-specific first fields.
- GitLab/GitHub E2E parity remains uneven unless the shared spec lists are centralized or the GitLab gaps are documented as GitHub-only gates.
- Existing `CHANGELOG.md` edits still touch the already-tagged `0.21v-rc3` section; preparing new release notes should add a new RC section or explicitly update the existing tag/GitHub Release.
- `0.21v-rc3` release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, plus reverse-proxy smoke evidence, is recorded.
- `check_release_gate.sh` currently reports the existing dependency notice unit as incomplete because dependency metadata is changed without a tracked `third_party/licenses/` snapshot change in the current status set.

### Fourth-Pass Validation

- `cd backend && go test ./internal/store ./internal/api -run 'TestImportPortableEntityFilesReplaceRejectsUnsafeJobIDs|TestBuildJobLogReadResultRejectsUnsafeJobID|TestRemoveDeletedJobArtifactsRejectsUnsafeJobID|TestOpenAPIMetaAndMigrationSchemasCoverFrontendContract' -count=1`: passed.
- `cd backend && go test ./...`: passed.
- `npm run test:unit -- ObjectsListRow.test.tsx useObjectDownloads.test.tsx useObjectsObjectGridRenderer.test.tsx`: passed, 14 tests.
- `npm run test:unit`: passed, 245 files / 947 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `npm run check:openapi`: passed.
- `python3 scripts/check_release_evidence_test.py`: passed, 36 tests.
- `python3 scripts/report_release_scope_test.py`: passed, 18 tests.
- `bash scripts/check_helm_chart.sh`: passed.
- `bash -n scripts/compose.sh scripts/check_helm_chart.sh`: passed.
- `git diff --check`: passed.
- `python3 scripts/check_release_evidence.py --candidate-id 0.21v-rc3 --base 0.21v-rc3 --head HEAD --format checklist`: blocked as expected with missing provider-live and reverse-proxy evidence.
- `bash ./scripts/check_release_gate.sh`: failed on the existing dependency notice unit split: dependency metadata is changed without generated license snapshot changes in the current status set.

## Fifth Current Expert Sub-Agent Pass

This pass split review across four read-only expert agents: backend/security, frontend UX/accessibility, DevOps/release, and docs/operations. I then implemented the low-risk fixes that could be safely completed in the current dirty worktree and left the larger architecture/security items explicit.

### Additional Findings

- Backend/Security: runtime SSRF remains the largest unresolved backend risk because profile endpoints, provider SDK clients, rclone config generation, and service-account token URLs still lack a shared runtime egress policy.
- Backend/Security: direct multipart form upload still streams unknown-size parts to final object keys before durable byte reservation; removing final-key cleanup prevents deleting another writer's object, but a full temp-key promote design is still needed.
- Backend/Security: portable import preserved queued/running jobs, allowing imported destructive jobs to be requeued after recovery.
- Frontend/Accessibility: object task dialogs and sheets opened with focus on Close, even when the task starts with a required text or bucket input.
- Frontend/State: several object mutations still expose global pending state across stale scope changes; this remains for a later hook-level pass.
- DevOps/Release: the dependency notice release-scope check treated toolchain-only `backend/go.mod` plus timestamp-only `THIRD_PARTY_NOTICES.md` as an incomplete dependency notice unit.
- DevOps/Release: `0.21v-rc3` tag metadata, current `CHANGELOG.md`, and GitHub Release-style expectations still need an explicit release-management decision before publishing another RC.
- Docs/Ops: Caddy compose required-env docs, backup password precedence docs, `/server/backup` `400` response docs, and release evidence secret guidance did not fully match runtime behavior.

### Improvements Applied

- Removed direct-form upload cleanup that unconditionally deleted the final object key after over-limit or reservation-race failures; added regression coverage that verifies no `rclone deletefile` is issued for those failed final-key paths.
- Added `initialFocusSelector` support to `useOverlayLayer`, `DialogModal`, `OverlaySheet`, and `ObjectsOverlaySheet`, then wired new-folder, copy/move, copy-prefix, rename, and move-selection flows to focus their first meaningful input.
- Added a DialogModal regression test proving selector-targeted initial focus beats the default close-button focus.
- Quarantined portable-imported queued/running jobs as failed audit history with `portable_import_quarantined`, cleared `started_at`, and set `finished_at` so recovery cannot requeue imported executable work.
- Added portable import tests for unsafe job IDs and executable-job quarantine.
- Updated `/server/backup` OpenAPI text to document non-empty backup-password precedence over destination `ENCRYPTION_KEY`, and added the missing `400` response.
- Regenerated `frontend/src/api/openapi.ts` from the updated OpenAPI contract.
- Updated README and Runbook Caddy required-env docs to match `compose.sh caddy` preflight, including `ALLOWED_LOCAL_DIRS`, `API_TOKEN`, and `POSTGRES_PASSWORD`.
- Split quick reverse-proxy operator smoke from stricter release evidence smoke in the Runbook.
- Updated portable backup docs to state that non-empty `X-S3Desk-Backup-Password` overrides destination `ENCRYPTION_KEY`; leave it blank for server-key encrypted bundles.
- Added backup password assignment detection to release evidence checks and updated release evidence docs to forbid backup passwords in evidence.
- Aligned `report_release_scope.py` with `check.sh` by ignoring toolchain-only `backend/go.mod` changes and timestamp-only `THIRD_PARTY_NOTICES.md` changes for dependency notice completeness.

### Remaining Limitations

- Runtime SSRF needs a shared guarded egress layer: scheme allowlist, DNS resolution checks, private/link-local/loopback denial by default, redirect revalidation, explicit private CIDR allowlist, and coverage across SDK clients, custom HTTP clients, rclone configs, and service-account token URLs.
- Direct form upload still needs a full final-key safety redesign: temp/session key streaming, atomic reserve/persist, then conditional promote/copy to the final key.
- Provider adapters still need bounded upstream body readers and capped OAuth/provider error formatting.
- Local-to-S3 source paths still have a narrower TOCTOU window; they should be fd-pinned like local destinations where the platform supports it.
- Object mutation hooks still need scope-local pending state so stale in-flight operations cannot disable newly opened dialogs in a different bucket/profile scope.
- GitLab publish jobs still need an explicit readiness/evidence gate before DockerHub/Helm publication.
- GitHub/GitLab critical E2E parity still needs a shared spec list or documented gate asymmetry.
- `0.21v-rc3` tag/changelog/GitHub Release consistency is unresolved; fixing it requires either rewriting the RC tag and GitHub Release body or preparing a new RC section/tag.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, plus reverse-proxy smoke evidence, is recorded.

### Fifth-Pass Validation

- `cd backend && go test ./internal/store -run 'TestImportPortableEntityFilesReplaceRejectsUnsafeJobIDs|TestImportPortableEntityFilesReplaceQuarantinesExecutableJobs' -count=1`: passed.
- `cd backend && go test ./internal/api -run 'TestUploadDirectHTTPService_FormUploadLimitsRemainingBytesFromSession|TestUploadDirectHTTPService_FormUploadDoesNotDeleteFinalKeyAfterReservationRace|TestOpenAPIMetaAndMigrationSchemasCoverFrontendContract' -count=1`: passed after tightening the OpenAPI password-header wording to preserve the existing contract phrase.
- `cd backend && go test ./...`: passed.
- `npm run test:unit -- src/components/__tests__/DialogModal.test.tsx src/components/__tests__/OverlaySheet.test.tsx`: passed, 10 tests.
- `npm run test:unit`: passed, 245 files / 948 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `npm run check:openapi`: passed.
- `python3 scripts/report_release_scope_test.py`: passed, 20 tests.
- `python3 scripts/check_release_evidence_test.py`: passed, 37 tests.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Sixth Current Expert Sub-Agent Pass

This pass split read-only analysis across four expert sub-agents: backend/security, frontend UX/state, DevOps/release, and docs/operations. I then implemented the low-risk fixes that were narrow enough for the current dirty worktree, with the remaining architecture and release-readiness risks called out explicitly.

### Additional Findings

- Backend/Security: runtime SSRF protection is still missing across provider SDK clients, custom provider HTTP clients, GCS token URLs, rclone config generation, and OCI CLI launch paths. Write-time profile validation is not enough to cover DNS rebinding, redirects, portable imports, or external process execution.
- Backend/Security: direct form upload still writes unknown-size payloads to final object keys before reservation/promotion, so the previous final-key cleanup fix prevents accidental delete but does not eliminate final-key pollution.
- Backend/Security: local-to-S3 source paths still need fd pinning like the S3-to-local destination path; provider response bodies also still need a shared bounded reader.
- Frontend/State: object create/copy/move/rename selection flows had stale pending state that could disable a newly opened dialog after a profile/bucket/prefix scope change.
- Frontend/Accessibility: repeated favorite/action controls needed object-specific names, selected-count status needed a live announcement, and compact mobile selection controls were still too small.
- Frontend/Accessibility: delete pending state, mobile bucket-picker initial focus, full 44px touch-target consistency, and collapsed favorites live announcements remain open.
- DevOps/Release: GitLab DockerHub/Helm publish still lacks a hard release-readiness/evidence pre-gate, compose release deploy can still mutate the remote stack before smoke-env failure, and GitHub/GitLab E2E parity remains uneven.
- DevOps/Release: Helm `allowSameNamespace` network policy defaults remain too permissive for shared browser-facing namespaces unless production values override them.
- Docs/Ops: portable backup docs mixed export header behavior with restore/import multipart password behavior, release evidence templates/checklists did not consistently mention backup passwords, and the live checklist final-gate commands needed diff-scoped `--base/--head` alignment.

### Improvements Applied

- Scoped new-folder, copy/move object, copy/move prefix, rename, and move-selection pending state to the current API token/profile/bucket/prefix plus the current dialog session so stale in-flight mutations cannot disable a newly opened dialog.
- Kept session refs out of render paths by mirroring the current session ID in React state; this preserves the stale-pending fix while satisfying `react-hooks/refs`.
- Added regression coverage for old-scope pending mutations across new folder, copy/move, rename, and selection move dialogs.
- Added object names to list/grid favorite labels and action-menu labels, and kept list/grid body selection controls explicit with `Select object ...` naming.
- Added a polite live `status` for the selected-count summary and increased compact mobile selection-bar hit targets to reduce accidental taps.
- Clarified portable backup password behavior: export uses `X-S3Desk-Backup-Password`; restore/import use the multipart `password` field or UI input; a non-empty supplied password wins over destination `ENCRYPTION_KEY`.
- Added `/server/backup` OpenAPI response contract coverage for `400`, `409`, and `500`.
- Expanded release evidence secret detection and templates to include backup passwords and natural-language labels such as backup/bundle password.
- Updated release evidence checklist commands to include `--base 0.21v-rc3 --head HEAD`, and taught `check_release_evidence_checklist.py` to read that diff scope from the checklist so `check_release_gate.sh` and manual checklist validation use the same scope.
- Clarified operator quick reverse-proxy smoke versus release evidence smoke, including the required `HEAD signed proxy URL` check.

### Remaining Limitations

- Runtime SSRF still needs a shared guarded egress layer with DNS/IP validation, redirect revalidation, explicit private-range allowlisting, provider SDK/client integration, and rclone/OCI launch-time checks.
- Direct form upload still needs temp-key staging and post-reservation promotion, or another design that never writes failed unknown-size uploads to final keys.
- Local-to-S3 source path pinning and provider upstream body caps remain backend security work.
- Delete pending state still needs the same scope/session treatment applied to the other object mutations.
- Mobile bucket picker initial focus should move to search, and touch targets should be made consistently 44px across favorites, switches, bucket drawer controls, and selection actions.
- Collapsed favorites state still needs an always-mounted live region for loading/error/count changes.
- GitLab publish, compose release preflight, GitHub/GitLab E2E parity, Helm same-namespace ingress defaults, and the `0.21v-rc3` versus next-RC release decision remain release-engineering blockers.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, plus reverse-proxy smoke evidence, is recorded.

### Sixth-Pass Validation

- `npm run test:unit -- src/pages/objects/__tests__/ObjectsListRow.test.tsx src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx src/pages/objects/__tests__/ObjectsSelectionBar.test.tsx src/pages/objects/__tests__/useObjectsNewFolder.test.tsx src/pages/objects/__tests__/useObjectsCopyMove.test.tsx src/pages/objects/__tests__/useObjectsRename.test.tsx src/pages/objects/__tests__/useObjectsSelectionMove.test.tsx`: passed, 7 files / 24 tests.
- `npm run test:unit`: passed, 245 files / 952 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `npm run check:openapi`: passed.
- `cd backend && go test ./internal/api -run TestOpenAPIMetaAndMigrationSchemasCoverFrontendContract -count=1`: passed.
- `cd backend && go test ./...`: passed.
- `python3 scripts/check_release_evidence_test.py`: passed, 37 tests.
- `python3 scripts/check_release_evidence_checklist_test.py`: passed, 15 tests.
- `python3 scripts/check_release_evidence_checklist.py --candidate-id 0.21v-rc3 --base 0.21v-rc3 --head HEAD`: passed.
- `python3 scripts/check_release_evidence_checklist.py --candidate-id 0.21v-rc3`: passed using the checklist's recorded diff scope.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Seventh Current Expert Sub-Agent Pass

This pass re-ran four read-only expert sub-agents across backend/security, frontend UX/state, DevOps/release, and docs/operations. I implemented the low-risk findings that were narrow, well covered by tests, and safe to apply inside the current dirty worktree.

### Additional Findings

- Backend/Security: runtime SSRF/egress controls remain missing across GCS token URLs, provider clients, rclone config generation, OCI CLI launch, and portable-imported profile data.
- Backend/Security: direct form upload still needs a temp-key promote design; the current final-key cleanup fix avoids deleting someone else's object but does not prevent final-key pollution.
- Backend/Security: local-to-S3 source paths still need fd pinning, and provider control-plane response bodies still need bounded readers.
- Frontend/State: delete and delete-prefix mutations still exposed raw React Query pending state into selection bars and delete-prefix confirmation UI.
- Frontend/State: rename scope still excluded `prefix`, so same-bucket prefix navigation could leave stale rename state or a stale pending spinner visible.
- Frontend/Accessibility: mobile bucket picker initial focus still went to Close instead of bucket search, and grid body selection did not expose pressed state.
- Frontend/Accessibility: full 44px mobile touch target consistency and collapsed favorites live announcements remain open.
- DevOps/Release: GitLab publish still lacks a hard release-readiness/evidence pre-gate; compose and Helm deploy scripts can still mutate remote targets before smoke-env failure.
- DevOps/Release: the live checklist still uses `--base 0.21v-rc3 --head HEAD --candidate-id 0.21v-rc3`, so evidence can be labelled as an already-existing RC while validating post-RC code.
- Docs/Ops: OpenAPI still implied restore/import password handling through the export header, and portable docs/testing omitted the `upload_objects` portable entity.

### Improvements Applied

- Scoped object delete and delete-prefix pending state to the current API token/profile/bucket/prefix context so stale deletes no longer show loading in a new scope.
- Added delete hook regression coverage proving old-scope pending direct deletes and prefix jobs clear from the new scope while stale completions stay ignored.
- Added `prefix` to rename scope and invalidation, and added a same-bucket prefix-change regression test.
- Added `aria-pressed` to grid object body selection buttons and locked it with renderer tests.
- Added mobile bucket picker `initialFocusSelector` support by giving `ObjectsOverlaySheet` an actual panel `id`, wiring the mobile drawer trigger to `aria-haspopup`, `aria-expanded`, and `aria-controls`, and focusing the mobile search input on open.
- Updated the bucket picker unit test and Playwright focus-trap expectation for search-first mobile focus.
- Corrected OpenAPI backup text so export uses `X-S3Desk-Backup-Password`, while restore/import use multipart `password` fields or UI input; regenerated `frontend/src/api/openapi.ts`.
- Strengthened OpenAPI contract tests to require multipart-password wording for restore/import and to prevent export-header text from describing destination-key restore/import precedence.
- Added `upload_objects` to portable backup docs and testing smoke expectations.

### Remaining Limitations

- Runtime SSRF needs a shared guarded egress layer with DNS/IP validation, redirect revalidation, explicit private-range allowlisting, provider SDK/client integration, and rclone/OCI launch-time checks.
- Direct form upload still needs temp-key staging and post-reservation promotion, or another design that never writes failed unknown-size uploads to final keys.
- Local-to-S3 source path pinning and provider upstream body caps remain backend security work.
- Full 44px mobile touch-target consistency still needs a broader CSS/e2e pass across favorites, switches, bucket controls, grid actions, and selection actions.
- Collapsed favorites state still needs an always-mounted live region for loading/error/count changes.
- GitLab publish readiness, compose/Helm preflight-before-mutation, GitHub/GitLab E2E parity, Helm same-namespace ingress defaults, and the next-RC decision remain release-engineering blockers.
- Release checklist candidate identity still needs a release-management decision: use a new RC tag, or validate an exact HEAD SHA rather than labelling post-`0.21v-rc3` evidence as `0.21v-rc3`.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, plus reverse-proxy smoke evidence, is recorded.

### Seventh-Pass Validation

- `npm run test:unit -- src/pages/objects/__tests__/ObjectsBucketPicker.test.tsx src/pages/objects/__tests__/useObjectsDelete.test.tsx src/pages/objects/__tests__/useObjectsRename.test.tsx src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx`: passed, 4 files / 17 tests.
- `npm run test:unit`: passed, 245 files / 953 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `npm run check:openapi`: passed.
- `cd backend && go test ./internal/api -run TestOpenAPIMetaAndMigrationSchemasCoverFrontendContract -count=1`: passed.
- `cd backend && go test ./...`: passed.
- `python3 scripts/check_release_evidence_checklist.py --candidate-id 0.21v-rc3 --base 0.21v-rc3 --head HEAD`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Eighth Current Expert Sub-Agent Pass

This pass re-ran four read-only expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/operations. I implemented the narrow fixes that were testable without changing release policy or broader backend architecture.

### Additional Findings

- Backend/Security: runtime SSRF/egress controls, direct form upload temp-key promotion, local-to-S3 fd pinning, provider response body caps, and OCI output caps remain the main backend security queue.
- Frontend/Accessibility: adding a collapsed favorites live region inside the pane title would make the collapse button name volatile (`Favorites0 favorites pinned`), so the live region needs to stay outside the toggle label.
- Frontend/Accessibility: mobile 44px touch targets were still partial; favorites rows/controls, selection bar buttons, and grid action buttons were still below the stated floor in some mobile layouts.
- DevOps/Release: GitLab publish can still publish Docker/Helm artifacts without a hard readiness/evidence gate.
- DevOps/Release: compose and Helm deploy scripts still mutate targets before reverse-proxy smoke environment preflight fails.
- DevOps/Release: GitHub/GitLab critical live E2E lists still diverge, and Helm same-namespace NetworkPolicy defaults still satisfy the browser-facing hardening gate.
- Release Management: the live checklist still validates `0.21v-rc3..HEAD` while labelling evidence as `0.21v-rc3`; a new RC tag or exact HEAD candidate is still needed.
- Docs/Ops: portable docs now mention `upload_objects`, but the portable smoke scripts still needed to assert that entity in the fixture and import verification loop.

### Improvements Applied

- Added an always-mounted favorites live region for loading/error/count changes and placed it in the pane header extra area, outside the collapsible toggle label, preserving the accessible button name `Favorites`.
- Added unit coverage for collapsed favorites loading, error, and count announcements while also keeping the collapsed body unmounted.
- Raised mobile favorites item/control, selection-bar, and grid action minimum touch targets to 44px where those controls were still below the floor.
- Added `upload_objects` to the portable smoke fixture minimum counts and import verification entity list so the documented portable smoke claim is actually enforced.

### Remaining Limitations

- Runtime SSRF needs a shared guarded egress layer with DNS/IP validation, redirect revalidation, explicit private-range allowlisting, provider SDK/client integration, and rclone/OCI launch-time checks.
- Direct form upload still needs temp-key staging and post-reservation promotion, or another design that never writes failed unknown-size uploads to final keys.
- Local-to-S3 source path pinning, provider upstream body caps, and OCI bounded output capture remain backend security work.
- Mobile 44px touch target coverage still needs the remaining bucket picker, tree controls, shared switches, and E2E helper threshold pass.
- GitLab publish readiness, compose/Helm preflight-before-mutation, GitHub/GitLab E2E parity, Helm same-namespace ingress defaults, and the next-RC decision remain release-engineering blockers.
- Release checklist candidate identity still needs a release-management decision: use a new RC tag, or validate an exact HEAD SHA rather than labelling post-`0.21v-rc3` evidence as `0.21v-rc3`.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, plus reverse-proxy smoke evidence, is recorded.

### Eighth-Pass Validation

- `npm run test:unit -- src/pages/objects/__tests__/ObjectsTreePanel.test.tsx src/pages/objects/__tests__/ObjectsFavoritesPane.test.tsx src/pages/objects/__tests__/ObjectsSelectionBar.test.tsx src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx`: passed, 4 files / 21 tests.
- `npm run test:unit`: passed, 245 files / 954 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed, including CSS token and import-cycle checks.
- `cd backend && go test ./...`: passed.
- `python3 -m py_compile scripts/portable/seed-source.py scripts/portable/run-smoke.py`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Ninth Current Expert Sub-Agent Pass

This pass re-ran four read-only expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/operations. I applied the narrow improvements that could be verified locally without inventing release evidence or changing broad backend architecture.

### Additional Findings

- Backend/Security: runtime SSRF/egress controls are still write-time heavy; runtime SDK clients, custom provider HTTP calls, rclone configs, and OCI CLI endpoints still need a shared guarded egress layer.
- Backend/Security: direct form upload still streams to final object keys before durable metadata success, and local-to-S3 still passes mutable source paths to rclone without the fd pinning now used for S3-to-local destinations.
- Backend/Security: provider control-plane response bodies, OCI CLI stdout/stderr, and API rclone stdout capture still need bounded readers to avoid unbounded memory use.
- Frontend/Accessibility: Objects mobile tests still accepted 40px touch targets in object mobile and layout-density helpers, allowing list/grid/search/filter/folder controls below the intended 44px floor.
- DevOps/Release: GitLab tag publishing had no hard local readiness/evidence preflight dependency before Docker Hub publication.
- DevOps/Release: compose and Helm deploy scripts could still reach remote mutation before reverse-proxy smoke environment inputs were checked; Helm also lacked a same-argument client dry-run before the live upgrade.
- Release Management: `0.21v-rc3` remains a stale current candidate for `HEAD`; evidence/checklist generation can still label post-`0.21v-rc3` diff evidence as `0.21v-rc3` unless a new RC tag or exact HEAD/SHA candidate is chosen.
- Docs/Ops: backup/portable release evidence is documented, but the release evidence model still only has provider-live and reverse-proxy requirement types.

### Improvements Applied

- Added `scripts/check_gitlab_publish_readiness.sh` to validate a tag, derive the previous tag or use `DEPLOY_RELEASE_BASE`, and run `check_release_readiness.py` against the committed candidate diff before publication.
- Added a GitLab `release_readiness_preflight` tag job and made `publish_dockerhub` depend on it, so Docker Hub and downstream Helm publication cannot start before local release readiness passes.
- Updated release-gate, testing, and deployment checklist docs plus `check_release_gate.sh` assertions so the GitLab publish preflight remains part of the documented contract.
- Moved reverse-proxy smoke env preflight into `deploy_compose_release.sh` and `deploy_helm_release.sh` before remote/cluster mutation.
- Added compose `config` preflight before compose `pull`/`up`, and added `helm upgrade --install --dry-run=client` before the live Helm upgrade.
- Raised Objects mobile E2E helper defaults from 40px to 44px.
- Raised Objects mobile list, grid, tree action, global-search result, and filter drawer controls from remaining 40px floors to 44px where this pass found direct coverage.

### Remaining Limitations

- Runtime SSRF still needs a shared guarded egress layer with DNS/IP validation, redirect revalidation, explicit private-range allowlisting, provider SDK/client integration, and rclone/OCI launch-time checks.
- Direct form upload still needs temp-key staging and post-reservation promotion, or another design that never writes failed unknown-size uploads to final keys.
- Local-to-S3 source path pinning, provider upstream body caps, and OCI/API bounded output capture remain backend security work.
- Mobile 44px coverage still needs the remaining tree toggle/label, details/image-viewer, bucket card, and structured bucket-policy action pass.
- Release checklist candidate identity still needs a release-management decision: create a new RC tag, or validate an exact HEAD SHA instead of labelling post-`0.21v-rc3` evidence as `0.21v-rc3`.
- Backup/portable release evidence still needs a first-class requirement in `check_release_evidence.py` if backup/portable changes should hard-block release readiness without smoke evidence.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, plus reverse-proxy smoke evidence, is recorded for the actual candidate.

### Ninth-Pass Validation

- `python3 scripts/release_candidate_test.py && python3 scripts/check_release_readiness_test.py`: passed, 4 + 9 tests.
- `bash -n scripts/check_gitlab_publish_readiness.sh scripts/check_release_gate.sh`: passed.
- `cd frontend && npm run check:e2e:geometry`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/check_live_evidence_env_test.py && python3 scripts/check_release_readiness_test.py`: passed, 8 + 9 tests.
- `bash -n scripts/check_gitlab_publish_readiness.sh scripts/deploy_compose_release.sh scripts/deploy_helm_release.sh scripts/deploy_smoke.sh scripts/check_release_gate.sh`: passed.
- `bash ./scripts/check_release_gate.sh`: passed.

## Tenth Current Expert Sub-Agent Pass

This pass re-ran four expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/operations. I applied the narrow fixes that reduced concrete release or runtime risk without inventing live evidence or changing broad architecture.

### Additional Findings

- Backend/Security: S3-to-local now pins the local destination for rclone, but local-to-S3 still used a mutable local source path between allowlist validation and rclone execution.
- Backend/Security: runtime SSRF, direct form upload final-key pollution, provider response body caps, and OCI/API bounded output capture remain larger backend security work.
- Frontend/Accessibility: Objects details and image-viewer mobile action buttons still had 40px floors, and tests asserted visibility/fit without enforcing the 44px target contract.
- Frontend/Accessibility: disclosure relationships remain inconsistent across tree, jobs filters, and columns popovers; fixing them needs stable mounted targets and IDs rather than broad `aria-controls` additions.
- DevOps/Release: GitLab live E2E omitted `server-migration-live`, `uploads-folder-live`, and `objects-image-preview-live` even though GitHub scheduled/live and local live runners include them.
- DevOps/Release: GitLab publish readiness still does not verify the GitHub Release object or GitHub required check runs; deploy smoke evidence file generation is also still optional.
- Docs/Ops: release readiness now catches stale candidate identity, but the current checklist still references `0.21v-rc3` while validating `0.21v-rc3..HEAD`.
- Docs/Ops: backup/portable release evidence is still not a first-class `check_release_evidence.py` requirement, so backup/portable changes can pass the current evidence model without staged restore smoke evidence.

### Improvements Applied

- Added candidate identity blocking to `scripts/check_release_readiness.py`, including Markdown/JSON reporting and tests, so an existing candidate tag must resolve to the checked `--head`.
- Documented the candidate identity blocker in `docs/RELEASE_GATE.md` and `docs/TESTING.md`, and added release-gate assertions for that contract.
- Pinned local-to-S3 rclone sources through the existing inherited fd mechanism before invoking rclone, matching the S3-to-local destination protection.
- Added regression coverage proving local-to-S3 passes an inherited fd path and one extra file to rclone instead of the mutable original source path.
- Raised Objects details and image-viewer mobile action buttons to the 44px touch-target floor, including the narrow 480px override.
- Extended Objects mobile Playwright coverage to assert 44px touch height for details drawer and image-viewer toolbar actions.
- Added the missing GitLab live E2E specs so GitLab critical live coverage matches GitHub/local critical coverage.
- Added release-gate string checks to catch future GitLab live-suite drift for the three restored live specs.
- Raised `SimpleTree` mobile rows, toggles, spacers, and label buttons to 44px touch targets for common mobile breakpoints.

### Remaining Limitations

- Runtime SSRF still needs a shared guarded egress layer with DNS/IP validation, redirect revalidation, explicit private-range allowlisting, provider SDK/client integration, and rclone/OCI launch-time checks.
- Direct form upload still needs temp-key staging and post-reservation promotion, or another design that never writes failed unknown-size uploads to final keys.
- Provider upstream body caps and OCI/API bounded output capture remain backend security work.
- Mobile 44px coverage still needs bucket picker search, shared switches, bucket-card actions at 390px, and structured bucket-policy action coverage.
- Disclosure relationships still need a coordinated accessibility pass for tree, jobs filter sheet, and jobs columns popover triggers.
- GitLab publish readiness still does not verify GitHub Release/check state before Docker/Helm publication.
- Deploy smoke evidence remains optional unless operators set `DEPLOY_SMOKE_EVIDENCE_FILE` and `DEPLOY_RELEASE_CANDIDATE`.
- Backup/portable release evidence still needs a first-class requirement such as `backup-portable-smoke` in `check_release_evidence.py` and checklist sync.
- Release checklist candidate identity still needs a release-management decision: create a new RC tag, or validate an exact HEAD SHA instead of labelling post-`0.21v-rc3` evidence as `0.21v-rc3`.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, plus reverse-proxy smoke evidence, is recorded for the actual candidate.

### Tenth-Pass Validation

- `cd backend && go test ./internal/localpath ./internal/jobs -run 'Test(OpenPinnedDirUnderRoots|RunTransferSync.*Pins.*ForRclone|EnsureLocalPathAllowed|PrepareLocalDestination)' -count=1`: passed.
- `cd frontend && npx playwright test tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --grep "details drawer|large preview viewer opens"`: passed, 2 tests.
- `python3 scripts/check_release_readiness_test.py`: passed, 12 tests.
- `bash -n scripts/check_release_gate.sh scripts/check_gitlab_publish_readiness.sh scripts/deploy_compose_release.sh scripts/deploy_helm_release.sh`: passed.
- `cd frontend && npm run check:e2e:geometry`: passed.
- `python3` YAML parse of `.gitlab-ci.yml`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.
- `python3 scripts/check_release_readiness.py --candidate-id 0.21v-rc3 --base 0.21v-rc3 --head HEAD --skip-release-gate --format json`: failed as expected with candidate identity mismatch plus missing live evidence/env blockers.

## Eleventh Current Expert Sub-Agent Pass

This pass re-ran four read-only expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. I implemented the narrow improvements that were directly testable and did not require generating live evidence.

### Additional Findings

- Backend/Security: upload staging commits still resolved `DATA_DIR/staging/<uploadID>` and handed that mutable path to rclone, while local-to-S3 and S3-to-local were already fd-pinned.
- Backend/Security: direct form uploads can still leave final remote objects after local quota rejection, and presigned uploads are still not strongly size-bound at object-store write time.
- Frontend/Accessibility: shared `ToggleSwitch` controls still had a 26px control box, and the Objects list custom `Favorites first` switch still had a 22px control box.
- DevOps/Release: `publish_dockerhub` could start after `trivy_scan` but before tag-scoped `security_fs_scan` and `gitleaks_scan` completed, because those jobs were not explicit `needs`.
- Docs/Testing: backup/portable smoke coverage was documented, but `check_release_evidence.py` still modeled only provider-live and reverse-proxy evidence.
- Release Management: `0.21v-rc3` is still stale for current `HEAD`; final evidence needs a new RC tag or an exact HEAD SHA candidate.

### Improvements Applied

- Added `backup-portable-smoke` as a first-class release evidence requirement with trigger detection for backup, restore, portable bundle, staged restore, portable smoke scripts, and portable smoke compose changes.
- Added `BACKUP_PORTABLE_SMOKE_TEMPLATE.md`, README guidance, current live evidence checklist targets, release-gate documentation, testing documentation, checklist sync validation, and unit coverage for backup-portable evidence.
- Updated release readiness blocker extraction so missing backup-portable smoke evidence is summarized alongside provider-live and reverse-proxy blockers.
- Pinned upload staging-to-S3 rclone sources through the existing inherited fd mechanism under `store.UploadStagingRoot(m.dataDir)`.
- Added backend regression coverage for staging source fd pinning and symlinked staging directory rejection before rclone invocation.
- Changed shared and Objects list switch controls to expose a 44px hit target while keeping the smaller visual track centered.
- Added Settings mobile Playwright coverage for shared switch hit-target height.
- Added `security_fs_scan` and `gitleaks_scan` to `publish_dockerhub.needs`, and added release-gate assertions to prevent drift.

### Remaining Limitations

- Runtime SSRF still needs a shared guarded egress layer with DNS/IP validation, redirect revalidation, explicit private-range allowlisting, provider SDK/client integration, and rclone/OCI launch-time checks.
- Direct form upload still needs temp-key staging and post-reservation promotion, or another design that never writes failed unknown-size uploads to final keys.
- Presigned upload size enforcement still needs stronger object-store-side bounds or cleanup/promotion semantics.
- Provider upstream body caps and OCI/API bounded output capture remain backend security work.
- Mobile 44px coverage still needs bucket picker search, bucket-card actions at 390px, and structured bucket-policy action coverage.
- Disclosure relationships still need a coordinated accessibility pass for tree, jobs filter sheet, and jobs columns popover triggers.
- GitLab publish readiness still does not verify GitHub Release/check state before Docker/Helm publication.
- Deploy smoke evidence remains optional unless operators set `DEPLOY_SMOKE_EVIDENCE_FILE` and `DEPLOY_RELEASE_CANDIDATE`.
- Release checklist candidate identity still needs a release-management decision: create a new RC tag, or validate an exact HEAD SHA instead of labelling post-`0.21v-rc3` evidence as `0.21v-rc3`.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, reverse-proxy smoke evidence, and backup-portable smoke evidence are recorded for the actual candidate.

### Eleventh-Pass Validation

- `python3 scripts/check_release_evidence_test.py`: passed, 40 tests.
- `python3 scripts/check_release_evidence_checklist_test.py`: passed, 17 tests.
- `python3 scripts/check_release_evidence_checklist.py --candidate-id 0.21v-rc3 --base 0.21v-rc3 --head HEAD`: passed.
- `cd backend && go test ./internal/localpath ./internal/jobs -run 'Test(OpenPinnedDirUnderRoots|RunTransferSync.*Pins.*ForRclone|RunTransferSyncStagingToS3RejectsSymlinkedStagingDir|EnsureLocalPathAllowed|PrepareLocalDestination)' -count=1`: passed.
- `cd frontend && npx playwright test tests/settings-mobile-responsive.spec.ts --project=mobile-iphone-13 --grep "settings drawer persists"`: passed, 1 test.
- `cd frontend && npx playwright test tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --grep "filters drawer applies"`: passed, 1 test.
- `python3 scripts/check_release_readiness_test.py`: passed, 12 tests.
- `bash -n scripts/check_release_gate.sh scripts/check_gitlab_publish_readiness.sh scripts/deploy_compose_release.sh scripts/deploy_helm_release.sh`: passed.
- `python3` YAML parse of `.gitlab-ci.yml`: passed.
- `cd frontend && npm run check:e2e:geometry`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.
- `python3 scripts/check_release_readiness.py --candidate-id 0.21v-rc3 --base 0.21v-rc3 --head HEAD --skip-release-gate --format json`: failed as expected with candidate identity mismatch and missing provider-live, reverse-proxy, backup-portable, and env evidence blockers.

## Twelfth Current Expert Sub-Agent Pass

This pass split review again across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. The backend/security sub-agent also ran `go test ./internal/jobs ./internal/localpath ./internal/api ./internal/store` successfully before reporting.

### Additional Findings

- Backend/Security: portable import validated job IDs but still accepted imported profile IDs without the normal ULID guard. Profile IDs later flow into profile-scoped local paths, so malformed IDs should be rejected before replacing rows.
- Frontend/Accessibility: Jobs mobile filter trigger lacked an explicit dialog disclosure relationship, and several mobile controls still needed verified 44px hit-target coverage.
- DevOps/Release: `check_gitlab_publish_readiness.sh` now delegates to `verify_release_readiness.sh`, but release docs and the release-gate self-check did not yet enforce that GitHub Release/check-state verification remains part of the GitLab publish preflight.
- Docs/Testing: backup-portable evidence required only the summary `Backup portable smoke: pass`; a summary pass could hide one failed script in the four-script smoke set.

### Improvements Applied

- Added `validatePortableProfileRows` and regression coverage so portable entity import rejects malformed profile IDs before any table replacement.
- Added explicit `sheetId` support to `OverlaySheet`, connected the Jobs mobile filter trigger with `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls`, and enforced a 44px trigger height.
- Added mobile E2E checks for Jobs filter disclosure state, bucket card action hit targets, and bucket picker search hit target height.
- Tightened backup-portable evidence validation so `## Smoke Results` must include pass/success results for all four portable smoke scripts, with JSON/checklist remediation fields and sync coverage.
- Updated backup-portable evidence template, evidence README, live evidence checklist, release-gate assertions, and tests to preserve the per-script evidence contract.
- Updated GitLab publish readiness documentation and release-gate assertions so `scripts/verify_release_readiness.sh` and GitHub Release/check-state verification remain visible requirements before Docker Hub or Helm publication.

### Remaining Limitations

- Runtime SSRF still needs a shared guarded egress layer with DNS/IP validation, redirect revalidation, explicit private-range allowlisting, provider SDK/client integration, and rclone/OCI launch-time checks.
- Direct form upload and presigned upload size enforcement still need stronger object-store-side bounds or cleanup/promotion semantics.
- Portable import now validates profile IDs, but imported profile endpoints/config still bypass the normal profile API validation path and should get a dedicated preflight pass.
- Non-Unix local path fd pinning remains a no-op fallback.
- Release checklist candidate identity still needs a release-management decision: create a new RC tag, or validate an exact HEAD SHA instead of labelling post-`0.21v-rc3` evidence as `0.21v-rc3`.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, reverse-proxy smoke evidence, and backup-portable smoke evidence are recorded for the actual candidate.

### Twelfth-Pass Validation

- `cd backend && go test ./internal/store -run 'TestImportPortableEntityFilesReplaceRejectsUnsafe(Profile|Job)IDs|TestImportPortableEntityFilesReplaceQuarantinesExecutableJobs'`: passed.
- `python3 scripts/check_release_evidence_test.py`: passed, 41 tests.
- `python3 scripts/check_release_evidence_checklist_test.py`: passed, 17 tests.
- `python3 scripts/check_release_readiness_test.py`: passed, 12 tests.
- `bash -n scripts/check_gitlab_publish_readiness.sh scripts/verify_release_readiness.sh scripts/check_release_gate.sh`: passed.
- `python3 scripts/check_release_evidence_checklist.py --candidate-id 0.21v-rc3 --base 0.21v-rc3 --head HEAD`: passed.
- `cd frontend && npx vitest run src/components/__tests__/OverlaySheet.test.tsx src/pages/jobs/__tests__/JobsToolbar.test.tsx`: passed, 11 tests.
- `cd frontend && npx playwright test tests/jobs-mobile-responsive.spec.ts --project=mobile-iphone-13 --grep "mobile filters persist"`: passed, 1 test.
- `cd frontend && npx playwright test tests/buckets-mobile-responsive.spec.ts --project=mobile-iphone-13 --grep "opens policy and controls"`: passed, 1 test.
- `cd frontend && npx playwright test tests/objects-bucket-picker.spec.ts --project=chromium --grep "focus contained"`: passed, 2 tests.
- `cd frontend && npm run check:e2e:geometry`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.
- `python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc3`: failed as expected because live provider, reverse-proxy, and backup-portable evidence files are still missing for that candidate.

## Thirty-Fifth Current Follow-Up Pass

This pass continued the locally verifiable follow-up queue after the Thirty-Fourth pass, focusing on bounded process output capture, runtime-image parser coverage, and a shared tooltip accessibility gap.

### Additional Findings

- Release/Compliance: runtime image license archive tests did not cover Docker layer replacement/whiteout behavior or the no-image-input path.
- Backend/Security: OCI CLI and non-streaming rclone helper paths still used unbounded process output buffers or `io.ReadAll` captures.
- Frontend/Product: the shared help tooltip used a compact visual trigger without a coarse-pointer hit-area floor.

### Improvements Applied

- Extended `scripts/check_runtime_image_licenses_test.py` with multi-layer Docker archive fixtures, APK DB whiteout coverage, and no-input coverage.
- Added `backend/internal/processio` with bounded `ReadAll`, bounded write-compatible buffers, truncation markers, and unit tests.
- Swapped OCI CLI stdout/stderr and rclone diagnostic/capture paths to bounded process output helpers while preserving streaming download/list behavior.
- Added over-limit regression coverage for OCI CLI stdout capture and API rclone stdout capture.
- Moved `HelpTooltip` trigger styling into a CSS module, preserved the 24px visual glyph, and added a 44px coarse-pointer hit area.
- Updated HelpTooltip tests to assert the button semantics, glyph class, explicit tooltip linkage, and Escape dismissal.

### Remaining Limitations

- The full `./scripts/check.sh full` gate was not rerun in this pass; the changes were verified with targeted backend/frontend checks.
- Streaming rclone list/download paths remain intentionally stream-based and are not converted to buffered captures.
- Release readiness still depends on external candidate evidence for provider-live, reverse-proxy, backup-portable smoke, and real tag-build runtime image tar license evidence.

### Thirty-Fifth-Follow-Up Validation

- `python3 scripts/check_runtime_image_licenses_test.py`: passed, 7 tests.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/processio ./internal/ocicli ./internal/api ./internal/jobs -run 'Test(LimitBuffer|ReadAll|ResolveCLIPath|GetBucketRejects|StartRclone|RunRcloneCapture|RunRcloneStdin|ComputeS3PrefixTotals)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/processio ./internal/ocicli ./internal/api ./internal/jobs`: passed.
- `cd frontend && npx vitest run src/components/__tests__/HelpTooltip.test.tsx`: passed, 6 tests.
- `cd frontend && npx eslint src/components/HelpTooltip.tsx src/components/__tests__/HelpTooltip.test.tsx --max-warnings 0`: passed.
- `cd frontend && npm run typecheck`: passed.
- `git diff --check`: passed.

## Sixty-First Objects Context Menu Keyboard Activation Follow-Up Pass

This pass completed the keyboard context-menu workflow by ensuring keyboard-opened context menus receive focus and can execute actions without pointer input.

### Additional Findings

- Frontend/Accessibility: the context-menu portal rendered menu buttons but did not move focus into the menu when it opened, leaving keyboard users on the objects list after pressing `ContextMenu` or `Shift+F10`.
- Frontend/E2E Coverage: browser coverage proved the menu opened, but did not yet prove the opened menu supported typeahead focus movement and `Enter` activation through the actual portal.

### Improvements Applied

- Added first-enabled-menu-item focus handling to `ObjectsContextMenuPortal` while preserving the existing external context-menu ref.
- Added unit coverage proving disabled items are skipped and the first enabled menu item receives focus when the portal mounts.
- Added Playwright coverage that opens the object context menu from the keyboard, uses typeahead to focus `Rename (F2)…`, and activates it with `Enter`.

### Remaining Limitations

- The new browser test covers Chromium; cross-browser confirmation remains part of the broader Playwright matrix.
- Prefix-row context-menu keyboard activation remains out of scope until prefix keyboard selection/navigation is promoted.

### Sixty-First-Follow-Up Validation

- `cd frontend && npm run test:unit -- src/pages/objects/__tests__/ObjectsContextMenuPortal.test.tsx src/pages/objects/__tests__/ObjectsMenuPopover.test.tsx`: passed, 4 tests.
- `cd frontend && npx playwright test tests/objects-context-menu-keyboard.spec.ts --project=chromium`: passed, 7 tests.
- `cd frontend && npx eslint src/pages/objects/ObjectsContextMenuPortal.tsx src/pages/objects/__tests__/ObjectsContextMenuPortal.test.tsx tests/objects-context-menu-keyboard.spec.ts --max-warnings 0`: passed.
- `cd frontend && npm run typecheck`: passed.
- `git diff --check`: passed.

## Sixtieth Objects Keyboard Context Menu Browser Coverage Follow-Up Pass

This pass closed the browser-level validation gap from the previous keyboard context-menu work by exercising the new shortcuts through Playwright.

### Additional Findings

- Frontend/E2E Coverage: the existing objects context-menu keyboard spec validated keyboard-created selections followed by mouse right-clicks, but it did not send `ContextMenu` or `Shift+F10` from the focused objects list.
- Frontend/Accessibility: object-action and bulk-selection context menus needed coverage through the actual browser keyboard event path, not only hook-level unit tests.

### Improvements Applied

- Added Playwright coverage for `ContextMenu` opening object actions after a single keyboard selection.
- Added Playwright coverage for `Shift+F10` opening bulk selection actions after a keyboard-created range selection.
- Kept assertions on selected checkboxes and selection-count text so the tests verify that keyboard menu invocation does not disturb selection state.

### Remaining Limitations

- These browser tests cover object rows in advanced list mode; prefix-row keyboard context-menu behavior remains out of scope unless prefix selection becomes a first-class keyboard workflow.
- Cross-browser behavior beyond Chromium remains covered only by the broader Playwright matrix when that full suite is run.

### Sixtieth-Follow-Up Validation

- `cd frontend && npx playwright test tests/objects-context-menu-keyboard.spec.ts --project=chromium`: passed, 6 tests.
- `cd frontend && npx eslint tests/objects-context-menu-keyboard.spec.ts --max-warnings 0`: passed.
- `git diff --check`: passed.

## Fifty-Ninth Objects Keyboard Context Menu Follow-Up Pass

This pass continued the local accessibility sweep by closing the remaining keyboard-only context-menu path for the objects list.

### Additional Findings

- Frontend/Accessibility: object rows supported mouse right-click context menus and row action buttons, but the list-level keyboard handler did not open a context menu for the standard `ContextMenu` key or `Shift+F10`.
- Frontend/Interaction: the existing context-menu state machine already supported object menus when given a context source and screen point, so the missing piece was wiring keyboard invocation into the same path instead of adding a parallel menu flow.
- Frontend/Test Coverage: the list keydown tests covered selection, rename, and ignored nested controls, but did not assert keyboard context-menu invocation or the screen-list bridge to `openObjectContextMenu`.

### Improvements Applied

- Added `ContextMenu` and `Shift+F10` handling to `useObjectsListKeydown`, using the single selected object first and falling back to the last selected object key.
- Wired `useObjectsListKeydownHandler` and `useObjectsScreenList` to open the existing object context menu from keyboard input.
- Added row/list anchor point calculation so keyboard-opened object menus appear at the selected row position and still fall back to a stable viewport point.
- Returned `openObjectContextMenu` through the screen-list rendering/interactions layer so the keyboard path reuses the same object action catalog and context-menu lifecycle as mouse invocation.
- Extended unit coverage for keyboard menu shortcuts and screen-list context-menu bridge positioning.

### Remaining Limitations

- This pass validates the keyboard path at the unit/hook layer; full browser-level keyboard focus and menu navigation coverage can still be expanded with Playwright.
- Prefix-row keyboard context menus remain separate from this object-selection path and should be considered only if prefix keyboard selection is promoted to a first-class workflow.

### Fifty-Ninth-Follow-Up Validation

- `cd frontend && npm run test:unit -- src/pages/objects/__tests__/useObjectsListKeydown.test.tsx src/pages/objects/__tests__/useObjectsScreenList.test.tsx`: passed, 8 tests.
- `cd frontend && npx eslint src/pages/objects/useObjectsListKeydown.ts src/pages/objects/useObjectsListKeydownHandler.ts src/pages/objects/useObjectsScreenList.tsx src/pages/objects/useObjectsScreenListRendering.tsx src/pages/objects/__tests__/useObjectsListKeydown.test.tsx src/pages/objects/__tests__/useObjectsScreenList.test.tsx --max-warnings 0`: passed.
- `cd frontend && npm run typecheck`: passed.
- `git diff --check`: passed.

## Fifty-Eighth Shared Endpoint Validator Follow-Up Pass

This pass continued the endpoint-policy test sweep by adding direct package-level coverage for the shared profile endpoint validators instead of relying only on API/store wrapper tests.

### Additional Findings

- Backend/Test Coverage: `profileendpoint.ValidateURL` and `ValidateTLSSkipVerifyEndpoint` were exercised indirectly through API and portable-import tests, but the shared package did not have direct validator tests for the newer CNAME and IPv6 DNS-resolution cases.
- Backend/Security: remote-mode localhost CNAME rejection should happen before IP lookup in the shared validator, matching the guarded dial and redirect behavior.
- Backend/Security: TLS skip-verify endpoint policy should explicitly allow IPv6 ULA/private endpoints while rejecting resolved public IPv6 hosts.

### Improvements Applied

- Added package-level `ValidateURL` coverage for remote-mode localhost CNAME rejection with a failing IP-lookup hook to prove validation stops at the CNAME boundary.
- Added package-level `ValidateURL` coverage for remote-mode resolved IPv6 loopback and link-local hosts.
- Added package-level `ValidateTLSSkipVerifyEndpoint` coverage for resolved IPv6 private ULA allowance and resolved public IPv6 rejection.
- Updated the endpoint test-seam technical-debt note to include shared validator coverage.

### Remaining Limitations

- These tests validate the local shared validator boundary; live provider validation still requires external provider credentials and deployment evidence.
- rclone subprocess paths remain guarded by pre-launch profile endpoint validation rather than this HTTP client or validator test file.

### Fifty-Eighth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint -run 'TestValidate(URL|TLSSkipVerifyEndpoint)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test -race ./internal/profileendpoint -run 'TestValidate(URL|TLSSkipVerifyEndpoint)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint ./internal/api ./internal/store -run 'Test(ValidateURL|ValidateTLSSkipVerifyEndpoint|ValidateProfileEndpointURL|ValidateProfileTLSSkipVerifyEndpoint|ValidatePortableEntityFiles)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.
- `git diff --check`: passed.

## Fifty-Seventh IPv6 Endpoint Resolution Follow-Up Pass

This pass continued the guarded endpoint-policy sweep by extending remote-mode DNS resolution coverage from IPv4-only loopback/link-local aliases to IPv6 loopback and link-local aliases.

### Additional Findings

- Backend/Security: the guarded endpoint policy uses Go's IP classification for both IPv4 and IPv6, but the package-level resolved-address tests only exercised IPv4 loopback and IPv4 link-local aliases.
- Backend/Test Coverage: remote-mode redirect validation and dial-time validation needed explicit `::1` and `fe80::1` coverage so IPv6 regressions are caught without depending on real DNS.

### Improvements Applied

- Extended `GuardedDialContext` remote-mode resolved-address regression coverage to include `::1` and `fe80::1`.
- Extended guarded HTTP client redirect-hook coverage to include the same IPv6 resolved-address cases.
- Updated the endpoint test-seam technical-debt note to call out IPv4 and IPv6 loopback/link-local coverage.

### Remaining Limitations

- These tests validate the shared Go guarded HTTP client boundary; live provider validation still requires external provider credentials and deployment evidence.
- rclone subprocess paths remain guarded by pre-launch profile endpoint validation rather than this HTTP client.

### Fifty-Seventh-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint -run 'Test(GuardedDialContextRejectsResolvedLoopbackOrLinkLocalWhenRemoteEnabled|NewHTTPClientRejectsRedirectToResolvedLoopbackOrLinkLocalWhenRemoteEnabled)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test -race ./internal/profileendpoint -run 'Test(GuardedDialContextRejectsResolvedLoopbackOrLinkLocalWhenRemoteEnabled|NewHTTPClientRejectsRedirectToResolvedLoopbackOrLinkLocalWhenRemoteEnabled)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint ./internal/s3client ./internal/s3policy ./internal/gcsiam ./internal/gcsbucket ./internal/azureacl ./internal/azurearmimmutability ./internal/api -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.
- `git diff --check`: passed.

## Fifty-Sixth Remote-Mode Localhost CNAME Follow-Up Pass

This pass continued the guarded endpoint-policy sweep by covering CNAME records that normalize to `localhost` or `*.localhost` while remote access is enabled.

### Additional Findings

- Backend/Security: `profileendpoint` already blocked localhost CNAMEs under `AllowRemote=true`, but tests only covered metadata CNAMEs and resolved loopback/link-local IPs.
- Backend/Test Coverage: the localhost CNAME case should fail before IP lookup, otherwise a DNS alias can reach later resolution or dialing logic that should never run in remote mode.

### Improvements Applied

- Added `GuardedDialContext` regression coverage for `localhost.` and `storage.localhost.` CNAME targets under `AllowRemote=true`.
- Added guarded HTTP client redirect-hook coverage for the same CNAME targets.
- Made the tests fail if IP lookup runs after a blocked localhost CNAME, proving the guard stops at the canonical-name validation step.
- Updated the endpoint test-seam technical-debt note to include remote-mode localhost CNAME coverage.

### Remaining Limitations

- These tests validate the shared Go guarded HTTP client boundary; live provider validation still requires external provider credentials and deployment evidence.
- rclone subprocess paths remain guarded by pre-launch profile endpoint validation rather than this HTTP client.

### Fifty-Sixth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint -run 'Test(GuardedDialContextRejectsLocalhostCNAMEWhenRemoteEnabled|NewHTTPClientRejectsRedirectToLocalhostCNAMEWhenRemoteEnabled)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test -race ./internal/profileendpoint -run 'Test(GuardedDialContextRejectsLocalhostCNAMEWhenRemoteEnabled|NewHTTPClientRejectsRedirectToLocalhostCNAMEWhenRemoteEnabled)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint ./internal/s3client ./internal/s3policy ./internal/gcsiam ./internal/gcsbucket ./internal/azureacl ./internal/azurearmimmutability ./internal/api -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.

## Fifty-Fifth Remote-Mode Endpoint Resolution Follow-Up Pass

This pass continued the guarded endpoint-policy sweep by covering remote-mode DNS resolution cases that do not use literal loopback or link-local endpoint hosts.

### Additional Findings

- Backend/Security: `profileendpoint.GuardedDialContext` already applied `AllowRemote=true` to resolved IPs, but the package-level tests did not prove that a public-looking hostname resolving to loopback or link-local addresses is rejected before dialing.
- Backend/Security: `profileendpoint.NewHTTPClient` cannot use a real local `httptest.Server` as the initial request when `AllowRemote=true`, because the guarded request path correctly rejects loopback origins first; the redirect hook therefore needed direct coverage for resolved loopback/link-local targets.

### Improvements Applied

- Added `GuardedDialContext` regression coverage for hostnames resolving to `127.0.0.1` and `169.254.10.20` under `AllowRemote=true`.
- Added guarded HTTP client redirect-hook regression coverage for the same resolved loopback/link-local cases without relying on real DNS or external network access.
- Updated the endpoint test-seam technical-debt note to reflect metadata, CNAME, and remote-mode loopback/link-local coverage.

### Remaining Limitations

- These tests validate the shared Go guarded HTTP client boundary; live provider validation still requires external provider credentials and deployment evidence.
- rclone subprocess paths remain guarded by pre-launch profile endpoint validation rather than this HTTP client.

### Fifty-Fifth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint -run 'Test(GuardedDialContextRejectsResolvedLoopbackOrLinkLocalWhenRemoteEnabled|NewHTTPClientRejectsRedirectToResolvedLoopbackOrLinkLocalWhenRemoteEnabled)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test -race ./internal/profileendpoint -run 'Test(GuardedDialContextRejectsResolvedLoopbackOrLinkLocalWhenRemoteEnabled|NewHTTPClientRejectsRedirectToResolvedLoopbackOrLinkLocalWhenRemoteEnabled)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint ./internal/s3client ./internal/s3policy ./internal/gcsiam ./internal/gcsbucket ./internal/azureacl ./internal/azurearmimmutability ./internal/api -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.

## Fifty-Fourth Endpoint SSRF Regression Follow-Up Pass

This pass continued the endpoint-policy sweep by adding direct regression coverage for DNS-resolved metadata targets in guarded HTTP client paths.

### Additional Findings

- Backend/Security: `profileendpoint.NewHTTPClient` and `GuardedDialContext` already revalidate request URLs, redirects, and dial targets, but package-level tests only covered literal metadata IP/host redirect cases.
- Backend/Test Coverage: a hostname that resolves to `169.254.169.254` is the important DNS-rebinding-style case for dial-level and redirect-time protection, and it needed package-local coverage that does not depend on real DNS.

### Improvements Applied

- Added a `GuardedDialContext` regression test that stubs endpoint lookup so `metadata-alias.internal` resolves to `169.254.169.254` and verifies the dial is rejected before any network connection is attempted.
- Added a guarded HTTP client redirect regression test where an initial local server redirects to a hostname resolving to `169.254.169.254`, verifying redirect validation blocks the request before following it.
- Added CNAME regression coverage for both dial-time and redirect-time paths so aliases to `metadata.google.internal` or `instance-data.ec2.internal` fail before IP lookup or connection.

### Remaining Limitations

- The tests validate the shared guarded HTTP client boundary; live provider validation still requires external credentials and deployment environments.
- rclone subprocess execution remains protected by profile endpoint validation before process start, not by this Go HTTP client.

### Fifty-Fourth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint -run 'Test(GuardedDialContextRejects|NewHTTPClientRejectsRedirect)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test -race ./internal/profileendpoint -run 'Test(GuardedDialContextRejects|NewHTTPClientRejectsRedirect)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint ./internal/s3client ./internal/s3policy ./internal/gcsiam ./internal/gcsbucket ./internal/azureacl ./internal/azurearmimmutability ./internal/api -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.

## Fifty-Third Endpoint Lookup Hook Follow-Up Pass

This pass continued the test-stability work after the API flake fix by reviewing mutable endpoint lookup hooks used by profile endpoint validation tests.

### Additional Findings

- Backend/Test Reliability: `profileendpoint.SetLookupHooksForTest` swapped package-level DNS lookup function pointers without synchronization.
- Backend/Test Reliability: endpoint validation reads those hooks from runtime paths shared by API, provider helper, and portable import tests, so future parallel or shuffled tests could introduce data races or semantic leakage while stubbing endpoint resolution.

### Improvements Applied

- Added an internal `RWMutex` around profile endpoint lookup hook set, restore, and read operations.
- Kept resolver calls outside the lock by copying the active hook function under `RLock` and invoking it after releasing the lock.

### Remaining Limitations

- The lookup hooks remain a package-level test seam; the mutex removes unsynchronized access but does not convert the seam to dependency injection.
- Live provider validation still depends on external credentials and remains outside this local pass.

### Fifty-Third-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint ./internal/api -run 'Test(ValidateProfileEndpoint|Handle(Create|Update)Profile|ValidateRequestURL|GuardedDialContext|NewHTTPClient)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test -race ./internal/profileendpoint ./internal/api -run 'Test(ValidateProfileEndpoint|Handle(Create|Update)Profile|ValidateRequestURL|GuardedDialContext|NewHTTPClient)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.

## Fifty-Second API Flake Follow-Up Pass

This pass investigated the intermittent `internal/api` broad-test failure that previously appeared without a useful test name in package-level output.

### Additional Findings

- Backend/Test Reliability: `go test -json ./internal/api -count=10 -shuffle=on -failfast` reproduced the failure in `TestHandleListObjectsMapsDecodeFailureToUpstreamInvalidCredentials`.
- Backend/Test Reliability: the test was intended to verify rclone authentication-error normalization, but its fixture included the public OCI endpoint `https://objectstorage.ap-tokyo-1.oraclecloud.com`.
- Backend/Test Reliability: endpoint validation now runs before the rclone process hook, so the unit test could perform live DNS resolution and return a 400 endpoint/config error before the fake rclone authentication failure was exercised.

### Improvements Applied

- Removed the live public OCI endpoint from the unit-test profile fixture so the test no longer depends on external DNS/network availability.
- Kept the OCI provider/auth-provider fixture and fake rclone stderr path intact, preserving coverage for `invalid_credentials` normalization.

### Remaining Limitations

- The change is test-only; production endpoint validation behavior is unchanged.
- Other live or smoke tests that intentionally use public provider endpoints still require their normal environment assumptions.

### Fifty-Second-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/api -run TestHandleListObjectsMapsDecodeFailureToUpstreamInvalidCredentials -count=50 -shuffle=on`: passed.
- `cd backend && GOTOOLCHAIN=auto go test -json ./internal/api -count=10 -shuffle=on -failfast > /tmp/s3desk-api-test-after.jsonl`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.

## Fifty-First Operational Thresholds Follow-Up Pass

This pass closed a local documentation debt item after the latest backend and full-gate validation pass.

### Additional Findings

- Ops/Observability: `RUNBOOK.md` already documented warm-cache and staged-restore thresholds, but `notes/TECH_DEBT.md` still described the area as lacking operator thresholds.
- Ops/Observability: the runbook had cache, download-proxy, and staged-restore guidance, but object-storage cost-pressure thresholds were still less explicit than the emitted `storage_operations_total` and `storage_operation_duration_ms` metrics allow.

### Improvements Applied

- Added object-storage cost-pressure guidance to `RUNBOOK.md`, including operation growth, provider error ratio, and list/metadata latency thresholds.
- Added `transfer_errors_total{code}` to the runbook metric watch list.
- Expanded dashboard and alert expectations to include storage operation error ratio and list/metadata p95 latency.
- Updated `notes/TECH_DEBT.md` to mark cost/restore observability thresholds as defined and keep the remaining action focused on alignment as metrics evolve.

### Remaining Limitations

- Real provider live validation and candidate evidence remain external tasks that require credentials and deployment environments.
- The runbook thresholds are operational starting points; production operators should tune them after collecting baseline provider and traffic data.

### Fifty-First-Follow-Up Validation

- `./scripts/check.sh full`: passed before the operational-threshold doc update, covering the latest code changes from the S3 bucket policy endpoint-policy pass.
- `bash ./scripts/check_release_gate.sh`: passed after the doc update.
- `git diff --check`: passed.

## Fiftieth S3 Bucket Policy Endpoint Policy Follow-Up Pass

This pass continued the provider endpoint-policy sweep after the Azure ARM parity fix and closed a bucket policy API path that still bypassed explicit `AllowRemote` propagation.

### Additional Findings

- Backend/S3/Security: the S3 bucket-policy helper used the shared guarded HTTP client, but did not accept `AllowRemote`, so remote-mode loopback/link-local rejection was not threaded into `GET/PUT/DELETE ?policy` calls.
- Backend/API/Security: bucket policy HTTP handlers called default provider helpers for S3, GCS, and Azure policy operations even though the server has a concrete `AllowRemote` policy.
- Backend/API/Security: profile middleware already validates profile endpoints, but direct helper parity is still important for stale/imported profiles, internal call sites, and tests that exercise service methods below middleware.

### Improvements Applied

- Added `s3policy.ClientOptions` plus `GetBucketPolicyWithOptions`, `PutBucketPolicyWithOptions`, and `DeleteBucketPolicyWithOptions`.
- Threaded `ClientOptions.AllowRemote` into the S3 policy guarded HTTP client while preserving the existing default helper API.
- Updated bucket policy HTTP handlers to pass `server.cfg.AllowRemote` into S3, GCS IAM, and Azure ACL provider helper calls for get, put, and delete operations.
- Added S3 helper regression coverage for remote-mode loopback endpoint rejection.
- Added bucket policy HTTP service regression coverage proving S3-compatible, GCS, and Azure policy lookups propagate remote-mode endpoint policy to provider helpers.

### Remaining Limitations

- No S3 bucket-policy-specific endpoint-policy gap remains from this pass.
- The first broad Go-test runs during this pass showed the existing no-test-name `internal/api` failure pattern and passed on rerun; the subsequent full gate completed green.

### Fiftieth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/s3policy ./internal/api -run 'Test(GetBucketPolicyWithOptionsRejectsLoopbackEndpointWhenRemoteEnabled|GetBucketPolicyUsesSignedPathStyleRequest|GetBucketPolicyRejectsOversizedResponseBody|BucketPolicyHTTPService_ExecuteGetThreadsAllowRemoteToProviderHelpers|BucketPolicyHTTPService_Handle)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/s3policy ./internal/gcsiam ./internal/azureacl ./internal/api -count=1`: passed for `s3policy`, `gcsiam`, and `azureacl`; `internal/api` reported a first-run failure without a captured failing test name.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/s3policy ./internal/gcsiam ./internal/azureacl ./internal/api`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/api -count=1`: passed on rerun.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: first broad run reported the same no-test-name `internal/api` failure; rerun passed.
- `cd backend && GOTOOLCHAIN=auto go vet ./internal/s3policy ./internal/gcsiam ./internal/azureacl ./internal/api`: passed.
- `./scripts/check.sh full`: passed, including OpenAPI validation, release gate, GitHub workflow checks, Helm chart checks, backend vet/tests/security analysis, frontend OpenAPI drift check, geometry guard, lint, 975 unit tests, production build, Playwright `@check-smoke`, and third-party notice reproducibility.
- `git diff --check`: passed.

## Forty-Ninth Azure ARM Endpoint Policy Follow-Up Pass

This pass continued the provider endpoint-policy follow-up queue from the GCS token work and closed the matching Azure ARM immutability gap.

### Additional Findings

- Backend/Azure/Security: Azure ARM immutability operations used fixed Microsoft OAuth and ARM URLs, but the helper constructed its own default HTTP client instead of the shared guarded endpoint client.
- Backend/Azure/Security: bucket governance already propagated `AllowRemote` into Azure Blob data-plane helpers, but the Azure ARM immutability closures still called the default top-level helpers directly.
- Backend/Azure/Security: Azure ARM OAuth and ARM response bodies were already bounded, so the remaining issue was endpoint-policy parity rather than response-size handling.

### Improvements Applied

- Added `azurearmimmutability.ClientOptions` and `NewClientWithOptions` so Azure ARM OAuth and ARM requests use `profileendpoint.NewHTTPClient` with the caller's `AllowRemote` policy.
- Added `GetPolicyWithOptions`, `PutPolicyWithOptions`, `DeletePolicyWithOptions`, `LockPolicyWithOptions`, and `ExtendPolicyWithOptions` while preserving the existing default helper API.
- Updated the Azure bucket-governance adapter to pass `AzureAdapterOptions.AllowRemote` through every ARM immutability operation.
- Added regression coverage proving `AllowRemote=true` reaches the Azure ARM HTTP client factory during a policy lookup.

### Remaining Limitations

- No Azure ARM immutability-specific endpoint-policy gap remains from this pass.
- Other provider helper paths should continue to be reviewed when new control-plane clients are added so they inherit `profileendpoint` endpoint policy by default.

### Forty-Ninth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/azurearmimmutability ./internal/bucketgov -run 'Test(GetPolicyWithOptionsThreadsAllowRemoteToHTTPClient|NewDefaultRegistryWithOptionsThreadsAllowRemoteToProviderAdapters|AzureAdapter)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/azurearmimmutability ./internal/bucketgov ./internal/api -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/azurearmimmutability ./internal/bucketgov ./internal/api`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.
- `./scripts/check.sh full`: passed, including OpenAPI validation, release gate, GitHub workflow checks, Helm chart checks, backend vet/tests/security analysis, frontend OpenAPI drift check, geometry guard, lint, 975 unit tests, production build, Playwright `@check-smoke`, and third-party notice reproducibility.
- `git diff --check`: passed.

## Forty-Eighth GCS Token Endpoint Policy Follow-Up Pass

This pass reviewed the remaining provider response-body and endpoint-policy queue, then closed a narrower GCS token-request propagation gap.

### Additional Findings

- Backend/Provider/Security: Azure Blob, Azure ARM immutability, GCS bucket metadata, GCS IAM, and OCI helper output paths already use bounded response/output reads through `responsebody` or `processio`.
- Backend/GCS/Security: GCS bucket metadata and GCS IAM control-plane requests use `profileendpoint.NewHTTPClient` with `ClientOptions.AllowRemote`, but the service-account OAuth token request still used an independent default HTTP client.
- Backend/GCS/Security: the token URI is restricted to `https://oauth2.googleapis.com/token`, but the request path still lacked the same guarded dial policy used by the subsequent provider control-plane request.

### Improvements Applied

- Threaded `ClientOptions` into GCS bucket metadata and GCS IAM `resolveBearerToken` calls.
- Added a guarded token HTTP client factory that uses `profileendpoint.NewHTTPClient` with `AllowRemote` and the existing token timeout.
- Preserved the existing fixed Google OAuth token URI validation through `gcsauth.NormalizeTokenURI`.
- Kept the existing token response size cap through `responsebody.TokenMaxBytes`.
- Added regression coverage showing `AllowRemote=true` reaches the GCS token HTTP client and updated the oversized-token-response test to use the new token client seam.

### Remaining Limitations

- Azure ARM immutability still uses fixed Microsoft OAuth/ARM endpoints through its own client construction; a future pass can add explicit `AllowRemote` options there for parity with GCS and bucket-governance adapters.
- The full `./scripts/check.sh full` gate was not rerun; verification used backend-wide tests plus focused static analysis.

### Forty-Eighth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/gcsbucket ./internal/gcsiam -run 'Test(GetBucketWithOptionsRejectsLoopbackEndpointWhenRemoteEnabled|GetBucketIamPolicyWithOptionsRejectsLoopbackEndpointWhenRemoteEnabled|ResolveBearerToken)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/gcsbucket ./internal/gcsiam ./internal/bucketgov ./internal/api -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/gcsbucket ./internal/gcsiam ./internal/bucketgov ./internal/api`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/api -count=1`: passed after the first backend-wide run again reported `internal/api` failure without a captured failing test name.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed on rerun.
- `git diff --check`: passed.

## Forty-Seventh Explicit Upload Temp Cleanup Follow-Up Pass

This pass closed the remaining direct upload temp cleanup gap for explicit upload-session deletion.

### Additional Findings

- Backend/API/Reliability: `DELETE /api/v1/uploads/{uploadId}` aborted tracked multipart uploads and removed local/store rows, but it did not remove direct form upload temporary provider objects under `.s3desk-upload-temp/<uploadID>/`.
- Backend/API/Reliability: deleting the session row before remote temp cleanup would discard the only persisted upload ID handle that can target the temp prefix after a crashed direct form upload.
- Backend/API/Consistency: the API delete path needed to share the same temp-prefix shape as direct form upload writes and the maintenance sweeper.

### Improvements Applied

- Added a shared API helper for the direct upload temp session prefix and reused it when generating per-file temp object keys.
- `DELETE /api/v1/uploads/{uploadId}` now runs `rclone delete` against `remote:<bucket>/<prefix>/.s3desk-upload-temp/<uploadID>/` for direct-mode sessions before deleting upload rows.
- Direct temp cleanup failures now return an upload error and keep the upload session row so the user can retry deletion instead of permanently orphaning the temp prefix.
- Existing S3 multipart abort behavior remains best-effort and still runs before direct temp-prefix cleanup.
- Added API regression coverage for successful explicit direct temp-prefix cleanup and for session retention when cleanup fails.

### Remaining Limitations

- If the profile itself is removed before explicit deletion or maintenance cleanup can run, provider-side temp cleanup still cannot authenticate and must be handled externally.
- The full `./scripts/check.sh full` gate was not rerun; verification used backend-wide tests plus focused static analysis.

### Forty-Seventh-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/api -run 'TestUploadSessionHTTPService_(DeleteDirectUploadSession|HandleDeleteUploadSession)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/api ./internal/jobs -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/api ./internal/jobs`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/api -count=1`: passed after the first backend-wide run reported `internal/api` failure without a captured failing test name.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed on rerun.
- `git diff --check`: passed.

## Forty-Sixth Backend Upload Temp Cleanup Follow-Up Pass

This pass continued the backend upload reliability queue by closing the persisted cleanup gap left by the direct form upload temp-key promotion design.

### Additional Findings

- Backend/Jobs/Reliability: `cleanupExpiredUploadSessions` deleted upload session rows, upload object rows, multipart rows, and local staging directories, but direct form upload temporary provider objects under `.s3desk-upload-temp/<uploadID>/` were not swept.
- Backend/API/Reliability: request-level direct form upload failures already delete the current temp object, but a process crash between successful byte reservation and `rclone moveto` can leave remote temp objects reachable only through the upload session ID.
- Backend/Jobs/Reliability: if cleanup failure handling simply left the session row in place, the maintenance loop needed progress tracking to avoid repeatedly fetching the same blocked expired session in a tight loop.

### Improvements Applied

- Added an expired direct upload-session remote temp cleanup step before DB row deletion.
- The cleanup targets `remote:<bucket>/<prefix>/.s3desk-upload-temp/<uploadID>/` with `rclone delete`, preserving the profile's leading-slash path policy through `rcloneRemoteDir`.
- The cleanup uses the same `startRcloneCommand` path as other jobs, so profile endpoint validation, TLS flags, temp rclone config cleanup, and process-test hooks remain centralized.
- If remote temp cleanup fails, the expired direct upload session is retained for a later maintenance retry instead of deleting the only persisted handle for the orphan temp prefix.
- The maintenance loop now tracks per-batch deletion progress and exits when all remaining expired sessions are blocked, preventing a tight retry loop.
- Added regression coverage for successful direct temp-prefix cleanup and for retry retention when rclone deletion fails.

### Remaining Limitations

- Explicit upload-session deletion is not yet wired to sweep provider-side direct temp prefixes; this pass focused on the persisted maintenance sweeper path.
- If a profile is deleted before maintenance can run, the session row can no longer provide credentials for remote temp cleanup and is cleaned locally only.
- The full `./scripts/check.sh full` gate was not rerun; verification used backend-wide tests plus focused static analysis.

### Forty-Sixth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/jobs -run 'TestCleanupExpiredUploadSessions' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/jobs -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/jobs`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.
- `git diff --check`: passed.

## Forty-Fifth Provider Helper Endpoint Policy Follow-Up Pass

This pass continued the provider endpoint policy work with two focused read-only expert sub-agents for low-level helper propagation and test placement, then closed the direct helper/client gaps for Azure, GCS, and OCI.

### Additional Findings

- Backend/Azure/Security: Azure Blob ACL and service-properties helpers built guarded HTTP clients without an explicit `AllowRemote` option, so direct helper callers could not opt into remote-mode loopback/link-local rejection.
- Backend/GCS/Security: GCS bucket metadata and IAM helper clients had the same default-local behavior for direct package callers.
- Backend/OCI/Security: OCI CLI helpers hardcoded `ValidateProfileSecretsEndpoints(profile, false)`, preventing direct callers from using the stricter remote-mode endpoint policy.
- Backend/Bucket Governance/Security: `NewDefaultRegistryWithOptions` propagated `AllowRemote` only to AWS; Azure, GCS, and OCI adapters still bound default helper entrypoints.

### Improvements Applied

- Added zero-default `ClientOptions{AllowRemote bool}` and `WithOptions` entrypoints for Azure container ACL, Azure Blob service/container properties, GCS bucket metadata, GCS IAM, and OCI CLI helper operations.
- Threaded `AllowRemote` into Azure/GCS guarded HTTP clients and OCI profile endpoint validation while preserving existing public helper defaults.
- Added `NewAzureAdapterWithOptions`, `NewGCSAdapterWithOptions`, and `NewOCIAdapterWithOptions`.
- Updated `NewDefaultRegistryWithOptions` so all four bucket-governance providers receive the runtime `AllowRemote` policy.
- Added loopback rejection regression coverage for Azure ACL/service-properties helpers, GCS bucket/IAM helpers, OCI CLI helpers, and default registry adapter propagation.

### Remaining Limitations

- Azure ARM immutability uses fixed Microsoft OAuth/ARM endpoints and does not expose custom endpoint policy options in this pass.
- The full `./scripts/check.sh full` gate was not rerun; verification used backend-wide tests plus targeted static analysis.
- Release readiness is still blocked until a real candidate identity and external provider/reverse-proxy/backup-portable evidence are produced.

### Forty-Fifth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/azureacl ./internal/gcsbucket ./internal/gcsiam ./internal/ocicli ./internal/bucketgov -run 'Test(GetContainerPolicyWithOptions|GetBlobServicePropertiesWithOptions|GetBucketWithOptions|GetBucketIamPolicyWithOptions|NewDefaultRegistryWithOptionsThreads)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/azureacl ./internal/gcsbucket ./internal/gcsiam ./internal/ocicli ./internal/bucketgov ./internal/api -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/azureacl ./internal/gcsbucket ./internal/gcsiam ./internal/ocicli ./internal/bucketgov ./internal/api`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/api -count=1`: passed after the first backend-wide run reported `internal/api` failure without a captured failing test name.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed on rerun.
- `git diff --check`: passed.

## Forty-Fourth Provider Endpoint Policy Follow-Up Pass

This pass used two focused read-only expert sub-agents to review runtime provider endpoint policy enforcement and endpoint-guard test coverage, then implemented the locally verifiable `AllowRemote` propagation gaps.

### Additional Findings

- Backend/API/Security: `requireProfile` loaded persisted profile secrets into request context without revalidating endpoints against the current `AllowRemote` policy, so legacy or directly seeded loopback endpoints could reach profile-scoped routes after remote mode was enabled.
- Backend/S3/Security: S3 SDK client and presigner construction hardcoded local-mode endpoint validation and built guarded HTTP clients without the runtime `AllowRemote` setting.
- Backend/Jobs/Security: S3 prefix-marker cleanup after delete-prefix jobs used the same hardcoded S3 client construction path.
- Backend/Bucket Governance/Security: bucket governance service and AWS adapter construction did not carry runtime endpoint policy into the service boundary or AWS S3 client factory.

### Improvements Applied

- Added `s3client.ProfileOptions` plus `FromProfileWithOptions` and `PresignFromProfileWithOptions`, preserving the existing local-mode default functions.
- Threaded `AllowRemote` through API S3 helpers, direct upload/multipart/presign/download/folder/delete paths, jobs S3 prefix-marker cleanup, and the AWS bucket-governance adapter.
- Added `requireProfile` endpoint revalidation before profile secrets are attached to request context, returning `400 invalid_config` without calling downstream handlers when the current remote policy rejects the profile.
- Added bucket-governance service options and default registry options so API construction passes `dep.Config.AllowRemote` into governance dispatch and AWS S3 client creation.
- Added regression coverage for remote-mode loopback rejection in API profile middleware, S3 client/presigner factories, jobs prefix-marker cleanup, bucket-governance service dispatch, and AWS governance adapter construction.

### Remaining Limitations

- Bucket governance now validates profile endpoints at the service boundary, but the low-level Azure/GCS/OCI provider helper packages still do not expose explicit `AllowRemote` options for direct package-level callers outside that service path.
- The full `./scripts/check.sh full` gate was not rerun in this pass; verification used backend-wide tests plus focused static analysis.
- Release readiness is still blocked until a real candidate identity and external provider/reverse-proxy/backup-portable evidence are produced.

### Forty-Fourth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/profileendpoint ./internal/s3client ./internal/api ./internal/jobs ./internal/bucketgov -run 'Test(RequireProfile|FromProfile|PresignFromProfile|CleanupS3PrefixMarker|ServiceRejectsLoopbackEndpointWhenRemoteEnabled|AWSAdapterRejectsLoopbackEndpointWhenRemoteEnabled)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/api ./internal/s3client ./internal/profileendpoint ./internal/jobs ./internal/bucketgov -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/api ./internal/s3client ./internal/profileendpoint ./internal/jobs ./internal/bucketgov`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.
- `git diff --check`: passed.

## Forty-Third Backend Upload Reservation Follow-Up Pass

This pass closed the highest-priority backend upload gap from the expert review: direct multipart form uploads could stream to the final provider key before byte reservation succeeded.

### Additional Findings

- Backend/API/Security: direct form uploads used `rclone rcat` against the final object key, then persisted upload object metadata and byte accounting afterward.
- Backend/API/Security: when `UPLOAD_MAX_BYTES` was exceeded after streaming, or when a concurrent reservation race happened after streaming, the API returned an error but the final provider key could already have been written.
- Backend/API/Security: promotion failure after a successful reservation needed an explicit rollback path so `bytes_tracked` and `upload_objects` do not describe an object that was not promoted.

### Improvements Applied

- Direct form uploads now stream to a hidden temporary object under the target prefix, not to the final provider key.
- The API now persists upload object metadata and reserves bytes before promoting the temporary object to the final key with `rclone moveto`.
- Over-limit and reservation-race failures delete the temporary object and do not issue a final-key promotion.
- Promotion failures roll back the store reservation and upload object row, then clean up the temporary object.
- Added store-level reservation rollback support for upload object replacement.
- Added regression coverage for over-limit cleanup, reservation-race cleanup, successful temp-to-final promotion, and promotion-failure rollback/redaction.

### Remaining Limitations

- A crash between successful reservation and successful `moveto` can still leave a temporary provider object; the request-level failure paths clean it up, but there is not yet a persisted orphan-temp sweeper.
- Runtime-aware provider endpoint validation still needs `AllowRemote` threading through profile loading and provider client construction.
- Release readiness is still blocked until a real candidate identity and external evidence are produced.
- The full `./scripts/check.sh full` gate was not rerun in this pass; verification stayed focused on the changed backend packages.

### Forty-Third-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/api ./internal/store -run 'TestUploadDirectHTTPService_FormUpload|TestUpsertUploadObject|TestAddUploadSessionBytesWithinLimit' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/api ./internal/store -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./... -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/api ./internal/store`: passed.

## Forty-Second CI/Ops Follow-Up Pass

This pass continued the next locally actionable items from the expert review: GitLab publish diagnostics and operator/env documentation cleanup.

### Additional Findings

- CI/Release: `scripts/verify_release_readiness.sh` discarded the structured `check_release_readiness.py` report, so `scripts/check_gitlab_publish_readiness.sh` could exit with no actionable candidate/evidence diagnostics.
- Docs/Ops: remote compose examples still encouraged `cp .env.example .env`, even though the repository root `.env` is a tracked defaults file and local secrets should not be committed.
- Docs/Ops: `.env.example` and `docs/RUNBOOK.md` still had non-canonical portable smoke command labels that did not match the strict backup-portable evidence checker.
- Docs/Ops: the runbook still used a hardcoded LAN IP in generic endpoint examples.
- Docs/Ops: `docs/README.md` described release evidence as provider-live and reverse-proxy only, omitting backup-portable evidence.

### Improvements Applied

- Changed `scripts/verify_release_readiness.sh` to capture the release-readiness report and print it to stderr on failure while staying quiet on success.
- Added ignored local env file patterns for `.env.local`, `.env.private`, `.env.secret`, and `.env.*.local`.
- Updated README and runbook remote-compose examples to use `.env.local`, export it into the shell, and explicitly keep real `API_TOKEN` / `POSTGRES_PASSWORD` values out of committed files.
- Normalized `.env.example` and runbook portable smoke labels to `bash scripts/...`.
- Replaced hardcoded LAN endpoint examples in the runbook with loopback/Caddy examples.
- Updated the docs index so release evidence includes backup-portable evidence.

### Remaining Limitations

- Direct form upload temp-key/promotion semantics remain open; a safe fix should include store-level reservation and rollback behavior before changing the final remote write order.
- Runtime-aware provider endpoint validation still needs `AllowRemote` threading through profile loading and provider client construction.
- Release readiness is still blocked until a real candidate identity and provider-live, reverse-proxy, and backup-portable evidence are produced.

### Forty-Second-Follow-Up Validation

- `bash -n scripts/verify_release_readiness.sh scripts/check_gitlab_publish_readiness.sh scripts/deploy_compose_release.sh scripts/deploy_helm_release.sh`: passed.
- `DEPLOY_RELEASE_BASE=0.21v-rc3 DEPLOY_RELEASE_HEAD=HEAD bash scripts/check_gitlab_publish_readiness.sh 0.21v-rc3`: failed as expected and printed the readiness report, including missing evidence and candidate identity mismatch.
- `python3 scripts/check_release_readiness_test.py`: passed, 12 tests.
- `bash scripts/check_release_gate.sh`: passed.
- `rg -n "(^|\\s)\\.\\/scripts\\/run_portable|192\\.168\\.|provider-live and reverse-proxy|cp \\.env\\.example \\.env($|\\s)" README.md docs .env.example`: no matches.
- `git check-ignore -v .env.local .env.private .env.secret .env.prod.local`: all ignored by the intended `.gitignore` rules.
- `git diff --check`: passed.

## Forty-First Expert Sub-Agent Follow-Up Pass

This pass created four focused expert sub-agents for backend/API/security, frontend UX/accessibility, CI/release/DevOps, and documentation/operations. The main pass applied the locally verifiable frontend fixes and recorded the release/backend items that still require broader design or external evidence.

### Additional Findings

- Backend/API/Security: direct multipart form upload can still write to the final provider key before byte reservation succeeds; a robust fix should fail before the final remote write or stream to a temporary object and promote only after reservation succeeds.
- Backend/API/Security: provider endpoint guarding is not fully runtime/config aware because profile loading and some provider client paths still need explicit `AllowRemote` threading.
- Frontend/Accessibility: Objects mobile drawer disclosure was incomplete until the Folders/Details triggers were linked to stable dialog IDs and current open state.
- Frontend/Accessibility: Objects mobile E2E still asserted the old chevron-button tree contract even though `SimpleTree` now exposes `treeitem` semantics.
- Frontend/Accessibility: `JobsUploadDetailsTable` pagination had weak accessible names, no named table/nav region, no live page status, and underspecified mobile target sizing.
- CI/Release/DevOps: release readiness is blocked by candidate identity drift; `0.21v-rc3` does not point at current `HEAD`, and no tag currently points at `HEAD`.
- CI/Release/DevOps: provider-live, reverse-proxy, and backup-portable evidence are still missing, and GitLab publish readiness can fail without printing the readiness report.
- Docs/Ops: release evidence docs still reference the old candidate, and operator docs still have `.env` policy ambiguity plus some command/path drift around portable smoke evidence.

### Improvements Applied

- Added stable Objects drawer IDs and connected mobile Folders/Details toolbar buttons with `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls`.
- Applied the stable drawer IDs to the Objects tree/details overlay sheets, including the tree fallback sheet.
- Updated Objects toolbar, tree panel, details panel, and toolbar-props tests for the new drawer disclosure contract.
- Updated the Objects mobile responsive E2E folder-drawer flow to use `treeitem` expansion via `ArrowRight`, assert the stable drawer ID, and verify the Folders trigger state closes back to `false`.
- Added a hidden caption, named pagination navigation, explicit previous/next accessible button names, live page status, and mobile minimum target sizing to `JobsUploadDetailsTable`.
- Extended `JobsUploadDetailsTable` unit coverage for the table name, pagination nav, and new button names.

### Remaining Limitations

- The full `./scripts/check.sh full` gate was not rerun in this pass; verification stayed focused on the changed frontend surfaces.
- Direct form upload temp-key/promotion semantics and runtime-aware provider endpoint validation remain backend follow-up work.
- Release readiness still requires a new candidate identity or exact `HEAD` candidate, plus provider-live, reverse-proxy, and backup-portable evidence from external environments.
- GitLab publish readiness should print the failed readiness report instead of exiting silently.
- `.env` handling remains a policy decision because the tracked `.env` file is dirty and the docs still encourage copying `.env.example` into `.env`.

### Forty-First-Follow-Up Validation

- `cd frontend && npm run test:unit -- src/pages/objects/__tests__/ObjectsToolbar.test.tsx src/pages/objects/__tests__/ObjectsTreePanel.test.tsx src/pages/objects/__tests__/ObjectsDetailsPanel.test.tsx src/pages/objects/__tests__/useObjectsToolbarProps.test.tsx src/pages/jobs/__tests__/JobsUploadDetailsTable.test.tsx`: passed, 20 tests.
- `cd frontend && npm run typecheck`: passed.
- `cd frontend && npx eslint src/pages/objects/ObjectsToolbar.tsx src/pages/objects/ObjectsTreePanel.tsx src/pages/objects/ObjectsTreePaneHost.tsx src/pages/objects/ObjectsDetailsPanel.tsx src/pages/objects/useObjectsToolbarProps.ts src/pages/objects/useObjectsScreenToolbar.ts src/pages/objects/__tests__/ObjectsToolbar.test.tsx src/pages/objects/__tests__/ObjectsTreePanel.test.tsx src/pages/objects/__tests__/ObjectsDetailsPanel.test.tsx src/pages/objects/__tests__/useObjectsToolbarProps.test.tsx src/pages/jobs/JobsUploadDetailsTable.tsx src/pages/jobs/__tests__/JobsUploadDetailsTable.test.tsx tests/objects-mobile-responsive.spec.ts --max-warnings 0`: passed.
- `cd frontend && npx playwright test tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --grep "folders drawer opens"`: passed, 1 test.

## Fortieth Current Follow-Up Pass

This pass closed the documentation/operations follow-up from the expert sub-agent review for current operator-facing docs.

### Additional Findings

- Docs/Ops: the live UI E2E example enabled `E2E_LIVE=1` without showing a required browser base URL, even though live Playwright does not start the managed mock Vite server.
- Docs/Ops: portable smoke commands still used both `./scripts/...` and `bash scripts/...` forms, while strict backup-portable evidence expects the `bash scripts/...` labels.
- Docs/Ops: current operational docs still contained local absolute file links that are not portable outside this workstation.

### Improvements Applied

- Updated the UI E2E live command to include `PLAYWRIGHT_BASE_URL` and documented the alternative `scripts/run_live_e2e_local.sh` harness.
- Standardized portable smoke commands in `README.md` and `docs/PORTABLE_BACKUP.md` to the strict evidence-compatible `bash scripts/...` form.
- Replaced local absolute links in `docs/TESTING.md` and `docs/RUNBOOK.md` with repository-relative links.

### Remaining Limitations

- Historical audit/report documents still contain workstation-specific absolute paths because they describe prior local analysis state; this pass intentionally limited edits to current operator-facing docs.
- The full `./scripts/check.sh full` gate was not rerun in this pass; the change was verified with focused documentation grep checks and `git diff --check`.

### Fortieth-Follow-Up Validation

- `rg -n "/home/homelab/Downloads/project/s3desk" README.md docs/TESTING.md docs/PORTABLE_BACKUP.md docs/RUNBOOK.md`: no matches.
- `rg -n "(^|\\s)\\.\\/scripts\\/run_portable|run_portable_" README.md docs/TESTING.md docs/PORTABLE_BACKUP.md docs/release/evidence/BACKUP_PORTABLE_SMOKE_TEMPLATE.md`: only `bash scripts/...` portable smoke labels remain.

## Thirty-Ninth Current Follow-Up Pass

This pass continued the backend security queue from the expert sub-agent findings and closed the upload/archive path-cleaning alias gap around internal `..` segments.

### Additional Findings

- Backend/Security: `sanitizeUploadPath` used `path.Clean` after trimming leading separators, so paths such as `a/../c.txt` were accepted as `c.txt` instead of being rejected as ambiguous input.
- Backend/Security: upload session prefixes were trimmed but not checked for parent-directory path segments before being stored and later joined into object keys.
- Backend/Security: restore and portable archive entry names used `cleanServerRestoreArchivePath`, which rejected leading escapes but still let internal `..` segments collapse into a different archive path.

### Improvements Applied

- Added a shared parent-segment guard and made upload relative paths reject any `..` segment before `path.Clean` can collapse it.
- Added upload session prefix validation so new upload sessions reject prefixes such as `incoming/../escape`.
- Hardened restore/portable archive entry cleanup so `data/a/../b` fails instead of normalizing to `data/b`.
- Added regression coverage for upload path sanitization, upload prefix validation, upload session HTTP creation errors, and archive path cleanup.

### Remaining Limitations

- The full `./scripts/check.sh full` gate was not rerun in this pass; the changes were verified with focused backend tests and static analysis.
- Existing persisted upload sessions with unusual prefixes are not migrated by this pass; the new guard prevents creating new ambiguous prefixes.
- Direct form upload temp-key/promotion semantics, Objects drawer/table accessibility follow-ups, docs command cleanup, and release-candidate evidence collection remain open.

### Thirty-Ninth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/api -run 'Test(SanitizeUploadPath|ValidateUploadPrefix|UploadSessionHTTPService_HandleCreateUploadSession|CleanServerRestoreArchivePath|ArchiveEntryFileMode|ParseUploadChunkHeaders|BuildUploadVerificationTargetsFromRequest)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/store -run 'TestImportPortable|TestValidatePortable|Test.*Upload' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/api -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/api ./internal/store`: passed.

## Thirty-Eighth Expert Sub-Agent Integration Pass

This pass used four focused expert sub-agents to re-scan the project from backend/security, frontend/accessibility, CI/release, and documentation/operations perspectives. The applied work focused on two locally verifiable gaps with high release impact: S3 SDK runtime egress guarding and release evidence trigger coverage.

### Additional Findings

- Backend/Security: S3 SDK clients validated stored endpoints at construction time, but the AWS SDK HTTP client path still used the default transport unless profile TLS was present, so redirects and later SDK requests did not consistently reuse the shared guarded endpoint HTTP client.
- Backend/Security: upload/archive path cleaners still need a stricter segment-level rejection pass for internal `..` aliases.
- CI/Release: provider-live evidence detection did not include `backend/internal/gcsauth/` or `backend/internal/profileendpoint/`, even though changes there can alter GCS auth behavior or provider endpoint egress safety.
- Frontend/Accessibility: Objects mobile Folders/Details drawer triggers still need explicit dialog disclosure state and target linkage.
- Docs/Ops: testing and portable-smoke documentation still has command-shape drift and local absolute path cleanup work.

### Improvements Applied

- Routed S3 SDK clients through `profileendpoint.NewHTTPClient`, preserving stored TLS configuration while applying guarded request URL, DNS/IP, dial, and redirect validation consistently.
- Added S3 client regression coverage for blocked stored endpoints, blocked public presign endpoints, blocked redirects, and stored mTLS configuration reaching a real mutual-TLS test server.
- Extended release evidence provider-change detection to cover `backend/internal/gcsauth/` and `backend/internal/profileendpoint/`.
- Scoped `gcsauth` changes to GCS provider-live evidence and left `profileendpoint` changes as all-provider evidence triggers.
- Updated release evidence tests to lock the new trigger paths and provider-scope suggestions.

### Remaining Limitations

- The full `./scripts/check.sh full` gate was not rerun in this pass; the changes were verified with focused backend and release-evidence checks.
- Upload/archive `..` segment rejection remains open and should be handled before relying on object-key cleanup as a security boundary.
- Direct form upload temp-key/promotion semantics, Objects drawer/table accessibility follow-ups, docs command cleanup, and release-candidate evidence collection remain open.
- Release readiness still depends on external candidate evidence for provider-live, reverse-proxy, backup-portable smoke, and real tag-build runtime image tar license evidence.

### Thirty-Eighth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/s3client ./internal/profileendpoint -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/api ./internal/jobs ./internal/bucketgov -run 'Test.*(S3|Presign|Upload|Bucket|Endpoint|Profile)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/s3client ./internal/profileendpoint ./internal/api ./internal/jobs ./internal/bucketgov`: passed.
- `python3 scripts/check_release_evidence_test.py`: passed, 42 tests.

## Thirty-Seventh Current Follow-Up Pass

This pass continued the frontend accessibility follow-up queue and converted the shared `SimpleTree` from a visual nested list into an ARIA tree with keyboard navigation.

### Additional Findings

- Frontend/Accessibility: `SimpleTree` still rendered nested lists and separate buttons, so folder trees did not expose `tree`/`treeitem`/`group`, levels, selection, or standard tree keyboard movement.
- Frontend/Accessibility: per-node loading spinners were visual-only and did not announce which tree item was loading.

### Improvements Applied

- Added `role="tree"` with a configurable label, `role="treeitem"` rows, nested `role="group"` containers, and `aria-level`/`aria-posinset`/`aria-setsize` metadata.
- Replaced label-button focus with row-level roving focus and tree keyboard support for ArrowUp/ArrowDown/Home/End, ArrowLeft/ArrowRight collapse/expand navigation, and Enter/Space selection.
- Preserved the existing pointer expand control as a mouse target while exposing expand/collapse state on the tree item itself.
- Added `aria-selected` and `aria-busy` to tree items and changed node loading indicators to polite `role="status"` announcements.
- Updated focused `SimpleTree` tests for tree semantics, keyboard navigation, selection, and loading announcements.

### Remaining Limitations

- The full `./scripts/check.sh full` gate was not rerun in this pass; the changes were verified with focused frontend checks.
- Broader object-tree follow-ups remain for context-menu keyboard invocation and any screen-reader tuning that needs manual assistive-technology validation.
- Release readiness still depends on external candidate evidence for provider-live, reverse-proxy, backup-portable smoke, and real tag-build runtime image tar license evidence.

### Thirty-Seventh-Follow-Up Validation

- `cd frontend && npx vitest run src/components/__tests__/SimpleTree.test.tsx`: passed, 3 tests.
- `cd frontend && npx eslint src/components/SimpleTree.tsx src/components/__tests__/SimpleTree.test.tsx --max-warnings 0`: passed.
- `cd frontend && npx vitest run src/pages/objects/__tests__/ObjectsTreeView.test.tsx src/components/__tests__/LocalPathBrowseModal.test.tsx`: passed, 8 tests.
- `cd frontend && npm run typecheck`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.

## Thirty-Sixth Current Follow-Up Pass

This pass continued the provider-response hardening work and closed the remaining production `resp.Body` paths that still used direct unbounded reads.

### Additional Findings

- Backend/Security: Azure ARM immutability token and control-plane responses still used direct `io.ReadAll(resp.Body)` reads.
- Backend/Security: S3 bucket-policy control-plane calls read upstream response bodies without the shared response-size cap and ignored body read errors.

### Improvements Applied

- Reused `backend/internal/responsebody` for Azure ARM OAuth token responses and Azure ARM immutability policy responses.
- Reused `backend/internal/responsebody` for S3 bucket-policy responses and now returns body read errors instead of silently dropping them.
- Added over-limit regression tests for Azure ARM OAuth, Azure ARM control-plane responses, and S3 bucket-policy responses.
- Verified that backend production code no longer has direct `io.ReadAll(resp.Body)`/`ReadAll(resp.Body)` matches.

### Remaining Limitations

- The full `./scripts/check.sh full` gate was not rerun in this pass; the changes were verified with targeted backend checks.
- Release readiness still depends on external candidate evidence for provider-live, reverse-proxy, backup-portable smoke, and real tag-build runtime image tar license evidence.

### Thirty-Sixth-Follow-Up Validation

- `cd backend && GOTOOLCHAIN=auto go test ./internal/azurearmimmutability ./internal/s3policy ./internal/bucketgov -run 'Test(GetTokenRejectsOversizedOAuthResponse|DoRejectsOversizedControlPlaneResponse|GetBucketPolicy|Azure|S3)' -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/azurearmimmutability ./internal/s3policy ./internal/bucketgov`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/azurearmimmutability ./internal/s3policy ./internal/bucketgov -count=1`: passed.
- `rg -n "io\.ReadAll\(resp\.Body\)|ReadAll\(resp\.Body\)" backend/internal -g '*.go'`: no matches.
- `git diff --check`: passed.

## Thirty-Fourth Current Expert Sub-Agent Pass

This pass used three focused expert sub-agents to choose the next locally verifiable work after the full local gate went green. The applied fixes covered release metadata validation, bounded provider HTTP reads, and a small frontend live-region gap.

### Additional Findings

- Release/CI: GitHub Release metadata validation was embedded as inline Python in `scripts/verify_release_readiness.sh`, which made tag/title/body/prerelease rules harder to unit test offline.
- Backend/Security: Azure and GCS provider control-plane clients read response bodies without shared size caps, including GCP access-token responses.
- Frontend/Product: the Jobs log count summary changed as logs/search results changed, but it was plain text rather than a polite live status.

### Improvements Applied

- Added `scripts/verify_github_release_metadata.py` with fixture tests and delegated GitHub Release metadata validation from `scripts/verify_release_readiness.sh`.
- Extended the publish readiness gate to require GitHub Release `tag_name`, title, body sections, `Full Changelog` compare link, and prerelease flag validation through the new helper.
- Added `backend/internal/responsebody` and replaced direct `io.ReadAll(resp.Body)` calls in Azure ACL/service-properties, GCS bucket metadata, GCS IAM, and GCP token response paths with bounded reads.
- Added over-limit regression tests for Azure ACL, GCS bucket metadata, GCS IAM metadata, GCP token responses, and the shared response-body helper.
- Marked Jobs log count metadata as `role="status"` with polite, atomic live announcements and updated the component test to assert the accessible status.

### Remaining Limitations

- Direct form upload still needs a larger temp-object plus verified promotion design so failed unknown-size uploads never write directly to final object keys.
- OCI/rclone subprocess output capture still needs bounded buffers in remaining non-streaming execution paths.
- Frontend mobile touch target follow-up remains for shared help tooltips and broader `SimpleTree` ARIA semantics.
- Release readiness still depends on external candidate evidence for provider-live, reverse-proxy, backup-portable smoke, and real tag-build runtime image tar license evidence.

### Thirty-Fourth-Current-Pass Validation

- `python3 scripts/verify_github_release_metadata_test.py`: passed, 6 tests.
- `python3 scripts/verify_release_readiness_checks_test.py`: passed, 5 tests.
- `bash -n scripts/verify_release_readiness.sh scripts/check_release_gate.sh`: passed.
- `bash scripts/check_release_gate.sh`: passed.
- `cd backend && GOTOOLCHAIN=auto go test ./internal/responsebody ./internal/azureacl ./internal/gcsbucket ./internal/gcsiam -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./internal/responsebody ./internal/azureacl ./internal/gcsbucket ./internal/gcsiam`: passed.
- `cd frontend && npx vitest run src/pages/jobs/__tests__/JobsLogsDrawer.test.tsx`: passed, 3 tests.
- `git diff --check`: passed.

## Thirty-Third Current Expert Sub-Agent Pass

This pass used the full local gate as the integration check after the release-compliance fixes and closed the residual backend static-analysis and frontend build blockers it exposed.

### Additional Findings

- Backend/Security: `staticcheck` still found unused compatibility wrappers left behind after the portable restore extraction and rclone execution refactors.
- Frontend/Product: the object pane resize accessibility props had reached the section/component types, but `buildObjectsPageDataState` did not pass the keyboard/min/max values through `ObjectsPaneVm`.
- Frontend/Test: several TypeScript fixtures were stale after stricter shell session, transfer task, and object preview shapes were introduced.

### Improvements Applied

- Removed or folded the unused backend wrappers in portable import, restore extraction, and rclone sync execution paths while keeping the budgeted extraction and pinned local-path behavior intact.
- Passed `onDetailsResizeKeyDown`, `onTreeResizeKeyDown`, and tree/details resize min/max values through `ObjectsPaneVm`.
- Updated frontend test fixtures for `settingsOpen`, download `profileId`, `ObjectPreview.kind`, `ObjectPreview.contentType`, and pane resize keyboard/value props.

### Remaining Limitations

- Local full gate is now green, but release readiness still depends on external candidate evidence for provider-live, reverse-proxy, and backup-portable smoke runs.
- Runtime image APK package license scanning still needs real `release-postgres.tar` and `release-sqlite.tar` artifacts from a tag build for candidate-specific evidence.
- The local check still prints an informational npm version recommendation (`10.9.7` found, `10.9.4` recommended), but it does not fail the gate.

### Thirty-Third-Current-Pass Validation

- `cd backend && go test ./internal/api ./internal/jobs -count=1`: passed.
- `cd backend && GOTOOLCHAIN=auto staticcheck ./...`: passed.
- `cd backend && GOTOOLCHAIN=auto gosec -quiet -exclude=G117,G702,G703,G704,G705 ./...`: passed.
- `cd backend && GOTOOLCHAIN=auto govulncheck ./...`: passed; no called vulnerabilities found.
- `cd frontend && npx vitest run src/__tests__/useFullAppController.test.tsx src/components/transfers/__tests__/TransfersDrawer.test.tsx src/pages/objects/__tests__/ObjectsDetailsContent.test.tsx src/pages/objects/__tests__/ObjectsPagePanes.test.tsx`: passed, 19 tests.
- `cd frontend && npm run build`: passed.
- `./scripts/check.sh full`: passed, including release gate, workflow validation, Helm lint, gofmt, backend tests, backend security analysis, bundle report, frontend lint, frontend unit tests, frontend build, browser smoke, and third-party notices.
- `git diff --check`: passed.

## Thirty-Second Current Expert Sub-Agent Pass

This pass closed the remaining local release-compliance item by adding runtime image package license scanning to the release license audit path.

### Additional Findings

- DevOps/Compliance: release images install Alpine runtime packages such as `ca-certificates`, `ffmpeg`, and sqlite support, but `scripts/license-audit.sh` only audited npm and Go dependencies.
- DevOps/Compliance: GitLab tag pipelines already produce `release-postgres.tar` and `release-sqlite.tar`, but `license_audit_runtime` did not consume those artifacts.
- DevOps/Compliance: the runtime image also copies the external `rclone` binary, so the audit should verify that the copied binary notice and license text remain present.

### Improvements Applied

- Added `scripts/check_runtime_image_licenses.py`, a stdlib Docker archive parser that reads Alpine `lib/apk/db/installed` from image layers and checks package license metadata against `IMAGE_ALLOWED_LICENSES`.
- Added `scripts/check_runtime_image_licenses_test.py` coverage for APK database parsing, license expressions, unknown/disallowed package licenses, and Docker archive layer parsing.
- Updated `scripts/license-audit.sh` to scan runtime image tar inputs from `LICENSE_AUDIT_IMAGE_TARS` or automatically from `release-postgres.tar` and `release-sqlite.tar` when present.
- Made `license_audit_runtime` optionally consume `build_release_images` artifacts in GitLab tag pipelines so release image APK package licenses are scanned before Docker Hub publication.
- Added runtime `rclone` notice/license guardrails to `scripts/license-audit.sh`.
- Wired the runtime image license parser and tests into `scripts/check_release_gate.sh`, and documented the image tar scan path in release/testing/deployment docs.

### Remaining Limitations

- A real release image APK package scan still depends on `release-postgres.tar` and `release-sqlite.tar` artifacts from a tag build; those tar files were not present in this local worktree.
- Release readiness still needs a real candidate id plus provider-live, reverse-proxy, and backup-portable evidence recorded for that candidate.
- Full `./scripts/check.sh full` was not run in this pass.

### Thirty-Second-Current-Pass Validation

- `python3 scripts/check_runtime_image_licenses_test.py`: passed, 5 tests.
- `python3 scripts/check_go_license_report_test.py`: passed, 5 tests.
- `python3 scripts/check_gitlab_publish_dag_test.py`: passed, 4 tests.
- `bash scripts/license-audit.sh runtime-only`: passed; image tar scan was skipped because no release image tar inputs were present locally.
- GitLab/GitHub workflow YAML parse for `.gitlab-ci.yml` and `.github/workflows/license-audit.yml`: passed.
- `bash scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Thirty-First Current Expert Sub-Agent Pass

This pass closed the locally enforceable Go license allow-list gap in the release license audit.

### Additional Findings

- DevOps/Compliance: `scripts/license-audit.sh` used an explicit allow-list for npm runtime dependencies, but Go module auditing only grepped `go-licenses` output for a blocked regex and uppercase `UNKNOWN`.
- DevOps/Compliance: `go-licenses` emits `Unknown` with title case, so the previous grep missed unknown Go license rows.
- DevOps/Compliance: first-party `s3desk/...` packages appeared as unknown in the Go report, creating noise that should be excluded before third-party license enforcement.
- DevOps/Compliance: `modernc.org/mathutil` is a third-party dependency whose BSD-3-Clause license text is already tracked under `third_party/licenses/go/`, but `go-licenses` cannot identify it from the module cache layout.

### Improvements Applied

- Added `scripts/check_go_license_report.py`, a stdlib CSV parser that enforces a Go license allow-list and writes separate blocked, unknown, and disallowed reports.
- Added `scripts/check_go_license_report_test.py` coverage for allowed licenses, case-insensitive unknown handling, disallowed licenses, blocked licenses, and the `modernc.org/mathutil=BSD-3-Clause` override.
- Updated `scripts/license-audit.sh` with `GO_ALLOWED_LICENSES`, `GO_LICENSE_IGNORE_PREFIXES`, and `GO_LICENSE_OVERRIDES`, and now runs `go-licenses report --ignore s3desk ./...` before allow-list evaluation.
- Wired the Go license report parser and tests into `scripts/check_release_gate.sh`.
- Updated release/testing docs to state that runtime license audit enforces explicit npm and Go allow-lists.

### Remaining Limitations

- Release image package license scanning was addressed in the Thirty-Second Current Expert Sub-Agent Pass; a real tag-build tar artifact is still required for candidate-specific APK package evidence.
- Release readiness still needs a real candidate id plus provider-live, reverse-proxy, and backup-portable evidence recorded for that candidate.
- Full `./scripts/check.sh full` was not run in this pass.

### Thirty-First-Current-Pass Validation

- `python3 scripts/check_go_license_report_test.py`: passed, 5 tests.
- `bash scripts/license-audit.sh runtime-only`: passed.
- `python3 scripts/check_gitlab_publish_dag.py`: passed.
- GitLab/GitHub workflow YAML parse for `.gitlab-ci.yml` and `.github/workflows/license-audit.yml`: passed.
- `bash scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Thirtieth Current Expert Sub-Agent Pass

This pass addressed the next locally enforceable release-compliance item: Helm chart publication order in the GitLab tag pipeline.

### Additional Findings

- DevOps/Release: `publish_helm_chart` was still in the `publish` stage and only needed `publish_dockerhub`, while `release_image_smoke` ran later in `post-publish`; this allowed a chart to be pushed before the already-published Docker Hub images were pulled and smoke-tested.
- DevOps/Release: the release gate relied on broad text assertions for publish dependencies but did not have a structural check for the release publish DAG.
- Docs/Release: release docs said publish readiness happened before Docker Hub or Helm publication, but did not clearly require Helm chart publication to wait for published-image smoke.

### Improvements Applied

- Added a dedicated GitLab `chart-publish` stage after `post-publish` and moved `publish_helm_chart` into it.
- Made `publish_helm_chart` explicitly need both `publish_dockerhub` and `release_image_smoke`, preserving the order `publish_dockerhub` -> `release_image_smoke` -> `publish_helm_chart` -> `deploy_release_helm`.
- Added `scripts/check_gitlab_publish_dag.py`, a stdlib-only structural checker for release publish stage ordering and job `needs`.
- Added `scripts/check_gitlab_publish_dag_test.py` coverage for the valid DAG, Helm chart publication in the wrong stage, missing `release_image_smoke` dependency, and bad stage ordering.
- Wired the new DAG checker and tests into `scripts/check_release_gate.sh`.
- Updated `docs/RELEASE_GATE.md`, `docs/TESTING.md`, and `docs/release/DEPLOYMENT_CHECKLIST.md` to document the published-image-smoke-before-chart-publish rule and the local checker command.

### Remaining Limitations

- Release image package license scanning remains open; Go license allow-listing was addressed in the Thirty-First Current Expert Sub-Agent Pass.
- Release readiness still needs a real candidate id plus provider-live, reverse-proxy, and backup-portable evidence recorded for that candidate.
- Full `./scripts/check.sh full` was not run in this pass.

### Thirtieth-Current-Pass Validation

- `python3 scripts/check_gitlab_publish_dag_test.py`: passed, 4 tests.
- `python3 scripts/check_gitlab_publish_dag.py`: passed.
- GitLab/GitHub workflow YAML parse for `.gitlab-ci.yml` and `.github/workflows/license-audit.yml`: passed.
- `bash -n scripts/check_release_gate.sh`: passed.
- `bash scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Twenty-Ninth Current Expert Sub-Agent Pass

This pass implemented the next locally actionable release-compliance item from the prior expert backlog: deterministic GitHub check-run reduction for release readiness.

### Additional Findings

- DevOps/Release: `verify_release_readiness.sh` collapsed check-runs by name using the GitHub API response order, so stale duplicate runs could make readiness pass or fail depending on pagination/order rather than the newest run.
- DevOps/Release: the check-run parser was embedded inside the shell script, which made focused regression coverage for duplicate, pending, and missing checks harder to maintain.
- DevOps/Release: release-gate did not explicitly guard that the readiness verifier continues to use the dedicated check-run reducer and its stale-run regression coverage.

### Improvements Applied

- Added `scripts/verify_release_readiness_checks.py` to parse GitHub check-run JSON from stdin, deduplicate by check name, and select the newest run using started/created time, completed/updated time, and run id as a deterministic tie-breaker.
- Tightened required-check evaluation so only the latest `success` state passes; latest failures, pending states, and missing required checks now fail with explicit diagnostics.
- Replaced the embedded shell Python block in `scripts/verify_release_readiness.sh` with a call to the dedicated reducer.
- Added `scripts/verify_release_readiness_checks_test.py` coverage for stale failure vs latest success, stale success vs latest failure, latest pending state, missing required checks, and CLI diagnostics.
- Extended `scripts/check_release_gate.sh` static assertions so the release gate watches the reducer script and stale-check regression test.

### Remaining Limitations

- Release image package license scanning remains open; Go license allow-listing was addressed in the Thirty-First Current Expert Sub-Agent Pass and Helm chart publish ordering was addressed in the Thirtieth Current Expert Sub-Agent Pass.
- Release readiness still needs a real candidate id plus provider-live, reverse-proxy, and backup-portable evidence recorded for that candidate.
- Full `./scripts/check.sh full` was not run in this pass.

### Twenty-Ninth-Current-Pass Validation

- `python3 scripts/verify_release_readiness_checks_test.py`: passed, 5 tests.
- `bash -n scripts/verify_release_readiness.sh`: passed.
- `python3 scripts/check_release_readiness_test.py`: passed, 12 tests.
- `bash scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Twenty-Eighth Current Expert Sub-Agent Pass

This pass closed the remaining local runtime SSRF hardening item for direct HTTP clients by adding a guarded transport layer shared by the S3 policy, GCS IAM/bucket metadata, and Azure ACL clients.

### Additional Findings

- Backend/Runtime Security: direct HTTP clients still used a plain `net.Dialer`, so request-time DNS results, redirects, and environment proxy routing were not guarded by the profile endpoint validator.
- Backend/Runtime Security: configured endpoint validation disallows query strings, but request URLs need query strings for control-plane APIs such as S3 `?policy` and Azure `restype=container&comp=acl`.
- Backend/Runtime Security: redirect targets need independent validation because they can point away from an already validated endpoint.

### Improvements Applied

- Added `profileendpoint.NewHTTPClient` with per-request URL validation, redirect validation, disabled proxy routing, and a guarded `DialContext`.
- Added `profileendpoint.GuardedDialContext`, which resolves hostnames through the shared resolver hooks, rejects blocked/non-routable IPs, and dials validated IP addresses directly.
- Added `profileendpoint.ValidateRequestURL` so direct request URLs can keep API query strings while still rejecting unsafe schemes, credentials, fragments, metadata hosts, and unsafe resolved IPs.
- Switched S3 policy, GCS IAM, GCS bucket metadata, and Azure ACL HTTP clients to the guarded client while preserving existing profile TLS configuration.
- Added regression coverage for request URL query allowance, metadata-host request rejection, metadata dial rejection, and metadata redirect rejection.

### Remaining Limitations

- DNS/IP guarding now covers direct HTTP client dial paths, but broader runtime hardening still needs continued review for provider SDK internals and any future clients that bypass `profileendpoint.NewHTTPClient`.
- Release image package license scanning, Go license allow-listing, and Helm chart publish ordering remain open release-compliance follow-ups; stale/duplicate GitHub check-run reduction was addressed in the Twenty-Ninth Current Expert Sub-Agent Pass.
- Release readiness remains blocked until a real candidate id is selected and provider-live, reverse-proxy, and backup-portable evidence are recorded for that candidate.
- Full `./scripts/check.sh full` was not run in this pass.

### Twenty-Eighth-Current-Pass Validation

- `gofmt -w backend/internal/profileendpoint/validation.go backend/internal/profileendpoint/http_client.go backend/internal/profileendpoint/http_client_test.go backend/internal/s3policy/s3policy.go backend/internal/gcsiam/gcsiam.go backend/internal/gcsbucket/gcsbucket.go backend/internal/azureacl/azureacl.go`: applied successfully.
- `cd backend && go test ./internal/profileendpoint ./internal/s3policy ./internal/gcsiam ./internal/gcsbucket ./internal/azureacl -count=1`: passed.
- `cd backend && go test ./internal/s3client ./internal/api ./internal/jobs ./internal/ocicli -run 'TestFromProfileRejectsBlockedEndpoint|TestPresignFromProfileRejectsBlockedPublicEndpoint|TestStartRcloneRejectsUnsafeProfileEndpointBeforeProcess|TestRunRcloneStdinRejectsUnsafeProfileEndpointBeforeProcess|TestStartRcloneCommandRejectsUnsafeProfileEndpointBeforeProcess|TestGetBucketRejectsBlockedEndpointBeforeCLIResolution' -count=1`: passed.
- `git diff --check`: passed.

## Twenty-Seventh Current Expert Sub-Agent Pass

This pass continued the runtime SSRF hardening backlog by adding launch-time endpoint guards for provider clients and external process execution paths that can consume legacy or directly injected profile endpoints.

### Additional Findings

- Backend/Runtime Security: S3 SDK client creation and presign client creation accepted profile endpoint fields without a runtime preflight, relying on save/import-time validation only.
- Backend/Runtime Security: API rclone execution and jobs rclone execution wrote endpoint-bearing rclone configs before revalidating profile endpoints, leaving legacy DB state and direct store writes as a launch-time gap.
- Backend/Runtime Security: OCI CLI execution passed `OciEndpoint` through to `--endpoint` without a final preflight.
- Backend/Runtime Security: direct HTTP clients in S3 policy, GCS IAM/bucket metadata, and Azure ACL still need a dial-time guard because preflight alone cannot fully cover DNS rebinding or redirect targets.

### Improvements Applied

- Added `profileendpoint.ValidateProfileSecretsEndpoints` for provider-aware endpoint validation on loaded `models.ProfileSecrets`.
- Added S3 client and presign client runtime endpoint guards.
- Added API rclone runtime endpoint guards before test hooks, config generation, and process launch.
- Added jobs manager `AllowRemote` propagation and jobs rclone runtime endpoint guards before hooks, config generation, and process launch.
- Added OCI CLI endpoint guard before resolving or launching the `oci` executable.
- Added regression coverage proving unsafe endpoints are rejected before S3 client creation, rclone hooks/process launch, and OCI CLI resolution.

### Remaining Limitations

- Direct HTTP clients still needed guarded `DialContext`, per-request resolved-IP validation, and redirect revalidation in this pass; this was addressed in the Twenty-Eighth Current Expert Sub-Agent Pass.
- Release image package license scanning, Go license allow-listing, stale/duplicate GitHub check-run reduction, and Helm chart publish ordering remain open release-compliance follow-ups.
- Release readiness remains blocked until a real candidate id is selected and provider-live, reverse-proxy, and backup-portable evidence are recorded for that candidate.
- Full `./scripts/check.sh full` was not run in this pass.

### Twenty-Seventh-Current-Pass Validation

- `gofmt -w backend/internal/profileendpoint/profile.go backend/internal/s3client/client.go backend/internal/s3client/client_test.go backend/internal/api/rclone_helpers.go backend/internal/api/rclone_endpoint_guard_test.go backend/internal/jobs/manager.go backend/internal/app/app.go backend/internal/jobs/manager_rclone_config.go backend/internal/jobs/rclone_exec.go backend/internal/jobs/rclone_exec_test.go backend/internal/ocicli/ocicli.go backend/internal/ocicli/ocicli_test.go`: applied successfully.
- `cd backend && go test ./internal/profileendpoint ./internal/s3client ./internal/api ./internal/jobs ./internal/ocicli -run 'TestFromProfileRejectsBlockedEndpoint|TestPresignFromProfileRejectsBlockedPublicEndpoint|TestStartRcloneRejectsUnsafeProfileEndpointBeforeProcess|TestRunRcloneStdinRejectsUnsafeProfileEndpointBeforeProcess|TestStartRcloneCommandRejectsUnsafeProfileEndpointBeforeProcess|TestGetBucketRejectsBlockedEndpointBeforeCLIResolution|TestValidateProfileEndpointURL|TestImportPortableEntityFilesReplaceRejectsUnsafePortableProfileEndpoints|TestValidatePortableEntityFilesWithOptionsAppliesAllowRemoteEndpointPolicy' -count=1`: passed.
- `git diff --check`: passed.

## Twenty-Sixth Current Expert Sub-Agent Pass

This pass used expert sub-agents for backend portable endpoint validation, runtime SSRF flow analysis, and release/devops automation. I applied the locally verifiable backend endpoint hardening and the smallest release workflow concurrency guard.

### Additional Findings

- Backend/Security: profile endpoint URL validation lived in the API package, so portable import could not reuse it without a dependency cycle.
- Backend/Security: portable import needed to validate S3-compatible `endpoint`/`publicEndpoint`, Azure/GCS/OCI `config_json.endpoint`, `tlsInsecureSkipVerify`, and remote-access localhost policy before replacing profile rows.
- Backend/Runtime Security: runtime paths still need launch-time or dial-time endpoint guards. S3 SDK creation, rclone execution, OCI CLI execution, and direct HTTP clients can still consume endpoints from legacy data, DB injection, or DNS changes after save-time validation.
- Release/DevOps: `license-audit` is a required GitHub check but lacked top-level workflow concurrency, unlike `release-gate` and `frontend-e2e`.

### Improvements Applied

- Moved profile endpoint validation into `backend/internal/profileendpoint` and kept API wrapper functions to preserve existing HTTP request validation behavior.
- Added portable validation options and wired `AllowRemote` into portable preview/apply paths.
- Added portable import validation for S3-compatible/AWS endpoint fields, S3 `publicEndpoint`, Azure/GCS/OCI config endpoints, and `tlsInsecureSkipVerify` endpoint requirements.
- Added regression coverage for unsafe portable provider endpoints, remote-mode localhost rejection, TLS skip without custom endpoint, and portable preflight remote-mode blocking.
- Added top-level `concurrency` to `.github/workflows/license-audit.yml`.
- Extended `scripts/check_github_workflows.py` so required workflows must declare `cancel-in-progress: true` with the expected concurrency group prefix.

### Remaining Limitations

- Runtime SSRF hardening still needed launch-time guards for S3 client creation, rclone execution, and OCI CLI execution in this pass; those were addressed in the Twenty-Seventh Current Expert Sub-Agent Pass. Guarded `DialContext` and redirect revalidation for direct HTTP clients remain open.
- Release image package license scanning, Go license allow-listing, stale/duplicate GitHub check-run reduction, and Helm chart publish ordering remain open release-compliance follow-ups.
- Release readiness remains blocked until a real candidate id is selected and provider-live, reverse-proxy, and backup-portable evidence are recorded for that candidate.
- Full `./scripts/check.sh full` was not run in this pass.

### Twenty-Sixth-Current-Pass Validation

- `gofmt -w backend/internal/profileendpoint/validation.go backend/internal/api/profile_endpoint_validation.go backend/internal/api/profile_endpoint_validation_test.go backend/internal/store/store_portable.go backend/internal/store/store_portable_test.go backend/internal/api/handlers_server_portable_apply.go backend/internal/api/handlers_server_portable_entities.go backend/internal/api/handlers_server_portable_flow_test.go`: applied successfully.
- `cd backend && go test ./internal/profileendpoint ./internal/api ./internal/store -run 'TestValidateProfileEndpointURL|TestValidateProfileTLSSkipVerifyEndpoint|TestHandle(Create|Update)Profile.*Endpoint|TestHandle(Create|Update)Profile.*TLSSkipVerify|TestPrepareCreateProfileRequest|TestValidatePreparedUpdateProfileRequest|TestImportPortableEntityFilesReplaceRejectsUnsafePortableProfileEndpoints|TestImportPortableEntityFilesReplaceRejectsUnsafeGcpServiceAccountTokenURI|TestValidatePortableEntityFilesWithOptionsAppliesAllowRemoteEndpointPolicy|TestValidatePortableEntityFilesRejectsTLSSkipVerifyWithoutPortableEndpoint|TestBuildPortableImportResponseRejectsLocalhostPortableEndpointWhenRemoteEnabled' -count=1`: passed.
- `python3 scripts/check_github_workflows.py`: passed.
- `git diff --check`: passed.

## Twenty-Fifth Current Expert Sub-Agent Pass

This pass continued the expert sub-agent backlog by closing the remaining local frontend accessibility issue from the previous pass: the docked Objects tree/details resize handles were pointer-only controls.

### Additional Findings

- Frontend/Accessibility: docked Objects tree and details resize handles were visually draggable but not focusable, not exposed as separators, and had no keyboard resize path.
- Frontend/Accessibility: the resize state already had reliable min/max clamping, so the lowest-risk fix was to expose the existing layout constraints through ARIA and keyboard handlers instead of introducing a parallel resize model.
- Release/Compliance: the project still has release-blocking work that cannot be completed locally without a selected release candidate and external evidence capture: provider-live evidence, reverse-proxy smoke evidence, backup-portable smoke evidence, image package license scanning, Helm publish ordering, and stale/duplicate GitHub check-run handling.

### Improvements Applied

- Added keyboard resize handlers to `useObjectsLayout` for the Objects tree and details panes.
- Added Arrow key resizing, larger Shift+Arrow steps, and Home/End min/max jumps while preserving the existing width clamp behavior.
- Exposed tree/details resize constraints from the layout hook into the pane props.
- Converted the docked tree/details resize handles to focusable `role="separator"` controls with `aria-orientation`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and descriptive labels.
- Kept the collapsed details spacer hidden from assistive technology while preserving the existing collapsed layout.
- Added regression coverage for keyboard resizing, tree separator semantics, details separator semantics, and the collapsed details spacer.

### Remaining Limitations

- Runtime endpoint SSRF hardening still needs a shared guarded egress layer with DNS/IP validation, redirect revalidation, explicit private-range allowlisting, provider SDK/client integration, and rclone/OCI launch-time checks.
- Portable endpoint validation was improved for GCP token URIs only in this pass; S3-compatible/Azure/GCS/OCI endpoint validation was addressed in the Twenty-Sixth Current Expert Sub-Agent Pass.
- Release readiness remains blocked until a real candidate id is selected and provider-live, reverse-proxy, and backup-portable evidence are recorded for that candidate.
- Release image package license scanning, Go license allow-listing, stale/duplicate GitHub check-run handling, and Helm chart publish ordering remain open release-compliance follow-ups.
- Full `./scripts/check.sh full` was not run in this pass.

### Twenty-Fifth-Current-Pass Validation

- `cd frontend && npx vitest run src/pages/objects/__tests__/useObjectsLayout.test.tsx src/pages/objects/__tests__/ObjectsTreePanel.test.tsx src/pages/objects/__tests__/ObjectsDetailsPanel.test.tsx`: passed, 17 tests.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `git diff --check`: passed.

## Twenty-Fourth Current Expert Sub-Agent Pass

This pass continued after the interrupted run and re-used the four expert sub-agent findings across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. I applied the next locally verifiable frontend accessibility and backend GCS auth hardening items.

### Additional Findings

- Backend/Security: GCS IAM still used raw service-account `token_uri`, and store/portable profile writes could still persist unsafe GCP service-account token endpoints outside the API request-preparation path.
- Backend/Security: portable import still needs shared endpoint URL validation for S3-compatible/Azure/GCS custom endpoints, beyond the GCP token URI validation added here.
- Frontend/Accessibility: `HelpTooltip` still used a focusable span instead of a native button, lacked Escape dismiss behavior, and had a 16px target.
- Frontend/Accessibility: `SimpleTree` mobile sizing applied only to viewport width; coarse-pointer tablet layouts between mobile and desktop could still receive 18px expand/collapse targets.
- Frontend/Accessibility: docked Objects tree/details resize handles remain pointer-only and need focusable `role="separator"` controls with keyboard resizing.
- DevOps/Release: Helm chart publication can still occur before published-image smoke, release image package license scanning is still absent, GitHub check-run verification still needs duplicate/stale run handling, and Go license auditing still needs a positive allow-list.
- Docs/Release: the evidence checklist still points at stale `0.21v-rc3` while `HEAD` differs, and live provider/reverse-proxy/backup-portable evidence remains absent.

### Improvements Applied

- Reused `gcsauth.NormalizeTokenURI` in the GCS IAM runtime token-fetch path, matching the GCS bucket metadata path.
- Added store-level GCP service-account token URI validation for direct `CreateProfile` and `UpdateProfile` calls, so non-HTTP callers cannot persist unsafe token endpoints.
- Added portable GCP profile validation for service-account `token_uri`, rejecting unsafe token endpoints before portable entity replacement.
- Added backend regression coverage for unsafe GCP `token_uri` rejection in store create/update and portable import paths.
- Converted `HelpTooltip` trigger to a native `button type="button"`, added stable `aria-describedby` linkage while visible, Escape dismissal, and a 24px base target.
- Added coarse-pointer CSS rules so `SimpleTree` rows, toggle buttons, and toggle spacers keep 44px touch targets independent of viewport width.
- Extended `HelpTooltip` tests for button semantics, tooltip linkage, and Escape dismissal; re-ran object tree tests to cover the shared SimpleTree surface.

### Remaining Limitations

- Runtime endpoint SSRF hardening still needs shared dial-time DNS/IP checks and redirect revalidation across provider clients and rclone launch paths.
- Portable endpoint validation is improved for GCP token URIs only; S3-compatible/Azure/GCS custom endpoint validation still needs a shared validator outside the API package.
- Objects docked pane resize handles still needed keyboard-accessible separators in this pass; this was addressed in the Twenty-Fifth Current Expert Sub-Agent Pass.
- Release readiness remains blocked until a real candidate id is selected and provider-live, reverse-proxy, and backup-portable evidence are recorded for that candidate.
- Release image package license scanning, Go license allow-listing, stale/duplicate GitHub check-run handling, and Helm chart publish ordering remain open release-compliance follow-ups.
- Full `./scripts/check.sh full` was not run in this pass.

### Twenty-Fourth-Current-Pass Validation

- `cd frontend && npx vitest run src/components/__tests__/HelpTooltip.test.tsx src/pages/objects/__tests__/ObjectsTreeView.test.tsx`: passed, 11 tests.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `gofmt -w backend/internal/gcsiam/gcsiam.go backend/internal/store/store_portable.go backend/internal/store/store_profiles.go backend/internal/store/store_portable_test.go backend/internal/store/store_profiles_test.go`: applied successfully.
- `cd backend && go test ./internal/gcsauth ./internal/gcsiam ./internal/gcsbucket ./internal/api ./internal/store -run 'TestNormalizeTokenURI|TestValidateServiceAccountJSON|TestPrepareCreateProfileRequest_RejectsUnsafeGcpServiceAccountTokenURI|TestValidatePreparedUpdateProfileRequest_RejectsUnsafeGcpServiceAccountTokenURI|TestCreateProfileGcpRejectsUnsafeServiceAccountTokenURI|TestUpdateProfileGcpRejectsUnsafeServiceAccountTokenURI|TestImportPortableEntityFilesReplaceRejectsUnsafeGcpServiceAccountTokenURI' -count=1`: passed.
- `git diff --check`: passed.

## Twenty-Third Current Expert Sub-Agent Pass

This pass re-ran four expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. I applied the locally verifiable security and accessibility fixes that did not require a new release candidate, external provider credentials, or release artifact publication.

### Additional Findings

- Backend/Security: GCP service account `token_uri` was accepted from profile input and used at runtime for OAuth token POSTs, making normal GCS profile flows capable of targeting metadata/internal URLs.
- Backend/Security: endpoint SSRF protection still runs mainly at save time; runtime provider clients and rclone paths still need dial-time DNS/IP and redirect revalidation.
- Backend/Security: provider control-plane clients still use unbounded `io.ReadAll` for some S3/Azure/GCS responses, and upload session prefixes still need stricter object-key-boundary validation.
- Frontend/Accessibility: destructive confirmation dialogs focused Close instead of the required confirmation input, upload selection summaries were visual-only, and transfer queues lacked list/listitem boundaries.
- Frontend/Accessibility: `SimpleTree` coarse-pointer hit targets and `HelpTooltip` trigger semantics remain incomplete.
- DevOps/Release: release image package license scanning is still missing for Alpine/rclone runtime content, GitHub check-run verification can still be confused by stale/duplicate runs, Helm chart publication can still race ahead of published-image smoke, and Go license auditing still lacks a positive allow-list.
- Docs/Release: the current evidence checklist still points at stale `0.21v-rc3` candidate identity while `HEAD` differs from that tag, required provider/reverse-proxy/backup-portable evidence files are still absent, historical docs still expose stale `rc1` guidance, and `.env` tracking conflicts with docs that tell operators to edit `.env`.

### Improvements Applied

- Added `backend/internal/gcsauth` with GCP OAuth token URI normalization/validation that only permits `https://oauth2.googleapis.com/token`.
- Wired GCP service-account token URI validation into profile create/update request preparation and the GCS runtime token-fetch path.
- Added backend regression tests for unsafe GCP `token_uri` rejection during create/update and for the shared token URI validator.
- Connected `ConfirmDangerDialog` to `DialogModal.initialFocusSelector` through a stable input selector so the required confirmation textbox receives initial focus.
- Added an upload selection `role="status"` live region for count, size, destination, and detected type updates.
- Exposed transfer queues as named lists and transfer rows as named listitems for upload/download queues.
- Extended focused frontend tests for confirmation focus, upload selection live-region semantics, and transfer queue list/listitem semantics.

### Remaining Limitations

- GCP token URI SSRF is blocked, but the broader runtime outbound-transport hardening still needs dial-time DNS/IP policy checks, redirect revalidation, and rclone launch-time enforcement.
- Multipart completion verification, multipart abort reservation cleanup, portable import endpoint validation, portable asset atomicity, and rclone process limiting remain open backend follow-ups.
- `SimpleTree` coarse-pointer target sizing and `HelpTooltip` button/escape/description semantics remain open frontend follow-ups.
- Release readiness remains blocked until a real candidate id is selected and provider-live, reverse-proxy, and backup-portable evidence are recorded for that candidate.
- Release image package license scanning, Go license allow-listing, stale/duplicate GitHub check-run handling, and structural GitLab publish-DAG validation remain open release-compliance follow-ups.
- Full `./scripts/check.sh full` was not run in this pass.

### Twenty-Third-Current-Pass Validation

- `gofmt -w backend/internal/gcsauth/token_uri.go backend/internal/gcsauth/token_uri_test.go backend/internal/api/handlers_profiles_request.go backend/internal/api/handlers_profiles_request_test.go backend/internal/gcsbucket/gcsbucket.go`: applied successfully.
- `cd backend && go test ./internal/gcsauth ./internal/api ./internal/gcsbucket -run 'TestNormalizeTokenURI|TestValidateServiceAccountJSON|TestPrepareCreateProfileRequest_RejectsUnsafeGcpServiceAccountTokenURI|TestValidatePreparedUpdateProfileRequest_RejectsUnsafeGcpServiceAccountTokenURI|TestResolveBearerToken' -count=1`: passed.
- `cd frontend && npx vitest run src/lib/__tests__/ConfirmDangerDialog.test.tsx src/pages/uploads/__tests__/UploadsSelectionSection.test.tsx src/components/transfers/__tests__/TransfersDrawer.test.tsx src/components/transfers/__tests__/TransferUploadRow.test.tsx src/components/transfers/__tests__/TransferDownloadRow.test.tsx`: passed, 15 tests.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `git diff --check`: passed.

## Twenty-Second Current Expert Sub-Agent Pass

This pass re-ran four expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. I applied the frontend accessibility fixes that were low-risk and locally verifiable, and recorded the higher-risk backend and release findings for a dedicated follow-up.

### Additional Findings

- Backend/Security: portable import still bypasses the normal profile endpoint SSRF validation path, so imported S3-compatible endpoints can reach stored runtime clients without the same API create/update checks.
- Backend/Security: multipart completion still trusts the caller-supplied part manifest instead of provider-listed part coverage, size, and ETag evidence before finalizing remote multipart objects.
- Backend/Security: multipart abort can leave upload object rows and reserved byte accounting behind, portable asset apply remains DB-atomic but filesystem-non-atomic, and API-triggered rclone subprocess fan-out is not globally bounded.
- Frontend/Accessibility: Objects tree prerequisite/loading/empty statuses were visual-only live changes, and the Jobs virtual table did not expose total row count or virtualized row indexes to assistive technology.
- Frontend/Accessibility: destructive confirmation dialogs still initially focus the close control, desktop tree expand targets remain small, upload selection summaries are visual-only, transfer queues lack list semantics, and the help tooltip trigger remains a focusable span.
- DevOps/Release: runtime license audit still does not cover Alpine/rclone packages in built images, generated notices disagree with optional-runtime audit scope, Go license policy is deny-regex-based instead of allow-list-based, and npm license checking still allows `UNLICENSED` while using an unpinned `npx` tool fetch.
- DevOps/Release: GitHub readiness can still trust stale or ambiguous check runs, the license-audit workflow lacks a tag trigger, and the publish-DAG guard still relies on grep-like assertions rather than parsed GitLab YAML structure.
- Docs/Release: the current evidence checklist still labels post-tag evidence as `0.21v-rc3` even though `HEAD` differs from that tag, provider/reverse-proxy/backup-portable live evidence is absent, and retained historical reports still include stale `rc1` current-guidance.

### Improvements Applied

- Added `role="status"`, `aria-live="polite"`, and `aria-atomic="true"` to non-error `ObjectsPaneStatus` states while preserving `role="alert"` for error states.
- Extended Objects tree tests so prerequisite, loading, empty, and error statuses verify the expected live-region and alert semantics.
- Added `aria-rowcount` to `JobsVirtualTable`, exposed the header row and virtualized data rows with stable `aria-rowindex` values, and stopped applying `aria-sort` to non-sortable column headers.
- Added Jobs virtual table coverage with a deterministic virtualizer mock so row-count, row-index, sortable header, and non-sortable header semantics are regression-tested.

### Remaining Limitations

- The backend/security findings in this pass were recorded but not implemented; portable endpoint validation, multipart completion verification, multipart abort accounting cleanup, portable asset atomicity, and rclone process limiting remain open.
- Release readiness remains blocked until a real candidate id is selected and provider-live, reverse-proxy, and backup-portable evidence are recorded for that candidate.
- Runtime image license scanning, Go license allow-listing, GitHub check-run disambiguation, and structural GitLab publish-DAG validation need a broader release-compliance pass.
- Frontend follow-ups remain for destructive dialog initial focus, desktop tree hit-target sizing, upload selection announcements, transfer queue list semantics, tooltip trigger semantics, true tree behavior, keyboard resizing, and context-menu keyboard invocation.
- Full `./scripts/check.sh full` was not run in this pass.

### Twenty-Second-Current-Pass Validation

- `cd frontend && npx vitest run src/pages/objects/__tests__/ObjectsTreeView.test.tsx src/pages/jobs/__tests__/JobsVirtualTable.test.tsx`: passed, 7 tests.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `git diff --check`: passed.

## Twenty-First Current Expert Sub-Agent Pass

This pass re-ran four expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing. I applied the release-readiness and accessibility fixes that were locally verifiable without choosing a release candidate or requiring live provider credentials.

### Additional Findings

- Backend/Security: multipart completion can still complete remote multipart objects before exact part coverage/size verification, so rejected commits can leave finalized objects.
- Backend/Security: download proxy URLs still trust signed metadata derived from caller-supplied query values, and endpoint SSRF validation remains save-time rather than runtime DNS/IP guarded.
- Frontend/Accessibility: docked Objects pane resize handles remain pointer-only; `SimpleTree`, Jobs virtual table virtualization semantics, and Objects context-menu keyboard invocation still need deeper accessibility work.
- DevOps/Release: runtime license audit existed but was not a publish blocker, and making `license-audit` a required GitHub check would fail for non-dependency commits while the workflow remained path-scoped.
- DevOps/Release: Helm Kubernetes smoke is still not a release-publish gate, release artifacts still do not expose verifiable tag/commit identity, and Helm chart publish can still happen before post-publish remote image smoke.
- Docs/Release: candidate identity and required provider/reverse-proxy/backup-portable evidence remain release-blocking, and some retained reports still contain stale `rc1` current-guidance wording.

### Improvements Applied

- Added a GitLab `license_audit_runtime` job that runs on release tags and dependency/license-relevant changes with `bash scripts/license-audit.sh runtime-only`.
- Made `publish_dockerhub` depend on `license_audit_runtime`, so Docker Hub publication cannot bypass runtime license audit in tag pipelines.
- Added `license-audit` to `scripts/verify_release_readiness.sh` default required GitHub checks.
- Removed path filters from `.github/workflows/license-audit.yml` so the required `license-audit` check materializes for every PR/main candidate, including non-dependency changes.
- Updated release gate assertions and docs to enforce the license-audit publish blocker and non-path-scoped GitHub workflow contract.
- Adjusted `scripts/license-audit.sh runtime-only` to restore the full npm install after the optional-dependency-omitted audit, preventing the audit from leaving local `node_modules` without Rollup's native optional package.
- Added accessible `role="status"`, `aria-live="polite"`, labels, and sr-only text for route loading, bucket loading, empty object-list loading, and object preview loading spinners.
- Added focused frontend tests for those loading announcements.

### Remaining Limitations

- Backend multipart completion, presigned oversized object cleanup, portable import quiescing/asset atomicity, and runtime SSRF protection remain unresolved.
- Release readiness remains blocked until a real candidate id is chosen and provider-live, reverse-proxy, and backup-portable evidence are recorded for that candidate.
- Helm release smoke gating, release image/chart identity, and chart publish ordering still need broader CI/release design changes.
- Objects pane keyboard resizing, `SimpleTree` ARIA tree behavior, Jobs virtual table row-count semantics, and keyboard context-menu invocation remain frontend accessibility follow-ups.
- Retained release reports that mention `rc1` still need historical/superseded notes.

### Twenty-First-Current-Pass Validation

- `bash -n scripts/check_ci_pair.sh scripts/check_release_gate.sh scripts/verify_release_readiness.sh scripts/license-audit.sh scripts/ci_podman_compose.sh`: passed.
- `python3 scripts/check_github_workflows.py`: passed.
- GitLab and changed GitHub workflow YAML parsed successfully with PyYAML.
- `cd frontend && npx vitest run src/__tests__/FullAppContentHost.test.tsx src/pages/buckets/__tests__/BucketsPageShell.test.tsx src/pages/objects/__tests__/ObjectsListContent.test.tsx src/pages/objects/__tests__/ObjectsDetailsContent.test.tsx`: passed, 12 tests.
- `bash scripts/license-audit.sh runtime-only`: passed; the script still reports expected go-licenses warnings and the runtime-only ffmpeg-static working-tree warning.
- `cd frontend && npx vitest run src/components/transfers/__tests__/uploadRuntimeTask.test.ts src/components/transfers/__tests__/TransferUploadRow.test.tsx src/pages/__tests__/SettingsPage.test.tsx`: passed, 16 tests, after rerunning outside the earlier concurrent npm install.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.
- Full `./scripts/check.sh full` was not run in this pass.

## Twentieth Current Expert Sub-Agent Pass

This pass started four expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing. The frontend, DevOps, and docs agents completed read-only reviews; the backend/security agent did not return findings before shutdown, so backend follow-ups remain based on the previous known multipart and portable-import risks.

### Additional Findings

- Frontend/Transfers: resumable upload preflight failures could return while the task was already in `staging`, leaving the row active and hiding the retry path.
- Frontend/Settings: the Backend API Token field applied edits on blur, which could commit an auth-token draft by tabbing or clicking away.
- Frontend/Accessibility: `SimpleTree` still needs full ARIA tree semantics, and several loading spinners still need `role="status"`/live announcements.
- DevOps/Release: `govulncheck`, `go-licenses`, and `podman-compose` installs were still mutable or unpinned, making release/security results drift over time.
- DevOps/Release: Docker Hub publish can still bypass some tag-pipeline verification lanes, Helm runtime smokes remain opt-in for release tags, release artifacts still lack verifiable tag/commit identity, and license audit is not yet a release-publish blocker.
- Docs/Testing: several retained docs still pointed at deleted `frontend/tests/responsive-lists.spec.ts` instead of the current mobile-responsive command.
- Docs/Release: current release evidence remains stale or absent for the actual candidate; `.env` guidance still needs a repository-policy decision because `.env` is tracked.

### Improvements Applied

- Pinned GitLab `GOVULNCHECK_VERSION` to `v1.1.4`, matching the repo security-tool installer.
- Added `PODMAN_COMPOSE_VERSION=1.5.0` and used `podman-compose==${PODMAN_COMPOSE_VERSION}` in GitLab release image smoke and `scripts/ci_podman_compose.sh`.
- Added `GO_LICENSES_VERSION=v1.6.0` to `scripts/license-audit.sh` and removed `go-licenses@latest`.
- Extended `scripts/check_release_gate.sh`, `docs/RELEASE_GATE.md`, and `docs/TESTING.md` so release/security tool pinning remains an enforced contract.
- Marked resumable upload preflight validation failures as `failed`, with `finishedAtMs` and the persisted error message, before returning.
- Removed API-token apply-on-blur in Settings; token edits now apply only through the explicit Apply button or Enter.
- Replaced deleted `responsive-lists.spec.ts` references with the current `npm run test:e2e:mobile-responsive` guidance in retained mobile/webview/E2E docs.

### Remaining Limitations

- Backend direct multipart cleanup, atomic byte reservation, and portable import maintenance/drain guard remain unresolved from prior passes.
- Release readiness remains blocked until the candidate identity is chosen and provider-live, reverse-proxy, and backup-portable evidence are recorded for that exact candidate.
- Docker Hub publish dependencies, release-tag Helm smoke requirements, artifact version identity, and release-blocking license audit still need broader CI/release design changes.
- `SimpleTree` ARIA tree behavior and screen-reader loading announcements remain frontend accessibility follow-ups.
- `.env` handling needs a policy-level fix: untrack/ignore it or change operator docs and scripts to use an ignored local env file.

### Twentieth-Current-Pass Validation

- `go list -m -versions github.com/google/go-licenses`: verified `v1.6.0` exists.
- `python3 -m pip index versions podman-compose`: verified `1.5.0` exists and is current in this environment.
- `go list -m -versions golang.org/x/vuln`: verified `v1.1.4` remains a valid `govulncheck` module version.
- `bash -n scripts/ci_podman_compose.sh scripts/license-audit.sh scripts/check_release_gate.sh scripts/deploy_compose_release.sh scripts/verify_release_readiness.sh`: passed.
- `python3 scripts/check_github_workflows.py`: passed.
- `rg -n "responsive-lists\\.spec" docs frontend/docs notes`: no matches.
- `cd frontend && npx vitest run src/components/transfers/__tests__/uploadRuntimeTask.test.ts src/components/transfers/__tests__/TransferUploadRow.test.tsx src/pages/__tests__/SettingsPage.test.tsx`: passed, 16 tests.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- GitLab and changed GitHub workflow YAML parsed successfully with PyYAML.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.
- Full `./scripts/check.sh full` was not run in this pass.

## Nineteenth Current Expert Sub-Agent Pass

This pass re-ran four expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing. I applied the small, locally verifiable fixes and kept broader storage, release-evidence, and infrastructure changes as follow-up.

### Additional Findings

- Backend/Security: portable import validated profile references, but `upload_multipart_uploads` and `upload_objects` rows could reference missing upload sessions or drift from the imported session bucket/prefix.
- Backend/Security: direct multipart form uploads can still stream to rclone before `UploadMaxBytes` is enforced, which can leave an over-limit remote object outside local tracking.
- Backend/Security: direct multipart chunk reservation still needs rollback/cleanup semantics on upload failure, and portable replacement still needs a maintenance guard against live jobs/uploads.
- Frontend/Accessibility: the Jobs Columns dialog-like popover closed on `Tab`, preventing keyboard users from traversing the checkbox list normally.
- Frontend/Accessibility: object custom context-menu focus/positioning, `SimpleTree` tree semantics, and Jobs virtual table scroll/table semantics still need follow-up.
- DevOps/Release: GitHub `Frontend E2E` required lanes could self-skip when browser-impacting backend runtime paths or the workflow itself changed.
- DevOps/Release: Compose release deploys relied on live `ssh-keyscan` fallback instead of requiring a protected known-hosts source.
- Docs/Testing: release evidence remains incomplete for provider-live, reverse-proxy, and backup-portable scopes, and the live checklist still needs an exact candidate id or HEAD SHA decision.
- Docs/Testing: tracked `.env` editing guidance, stale fixed-sleep report wording, webview/manual QA evidence gaps, and broken retained-report links remain documentation follow-ups.

### Improvements Applied

- Extended `.github/workflows/frontend-e2e.yml` browser-facing path filters to include workflow self-changes and backend jobs/store/localpath/redaction paths that affect browser runtime behavior.
- Updated release/testing docs and `scripts/check_release_gate.sh` so the browser-facing filter contract remains enforced.
- Removed Compose deploy live host-key scanning; deploys now require `DEPLOY_SSH_KNOWN_HOSTS`, a populated `~/.ssh/known_hosts`, and strict host-key checking.
- Updated deployment checklist and release/testing docs to document the protected known-hosts requirement.
- Added portable upload row/session validation so multipart uploads and upload objects must reference an imported upload session with matching profile, upload id, bucket, and prefix.
- Added backend regression coverage for missing upload-session references and upload objects outside the session prefix.
- Added `PopoverSurface.closeOnTab` and used it for the Jobs Columns popover so dialog-like checkbox content remains open during keyboard traversal.
- Added frontend regression coverage for the reusable popover contract and Jobs Columns `Tab` behavior.

### Remaining Limitations

- Direct multipart remote-object cleanup and atomic byte reservation remain unresolved storage-consistency work.
- Portable import still needs a maintenance-mode/drain guard and DB-plus-asset atomicity for destructive replacement.
- Release readiness is still blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, reverse-proxy smoke evidence, and backup-portable smoke evidence are recorded for the actual candidate.
- GitLab Helm smoke image selection for chart/k8s-only changes, unpinned release/security tooling, and automatic GitLab release-contract checks remain DevOps follow-ups.
- Object context-menu keyboard behavior, `SimpleTree` semantics, and Jobs virtual table semantic polish remain frontend follow-ups.
- README `.env` handling and retained-report evidence links still need documentation cleanup.

### Nineteenth-Current-Pass Validation

- `gofmt -w backend/internal/store/store_portable.go backend/internal/store/store_portable_test.go`: applied successfully.
- `bash -n scripts/deploy_compose_release.sh scripts/check_release_gate.sh scripts/verify_release_readiness.sh`: passed.
- `python3 scripts/check_github_workflows.py`: passed.
- `cd backend && go test ./internal/store -run 'TestImportPortableEntityFilesReplaceRejects(MultipartRowsMissingUploadSession|UploadObjectsOutsideSessionPrefix|UnknownPortableEntityFields)' -count=1`: passed.
- `cd backend && go test ./internal/store`: passed.
- `cd frontend && npx vitest run src/components/__tests__/PopoverSurface.test.tsx src/pages/jobs/__tests__/JobsToolbar.test.tsx`: passed, 13 tests.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.
- Full `./scripts/check.sh full` was not run in this pass.

## Eighteenth Current Expert Sub-Agent Pass

This pass re-ran four read-only expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. I implemented the small, locally verifiable fixes and kept larger operational design work as follow-up.

### Additional Findings

- Backend/Security: portable import preflight verified entity checksums/counts, but did not reuse the strict portable row schema validation used by destructive replace; unknown JSONL fields could still pass preview and fail only at apply time.
- Backend/Security: portable import can still interleave with live job execution, API mutations, and active uploads; a robust fix needs a shared maintenance/import guard and job/upload drain semantics.
- Backend/Security: portable import commits DB rows before thumbnail asset application, so asset-copy failure can leave a replaced DB with missing or partial thumbnail assets.
- Frontend/Accessibility: object toolbar and selection-bar action menu triggers did not consistently expose `aria-haspopup="menu"` and expanded state.
- Frontend/Accessibility: object pane resize handles are still pointer-only and need keyboard-operable separator semantics.
- DevOps/Release: reverse-proxy evidence accepted pass-like text for `Signed proxy URL root`, so a concrete URL-root match was not actually required.
- DevOps/Release: GitHub Release publish preflight accepted any `/compare/` link instead of requiring the exact `base...tag` comparison for the release candidate.
- Docs/Testing: current release evidence/checklist references still need an actual candidate id or exact HEAD SHA instead of stale `0.21v-rc3`, and several required report/template files remain untracked in the worktree.

### Improvements Applied

- Added `store.ValidatePortableEntityFiles` and reused the same strict portable row parsing/reference validation from import replace during portable import preflight.
- Added a portable preflight regression test that blocks unknown JSONL entity fields before import apply.
- Tightened reverse-proxy evidence validation so `Signed proxy URL root` must match `Expected external base URL` as a concrete normalized URL, not a pass-like phrase.
- Updated reverse-proxy evidence template wording to collect the concrete signed proxy URL root.
- Added release-evidence regression coverage for pass-like signed-root rejection.
- Tightened GitHub Release publish readiness so the release body must include the expected `/compare/<base>...<tag>` link.
- Added menu disclosure semantics to object toolbar and selection-bar action triggers, with focused frontend tests.

### Remaining Limitations

- Portable import still needs a larger maintenance-mode guard to block or drain live jobs, active uploads, and mutating APIs during destructive replacement.
- Portable DB replacement and asset application are still not fully atomic; thumbnail asset copy should move to a staged/swap flow or rollback-capable flow.
- Object pane resize handles still need keyboard-accessible separator behavior.
- Compose deploy still needs stricter host-key handling; relying on live `ssh-keyscan` remains a deployment hardening gap.
- Frontend E2E workflow path filters still need review so backend jobs/store/localpath/redaction changes cannot incorrectly skip browser-facing lanes.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, reverse-proxy smoke evidence, and backup-portable smoke evidence are recorded for the actual candidate.

### Eighteenth-Pass Validation

- `gofmt -w backend/internal/store/store_portable.go backend/internal/api/handlers_server_portable_entities.go backend/internal/api/handlers_server_portable_entities_test.go`: applied successfully.
- `bash -n scripts/verify_release_readiness.sh scripts/check_release_gate.sh`: passed.
- `cd backend && go test ./internal/api -run 'TestBuildPortableImportEntityVerification|TestVerifyPortable|TestVerifyServerRestorePayload' -count=1`: passed.
- `cd backend && go test ./internal/store -run 'TestImportPortableEntityFilesReplace' -count=1`: passed.
- `python3 scripts/check_release_evidence_test.py`: passed, 42 tests.
- `cd frontend && npx vitest run src/pages/objects/__tests__/ObjectsToolbar.test.tsx src/pages/objects/__tests__/ObjectsSelectionBar.test.tsx`: passed, 6 tests.
- `cd backend && go test ./internal/api ./internal/store`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Seventeenth Current Expert Sub-Agent Pass

This pass re-ran four read-only expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. I also performed a local backend portable-import review and implemented the findings that were locally verifiable without creating live release evidence.

### Additional Findings

- Backend/Security: portable imports could extract and later apply thumbnail assets without requiring a portable v1 payload checksum summary, and without comparing extracted thumbnail entries to `manifest.Assets["thumbnails"]`.
- Backend/Data Integrity: portable profile import accepted legacy `oci_s3_compat` provider rows but persisted the legacy provider string instead of normalizing it at the destructive replace boundary.
- Frontend/Accessibility: the desktop `Settings` trigger opened a dialog/drawer but exposed no `aria-haspopup`, `aria-expanded`, or stable `aria-controls` relationship.
- DevOps/Release: GitLab tag publication verified that a GitHub Release existed and was not a draft, but did not block empty/wrong release notes, missing `Full Changelog` compare links, or the wrong prerelease flag for RC tags.
- Docs/Release: deployment checklist wording still documented only provider/reverse-proxy evidence as readiness blockers, while the checker also blocks on backup-portable smoke evidence.

### Improvements Applied

- Required portable format v1 imports to carry a payload checksum summary and made payload file-count, byte-count, and checksum mismatches fail during extraction before preview/import can continue.
- Added thumbnail asset manifest verification for portable imports; extracted `assets/thumbnails/` entries now must match manifest file count, bytes, and checksum before assets can be applied.
- Normalized imported legacy `oci_s3_compat` portable profile rows to `s3_compatible` before inserting replacement profile rows.
- Added focused backend regression tests for required portable payload checksums, thumbnail asset manifest mismatch rejection, and legacy portable provider normalization.
- Added stable app-shell drawer IDs, connected the desktop `Settings` button to the settings drawer with dialog disclosure ARIA, and extended the desktop header smoke test.
- Hardened `scripts/verify_release_readiness.sh` so GitLab publish preflight rejects GitHub Releases with empty bodies, missing `Full Changelog` compare links, missing Markdown sections, or incorrect prerelease flags.
- Updated release gate/testing docs, deployment checklist wording, and release-gate static assertions to include backup-portable evidence and the stronger GitHub Release-page contract.

### Remaining Limitations

- Portable clear-bundle authenticity still depends on the configured HMAC/password path; this pass strengthens internal payload/asset integrity checks but does not require HMAC for every clear portable bundle.
- Portable import still needs shared API-equivalent endpoint validation for all endpoint-bearing profile fields.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, reverse-proxy smoke evidence, and backup-portable smoke evidence are recorded for the actual candidate.
- `scripts/verify_release_readiness.sh` still depends on live GitHub API responses for end-to-end validation; this pass covered syntax and release-gate static assertions, not a mocked network execution path.

### Seventeenth-Pass Validation

- `gofmt -w backend/internal/store/store_portable.go backend/internal/store/store_portable_test.go backend/internal/api/handlers_server_restore_verify.go backend/internal/api/handlers_server_restore_verify_test.go backend/internal/api/handlers_server_portable.go`: applied successfully.
- `bash -n scripts/verify_release_readiness.sh scripts/check_release_gate.sh`: passed.
- `cd backend && go test ./internal/store -run 'TestImportPortableEntityFilesReplace(NormalizesLegacyProfileProvider|RejectsInvalidPortableProfileProvider|RejectsMalformedProviderConfig)' -count=1`: passed.
- `cd backend && go test ./internal/api -run 'TestVerifyPortable|TestVerifyServerRestorePayload|TestBuildPortableImportResponse|TestPortableImportPreflightService|TestApplyPortableImportPayload' -count=1`: passed.
- `cd backend && go test ./internal/api -run 'TestVerifyPortable|TestVerifyServerRestorePayload' -count=1`: passed after final asset-manifest checksum tightening.
- `cd frontend && npx vitest run src/__tests__/FullAppInner.smoke.test.tsx -t 'keeps inline settings and logout actions on desktop'`: passed, 1 focused test.
- `python3 scripts/check_release_readiness_test.py`: passed, 12 tests.
- `cd backend && go test ./internal/api ./internal/store`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `bash ./scripts/check_release_gate.sh`: passed.
- `git diff --check`: passed.

## Sixteenth Current Expert Sub-Agent Pass

This pass re-ran four read-only expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. I implemented the findings that were locally verifiable without creating live release evidence.

### Additional Findings

- Backend/Security: portable JSONL parsing accepted unknown entity fields, so malformed or forward-drifted bundle rows could be silently truncated before replacement.
- Backend/Security: portable import treated manifest entity-count mismatches as post-import warnings instead of preflight blockers, allowing a signed bundle to misrepresent import counts before destructive replacement.
- Frontend/Accessibility: the compact header `More actions` trigger exposed no menu disclosure semantics.
- Frontend/Accessibility: Objects `Ctrl/Cmd+K` command palette could open over an existing dialog/drawer because it did not check the shared overlay stack.
- DevOps/Release: GitLab deploy jobs ran scripts that require `curl`, `git`, and `python3`, but deploy job images did not install the full preflight toolchain.
- Docs/Testing: `REVERSE_PROXY_SMOKE_TEMPLATE.md` still listed template-only fields that generated evidence and strict validation do not require.

### Improvements Applied

- Enabled strict JSON decoding for portable entity JSONL rows and added a store regression test that rejects unknown imported entity fields before DB replacement.
- Added portable entity row-count verification during import preflight; manifest count mismatches now become blockers before `replaceEntities`.
- Added unit coverage for portable manifest count mismatch blockers.
- Added `aria-haspopup="menu"` and `aria-expanded` to the compact header `More actions` trigger, with header smoke coverage.
- Blocked Objects command palette global `Ctrl/Cmd+K` opening while another overlay layer is active, while preserving normal toggle behavior when no overlay is open.
- Added command-palette overlay-stack regression coverage.
- Installed the missing GitLab deploy preflight tools for compose and Helm deploy jobs and added release-gate assertions for those toolchains.
- Removed reverse-proxy evidence template-only metadata fields and added release-gate assertions so they do not drift back from generated/strict evidence shape.

### Remaining Limitations

- Portable HMAC still does not sign the full `entities` and `assets` metadata maps; count mismatch is now blocked, but broader signed-metadata coverage remains a future hardening step.
- Imported profile endpoints still need shared API-equivalent endpoint validation for all endpoint-bearing fields.
- Runtime SSRF still needs dial-level DNS/IP validation and redirect revalidation.
- Direct form upload and presigned upload size enforcement still need stronger object-store-side bounds or cleanup/promotion semantics.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, reverse-proxy smoke evidence, and backup-portable smoke evidence are recorded for the actual candidate.

### Sixteenth-Pass Validation

- `cd backend && go test ./internal/api ./internal/store`: passed.
- `cd frontend && npx vitest run src/__tests__/FullAppInner.smoke.test.tsx src/pages/objects/__tests__/useObjectsCommandPaletteOverlayState.test.tsx`: passed, 6 tests.
- `python3 scripts/check_release_evidence_test.py`: passed, 41 tests.
- `python3 scripts/check_release_evidence_checklist_test.py`: passed, 17 tests.
- `python3 scripts/check_release_readiness_test.py`: passed, 12 tests.
- `bash -n scripts/check_release_gate.sh scripts/deploy_compose_release.sh scripts/deploy_helm_release.sh scripts/verify_release_readiness.sh`: passed.
- GitHub/GitLab workflow YAML parse: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `git diff --check`: passed.
- `python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc3`: failed as expected because live provider, reverse-proxy, and backup-portable evidence files are still missing for that candidate.

## Fifteenth Current Expert Sub-Agent Pass

This pass re-ran four read-only expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. I implemented the findings that were locally verifiable in the current worktree.

### Additional Findings

- Backend/Security: restore and portable import capped the compressed multipart request body, but clear and encrypted archive extraction did not enforce a cumulative decompressed payload budget.
- Frontend/Accessibility: the mobile navigation button opened an `OverlaySheet` dialog without `aria-haspopup`, `aria-expanded`, or `aria-controls` linkage to the navigation drawer.
- DevOps/Release: GitLab release-sensitive jobs used `quay.io/podman/stable:latest` through `PODMAN_IMAGE`, allowing release builds and publishes to drift without a repository change.
- Docs/Testing: generated reverse-proxy smoke remediation and the current live evidence checklist omitted the required `DEPLOY_BASE_URL`, `DEPLOY_API_TOKEN`, `DEPLOY_PROFILE_ID`, `DEPLOY_SMOKE_BUCKET`, and `DEPLOY_SMOKE_OBJECT_KEY` variables.

### Improvements Applied

- Added a shared restore extraction budget and wired `ServerRestoreMaxBytes` through clear/encrypted server restore and portable import extraction paths; oversized decompressed payloads now fail before the next file is written.
- Added API regression coverage for cumulative extracted-byte rejection before write while preserving the existing disk-space preflight test.
- Added `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`, and a stable `sheetId` for the mobile navigation drawer, with header smoke coverage.
- Pinned GitLab `PODMAN_IMAGE` to the digest-backed `quay.io/podman/stable@sha256:dbdc5e9fdc3c9e89fb842ffa56a1545437884bc39d619352214093dba169a8f1` reference and added release-gate assertions/documentation banning the floating `stable:latest` release builder.
- Updated `reverse_proxy_smoke_command()`, release evidence tests, checklist tests, and `LIVE_EVIDENCE_CHECKLIST_2026-05-02.md` so reverse-proxy smoke commands include all required deploy variables.

### Remaining Limitations

- `ServerRestoreMaxBytes` is now also the extracted payload budget; a separate `ServerRestoreMaxExtractedBytes` knob may still be useful for operators who want different upload and expansion ceilings.
- Runtime SSRF still needs dial-level DNS/IP validation and redirect revalidation.
- Imported profile endpoints still need shared API-equivalent endpoint validation for all endpoint-bearing fields.
- Direct form upload and presigned upload size enforcement still need stronger object-store-side bounds or cleanup/promotion semantics.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, reverse-proxy smoke evidence, and backup-portable smoke evidence are recorded for the actual candidate.

### Fifteenth-Pass Validation

- `cd backend && go test ./internal/api`: passed.
- `cd frontend && npx vitest run src/__tests__/FullAppInner.smoke.test.tsx`: passed, 3 tests.
- `python3 scripts/check_release_evidence_test.py`: passed, 41 tests.
- `python3 scripts/check_release_evidence_checklist_test.py`: passed, 17 tests.
- `python3 scripts/check_release_readiness_test.py`: passed, 12 tests.
- GitHub/GitLab workflow YAML parse: passed.
- `bash ./scripts/check_release_gate.sh`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `git diff --check`: passed.
- `python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc3`: failed as expected because live provider, reverse-proxy, and backup-portable evidence files are still missing for that candidate.

## Fourteenth Current Expert Sub-Agent Pass

This pass re-ran four read-only expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. I implemented only changes that could be verified locally without creating live provider or release evidence.

### Additional Findings

- Backend/Security: portable import rejected malformed profile IDs and missing profile references, but still accepted unsupported profile providers and malformed provider `config_json`/`secrets_json` before replacement.
- Backend/Security: the full API-equivalent endpoint validation for imported profiles still requires a shared validator; this pass only adds store-level provider/config shape checks.
- Frontend/Accessibility: the sidebar `Backup` trigger exposed dialog state but did not connect to the drawer panel with `aria-controls`.
- DevOps/Release: `verify_release_readiness.sh` enforces exact check-run names, but release-gate did not guard drift between the verifier defaults and workflow job names.
- Docs/Testing: `docs/TESTING.md` still showed portable smoke commands as `./scripts/...` and in a different order than the strict `bash scripts/...` evidence labels.

### Improvements Applied

- Extended portable profile validation to reject unsupported providers, malformed JSON config/secrets, and missing required provider fields for S3-compatible/AWS, Azure, GCS, and OCI rows.
- Added backend tests for invalid portable profile providers and malformed provider config rejection.
- Added `aria-controls` from the sidebar `Backup` trigger to both real and fallback backup drawer panels via `OverlaySheet.sheetId`, with unit coverage.
- Canonicalized the portable smoke commands in `docs/TESTING.md` to generated `bash scripts/...` invocations and documented that `## Smoke Results` must use exact template labels.
- Added release-gate assertions for the canonical portable smoke command/result labels and for rejecting non-canonical `./scripts/run_portable_` examples in testing docs.
- Added release-gate assertions that `verify_release_readiness.sh` defaults include `release-gate`, `Core Mock E2E`, and `Mobile Responsive E2E (Required)`, and that the corresponding workflow names still exist.
- Documented that `DEPLOY_REQUIRED_CHECKS` or the verifier default must change with branch-protection check-name changes.

### Remaining Limitations

- Imported profile endpoints still need shared API-equivalent endpoint validation, including remote-mode localhost/link-local handling and TLS skip-verify constraints.
- Runtime SSRF still needs dial-level DNS/IP validation and redirect revalidation.
- Direct form upload and presigned upload size enforcement still need stronger object-store-side bounds or cleanup/promotion semantics.
- `verify_release_readiness.sh` remains fail-fast and does not poll pending GitHub checks.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, reverse-proxy smoke evidence, and backup-portable smoke evidence are recorded for the actual candidate.

### Fourteenth-Pass Validation

- `cd backend && go test ./internal/store -run 'TestImportPortableEntityFilesReplaceRejectsUnsafe(Profile|Job)IDs|TestImportPortableEntityFilesReplaceRejectsMissingProfileReferences|TestImportPortableEntityFilesReplaceRejectsInvalidPortableProfileProvider|TestImportPortableEntityFilesReplaceRejectsMalformedProviderConfig|TestImportPortableEntityFilesReplaceQuarantinesExecutableJobs'`: passed.
- `cd frontend && npx vitest run src/components/__tests__/SidebarBackupAction.test.tsx`: passed, 13 tests.
- `bash -n scripts/check_gitlab_publish_readiness.sh scripts/verify_release_readiness.sh scripts/check_release_gate.sh`: passed.
- GitHub/GitLab workflow YAML parse: passed.
- `python3 scripts/check_release_evidence_test.py`: passed, 41 tests.
- `python3 scripts/check_release_evidence_checklist_test.py`: passed, 17 tests.
- `python3 scripts/check_release_readiness_test.py`: passed, 12 tests.
- `bash ./scripts/check_release_gate.sh`: passed.
- `cd frontend && npm run check:e2e:geometry`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/check_release_evidence_checklist.py --candidate-id 0.21v-rc3 --base 0.21v-rc3 --head HEAD`: passed.
- `git diff --check`: passed.
- `python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc3`: failed as expected because live provider, reverse-proxy, and backup-portable evidence files are still missing for that candidate.

## Thirteenth Current Expert Sub-Agent Pass

This pass re-ran four read-only expert sub-agents across backend/security, frontend UX/accessibility, DevOps/release, and docs/testing/release evidence. The selected fixes were limited to changes that are locally testable in the current dirty worktree.

### Additional Findings

- Backend/Security: portable import now validates profile row IDs, but related entity files could still carry malformed or missing `profile_id` references and leave orphaned jobs, uploads, object index rows, or favorites after replacement.
- Backend/Security: imported profile endpoints/config still bypass the normal API endpoint validation path; the full fix needs a shared profile validation package used by both API create/update and portable import preflight.
- Frontend/Accessibility: Jobs `Columns` popover lacked explicit dialog disclosure semantics, a stable panel id, and mobile 44px hit-target coverage beside the already-fixed mobile Filters trigger.
- DevOps/Release: GitLab publish readiness delegated to `verify_release_readiness.sh`, but the GitHub API prerequisites were implicit: `curl` was not installed in the preflight job, and missing `GH_TOKEN`/`GITHUB_TOKEN` would fail later with less clear API errors.
- Docs/Testing: backup-portable enforcement requires four per-script `## Smoke Results` lines, but `RELEASE_GATE.md` and `TESTING.md` still had wording that could be read as summary-only evidence.

### Improvements Applied

- Added portable profile-reference validation across `profile_connection_options`, `jobs`, `upload_sessions`, `upload_multipart_uploads`, `upload_objects`, `object_index`, and `object_favorites`; missing or malformed `profile_id` values now fail before DB replacement.
- Added a regression test proving a missing profile reference rejects the import and leaves the existing profile intact.
- Added Jobs `Columns` popover `id`, `role="dialog"`, `aria-label`, trigger `aria-haspopup`, `aria-expanded`, `aria-controls`, and mobile hit-target coverage for `Reset filters`, `Columns`, and `Refresh`.
- Made GitLab `release_readiness_preflight` install `curl`, and made `verify_release_readiness.sh` fail fast when `curl` or `GH_TOKEN`/`GITHUB_TOKEN` is missing.
- Updated release/testing/deployment docs and release-gate drift assertions for GitHub API prerequisites and backup-portable per-script evidence wording.

### Remaining Limitations

- Runtime SSRF still needs dial-level DNS/IP validation and redirect revalidation; imported profile endpoint/config validation is still a larger shared-validator refactor.
- Direct form upload and presigned upload size enforcement still need stronger object-store-side bounds or cleanup/promotion semantics.
- `verify_release_readiness.sh` remains fail-fast; it does not poll pending GitHub checks.
- `DEPLOY_REQUIRED_CHECKS` still depends on exact GitHub check-run names.
- Release readiness remains blocked until provider-live evidence for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, reverse-proxy smoke evidence, and backup-portable smoke evidence are recorded for the actual candidate.

### Thirteenth-Pass Validation

- `cd backend && go test ./internal/store -run 'TestImportPortableEntityFilesReplaceRejectsUnsafe(Profile|Job)IDs|TestImportPortableEntityFilesReplaceRejectsMissingProfileReferences|TestImportPortableEntityFilesReplaceQuarantinesExecutableJobs'`: passed.
- `cd frontend && npx vitest run src/pages/jobs/__tests__/JobsToolbar.test.tsx`: passed, 7 tests.
- `bash -n scripts/check_gitlab_publish_readiness.sh scripts/verify_release_readiness.sh scripts/check_release_gate.sh`: passed.
- `.gitlab-ci.yml` YAML parse: passed.
- `cd frontend && npx playwright test tests/jobs-mobile-responsive.spec.ts --project=mobile-iphone-13 --grep "mobile filters persist"`: passed, 1 test.
- `python3 scripts/check_release_evidence_test.py`: passed, 41 tests.
- `python3 scripts/check_release_evidence_checklist_test.py`: passed, 17 tests.
- `python3 scripts/check_release_readiness_test.py`: passed, 12 tests.
- `bash ./scripts/check_release_gate.sh`: passed.
- `cd frontend && npm run check:e2e:geometry`: passed.
- `cd frontend && npm run lint`: passed, including CSS token and import-cycle checks.
- `python3 scripts/check_release_evidence_checklist.py --candidate-id 0.21v-rc3 --base 0.21v-rc3 --head HEAD`: passed.
- `git diff --check`: passed.
- `python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc3`: failed as expected because live provider, reverse-proxy, and backup-portable evidence files are still missing for that candidate.
