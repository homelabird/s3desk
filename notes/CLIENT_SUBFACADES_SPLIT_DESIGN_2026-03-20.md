# `clientSubFacades.ts` Split Design

Date: `2026-03-20`

## Current state

- Target file:
  - [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts)
- Approximate size:
  - about `392` lines
- Current role:
  - owns all sub-facade builder functions
  - owns the shared dependency contract
  - owns the bundle composition helper `createAPIClientFacades(...)`

## Decision

- Do not split immediately.
- Prepare a domain-family split design now so future work can land cleanly if the file grows again.

This is not an active blocker because:

- ownership is already clear
- the public API shape is stable
- tests are green
- the file is large but still cohesive

## Goal

If `clientSubFacades.ts` grows meaningfully, split by domain family without changing the public `APIClient` shape.

## Proposed target layout

- `clientFacadeDeps.ts`
  - `RequestFn`
  - `FetchResponseFn`
  - `XhrConfig`
  - `SubFacadeDeps`
- `clientCoreFacades.ts`
  - `createServerSubFacade`
  - `createProfilesSubFacade`
- `clientStorageFacades.ts`
  - `createBucketsSubFacade`
  - `createObjectsSubFacade`
- `clientTransferFacades.ts`
  - `createUploadsSubFacade`
  - `createJobsSubFacade`
- `clientSubFacades.ts`
  - keep as barrel/composition entry
  - export `createAPIClientFacades(...)`
  - re-export the individual `create*SubFacade(...)` functions if still needed

## Why this family split is preferred

### `core`

- `server`
- `profiles`

Reason:
- admin/bootstrap/profile lifecycle concerns

### `storage`

- `buckets`
- `objects`

Reason:
- S3/GCS/Azure bucket and object browsing surface

### `transfer`

- `uploads`
- `jobs`

Reason:
- upload handoff, artifacts, logs, and job orchestration live in the same usage orbit

## Trigger conditions

Do the split only when one or more of these becomes true:

- [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts) exceeds about `500` to `550` lines
- new domains are added to the API layer
- review churn shows unrelated changes colliding in the same file
- `mockApiClient.ts` and facade builders start needing the same type helpers in multiple places

## Guardrails

- Keep [`client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts) unchanged from the caller perspective.
- Keep `createAPIClientFacades(...)` as the single bundle constructor.
- Do not duplicate `SubFacadeDeps` types across files.
- Avoid circular imports between family files.

## Recommended implementation order

1. extract `clientFacadeDeps.ts`
2. move `server/profiles` to `clientCoreFacades.ts`
3. move `buckets/objects` to `clientStorageFacades.ts`
4. move `uploads/jobs` to `clientTransferFacades.ts`
5. turn [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts) into barrel + bundle composition

## Validation

- `npm run lint && npm run typecheck`
- `npx vitest run`

## Recommendation now

- Hold
- Reevaluate only when trigger conditions are met
