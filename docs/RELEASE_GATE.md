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
   - default behavior is `./scripts/check.sh full`
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
- dirty-worktree inventory from `python3 scripts/report_release_scope.py` when release scope is still being reduced, or `python3 scripts/report_release_scope.py --base <base-tag-or-sha> --head <candidate-tag-or-sha>` for a committed candidate comparison
- final local artifact/scope check: `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`
- final committed-candidate evidence check: `python3 scripts/check_release_evidence.py --base <base-tag-or-sha> --head <candidate-tag-or-sha> --strict --require-candidate-id --candidate-id <candidate-tag-or-sha>`
- clean-snapshot local runner approximation: `python3 scripts/check_clean_snapshot.py full`
- clean-snapshot copies do not include `.git`, so the release-scope status check is enforced in the source worktree and skipped inside the temporary snapshot.

## Automated Enforcement

The repository keeps automated enforcement for release readiness inside the standard verification path:

- focused local release-doc check: `./scripts/check_release_gate.sh`
- release-readiness blocker summary: `python3 scripts/check_release_readiness.py --candidate-id <tag-or-sha>`
  - runs the strict scope/evidence checks and live-evidence env preflight for the candidate
  - reports a candidate identity blocker when an existing tag candidate does not resolve to the checked `--head`
  - exits non-zero until required provider/reverse-proxy/backup-portable evidence is present
  - does not replace `./scripts/check.sh full`, clean-snapshot verification, or the browser lanes
- local workflow lint: `bash ./scripts/check_github_workflows.sh`; the built-in validator rejects mutable GitHub Action tag/branch refs and requires 40-character commit SHAs
- optional repo-local `actionlint` install: `bash ./scripts/install_actionlint.sh`
- full local verification pass: `./scripts/check.sh` or `./scripts/check.sh full`
- non-browser CI-equivalent pass: `./scripts/check.sh ci`; keeps backend security analysis while the required `Core Mock E2E` check owns browser smoke
- faster non-browser local pass: `./scripts/check.sh fast`
- third-party notice enforcement inside `./scripts/check.sh`: generates into a temporary output tree, compares it with `THIRD_PARTY_NOTICES.md` and `third_party/licenses/`, and leaves the tracked snapshot untouched
- CI workflow: `Release Gate` (runs `./scripts/check.sh ci` on pull requests and `main`; required `Core Mock E2E` owns workflow-lint success there, while a standalone manual dispatch still runs repo-local `actionlint`; setup-go caches module/build outputs but not writable executables)
- canonical release verdict: GitHub `Release Gate`; GitLab release/security jobs are parity and publish safeguards, not the source of truth for branch protection
- backend toolchain pin: Go `1.25.13` is declared in `backend/go.mod`, `Containerfile`, `Containerfile.local`, GitHub workflow `go-version` fields, and literal GitLab `image:` declarations, and `python3 scripts/check_go_toolchain.py` keeps those declarations aligned
- backend security gate inside `./scripts/check.sh ci` and `./scripts/check.sh full`: `go vet`, `staticcheck`, `gosec`, and `govulncheck`
- GitLab additive security gates: `security_fs_scan` runs Trivy filesystem/config scans and `gitleaks_scan` runs Gitleaks when tag/default-branch/schedule or relevant source changes require them
- GitLab release-builder images are literal digest-pinned image references; they must not be overridable through `PODMAN_IMAGE` or mutable tags such as `quay.io/podman/stable:latest`.
- GitLab publish and deploy jobs require both a release tag and `CI_COMMIT_REF_PROTECTED == "true"`; production deploy jobs declare the `production` environment tier. The actual protected-tag/environment rules remain a GitLab project setting and must be verified there before release approval.
- Release image tar artifacts emit `release-images.sha256`; release smoke and Docker Hub publication verify it. Docker Hub publication records registry digests, and post-publish smoke pulls by digest before using local test tags. `trivy_scan` publishes CycloneDX SBOM artifacts for both database variants. These checksums/SBOMs do not replace a trusted signature or provenance attestation.
- Security configuration contracts are also checked: Vercel must emit anti-clickjacking headers, Lighthouse auth requires an explicit controlled-origin token-storage opt-in, the regular E2E lane must reject live mode while the live lane requires a protected ref, and the GitLab runner smoke RoleBinding must have an enforcing admission-policy boundary.
- GitLab tag publish safeguard: `release_readiness_preflight` runs `bash scripts/check_gitlab_publish_readiness.sh "$CI_COMMIT_TAG"` before Docker Hub or Helm publication; the helper delegates to `scripts/verify_release_readiness.sh` so GitHub Release tag/title, body, `Full Changelog` compare link, prerelease flag, and required check state are verified as part of the publish preflight. Set `DEPLOY_RELEASE_BASE` when the previous tag cannot be derived locally. `curl` plus a masked `GH_TOKEN` or `GITHUB_TOKEN` are required in GitLab CI and local runs for deterministic GitHub API checks.
  - Default required GitHub checks are `release-gate`, `Core Mock E2E`, `Mobile Responsive E2E (Required)`, and `license-audit`. If branch protection check names change or a new required check is added, update `DEPLOY_REQUIRED_CHECKS` or the verifier default in the same change.
