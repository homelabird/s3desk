# Security Remediation Follow-up

Date: 2026-08-06
Scope: ChatGPT Codex Cloud security findings (detected 2026-08-05) for `homelabird/s3desk`.

## Status overview

The 2026-08-05 scan produced 15 findings. Compared against `main`:

- **Fixed in repo** (4): quick-run podman credentials (`a85b17e`), demo bind host known token (`752af59`), GCS governance SSRF (`gcsauth`/`profileendpoint` guards), GCS IAM conditional binding serialization (structured condition editor).
- **Remediated in the working tree** (11): #2, #3, #5, #7, #8, #9, #10, #11, #12, #13, #15.
- **External or protected-environment verification still required**: #2 shared-cluster policy/application acceptance, #8 deployed Vercel headers, #12 GitLab variable protection, and #13 Harbor/upstream digest parity.

## 2. Changes applied in the working tree (uncommitted)

All changes below are local edits; **nothing is committed or pushed** yet.

| Finding | Status | Files touched |
|---|---|---|
| #2 CI runner RBAC cluster-wide | Applied; disposable-cluster RBAC/admission and Helm smoke verified; shared-cluster acceptance pending | `k8s/gitlab-runner-namespace-admin.yaml`, `scripts/helm_k8s_smoke.sh`, `charts/s3desk/ci-values.yaml` |
| #3 localStorage token scoping | Applied | `frontend/src/auth/AuthProvider.tsx`, `frontend/src/lib/thumbnailCache.ts`, `frontend/src/lib/storageResetRegistry.ts` |
| #5 realtime ticket path check | Applied | `backend/internal/api/middleware_api_token.go`, `backend/internal/api/middleware_api_token_test.go` |
| #7 Dev proxy unauthenticated LAN API | Applied | `scripts/dev.sh` |
| #8 Vercel missing anti-clickjacking headers | Applied | `frontend/vercel.json` |
| #10 CI cached global npm executables | Applied | `.gitlab-ci.yml` |
| #11 CI image override steals secrets | Applied | `.gitlab-ci.yml` |
| #12 Live E2E CI credential exfiltration | Applied | `.gitlab-ci.yml` |
| #13 Harbor image sources | Digest-pinned; Harbor parity pending | `Containerfile`, `e2e/runner/Dockerfile` |
| #15 Lighthouse CI token leak | Applied | `lighthouserc.js`, `scripts/lighthouse_puppeteer_auth.js` |
| Pre-existing `.gitlab-ci.yml` YAML breakage | Applied | `.gitlab-ci.yml`, `scripts/render_policy_live_summary.js` (restored), `scripts/check_go_toolchain.py` |

## 3. What was verified

