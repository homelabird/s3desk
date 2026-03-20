# `BucketModal` Split Plan

Date: `2026-03-20`

## Current state

- Target file:
  - [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx)
- Approximate size:
  - about `258` lines
- Current responsibilities mixed in one file:
  - modal shell
  - name/region form state
  - provider-specific secure-default state
  - provider-specific default serialization
  - provider-specific secure-default presentation selection
  - submit/cancel/reset flow

## Why this is the next frontend hotspot

- `BucketPolicyModal` and profile modal sections were already split.
- `BucketModal` is now the largest remaining bucket-entry UI coordinator that still mixes shell, state, and provider-specific default-building logic.
- The file is still readable, but it is carrying logic that will grow again if:
  - OCI create defaults are added
  - AWS/GCS/Azure default rules become more detailed
  - create-time validation expands

## Goal

Reduce [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx) to a thin coordinator without changing the bucket create UX or request payload semantics.

## Current responsibility map

### Shell and form flow

- dialog shell
- footer actions
- submit/cancel/reset flow
- region field visibility metadata

### Provider default state

- AWS defaults state
- GCS defaults state
- Azure defaults state
- row key generation for provider list items

### Provider default serialization

- `buildAWSDefaults`
- `buildGCSDefaults`
- `buildAzureDefaults`
- `buildDefaults`

### Provider UI selection

- `renderSecureDefaults`

## Target file layout

- `BucketModal.tsx`
  - modal coordinator
  - submit/cancel flow
  - compose shell + provider form sections
- `bucketCreateDefaultsState.ts`
  - initial provider state grouping
  - reset helpers
  - region metadata helper
- `bucketCreateDefaultsBuild.ts`
  - `buildAWSDefaults`
  - `buildGCSDefaults`
  - `buildAzureDefaults`
  - `buildBucketCreateDefaults`
- `BucketCreateDefaultsSection.tsx`
  - provider switch for secure-default UI
  - fallback provider hint
- optional `bucketCreateDefaultsKeys.ts`
  - `nextKey` helper only if the key generation survives after the first extraction

## Recommended phase plan

## Phase 1: serialization helper extraction

### Intent

Move provider default serialization out first because it is pure logic and easiest to test.

### Files

- new: [`bucketCreateDefaultsBuild.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/bucketCreateDefaultsBuild.ts)
- edit: [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx)

### Candidate content

- `buildAWSDefaults`
- `buildGCSDefaults`
- `buildAzureDefaults`
- `buildDefaults` replacement as `buildBucketCreateDefaults(...)`

### Validation

- `npm run lint && npm run typecheck`
- targeted bucket modal test

## Phase 2: provider section shell extraction

### Intent

Move the provider switch and fallback hint out of the modal shell.

### Files

- new: [`BucketCreateDefaultsSection.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketCreateDefaultsSection.tsx)
- edit: [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx)

### Candidate content

- `renderSecureDefaults`
- fallback info alert for unsupported providers

### Validation

- `npm run lint && npm run typecheck`
- targeted bucket modal test

## Phase 3: state/reset helper extraction

### Intent

Move state initialization/reset helpers and provider region metadata out of the coordinator.

### Files

- new: [`bucketCreateDefaultsState.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/bucketCreateDefaultsState.ts)
- edit: [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx)

### Candidate content

- provider region metadata helper
- provider defaults reset helper
- optional row key helper if still justified

### Validation

- `npm run lint && npm run typecheck`
- targeted bucket modal test

## Phase 4: coordinator cleanup

### Intent

Leave [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx) as shell + event wiring only.

### Result target

- local state
- submit/cancel callbacks
- minimal composition only

## Guardrails

- Do not change the `BucketCreateRequest` payload shape.
- Do not rework the create UX.
- Keep provider defaults behavior byte-for-byte equivalent where possible.
- Prefer pure helper extraction before any UI extraction.

## Acceptance target

- [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx) is materially smaller and mainly coordinates state + submit flow.
- Provider-specific serialization logic is outside the modal.
- Secure-default provider switching is isolated from the shell.

## Recommended next slice

- Start with Phase 1: `bucketCreateDefaultsBuild.ts`

## Current implementation status

- Completed
- Implemented files:
  - [`bucketCreateDefaultsBuild.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/bucketCreateDefaultsBuild.ts)
  - [`BucketCreateDefaultsSection.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketCreateDefaultsSection.tsx)
  - [`bucketCreateDefaultsState.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/bucketCreateDefaultsState.ts)
- [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx) now acts primarily as:
  - local state holder
  - submit/cancel coordinator
  - modal composition shell
- Targeted validation already passed during the split:
  - `npm run lint && npm run typecheck`
  - `npx vitest run src/pages/buckets/__tests__/BucketModal.test.tsx`