- GitLab Helm chart publication must run after published Docker Hub image smoke, not just after Docker Hub push. `python3 scripts/check_gitlab_publish_dag.py` enforces the `publish_dockerhub` -> `release_image_smoke` -> `publish_helm_chart` -> `deploy_release_helm` order, including the dedicated `chart-publish` stage.
- Deploy scripts run `python3 scripts/check_live_evidence_env.py --scope reverse-proxy` before compose or Helm target mutation; Helm deploy also performs a `helm upgrade --install --dry-run=client` render before the live upgrade.
- Compose deploys require protected `DEPLOY_SSH_KNOWN_HOSTS` and strict SSH host-key checking; do not bootstrap production deploy trust with live `ssh-keyscan` output.
- Release/security tooling used by CI must be version pinned. `govulncheck`, `go-licenses`, and `podman-compose` installs must not use mutable `latest` or unversioned package installs.
- Runtime license audit is a release-publish blocker. GitLab tag pipelines run `license_audit_runtime`, Docker Hub publish depends on it, and GitHub release-readiness requires the `license-audit` check by default. The audit enforces explicit npm and Go license allow-lists; Go results are produced with `go-licenses report --ignore s3desk ./...` and parsed by `scripts/check_go_license_report.py` so `Unknown`/blocked/disallowed licenses fail deterministically. When release image tar artifacts are present, the audit also parses Alpine `lib/apk/db/installed` package metadata from `release-postgres.tar` and `release-sqlite.tar` with `scripts/check_runtime_image_licenses.py`; local runs can pass semicolon-separated tar paths through `LICENSE_AUDIT_IMAGE_TARS`. The same audit verifies that the copied runtime `rclone` binary has a `THIRD_PARTY_NOTICES.md` entry and license text under `third_party/licenses/external/`. The GitHub `License Audit` workflow is intentionally not path-scoped, so `license-audit` still materializes for every PR/main candidate; its job rebuilds reports only for Go source/module, npm dependency/patch, Containerfile, notice/license, audit-script, or manual-dispatch changes.
- GitLab additive quality gates:
  - `shellcheck` runs `shellcheck -x` for repository shell scripts and publishes logs under `artifacts/ci/shellcheck/`
  - `go_test` runs `go vet`, backend tests with `coverage.out`, enforces `GO_COVERAGE_MIN_TOTAL`, and publishes logs under `artifacts/ci/backend/`
  - `go_race` runs targeted `go test -race ./internal/api ./internal/jobs` and publishes `artifacts/ci/backend/go-race.log`
  - `golangci_lint` must use the checked-in `.golangci.yml` named by `GOLANGCI_LINT_CONFIG`; a missing config is a hard failure
