# Stable Zones

Date: `2026-03-20`

## Purpose

List the areas that should not be reopened for proactive refactoring unless new feature work or real regressions justify it.

## Stable zone 1: backend `store`

Files:

- [store.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store.go)
- [store_upload_sessions.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_upload_sessions.go)
- [store_profiles.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_profiles.go)
- [store_profile_secrets.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_profile_secrets.go)
- [store_helpers.go](/home/homelab/Downloads/project/s3desk/backend/internal/store/store_helpers.go)

Why stable:

- split is complete
- exported `Store` surface stayed stable
- backend validation already passed after the split

Reopen only if:

- schema/storage behavior changes force new ownership boundaries

## Stable zone 2: backend `jobs manager` shell

Files:

- [manager.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go)
- [manager_state_transitions.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_state_transitions.go)
- [manager_dispatch.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_dispatch.go)
- [manager_wiring.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_wiring.go)
- [manager_job_types.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_job_types.go)

Why stable:

- shell cleanup is complete
- `manager.go` is no longer the hotspot

Reopen only if:

- exported lifecycle/orchestration behavior changes

Do not reopen for:

- speculative file shuffling

## Stable zone 3: frontend API client shell

Files:

- [client.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts)
- [clientContracts.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientContracts.ts)
- [clientTransport.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientTransport.ts)
- [retryTransport.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/retryTransport.ts)
- [clientSubFacades.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts)

Why stable:

- split and cleanup are complete
- public sub-facade shape is established
- full frontend unit/runtime validation already passed

Reopen only if:

- new domains make `clientSubFacades.ts` materially larger
- public API shape has to change for feature work

## Stable zone 4: `Objects` responsive/CSS split

Files:

- [ObjectsShell.module.css](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsShell.module.css)
- [ObjectsSearch.module.css](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsSearch.module.css)
- [ObjectsListView.module.css](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsListView.module.css)
- [ObjectsGridCards.module.css](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsGridCards.module.css)
- [ObjectsDetails.module.css](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsDetails.module.css)
- [ObjectsFavorites.module.css](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsFavorites.module.css)
- [ObjectsImageViewer.module.css](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsImageViewer.module.css)
- [ObjectsBucketPicker.module.css](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsBucketPicker.module.css)
- [ObjectsThumbnailPrimitives.module.css](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsThumbnailPrimitives.module.css)

Why stable:

- ownership split is complete
- mobile responsive suite already passed after the refactor

Reopen only if:

- `Objects` UX changes require new layout work
- mobile regressions appear

## Stable zone 5: bucket/profile modal refactors

Files:

- [BucketPolicyModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx)
- [BucketModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx)
- [profileModalSectionContent.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx)

Why stable:

- the original split goals were met
- targeted tests passed during the refactor work

Reopen only if:

- create/policy/profile workflows gain new provider-specific behavior

## Stable zone 6: `mockApiClient` rollout

Files:

- [mockApiClient.ts](/home/homelab/Downloads/project/s3desk/frontend/src/test/mockApiClient.ts)

Why stable:

- current small-test candidate set is covered
- remaining page-level tests intentionally use `APIClient.prototype` getter spies

Reopen only if:

- new repeated sub-facade mock patterns appear in small hook/component tests

## Recommendation

Treat these areas as maintenance-only.

Do not spend refactor budget here unless:

- a feature creates real growth pressure
- a test or runtime regression shows the current boundary is wrong
