# `mockApiClient` Remaining Candidates

Date: `2026-03-20`

## Goal

Identify the last test files where adopting [`mockApiClient.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/test/mockApiClient.ts) is still useful.

## Current adoption status

`mockApiClient` is already used in:

- objects preview/thumbnail tests
- jobs logs/action/upload-details tests
- bucket policy/governance tests
- sidebar backup action tests

## Final cleanup candidates

### Priority 1

- [useObjectsPresign.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/__tests__/useObjectsPresign.test.tsx)

Reason:
- still uses a small inline `objects` sub-facade mock
- this is a direct fit for `createMockApiClient({ objects: ... })`
- low-risk conversion

### Priority 2

- [useObjectsPrefetch.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/__tests__/useObjectsPrefetch.test.tsx)

Reason:
- still uses `as unknown as APIClient`
- likely another small objects-only test seam
- same low-risk conversion pattern as the preview/thumbnail tests

## Hold, not immediate candidates

### Page-level suites using `APIClient.prototype` getter spies

Examples:

- [FullAppInner.smoke.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/__tests__/FullAppInner.smoke.test.tsx)
- [UploadsPage.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/__tests__/UploadsPage.test.tsx)
- [BucketsPage.routes.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/__tests__/BucketsPage.routes.test.tsx)
- [BucketsPage.smoke.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/__tests__/BucketsPage.smoke.test.tsx)
- [ProfilesPage.smoke.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/__tests__/ProfilesPage.smoke.test.tsx)
- [ProfilesPage.lazy.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/__tests__/ProfilesPage.lazy.test.tsx)

Reason:
- these are page integration tests
- they intentionally patch `APIClient.prototype` getter paths
- forcing them onto `mockApiClient` would not obviously reduce complexity

### Tests already using local `createApi(...)` wrappers backed by `mockApiClient`

Examples:

- [BucketPolicyModal.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/__tests__/BucketPolicyModal.test.tsx)
- [BucketGovernanceModal.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/__tests__/BucketGovernanceModal.test.tsx)
- [SidebarBackupAction.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/components/__tests__/SidebarBackupAction.test.tsx)

Reason:
- the main duplication is already removed
- further cleanup here is cosmetic only

## Recommendation

- Stop after converting:
  - [useObjectsPresign.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/__tests__/useObjectsPresign.test.tsx)
  - [useObjectsPrefetch.test.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/__tests__/useObjectsPrefetch.test.tsx)
- After that, treat `mockApiClient` rollout as complete enough.