- CI workflow: `Frontend E2E` runs repo-local `actionlint` in the `Workflow Lint` prerequisite when workflow wiring changes; unchanged workflows use the fast no-op path
- CI workflow: `Frontend E2E` also runs `Bundle Budget` for bundle-affecting frontend changes
- CI workflow: `Frontend E2E` only treats frontend runtime/tests, `openapi.yml`, and browser harness wiring as browser-facing, so backend-only, frontend-docs, or bundle-only changes do not retrigger mocked Playwright; backend verification remains in `Release Gate`, while integrated browser/backend coverage remains scheduled/manual `live-e2e-critical`
- `Frontend E2E` workflow wiring changes are browser-facing for gating purposes; required browser lanes must not self-skip when `.github/workflows/frontend-e2e.yml` changes.
- CI workflow: workflow-lint-only changes still execute the dedicated `Workflow Lint` job, but leave `Browser Lanes:` as `not applicable (...)` unless the browser surface also changed
  - preferred CI wording: `Browser Lanes: smoke + core not applicable (workflow or browser-CI wiring changed, but the browser surface did not)`
- CI summaries use the same evidence labels as the PR/release templates: `Workflow Lint:`, `Bundle Budget:`, `Bundle Budget Contract:`, and `Browser Lanes:`
- frontend CI required checks for browser-surface work:
  - `Core Mock E2E`
  - `Mobile Responsive E2E (Required)`
- current `Frontend E2E` wiring does not maintain a narrower mobile-only runtime scope, so browser-surface changes normally materialize both required Playwright checks together
- frontend CI advisory bundle signal:
  - `Bundle Budget`
  - local equivalent: `cd frontend && npm run bundle:budget`
  - focused contract test: `cd frontend && npm run check:bundle-report`
  - committed defaults: `frontend/scripts/bundle-budgets.json`
  - `Bundle Budget` and `./scripts/check.sh` both run that contract test before the heavier analyze/build path so report wording and action-hint regressions fail before browser or release evidence review
  - release evidence should normally mark `Bundle Budget:` as `executed` only when entrypoints, chunking, dependencies, or bundle-shape changed; otherwise mark it `not applicable` with a short reason
  - release evidence should normally mark `Bundle Budget Contract:` as `executed` only when the manifest, report wording, or CI summary wiring changed; otherwise mark it `not applicable` with a short reason
  - the `Frontend E2E` summary follows both scopes automatically, so runtime-only and contract-only changes no longer imply the other bundle evidence line was relevant
  - update the manifest rationale when you intentionally re-baseline a threshold
  - the manifest also carries a follow-up action hint for each route so bundle review can distinguish `shrink first` from `rebaseline if stable`
  - the generated report also shows actual usage, remaining headroom, and review-candidate notes so re-baselines have concrete evidence
  - missing budgeted chunks are warnings and make `npm run bundle:budget` fail, forcing renamed, merged, or accidentally removed lazy boundaries through release review
  - release evidence should say whether the run ended with `No budget warnings` / `No budget review candidates`, or name the chunk that still needs a re-baseline
  - the CI summary now splits `Warnings:`, `Review targets:`, and `Action hints:` into separate lines for up to the first two follow-up chunks, with the full detail still living in `frontend-bundle-report`
  - keep action hints narrow and reviewable: `shrink first` for likely regressions, `rebaseline if stable` when the route floor is already understood
- frontend CI browser guardrails:
  - `npm run check:e2e:geometry`
  - `npm run test:e2e:smoke`
- local browser smoke used by the full gate:
  - `cd frontend && npm run test:e2e:smoke`
- local convenience wrapper:
  - `bash ./scripts/check_ci_pair.sh`
  - useful for workflow lint + frontend OpenAPI drift + frontend build + backend test only
  - not a replacement for required browser checks or release approval evidence
- mobile responsive suite scope and local commands:
  - [frontend/docs/MOBILE_RESPONSIVE_E2E.md](../frontend/docs/MOBILE_RESPONSIVE_E2E.md)

Browser-facing release work should follow the same lane split that CI enforces:

- `@check-smoke`
  - tiny boot/auth/shell gates only
- `core`
  - desktop/mock task-completion regressions
- Release evidence should list `smoke`, `core`, and `mobile-responsive` as separate lines. If a lane did not run, state why it was not applicable.
- `mobile-responsive`
  - constrained-viewport task-completion regressions

Do not treat geometry-heavy Playwright assertions as releasable signal. If a browser test needs direct geometry math, require a documented `e2e-geometry-allow` justification and prefer pushing that contract into a lower-level test instead.

## Branch Protection / Required Checks

When branch protection is configured for `main`, keep the following check names in the required set:

- `release-gate`
- `Core Mock E2E`
- `Mobile Responsive E2E (Required)`
- `license-audit`

