# API Client Top-Level Wrapper Migration Scope

## Goal

- keep `APIClient` top-level methods as compatibility shims only while migration is in progress
- prefer direct sub-facade usage:
  - `api.server.*`
  - `api.profiles.*`
  - `api.buckets.*`
  - `api.objects.*`
  - `api.uploads.*`
  - `api.jobs.*`

## Current state

- `server`, `profiles`, `buckets`, `objects`, `uploads`, and `jobs` call sites were moved to sub-facade usage in `frontend/src`
- in [client.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts), top-level wrappers for every domain now delegate to `this.server/*`, `this.profiles/*`, `this.buckets/*`, `this.objects/*`, `this.uploads/*`, and `this.jobs/*`
- there are no remaining `frontend/src` call sites that require the top-level wrappers

## Removal readiness

Internal repository usage is now ready for wrapper removal.

Conditions satisfied:

- no remaining `frontend/src` call sites for top-level wrapper methods
- no duplicated migration artifacts like `api.objects.objects.*` or `api.uploads.uploads.*`
- sub-facade entry points exist for every migrated domain

## Recommended cleanup patch

1. remove top-level compatibility wrappers from [client.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts)
2. keep the public sub-facades:
   - `client.server`
   - `client.profiles`
   - `client.buckets`
   - `client.objects`
   - `client.uploads`
   - `client.jobs`
3. run frontend validation after wrapper deletion

## Caution

This readiness check is scoped to repository-local usage.
If any external consumer imports this client shape from outside this repository, that compatibility impact must be evaluated separately before deleting wrappers.
