# `BucketPolicyModal.tsx` Split Plan

## Goal

- Reduce [BucketPolicyModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx) into smaller units with clearer ownership.
- Keep current route behavior, provider-specific policy editing, and validation behavior unchanged during the split.
- Split by responsibility first, then reduce local state concentration.

## Current Hotspots

- Modal shell and fetch lifecycle are coupled to editor rendering.
- [BucketPolicyModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx:71) owns:
  - modal shell
  - query wiring
  - mobile/desktop shell choice
- [BucketPolicyModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx:150) owns:
  - editor state
  - provider-specific structured state
  - mutations
  - validation
  - diff rendering
  - footer actions
- [BucketPolicyModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx:1227) still contains local diff logic.

## Proposed Split

### Phase 1: Modal shell and query boundary

#### New files

- `BucketPolicyModalShell.tsx`
- `useBucketPolicyQuery.ts`

#### Move out

- query loading/error/success shell
- modal title and route-level bucket/context handling
- mobile vs desktop shell selection

#### Keep in main editor for now

- editing state
- mutations
- structured editor controls

## Phase 2: Provider editor state and conversion

#### New files

- `useBucketPolicyStructuredState.ts`
- `bucketPolicyStructuredState.ts`

#### Move out

- initial GCS state extraction
- initial Azure state extraction
- `updateStructuredStateFromText`
- policy preset application
- structured text serialization

#### Why

- This is the densest local-state block.
- It is also where provider-specific branching is concentrated.

## Phase 3: Validation and diff helpers

#### New files

- `bucketPolicyValidation.ts`
- `bucketPolicyDiff.ts`

#### Move out

- provider warning generation
- local validation errors
- diff generation
- diff stats
- visible diff filtering
- `unifiedDiff`

#### Guardrail

- Keep output strings and validation semantics identical.
- No UI copy changes in this phase.

## Phase 4: Actions and footer wiring

#### New files

- `useBucketPolicyMutations.ts`
- `BucketPolicyFooterActions.tsx`

#### Move out

- `putMutation`
- `deleteMutation`
- `validateMutation`
- footer button enable/disable logic
- provider action hints

## Phase 5: Final shell cleanup

#### Target for remaining main file

- small coordinator component
- composition of:
  - shell
  - editor
  - footer actions
  - validation/diff sections

## Suggested Write Scopes

### Commit 1

- `refactor(buckets): extract bucket policy modal query shell`

### Commit 2

- `refactor(buckets): extract structured policy state helpers`

### Commit 3

- `refactor(buckets): extract validation and diff helpers`

### Commit 4

- `refactor(buckets): extract modal mutations and footer actions`

### Commit 5

- `refactor(buckets): leave thin bucket policy modal coordinator`

## Validation

- `npm run lint`
- `npm run typecheck`
- targeted tests:
  - `BucketPolicyModal.test.tsx`
  - `BucketsPage.smoke.test.tsx`
  - `BucketsPage.routes.test.tsx`

## Recommendation

- Start with phase 1.
- That slice has the best risk/reward ratio because it reduces the file’s responsibility without immediately touching provider-specific validation logic.
