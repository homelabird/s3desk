# Release Scope Audit - 2026-04-30

## Summary

<!-- release-scope-audit: dynamic-current-scope -->

- Current scope counts and release-unit tables are intentionally generated at check time instead of being rewritten into this dated audit after every dirty-worktree iteration.
- Current strict scope source of truth: `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`.
- Historical reference snapshot before dynamic audit sync: strict file-level scope 기준 `tracked changes=279` including `deleted=0`, `untracked=25`, `total status entries=304`.
- This is still not a release-clean worktree.
- Repeatable inventory command: `python3 scripts/report_release_scope.py`.
- Repeatable staging checklist command: `python3 scripts/report_release_scope.py --format checklist`.
- Repeatable review manifest command: `python3 scripts/report_release_scope.py --format manifest`.
- File-level untracked directory review command: `python3 scripts/report_release_scope.py --format manifest --untracked-files all`.
- Strict scope command now passes for root-local artifact detection: `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning`.
- File-level strict scope command now passes when untracked directories are expanded and no catch-all `other` release unit remains: `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`.
- Clean snapshot fast command last passed after copying 1817 non-ignored tracked/untracked paths before the release-readiness preflight was added: `python3 scripts/check_clean_snapshot.py fast`.
- Clean snapshot full command now passes after copying 1819 non-ignored tracked/untracked paths: `python3 scripts/check_clean_snapshot.py full`.
- Dependency notice unit status from the inventory command: `complete`.
- Root local/generated directories now ignored by policy:
  - `.codex`
  - `.playwright-mcp/`
  - `node_modules/`
  - `test-results/`
  - `playwright-report/`
- Root-local screenshot and exploratory Playwright note patterns are also ignored by policy. Preserve intentional release evidence under `docs/release/evidence/` instead.
- The remaining untracked files are backend helper/store/test additions, frontend test additions, retained design/project reports under `notes/`, the backend security tool installer script, and release-candidate helper tests.

## 2026-05-01 Recheck

- Status snapshot: strict file-level scope 기준 `tracked changes=495` including `deleted=18`, `untracked=358`, `total status entries=853`.
- Strict scope command still passes: `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`.
- Clean snapshot fast command passes after copying 1812 non-ignored tracked/untracked paths: `python3 scripts/check_clean_snapshot.py fast`.
- Clean snapshot full command passes after copying 1812 non-ignored tracked/untracked paths: `python3 scripts/check_clean_snapshot.py full`.
  - Included backend tests, backend security analysis (`staticcheck`, `gosec`, `govulncheck`), frontend lint/unit/build, check-smoke browser lane, and third-party notice reproducibility.
  - Frontend unit result: 239 files / 903 tests passed.
  - Browser smoke result: 2 Chromium `@check-smoke` tests passed.
- Required browser lanes pass outside the clean-snapshot full gate:
  - `npm --prefix frontend run test:e2e:core`: 124 passed / 15 skipped after `objects-bucket-picker`/`objects-global-search` mock profile provider correction.
  - `npm --prefix frontend run test:e2e:mobile-responsive`: 66 passed on latest re-run.
  - `npm --prefix frontend run test:e2e:visual`: 18 passed on latest re-run.
- Bundle budget lanes pass outside the clean-snapshot full gate:
  - `npm --prefix frontend run check:bundle-report`: 2 Node tests passed on latest re-run.
  - `npm --prefix frontend run bundle:budget`: passed with no budget warnings on latest re-run.
  - `UploadsPage` route chunk was reduced from 2.31 kB raw / 1.00 kB gzip to 2.11 kB raw / 0.96 kB gzip by folding the single-use route shell into the route entry.
  - Current bundle report has no budget review candidates, action hints, or warnings.
- Dependency notice unit remains `complete`.
- Root artifact candidates remain absent.
- Current release readiness remains blocked by live evidence, not by release-scope artifact hygiene:
  - provider live evidence missing for `aws`, `gcs`, `azure`, `oci`, `minio`, `ceph`
  - reverse-proxy smoke evidence missing
  - environment preflight rechecked on 2026-05-01 reports all provider and reverse-proxy required variables still missing locally
  - strict evidence audit for `rc1` remains blocked because no provider or reverse-proxy evidence files are present