`Bundle Budget` is useful release evidence for frontend bundle-affecting changes, but it is normally an advisory signal rather than a default required check. Review it when entrypoints, chunking, or dependency weight move, even if branch protection does not mark it required.

The `Frontend E2E` and `License Audit` workflows should still trigger on every pull request and `main` push so these required checks always materialize. When the browser surface is out of scope, the two Playwright required checks should self-skip inside the job and report success without running the suites.

Do not treat a green `bash ./scripts/check_ci_pair.sh` run as equivalent to the required GitHub checks above. It is a local convenience wrapper, not a branch-protection signal and not sufficient release evidence when browser lanes or other gated checks apply.

Use the exact check names when you record release evidence:

- `./scripts/check.sh ci` mirrors the `Release Gate` workflow job named `release-gate`; `./scripts/check.sh full` is its local superset with browser smoke.
- `bash ./scripts/check_github_workflows.sh` mirrors the `Workflow Lint` job in `Frontend E2E`.
- `cd frontend && npm run test:e2e:core` mirrors `Core Mock E2E`.
  In CI, the core suite is split into three Playwright shards and aggregated back into the required `Core Mock E2E` check name.
- `cd frontend && npm run test:e2e:visual` mirrors `Visual Regression E2E`.
- `cd frontend && npm run test:e2e:mobile-responsive` mirrors `Mobile Responsive E2E (Required)`.
- `bash ./scripts/license-audit.sh` mirrors `license-audit`.
- `bash ./scripts/check_ci_pair.sh` is only a local convenience wrapper for workflow lint + frontend OpenAPI drift + frontend build + backend test.

For the mobile suite scope, local commands, and operator-facing test entry points, use [frontend/docs/MOBILE_RESPONSIVE_E2E.md](../frontend/docs/MOBILE_RESPONSIVE_E2E.md).

The focused release-doc check specifically enforces that:

- `CHANGELOG.md` still carries the current required known limitations
- the live validation runbook still exposes the required evidence fields
- the release gate, testing, and mobile responsive docs still expose the expected browser-test policy, reviewer guidance, and commands
- the pull request template still asks for the expected smoke, geometry-guard, and task-completion review checks
- the GitHub workflows still publish the expected browser-test lane summaries in the Actions UI

It does not replace the actual live-provider validation pass.

Use `python3 scripts/check_release_evidence.py` to audit whether the current changed files require
provider-live, reverse-proxy, or backup-portable evidence. Before release approval, use
`python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>` and resolve any missing-evidence, omitted-candidate, or mismatched-candidate blockers.

## Provider Change Gate

If a change touches bucket governance, provider capabilities, profile auth, or object-provider behavior, release readiness is blocked until the relevant live pass is recorded under `docs/release/evidence/` using [PROVIDER_LIVE_VALIDATION_TEMPLATE.md](release/evidence/PROVIDER_LIVE_VALIDATION_TEMPLATE.md).

Minimum evidence per affected provider:

- provider name
- bucket or container used
- profile identifier
- S3Desk commit SHA or release tag used for validation
- feature tested
- actual outcome
- API failure body on error
- provider-native confirmation on success

If a provider was not revalidated, the release is not ready unless the release notes explicitly say the provider change is unvalidated and the release is intentionally internal-only.

Before running a provider live pass, use `python3 scripts/check_live_evidence_env.py --scope <provider>`
to check required environment variables without printing secret values.
Use `python3 scripts/check_release_evidence.py --format checklist` to print the affected provider scopes, exact provider test command, and target evidence filenames for the current changed file set.

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
5. `HEAD` against the returned signed proxy URL succeeds
6. recorded `S3Desk commit SHA or release tag` matches the candidate that was validated

The evidence file must include sanitized base URL, expected external base URL, profile, bucket, object key, and each smoke check result from the `## Checks` section. Generated evidence records `HTTP 200` for healthz, meta, download-url, and HEAD checks, and `HTTP 201` for realtime-ticket creation. `Signed proxy URL root` must match `Expected external base URL`; expected-status reference lines alone do not satisfy the smoke evidence requirement.

