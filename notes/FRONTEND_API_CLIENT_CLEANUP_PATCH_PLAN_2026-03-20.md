# Frontend API Client Cleanup Patch Plan

## Goal

Finish the post-split cleanup after the move to sub-facades in [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts).

The main structural split already exists. The remaining work is to reduce naming overlap, centralize test ownership, and make the public facade thinner and easier to maintain.

## Current Ownership Baseline

Core files:

- [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts)
- [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts)
- [`clientTransport.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientTransport.ts)
- [`transport.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/transport.ts)
- [`config.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/config.ts)
- [`errors.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/errors.ts)
- [`headers.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/headers.ts)
- [`types.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/types.ts)

Domain files:

- [`domains/server.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/domains/server.ts)
- [`domains/profiles.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/domains/profiles.ts)
- [`domains/buckets.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/domains/buckets.ts)
- [`domains/objects.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/domains/objects.ts)
- [`domains/uploads.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/domains/uploads.ts)
- [`domains/downloads.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/domains/downloads.ts)
- [`domains/jobs.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/domains/jobs.ts)

## Remaining Cleanup Target

The remaining issues are:

- `transport.ts` and `clientTransport.ts` have overlapping naming
- test mocks are still scattered file by file
- `client.ts` still owns more facade wiring than necessary
- the public API shape is not documented or enforced in one place

## Patch Strategy

Do not reopen the domain split. Focus on ownership cleanup and test ergonomics.

## Slice 1: Transport naming consolidation

### Intent

Remove ambiguity between low-level retry transport and client-level transport wiring.

### Target choice

Pick one of these and commit to it:

- keep [`clientTransport.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientTransport.ts) as the public transport module and fold [`transport.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/transport.ts) into it
- or rename [`transport.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/transport.ts) to a narrower name such as `retryTransport.ts`

### Files

- [`clientTransport.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientTransport.ts)
- [`transport.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/transport.ts)
- direct importers under `frontend/src/api`

### Acceptance

- one obvious transport entrypoint remains
- no duplicate naming layer for the same concern

### Validation

- `npm run lint && npm run typecheck`

## Slice 2: Facade contract extraction

### Intent

Move facade interface typing out of [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts) so the file is mostly composition.

### Target file

- new: [`clientContracts.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientContracts.ts)

### Candidate content

- `ServerAPI`
- `ProfilesAPI`
- `BucketsAPI`
- `ObjectsAPI`
- `UploadsAPI`
- `JobsAPI`
- `APIClientShape`

### Acceptance

- `client.ts` no longer declares bulky facade contracts inline
- domain sub-facade builder signatures are explicit

### Validation

- `npm run lint && npm run typecheck`

## Slice 3: Test support centralization

### Intent

Stop rebuilding ad-hoc sub-facade mocks in many test files.

### Target files

- new: [`test/mockApiClient.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/test/mockApiClient.ts)
- optional new: [`test/mockApiFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/test/mockApiFacades.ts)

### Pull from

- repeated inline mocks in page/component tests

### Scope

Start with the areas that were recently migrated:

- `jobs`
- `buckets`
- `profiles`
- `objects`

### Acceptance

- new tests can import one canonical mock builder
- existing migrated tests stop duplicating `server/jobs/buckets/...` sub-facade boilerplate

### Validation

- `npx vitest run`

## Slice 4: Thin facade shell cleanup

### Intent

Make [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts) read as a coordinator instead of a mixed implementation file.

### Files

- [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts)
- [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts)
- [`clientContracts.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientContracts.ts) if added

### Work

- keep transport creation in one place
- keep sub-facade getter wiring in one place
- remove redundant re-exports that exist only for historical compatibility
- keep public exports intentional and minimal

### Acceptance

- `client.ts` is primarily constructor/composition code
- tests and consumers use sub-facade shape as the default

### Validation

- `npm run lint && npm run typecheck`
- `npx vitest run`

## Recommended Commit Order

1. `refactor(api): consolidate transport naming`
2. `refactor(api): extract client facade contracts`
3. `test(api): centralize api client mock builders`
4. `refactor(api): thin client facade shell`

## Out of Scope

- changing request behavior
- changing error semantics
- reopening domain ownership boundaries
- changing page-level API usage patterns that already migrated

## Done Condition

The cleanup is complete when:

- transport naming is unambiguous
- sub-facade contracts live outside [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts)
- test mock setup is centralized
- [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts) is mostly composition and public export wiring