- Latest operator checklist: [docs/release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-01.md](release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-01.md)
  - The checklist now includes concrete `rc1` provider evidence target filenames, the `reverse-proxy-smoke-rc1.md` target, the `rc1` smoke command, and the `rc1` final evidence gate command so release operators do not have to manually substitute `<tag-or-sha>` for the current candidate.

## 2026-05-01 Release Evidence Gate Recheck

- `python3 scripts/check_release_evidence_test.py`: 29 tests passed.
- `bash ./scripts/check_release_gate.sh`: 12 release-scope tests, 7 live-evidence-env tests, 29 release-evidence tests, and the Go toolchain/documentation gates passed.
  - The documentation gate now also pins provider evidence template guidance for supported provider names, non-placeholder required fields, and accepted pass outcomes.
  - The reverse-proxy evidence template gate now pins the expected HTTP 200/201 smoke result guidance and accepted pass outcomes.
- `bash -n scripts/deploy_smoke.sh`: passed.
- `bash ./scripts/check_github_workflows.sh`: passed through `actionlint` for 3 workflows.
- `bash ./scripts/check_helm_chart.sh`: passed for 3 Helm lint variants.
- `git diff --check`: passed.
- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`: passed with `tracked changes=495`, `deleted=18`, `untracked=358`, and `total status entries=853`.
- `python3 scripts/report_release_scope.py --format json --untracked-files all`: parsed successfully with 22 release units and a populated `stage_command` for every unit.
- Stage-command dry-run output was spot-checked for `dependency-notices`, `release-gate-ci-deploy`, and `frontend-objects`; no files were staged.
- NUL path-list dry-run counts matched the audit table for key units: `dependency-notices` 17, `backend-api-provider-surface` 186, `frontend-objects` 220, and `docs` 20.
- `python3 scripts/report_release_scope.py --format manifest --untracked-files all`: generated a 1108-line manual review manifest for all release units; no files were staged or mutated.
- Unit manifest dry-runs were spot-checked for `dependency-notices`, `backend-api-provider-surface`, and `frontend-objects`.
- `npm --prefix frontend run test:unit`: 239 files / 903 tests passed after capability-gated bucket/object/favorites query and mutation/UI coverage was added.
- `./scripts/check.sh full`: passed after the evidence template gate hardening; this replay covered openapi, release gate, workflow/actionlint checks, helm lint, gofmt, backend test/security analysis with reachable vulnerabilities 0, bundle report, frontend openapi/geometry/lint/unit 239 files / 903 tests/build, browser smoke 2 tests, and third-party notice reproducibility.
- `python3 scripts/check_clean_snapshot.py full`: passed after the evidence template gate hardening and after copying 1812 non-ignored tracked/untracked paths into a `.git`-less snapshot; this replay covered release gate with status-only scope check skipped as intended, workflow fallback validation, helm, gofmt, backend tests/security analysis with reachable vulnerabilities 0, bundle report, frontend openapi/geometry/lint/unit 239 files / 903 tests/build, browser smoke 2 tests, and third-party notice reproducibility.
- `python3 scripts/check_clean_snapshot.py fast`: passed on the latest workspace after copying 1812 non-ignored tracked/untracked paths into a `.git`-less snapshot; this replay covered release gate with status-only scope check skipped as intended, workflow fallback validation, helm, gofmt, backend tests, bundle report, frontend openapi/geometry/lint/unit 239 files / 903 tests/build, and third-party notice reproducibility.
- `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id rc1`: blocked as expected because the candidate still has no provider live evidence files and no reverse-proxy smoke evidence file.
- `python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --scope reverse-proxy`: blocked as expected because all required provider and reverse-proxy variables are missing locally.
- `python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --scope reverse-proxy --format env-template`: printed the provider and reverse-proxy environment template without exposing secret values.
- `cd backend && go test ./internal/api -run '^(TestLiveValidationAwsS3|TestLiveValidationGcpGcs|TestLiveValidationAzureBlob|TestLiveValidationOciObjectStorage|TestLiveValidationMinioS3Compatible|TestLiveValidationCephS3Compatible)$' -count=1 -v`: passed with all 6 live provider tests skipped because the required local provider variables are unset; this is not release evidence.
- `python3 scripts/check_release_evidence.py --format json --candidate-id rc1`: parsed successfully with 2 required unsatisfied requirements, 6 provider evidence targets, 1 reverse-proxy evidence target, structured metadata expectations, and final `release_scope`/`release_evidence` gate commands.
- `python3 scripts/check_release_evidence.py --format checklist --candidate-id rc1`: generated checklist was compared with `docs/release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-01.md`; provider evidence targets, reverse-proxy target, `rc1` smoke command, and strict final gate command match.
- `npm --prefix frontend run test:e2e -- tests/objects-bucket-picker.spec.ts tests/objects-global-search.spec.ts --project=chromium`: 7 tests passed after mock profiles were aligned with the provider capability contract.
- `npm --prefix frontend run test:e2e:core`: 124 passed / 15 skipped after the same E2E fixture correction.
- `npm --prefix frontend run test:e2e:mobile-responsive`: 66 tests passed on the latest re-run.
- `npm --prefix frontend run test:e2e:visual`: 18 tests passed on the latest re-run.
- `npm --prefix frontend run check:bundle-report`: 2 Node tests passed, including the missing budgeted chunk warning/failure regression.
- `npm --prefix frontend run bundle:budget`: passed with no budget warnings, no budget review candidates, and no budget action hints.
- `npm --prefix frontend audit --omit=dev`: passed with 0 production vulnerabilities.
- `docs/release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-01.md`: updated with current `rc1` evidence target filenames, smoke command, and final evidence gate command after the latest preflight confirmed all local live-evidence variables were still missing.

## 2026-05-01 Staging Handoff

- Scope classifier check: `.golangci.yml` is classified under `release-gate-ci-deploy`; no `other` release unit remains after file-level untracked expansion.
- Release gate now enforces `--fail-on-other-unit` in real git worktrees; clean snapshot copies intentionally skip that status-based check because the temporary snapshot does not include `.git`.
- Release evidence guard now rejects authorization headers, cookie token values, and `*_ACCESS_KEY_ID` assignments in addition to existing token, private key, credential assignment, and signed URL signature checks.
- Clean snapshot fast and full were re-run after the `rc1` handoff updates and pass after copying 1812 non-ignored tracked/untracked paths.
- Stage/review dependency and generated notice files as one unit: `dependency-notices`.
- Stage/review release and CI tooling together: `release-scope-tooling`, then `release-gate-ci-deploy`.
- Stage/review backend provider/API changes with live evidence attached before release readiness is claimed: `backend-api-provider-surface`, `backend-runtime-store-jobs`, `backend-other`.
- Stage/review frontend feature surfaces by owner: `frontend-objects`, `frontend-buckets`, `frontend-jobs`, `frontend-profiles`, `frontend-uploads`, `frontend-transfers`, `frontend-shell-theme`, `frontend-shared-components`, `frontend-api-contracts`, `frontend-lib`, `frontend-e2e`, `frontend-tooling`, `frontend-docs`, `frontend-other`.
- Stage/review repository docs and scripts last: `docs`, `scripts-tooling`.
- Final local candidate commands before release handoff:
  - `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all`
  - `python3 scripts/check_clean_snapshot.py full`
  - `npm --prefix frontend run test:e2e:core`
  - `npm --prefix frontend run test:e2e:mobile-responsive`
  - `npm --prefix frontend run test:e2e:visual`
  - `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>`

## 2026-05-02 Live Evidence Recheck

- Historical status snapshot after the 2026-05-18 project quality follow-up: strict file-level scope 기준 `tracked changes=279` including `deleted=0`, `untracked=25`, `total status entries=304`.
- `python3 scripts/check_release_evidence_checklist.py --candidate-id rc1`: passed; the checker resolves the current checklist from `docs/release/evidence/README.md`, and the latest operator checklist contains the generated `rc1` provider evidence targets, reverse-proxy smoke target/command, expected reverse-proxy check outcomes, and final gate commands.
- `python3 scripts/check_release_evidence_checklist_test.py`: 6 tests passed for README checklist discovery, explicit checklist override, latest-checklist fallback, provider/reverse-proxy target matching, and non-git snapshot skip behavior.
- `python3 scripts/check_release_scope_audit.py`: passed; the checker treats this dated audit as historical when the dynamic scope marker is present and keeps current status enforcement in the strict `report_release_scope.py` gate.
- `python3 scripts/check_release_scope_audit_test.py`: 9 tests passed for legacy status count drift, untracked group table drift, release unit table drift, dynamic marker behavior, outside-git skip, and clean-worktree skip behavior.
- `python3 scripts/check_release_readiness_test.py`: 6 tests passed for candidate readiness report composition, evidence blocker summaries, live env scope expansion, Markdown output, and blocked exit status behavior.
- `python3 scripts/check_release_readiness.py --candidate-id rc1 --skip-release-gate`: blocked as expected; strict release scope passes, strict evidence fails on missing provider/reverse-proxy evidence, and live env preflight fails because the local provider/reverse-proxy variables are unset.
- `bash ./scripts/check_release_gate.sh`: passed after adding the release-scope audit sync guard, checklist sync guard, and their unit tests to the release gate.
- `python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --scope reverse-proxy`: still blocked; all required provider and reverse-proxy variables are missing locally.
- `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id rc1`: still blocked; no provider live evidence files and no reverse-proxy smoke evidence file are present.
- `python3 scripts/check_release_evidence.py --format checklist --require-candidate-id --candidate-id rc1`: still reports provider targets for `aws`, `gcs`, `azure`, `oci`, `minio`, and `ceph`, plus `docs/release/evidence/reverse-proxy-smoke-rc1.md`.
- Browser lanes were rechecked sequentially on 2026-05-02 after the first parallel start showed Playwright webServer port 18080 contention for `core` and `visual`:
  - `npm --prefix frontend run test:e2e:mobile-responsive`: 66 passed.
  - `npm --prefix frontend run test:e2e:core`: 124 passed / 15 skipped.
  - `npm --prefix frontend run test:e2e:visual`: 18 passed.
  - Generated Playwright run metadata `frontend/test-results/.last-run.json` was removed after the recheck.
- `python3 scripts/check_clean_snapshot.py fast`: last passed before the release-readiness preflight was added after copying 1817 non-ignored tracked/untracked paths into a `.git`-less snapshot; this replay covered openapi, release gate with status-only scope plus scope-audit/checklist-sync checks skipped outside git as intended, workflow fallback validation, helm, gofmt, backend tests, bundle report, frontend openapi/geometry/lint/unit 239 files / 903 tests in 98.53s, build, and third-party notice reproducibility.
- `python3 scripts/check_clean_snapshot.py full`: passed after copying 1819 non-ignored tracked/untracked paths into a `.git`-less snapshot; this latest replay covered release gate with status-only scope plus scope-audit/checklist-sync checks skipped outside git as intended, workflow fallback validation, helm, gofmt, backend tests/security analysis with reachable vulnerabilities 0, bundle report, frontend openapi/geometry/lint/unit 239 files / 903 tests in 131.57s, build, browser smoke 2 tests, and third-party notice reproducibility.
- Latest operator checklist: [docs/release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-02.md](release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-02.md)

## Must Keep Together

### Dependency And License Snapshot Set

Treat these as one release unit:

- `backend/go.mod`
- `backend/go.sum`
- `frontend/package.json`
- `frontend/package-lock.json`
- `THIRD_PARTY_NOTICES.md`
- `third_party/licenses/go/golang.org_x_image@v0.30.0-LICENSE` deleted
- `third_party/licenses/go/golang.org_x_mod@v0.29.0-LICENSE` deleted
- `third_party/licenses/go/golang.org_x_sync@v0.18.0-LICENSE` deleted
- `third_party/licenses/go/golang.org_x_text@v0.31.0-LICENSE` deleted
- `third_party/licenses/go/golang.org_x_tools@v0.38.0-LICENSE` deleted
- `third_party/licenses/npm/yaml@2.4.2-LICENSE` deleted
- `third_party/licenses/go/golang.org_x_image@v0.39.0-LICENSE` added
- `third_party/licenses/go/golang.org_x_mod@v0.34.0-LICENSE` added
- `third_party/licenses/go/golang.org_x_sync@v0.20.0-LICENSE` added
- `third_party/licenses/go/golang.org_x_text@v0.36.0-LICENSE` added
- `third_party/licenses/go/golang.org_x_tools@v0.43.0-LICENSE` added
- `third_party/licenses/npm/yaml@2.8.3-LICENSE` added

Rationale:

- `golang.org/x/image` security remediation changed the Go dependency graph.
- Notice generation also exposed related indirect Go module license snapshot updates.
- Frontend dependency metadata has changed and must stay aligned with generated runtime notices.
- `python3 scripts/report_release_scope.py` confirms this dependency notice unit is complete: all five dependency/notice metadata files are present with generated license snapshot changes.

Validation already run:

- `python3 scripts/generate_third_party_notices.py`
- `./scripts/check.sh full`
- `govulncheck ./...` in `backend/`
- `staticcheck ./...` in `backend/`
- `go test ./...` in `backend/`
- `go vet ./...` in `backend/`
- `gosec -quiet -exclude=G117,G702,G703,G704,G705 ./...`

`./scripts/check.sh full` now verifies third-party notice reproducibility by comparing the `THIRD_PARTY_NOTICES.md` and `third_party/licenses/` file tree before and after regeneration. That keeps dirty local worktrees from failing only because generated dependency snapshots are intentionally present but not committed yet.

## Source/Test/Docs Candidate Sets

The table below is a historical reference snapshot. For the current file-level untracked top-level groups, run `python3 scripts/report_release_scope.py --untracked-files all`.

| Group | Untracked Count | Release Scope Guidance |
|---|---:|---|
| `backend/` | 9 | Review as backend helper, store, and test additions. |
| `frontend/` | 6 | Review as frontend source and unit test additions. |
| `notes/` | 7 | Review as project/frontend design reports and keep indexed from `notes/INDEX.md`. |
| `scripts/` | 3 | Include with release/check tooling changes referenced by CI. |

## Release Unit Candidate Summary

The table below is a historical reference snapshot. `python3 scripts/report_release_scope.py --untracked-files all` is the current source of truth for candidate review/staging units:

| Unit | Paths | Tracked | Untracked | Deleted | Guidance |
|---|---:|---:|---:|---:|---|
| `release-scope-tooling` | 3 | 3 | 0 | 0 | Review release-scope scripts, reports, and ignore policy together. |
| `release-gate-ci-deploy` | 38 | 37 | 1 | 0 | Review CI, release gate, workflow, container, compose, deploy, and chart changes together. |
| `backend-api-provider-surface` | 48 | 46 | 2 | 0 | Review backend HTTP/API, provider, auth, realtime, and download-proxy behavior together. |
| `backend-runtime-store-jobs` | 9 | 6 | 3 | 0 | Review backend app, db, jobs, store, and websocket runtime behavior together. |
| `backend-other` | 4 | 0 | 4 | 0 | Review remaining backend changes by package. |
| `frontend-objects` | 45 | 45 | 0 | 0 | Review Objects page source, hooks, and tests together. |
| `frontend-buckets` | 16 | 13 | 3 | 0 | Review Buckets and governance UI changes together. |
| `frontend-jobs` | 25 | 24 | 1 | 0 | Review Jobs page source and tests together. |
| `frontend-profiles` | 16 | 16 | 0 | 0 | Review Profiles page source and tests together. |
| `frontend-uploads` | 2 | 2 | 0 | 0 | Review Uploads page source and tests together. |
| `frontend-transfers` | 9 | 7 | 2 | 0 | Review transfer runtime/source changes together. |
| `frontend-shell-theme` | 7 | 7 | 0 | 0 | Review app shell, routing, theme, and bootstrap changes together. |
| `frontend-shared-components` | 21 | 21 | 0 | 0 | Review shared component changes together. |
| `frontend-api-contracts` | 4 | 4 | 0 | 0 | Review frontend API client/query contract changes together. |
| `frontend-lib` | 2 | 2 | 0 | 0 | Review frontend shared library changes together. |
| `frontend-e2e` | 18 | 18 | 0 | 0 | Review Playwright specs, snapshots, and browser-lane config together. |
| `frontend-docs` | 1 | 1 | 0 | 0 | Review frontend documentation changes together. |
| `frontend-other` | 13 | 13 | 0 | 0 | Review remaining frontend changes by nearby owner. |
| `docs` | 14 | 7 | 7 | 0 | Review repository documentation and release docs together. |
| `scripts-tooling` | 9 | 7 | 2 | 0 | Review repository scripts together. |

## Ignored Root Local Evidence Artifacts

These root files looked like local evidence artifacts rather than source files and are now covered by root-local ignore policy. Do not include similar root files in a release commit; preserve intentional evidence under `docs/release/evidence/` instead.

- `buckets-page.png`
- `jobs-page.png`
- `jobs-upload-modal.png`
- `objects-mobile.png`
- `objects-page.png`
- `profiles-desktop.png`
- `profiles-mobile.png`
- `profiles-page.png`
- `uploads-page.png`
- `playwright-profiles-snapshot.md`
- `profiles-deep.md`
- `process`

The file `process` is zero bytes and should be treated as disposable unless the user says otherwise.

## Completed Local Preparation

- Release unit inventory, checklist, manifest, path-list, and stage-command dry-runs are available from `python3 scripts/report_release_scope.py`.
- `python3 scripts/report_release_scope.py --format json --untracked-files all` was verified to include `path_list_command` and `stage_command` fields for every release unit.
- Full manual review manifest generation was verified with `python3 scripts/report_release_scope.py --format manifest --untracked-files all`; the output contained 1108 lines and did not stage or mutate files.
- Unit manifest and staging dry-runs were spot-checked for the highest-risk units: `dependency-notices`, `backend-api-provider-surface`, and `frontend-objects`.
- Strict file-level scope validation currently passes with no root-local artifacts, no split dependency/license unit, no collapsed untracked directories, and no catch-all `other` release unit.

## Remaining Required Actions

1. Review and stage the dependency/license snapshot set as one unit; do not split dependency metadata, `THIRD_PARTY_NOTICES.md`, or `third_party/licenses/` changes.
2. Stage source/test/docs/workflow/chart files by the release unit candidates above rather than all at once.
3. Run `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all` after final scope selection.
4. Re-run `./scripts/check.sh full` and `python3 scripts/check_clean_snapshot.py full` after scope selection if the staged release candidate changes.
5. Run provider live checks and reverse-proxy smoke for provider-facing and proxy/auth changes using [docs/release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-02.md](release/evidence/LIVE_EVIDENCE_CHECKLIST_2026-05-02.md).
6. Run `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>` after evidence files are recorded.
7. Verify the final candidate from a clean checkout or clean CI runner before tagging.

Use `python3 scripts/report_release_scope.py --format json` if a reviewer needs the same inventory as machine-readable evidence; release unit objects include `path_list_command` and `stage_command` fields for automation that should not reconstruct staging commands itself.
Before final release review, use `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all` to fail if local evidence files, split dependency/license scope, collapsed untracked directories, or catch-all `other` release-unit paths are still present.
