# Backend Architecture

This document records the current backend boundaries so new API and provider work
has a stable place to land.

## Runtime Shape

- `cmd/server` owns process startup and wires the HTTP server.
- `internal/app` builds runtime dependencies from config, database, store, jobs,
  metrics, websocket hub, static files, and shutdown handling.
- `internal/api` owns HTTP routing, auth/origin middleware, OpenAPI-facing
  request/response behavior, and narrow HTTP services.
- `internal/jobs` owns queued background execution, rclone integration, job logs,
  progress publishing, and retry/cancel state transitions.
- `internal/store` owns persistence models, encrypted profile secrets, portable
  import/export helpers, and database-specific query behavior.
- `internal/bucketgov`, provider helper packages, and `internal/s3client` own
  provider-specific capabilities and control-plane calls.
- `internal/rcloneegress` owns the short-lived authenticated loopback proxy
  used by every rclone subprocess; its outbound HTTP/CONNECT dials must use the
  guarded profile-endpoint resolver.

## Runtime Ownership

- The supported topology is one S3Desk replica owning one `DATA_DIR`. The job
  queue, realtime state, and direct-multipart creation state are process-local;
  the Helm chart rejects `replicaCount > 1`.
- Direct multipart creation is serialized by a process-local lock so concurrent
  chunks share one provider upload. A durable cross-process claim is intentionally
  not implemented until HA becomes a supported topology.
- The HTTP server leaves the total `ReadTimeout` unset for streaming uploads;
  API middleware applies route-specific body-idle deadlines instead.
- Shutdown first drains the HTTP server, then cancels the manager context and
  waits up to ten seconds for registered job-manager lifecycles. A timeout is
  logged as a warning; it is not proof that an external provider operation
  completed.

## Handler Rules

- Keep request decoding, validation, and response mapping in `internal/api`.
- Put durable state changes in `internal/store`; handlers should not reach around
  store helpers for database writes.
- Put long-running object-storage work in `internal/jobs`; API handlers should
  enqueue and return job state instead of blocking on rclone.
- Use `internal/jobs.RequiresRclone` when adding any job type that executes rclone
  so create/retry preflight matches runtime dispatch.
- Update `openapi.yml`, frontend generated types, and contract tests with any
  public API shape change.

## Adding A Job Type

1. Add the job type constant in `internal/jobs/manager.go`.
2. Add it to `isSupportedJobType` and, if it calls rclone, `RequiresRclone`.
3. Add payload parsing/validation in `internal/jobs/payload_*.go` and API request
   validation in `internal/api/handlers_jobs*.go`.
4. Add dispatch wiring in `internal/jobs/manager_dispatch.go`.
5. Add backend tests for payload validation, dispatch behavior, error mapping,
   and retry/cancel behavior when relevant.
6. Add frontend and Playwright coverage for visible job lifecycle changes.

## Adding A Provider Capability

1. Implement provider-specific logic in the provider package, not directly inside
   a generic HTTP handler.
2. Represent support and unsupported reasons through the capability model.
3. Keep secrets in `store.ProfileSecrets` and redact diagnostic output.
4. Add provider fixtures and at least one contract test for API response shape.
5. Update `docs/PROVIDERS.md` and relevant release evidence templates.