- `.gitlab-ci.yml` parses (Python PyYAML and Ruby Psych both succeed; both previously failed on `main`).
- `scripts/dev.sh`, `scripts/helm_k8s_smoke.sh`: `bash -n` OK.
- `lighthouserc.js`, `scripts/lighthouse_puppeteer_auth.js`, `scripts/render_policy_live_summary.js`: `node --check` OK; summary script ran end-to-end against sample NDJSON.
- `python3 scripts/check_go_toolchain.py`: OK (`1.25.10`). `scripts/check_go_toolchain.py` was updated because `.gitlab-ci.yml` no longer declares `GO_IMAGE` (image names are inlined, see #11).
- No leftover `$ALPINE_IMAGE`/`$GO_IMAGE`/`$NODE_IMAGE`/`$PODMAN_IMAGE`/`$PLAYWRIGHT_IMAGE`/`$TRIVY_IMAGE` references in `.gitlab-ci.yml`.
- `backend/internal/api` realtime-ticket tests cover rejection on `/api/v1/meta` and acceptance on `/api/v1/events`.
- Frontend thumbnail-cache tests cover token redaction and persistent-cache clearing; the cache no longer embeds the raw API token.
- Full frontend unit validation is `251/252` files and `1012/1013` tests; the one failure is the unrelated `ServerSettingsSection` expectation for `Backup and restore` versus the current `Backup` trigger.
- Playwright cache is `policy: pull`, so CI jobs cannot publish executable cache content.
- The regular GitLab `e2e` lane now refuses `E2E_LIVE=1`; live flows can only enter `e2e_live`, whose rule also requires a protected ref.
- `k8s/gitlab-runner-namespace-admin.yaml` includes a native `ValidatingAdmissionPolicy` that restricts the runner's RoleBinding to the labeled smoke namespace and pinned smoke role.
- The policy and binding pass `kubectl apply --dry-run=server` against the current Kubernetes `v1.31.12` API server; no shared-cluster resources were applied.
- A disposable local k3d `v1.31.12+k3s1` cluster was created and deleted after verification. With the runner service account impersonated, it could create/delete namespaces, create only the pinned smoke-role binding, and bind only `gitlab-runner-helm-smoke`; it could not bind `cluster-admin` or create cluster-role bindings.
- The same disposable cluster accepted the exact binding in a namespace labeled `s3desk.homelabird.com/helm-smoke=true`, granted `pods`, `pods/exec`, and `services` only inside that namespace, and denied an unlabeled namespace binding plus a binding with the wrong subject. The role-binding setup now uses `kubectl create -f -`, preserving the intended create-only RBAC permission.
- The smoke ClusterRole includes chart-owned `serviceaccounts`; the smoke script supplies a strong token and generates a fresh 32-byte base64 encryption key when the caller does not provide one, matching the server's remote-startup requirements.
- The same runner-token kubeconfig ran `bash scripts/helm_k8s_smoke.sh sqlite` successfully (Helm install, rollout, Service port-forward, `/healthz`, `/readyz`, and authenticated `/api/v1/meta`) and `bash scripts/helm_k8s_smoke.sh pvc` successfully (Helm install, rollout, pod `exec`, and persistence after pod replacement). Both namespaces were cleaned up.
- The current context is restored to `k3d-board-msa`; its required `gitlab-runner` namespace is absent, so the shared-cluster apply and shared-cluster smoke job remain unattempted.
- A local `S3DESK_FRONTEND_HOST=0.0.0.0` dev run reached the LAN address `192.168.0.227`; the SPA returned `200 text/html`, unauthenticated `/api/v1/meta` returned `401 application/json`, and token-authenticated `/api/v1/meta` returned `200 application/json`.
- `podman build -f Containerfile.local -t localhost/s3desk:security-remediation-smoke .` completed and supplied the disposable-cluster smoke image. Production Harbor image references are digest-pinned to the checked upstream manifests; the internal Harbor endpoint was unreachable from this run, so mirror parity is not proven.

## 4. Remaining work to do

### 4.1 Review and commit the working tree changes

- [x] `git diff` review of the remediation changes above.
- [ ] Commit the remediation changes in logical security units.
- [ ] Push and watch the GitLab pipeline; confirm `.gitlab-ci.yml` actually parses in GitLab (it was broken on `main` since `c899d34`).

### 4.2 #2 RBAC — cluster verification
- [x] Apply `k8s/gitlab-runner-namespace-admin.yaml` to a disposable Kubernetes `v1.31.12+k3s1` test cluster with a `gitlab-runner` namespace; delete the cluster after verification.
- [x] Impersonated runner checks confirmed `create/delete namespace`, `create rolebinding`, and `bind` only for `gitlab-runner-helm-smoke`; `bind cluster-admin` and `create clusterrolebindings` were denied.
- [x] The generated namespace label and exact self-binding path were accepted, and the binding granted the smoke role only in that namespace (`pods`, `pods/exec`, and `services` allowed there; `pods` denied outside it).
- [x] Run `helm_k8s_smoke_sqlite` in the disposable cluster and confirm Helm install, rollout, port-forward, `/healthz`, `/readyz`, and authenticated `/api/v1/meta`.
- [x] Run `helm_k8s_smoke_pvc` in the disposable cluster and confirm Helm install, rollout, pod `exec`, and persistence after pod replacement.
- [ ] Apply the manifest and repeat the smoke acceptance in the protected/shared cluster; its `gitlab-runner` namespace is absent from the current context.
- [x] The native RBAC rule for `rolebindings {create}` remains cluster-wide; the manifest now adds `ValidatingAdmissionPolicy` `s3desk-gitlab-runner-smoke-rolebinding` to restrict that runner identity to the labeled namespace and pinned smoke role.
- [x] The policy denied an exact-role binding in an unlabeled namespace and a pinned-role binding with the wrong subject.

### 4.3 #12 Live E2E — GitLab settings (cannot be done from YAML)
- [ ] In GitLab project settings, mark `E2E_API_TOKEN`, `E2E_S3_*`, and any other credential variables as **Protected** so they are only injected on protected refs.
- [ ] Ensure the branches undeployed for release/staging are marked protected; otherwise `CI_COMMIT_REF_PROTECTED == "true"` never matches.
- [ ] Reconsider whether the non-live `e2e` job also needs the same gates when it touches live credentials in the future.

### 4.4 #15 Lighthouse — docs/examples
- [x] The removed cron/systemd examples are still absent (`scripts/cron/`, `scripts/systemd/` are empty), and `docs/TESTING.md` documents `S3DESK_URL` as required for Lighthouse.
- [x] Only run `lighthouse` against origins you control; the puppeteer auth script refuses to run without `S3DESK_URL` and refuses to write the token outside `S3DESK_URL`'s origin.
- [x] `lighthouse_puppeteer_auth.js` requires the explicit `S3DESK_LH_ALLOW_TOKEN_STORAGE=1` opt-in before writing the API token into localStorage.

### 4.5 #8 Vercel
- [ ] Deploy the `frontend/vercel.json` change and confirm with `curl -I` that `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` are emitted on the SPA response.
- [ ] Note: Vercel headers only apply to responses served by Vercel; the Go backend headers already cover non-Vercel hosting.

### 4.6 #7 Dev proxy - validate exposed LAN path
- [x] Run a LAN-exposed dev session with `S3DESK_FRONTEND_HOST=0.0.0.0`; from `192.168.0.227`, the SPA returned `200 text/html`, `/api/v1/meta` returned `401 application/json` without a token, and `200 application/json` with the supplied token.
- [x] Keep the generated token in the local dev console for login usability; `S3DESK_AUTO_GENERATE_TOKEN=0` disables generation and fails closed.

### 4.7 #10/#11 CI - validation scripts/docs
- [x] `scripts/check_release_gate.sh` and `docs/RELEASE_GATE.md` / `docs/TESTING.md` now check and describe literal digest-pinned `image:` references instead of `PODMAN_IMAGE`.
- [x] `scripts/check_release_gate.sh` now guards the Vercel anti-clickjacking headers, Lighthouse explicit-origin opt-in, and smoke RoleBinding admission policy against regression.
- [x] The regular `e2e` lane is explicitly non-live; `e2e_live` remains the protected-ref lane for live credentials.
- [x] `notes/PROJECT_QUALITY_ANALYSIS_2026-05-18.md` now labels the old `PODMAN_IMAGE` wording as historical and points to the current literal-image contract.
- [ ] Confirm improving the `before_script` npm reinstall order is acceptable with the team (the pinned `npm install -g "npm@${NPM_VERSION}"` now runs against the base image npm because `.cache/npm-global/` is no longer cached).

### 4.8 Partially-fixed items
- [x] #3: thumbnail keys use the existing server-scope hash, and logout/token replacement clears persisted UI, transfer, and thumbnail state.
- [x] #5: realtime tickets are accepted only on the registered `/api/v1/events` and `/api/v1/ws` paths.
- [x] #9: the shared Playwright cache is pull-only.
- [ ] #13: production references use upstream-checked digests, but Harbor digest parity still needs registry access and a test build.

## 5. Notes to reproduce/verify

```bash
# Syntax checks
bash -n scripts/dev.sh && bash -n scripts/helm_k8s_smoke.sh
node --check lighthouserc.js && node --check scripts/lighthouse_puppeteer_auth.js && node --check scripts/render_policy_live_summary.js
python3 - <<'PY'
import yaml
yaml.safe_load(open('.gitlab-ci.yml'))
print('yaml ok')
PY

# Toolchain consistency
python3 scripts/check_go_toolchain.py
```
