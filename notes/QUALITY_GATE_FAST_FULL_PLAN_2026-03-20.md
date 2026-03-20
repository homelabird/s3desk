# Local quality gate fast/full plan

Date: `2026-03-20`

## Goal

Align the standard local quality path with the browser-facing risk that CI already enforces, without turning the default developer loop into a full end-to-end pipeline.

## Current baseline

- [`scripts/check.sh`](/home/homelab/Downloads/project/s3desk/scripts/check.sh) currently runs:
  - OpenAPI validation
  - release gate checks
  - optional Helm validation
  - backend `gofmt`, `go vet`, `go test`
  - frontend `npm ci`, `check:openapi`, `lint`, `test:unit`, `build`
  - third-party notices verification
- [`frontend/package.json`](/home/homelab/Downloads/project/s3desk/frontend/package.json) already exposes:
  - `test:e2e:core`
  - `test:e2e:mobile-responsive`
- [`.github/workflows/frontend-e2e.yml`](/home/homelab/Downloads/project/s3desk/.github/workflows/frontend-e2e.yml) already enforces:
  - `Core Mock E2E`
  - `Mobile Responsive E2E (Required)`

The gap is that the standard local gate still has no browser-level check at all.

## Recommended command model

Keep one script, but add explicit modes:

- `./scripts/check.sh`
  - default to `full`
- `./scripts/check.sh full`
  - same as default
- `./scripts/check.sh fast`
  - skip browser smoke only

Reason:

- `check.sh` is already treated as the main local gate
- defaulting to `fast` would silently weaken that contract
- an explicit `fast` mode gives developers a shorter iteration loop without changing the meaning of the default command

## Proposed behavior

### `fast`

Run the current non-browser validations only:

- `validate_openapi.sh`
- `check_release_gate.sh`
- optional Helm chart validation
- backend `gofmt`
- backend `go vet`
- backend `go test`
- frontend `npm ci`
- frontend `check:openapi`
- frontend `lint`
- frontend `test:unit`
- frontend `build`
- third-party notices verification

### `full`

Run everything in `fast`, plus one thin Playwright browser smoke layer:

- `npm run test:e2e:smoke`

This is enough to close the biggest confidence gap without trying to run the entire mock or mobile matrix locally by default.

## Required frontend script additions

Add these scripts to [`frontend/package.json`](/home/homelab/Downloads/project/s3desk/frontend/package.json):

- `test:e2e:smoke`
  - recommended shape:
  - `playwright test --grep @check-smoke --project=chromium`
- `test:e2e:smoke:deps`
  - recommended shape:
  - `npx playwright install chromium && npm run test:e2e:smoke`

Reason:

- `check.sh full` needs one stable browser command
- browser installation should stay explicit instead of being hidden inside every `check.sh` run
- `chromium` only is the right first step for local smoke cost control

## Required Playwright scope changes

Introduce a small `@check-smoke` subset.

Recommended initial scope:

- login / auth bootstrap
- shell boot / route mount
- one primary object-flow smoke

Do not include:

- the full `Core Mock E2E` matrix
- the dedicated mobile responsive matrix
- any live environment specs

The smoke layer should answer only this question:

- “Does the app boot and does one real browser path still work?”

## `scripts/check.sh` patch shape

Recommended structure:

1. Parse mode near the top:
   - `MODE="${1:-full}"`
2. Validate allowed values:
   - `fast`
   - `full`
3. Keep the existing current body as the shared base path
4. Add one conditional near the end of the frontend section:
   - if `MODE=full`, run `npm run test:e2e:smoke`
5. Print the selected mode in logs:
   - `[check] mode: fast`
   - `[check] mode: full`

## CI relationship

No mandatory CI workflow rewrite is needed in the first pass.

Existing CI checks remain:

- `Frontend E2E / Core Mock E2E`
- `Frontend E2E / Mobile Responsive E2E (Required)`

The local smoke command is not meant to replace them. It is meant to remove the current zero-browser gap in the default local gate.

Optional follow-up after rollout:

- add a short summary note in [`.github/workflows/frontend-e2e.yml`](/home/homelab/Downloads/project/s3desk/.github/workflows/frontend-e2e.yml) or related docs that maps:
  - local `./scripts/check.sh fast`
  - local `./scripts/check.sh full`
  - CI required checks

## Rollout order

### Phase 1

- add `fast/full` mode handling to `check.sh`
- add `test:e2e:smoke` and `test:e2e:smoke:deps` scripts
- document the intended command contract

### Phase 2

- tag a minimal Playwright subset with `@check-smoke`
- keep the smoke command desktop-only
- verify that `full` stays acceptable for local use

### Phase 3

- if local adoption is good, link the command mapping from quality docs and release-gate docs

## Acceptance criteria

- `./scripts/check.sh` has explicit `fast` and `full` modes
- default `./scripts/check.sh` includes at least one browser smoke command
- developers have a documented shorter path via `./scripts/check.sh fast`
- CI remains the source of truth for the full E2E matrix

## Non-goals

- replacing `Core Mock E2E`
- replacing `Mobile Responsive E2E (Required)`
- running full Playwright coverage from `check.sh`
- adding live E2E to local default checks

## Recommendation

Implement this before the backend security-scan expansion.

Reason:

- this change improves confidence for every frontend change immediately
- the repository already has Playwright infrastructure, so the missing part is command orchestration, not tooling invention
