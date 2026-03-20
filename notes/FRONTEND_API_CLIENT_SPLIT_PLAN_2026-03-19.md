# Frontend API Client Split Plan

Date: `2026-03-19`

## Current status

- The main breakup is complete.
- Transport, error, config, headers, and upload helpers are already extracted.
- Post-split cleanup is also complete:
  - low-level retry transport renamed to [`retryTransport.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/retryTransport.ts)
  - facade contracts extracted to [`clientContracts.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientContracts.ts)
  - test mock builder added at [`mockApiClient.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/test/mockApiClient.ts)
  - facade bundle wiring consolidated in [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts)
- Domain modules are in place for:
  - `profiles`
  - `buckets`
  - `objects`
  - `uploads`
  - `downloads`
  - `jobs`
  - `server`
- Internal frontend call sites were migrated to domain sub-facades.
- Top-level compatibility wrappers are no longer the primary calling path.
- The facade shell is now materially reduced:
  - [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts) is about `106` lines

## Current public shape

- [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts) now acts as the stable facade.
- The preferred access path is through domain sub-facades such as:
  - `client.server.*`
  - `client.jobs.*`
  - `client.buckets.*`
  - `client.objects.*`
  - `client.uploads.*`
  - `client.profiles.*`

## Validation status

- `npm run lint && npm run typecheck`
- `npx vitest run`

Both passed after the split and call-site migration work.
Both also passed after the post-split cleanup slices landed.

## Goal

Split [`frontend/src/api/client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts) into transport, error, and domain-focused modules while keeping a stable calling surface for UI code.

## Cleanup result

- [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts) is now primarily:
  - base URL/token state
  - transport creation
  - sub-facade exposure
- The old `client.ts` monolith hotspot is gone.
- The remaining larger file in this area is now:
  - [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts)
  - about `392` lines

## Target module layout

- `frontend/src/api/client.ts`
  - keep as facade
  - export `APIClient`
  - re-export public error types/constants when needed
- `frontend/src/api/transport.ts`
  - `fetchWithTimeout`
  - `fetchWithRetry`
  - retry delay helpers
  - idempotency/status retry checks
- `frontend/src/api/errors.ts`
  - `APIError`
  - `RequestTimeoutError`
  - `RequestAbortedError`
  - normalized error parsing
  - `parseAPIError`
- `frontend/src/api/config.ts`
  - timeout/retry constants
  - retry storage keys
  - retry defaults reader
  - numeric clamp helpers if still shared
- `frontend/src/api/headers.ts`
  - safe header validation
  - fetch/XHR header helpers
- `frontend/src/api/uploads.ts`
  - upload file helpers
  - multipart file creation helpers
- `frontend/src/api/domains/profiles.ts`
  - profile-related request methods
- `frontend/src/api/domains/buckets.ts`
  - bucket policy/governance/sharing/access methods
- `frontend/src/api/domains/objects.ts`
  - object listing, metadata, search, favorites
- `frontend/src/api/domains/jobs.ts`
  - jobs and transfers methods
- `frontend/src/api/domains/server.ts`
  - server backup/restore/portable/migration methods

## Stable API strategy

- Keep `APIClient` as the public type used by React code.
- Convert `APIClient` methods into thin wrappers that delegate to domain helpers.
- Do not rewrite all callers during the split.
- Defer any public naming cleanup until after the module split is stable.

## Recommended implementation order

## Step 1

Extract pure utilities with no behavior change.

Files:

- `config.ts`
- `headers.ts`
- `uploads.ts`
- `errors.ts`
- `transport.ts`

Why:

- Lowest coupling to the rest of the file.
- Produces immediate test seams for transport and error behavior.

## Step 2

Create domain modules behind the existing `APIClient`.

Files:

- `domains/profiles.ts`
- `domains/buckets.ts`
- `domains/objects.ts`
- `domains/jobs.ts`
- `domains/server.ts`

Why:

- Keeps call sites stable.
- Lets each migration land domain by domain.

## Step 3

Shrink `client.ts` to a facade.

Files:

- `client.ts`

Target:

- constructor and shared request primitive
- domain delegation methods
- public exports

## Risks to control

- Circular dependencies between `client.ts`, `transport.ts`, and domain modules.
- Type drift if domain modules start importing too many UI-facing types directly.
- Hidden coupling between upload helpers and transport behavior.

## Guardrails

- Prefer moving logic, not rewriting it.
- Keep error semantics unchanged.
- Keep retry defaults and timeout behavior identical during the split.
- Add or preserve focused unit tests around transport/error helpers when the split starts.

## Acceptance target

- `client.ts` is no longer a monolith.
- Transport and error logic are independently testable.
- Domain API changes can be reviewed without scanning unrelated upload or retry code.

## Status against acceptance target

- Completed
- The acceptance target for the API client split and cleanup has been met.

## Optional future work

### Option 1: split `clientSubFacades.ts` by domain family

- Only if the file keeps growing.
- Candidate files:
  - `clientServerFacade.ts`
  - `clientDataFacades.ts`
  - `clientTransferFacades.ts`

### Option 2: broaden `mockApiClient` adoption

- Continue moving repeated inline test mocks to:
  - [`mockApiClient.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/test/mockApiClient.ts)
- This is test ergonomics work, not a structural blocker.

## Recommended next slice

- Do not keep treating `APIClient` shell cleanup as an active hotspot.
- If frontend cleanup resumes in this area, reevaluate `clientSubFacades.ts` only if domain count or test burden grows again.