Use `DEPLOY_RELEASE_CANDIDATE=<tag-or-sha> DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md bash ./scripts/deploy_smoke.sh`
to run the smoke and write Markdown release evidence with the validated candidate recorded. Use
[REVERSE_PROXY_SMOKE_TEMPLATE.md](release/evidence/REVERSE_PROXY_SMOKE_TEMPLATE.md)
when evidence must be filled in manually.

Before running the smoke, use `python3 scripts/check_live_evidence_env.py --scope reverse-proxy`
to check required environment variables without printing secret values.

## Backup Portable Smoke Gate

If a change touches in-product backup, restore, portable bundle export/import, staged restore verification, or the portable smoke stack, release readiness is blocked until candidate-bound backup-portable smoke evidence is recorded under `docs/release/evidence/backup-portable-smoke-<tag-or-sha>.md`.

Minimum backup-portable evidence:

1. `S3Desk commit SHA or release tag` matches the candidate that was validated
2. source and target database backends are named
3. export, import, verification workflow, and staged restore target are described with sanitized details
4. `Backup portable smoke` and each portable smoke script in `## Smoke Results` records a pass/success result
5. backup passwords, API tokens, database credentials, encryption keys, provider secrets, and private keys are omitted

Use [BACKUP_PORTABLE_SMOKE_TEMPLATE.md](release/evidence/BACKUP_PORTABLE_SMOKE_TEMPLATE.md) and run the documented portable smoke scripts before filling the evidence file.

## Upgrade Compatibility Gate

Every S3Desk upgrade must preserve persistent records (the SQLite `DATA_DIR` or
the Postgres database) and re-check the bundled or locally installed rclone
binary. The direct-install compatibility tests run in the normal backend test
lane:

```bash
cd backend && go test ./internal/db ./internal/jobs -run 'TestOpenMigratesLegacySQLiteSchemaAndPreservesRecords|TestEnsureRcloneCompatibleRechecksReplacedBinary' -count=1
```

The release image lanes cover both supported container database backends. The
SQLite lane mounts a legacy SQLite fixture into `/data`; the Postgres lane seeds
legacy tables before starting the candidate image. Both verify profiles/jobs,
schema migrations, and rclone compatibility through the API, then verify the
records in the backing database:

```bash
S3DESK_EXPECTED_VERSION=<tag> \
bash scripts/run_container_legacy_db_smoke.sh <candidate-sqlite-image>

S3DESK_EXPECTED_VERSION=<tag> S3DESK_POSTGRES_IMAGE=<postgres-image> \
bash scripts/run_container_legacy_postgres_smoke.sh <candidate-postgres-image>
```

Back up the persistent volume before an operator upgrade. Keep one S3Desk
process per SQLite `DATA_DIR`; Postgres deployments must back up Postgres
separately. These upgrade lanes do not replace `pg_dump`/WAL or managed
provider disaster-recovery validation; keep the `DATA_DIR` volume for
thumbnails, artifacts, and staged restores.

## Release Notes Requirements

Every release note set must include:

1. user-visible changes
2. operationally relevant changes
3. known limitations that still apply

For the current codebase, these unsupported or partial behaviors must be called out when relevant:

- Azure immutability and legal-hold editing require ARM credentials in addition to storage credentials.
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
- release artifacts lack an externally verifiable signature and provenance attestation; the repository currently provides checksum and SBOM evidence, but signing identity/attestation storage must be configured in CI before treating this boundary as closed

## Fast Approval Path

A change can use the fast path only if all of the following are true:

- docs-only or copy-only change, or
- internal refactor with no runtime behavior change, and
- no provider behavior, auth flow, backup flow, or deployment default changed

Fast path still requires a clean OpenAPI state and passing local checks if touched files affect compiled code.

For contributor-facing command details, use [TESTING.md](TESTING.md).

## Browser Test Policy

Release-facing browser checks should prefer task completion over geometry inspection.

- Playwright coverage belongs in the appropriate lane:
  - `@check-smoke` for fast boot gates
  - core mock suite for desktop/browser regression coverage
  - mobile responsive suite for required mobile task completion
- Low-signal layout probes in Playwright are blocked by `npm run check:e2e:geometry`.
- Exact width or height assertions are only acceptable in component tests when they prove a public API passthrough contract, such as `DialogModal` and `OverlaySheet` size props.
