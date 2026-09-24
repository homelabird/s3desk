# SeaweedFS demo

The `demo` stack uses SeaweedFS through S3Desk's existing `s3_compatible`
provider. It does not start MinIO or require the MinIO `mc` client. The image
is pinned to `docker.io/chrislusf/seaweedfs:4.47`. This is a single-node demo,
not an HA or production storage design.

## Start

Use Docker Compose v2 or a Podman Compose provider implementing health checks
and `depends_on` conditions `service_healthy` / `service_completed_successfully`.
Run from the repository root. If omitted, `DEMO_PUBLIC_HOST` defaults to
`0.0.0.0`; set it explicitly to a reachable LAN address when clients connect
from another device. Use the same value for later `logs`, `ps`, and `down` calls.

```bash
./scripts/compose.sh demo up --build -d --remove-orphans
./scripts/compose.sh demo ps -a
./scripts/compose.sh demo logs seaweedfs-seed s3desk-seed
```

Open `http://127.0.0.1:8080`, authenticate using the configured `API_TOKEN`,
and select **SeaweedFS Demo**. The local-demo token default is in
`compose/demo/compose.yml`; it is public development configuration, not a
production secret. `demo-bucket` contains `welcome.txt`, `about.json`, and
`notes/readme.md`.

Both seed containers must exit with code `0`. Detached `up` returning does not
prove that seeding succeeded. The storage seed verifies authenticated S3 access;
the application seed checks the profile connection before reporting success.

### LAN and custom ports

```bash
# Replace this example with the host's real LAN address.
DEMO_PUBLIC_HOST=192.168.0.227 ./scripts/compose.sh demo up --build -d --remove-orphans

# Custom published ports; the internal S3 address remains seaweedfs:8333.
DEMO_PUBLIC_HOST=192.168.0.227 S3DESK_PORT=18080 SEAWEEDFS_API_PORT=18333 \
  ./scripts/compose.sh demo up --build -d --remove-orphans
```

The wrapper binds to `0.0.0.0` for a non-local host unless `S3DESK_BIND_HOST` is
already exported. Keep these values consistent on later commands. Allow the UI
and S3 ports only through the intended host firewall/network. There is no MinIO
console on port 9001. Browser S3 URLs must not contain a container-only hostname.
A local-only S3 public URL with a remote `DEMO_PUBLIC_HOST` fails fast.

For a reverse proxy, set `DEMO_EXTERNAL_BASE_URL` to the UI URL and
`SEAWEEDFS_PUBLIC_ENDPOINT` to the browser-facing S3 origin. Set
`DEMO_S3_ALLOWED_ORIGINS` to comma-separated UI origins without spaces, paths,
or trailing slashes. The S3 proxy must preserve signed hosts and S3 headers.
TLS/proxy deployment is not provided or validated by this demo.

## Architecture and persistence

```text
SeaweedFS master + volume + filer + S3 (one container)
  -> storage health check
  -> seaweedfs-seed (rclone signed S3 operations)
  -> S3Desk
  -> s3desk-seed (profile registration and connection test)
```

Only S3 port `8333` is published. Master, volume, and filer bind to container
loopback. Static S3 credentials are loaded through `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`; IAM management, automatic bucket creation on upload,
and non-empty bucket deletion are disabled. The seed creates buckets explicitly.

| Data | Persistent volume / path |
| --- | --- |
| Object volumes and master state | `seaweedfs-demo-data`, `/data` |
| Filer bucket/object namespace | Same volume, `/data/filerldb2`, configured in `compose/demo/filer.toml` |
| S3Desk DB, profiles, jobs | Existing `s3desk-demo-data`, `/data` |
| Old MinIO storage | Old `minio-demo-data` volume, not reused or deleted |

Volume names may have a Compose project prefix. Preserve the previous project
name and application `ENCRYPTION_KEY` when retaining the DB. Changing that key
can make existing profile credentials unreadable.

Seeding uses `rclone copy --ignore-existing`: modified samples and unrelated
objects survive; missing samples are restored. Existing profiles are matched by
name and expected provider/endpoint. A conflicting target or duplicate matching
names fail without overwriting another profile. For an intentional endpoint
change, use a new `DEMO_PROFILE_NAME` or edit the profile explicitly.

## Configuration

`.env.example` documents all overrides. When sourcing it as shell input, retain
quotes around values containing spaces. An exported `S3DESK_BIND_HOST` overrides
automatic LAN binding. Use a stable `API_TOKEN` and `ENCRYPTION_KEY`; replace
known demo credentials before sharing beyond a trusted local machine.
Do not publish `compose config` output or container environment dumps: they may
contain credentials.

| Variable | Default / purpose |
| --- | --- |
| `SEAWEEDFS_IMAGE` | `docker.io/chrislusf/seaweedfs:4.47` |
| `SEAWEEDFS_ACCESS_KEY` / `SEAWEEDFS_SECRET_KEY` | Demo-only static identity shared by gateway and seeders |
| `SEAWEEDFS_REGION` | `us-east-1` |
| `SEAWEEDFS_API_PORT` | Host S3 port `8333` |
| `SEAWEEDFS_BIND_HOST` | Follows `S3DESK_BIND_HOST` |
| `SEAWEEDFS_INTERNAL_ENDPOINT` | `http://seaweedfs:8333` |
| `SEAWEEDFS_PUBLIC_ENDPOINT` | `http://${DEMO_PUBLIC_HOST}:${SEAWEEDFS_API_PORT}` |
| `DEMO_PROFILE_NAME` | `SeaweedFS Demo` |
| `DEMO_BUCKET` | `demo-bucket`; 3–63 lowercase letters, digits, interior hyphens |
| `DEMO_SEED_ATTEMPTS` | `30`, range `1..120`, per storage operation |
| `DEMO_SEED_TIMEOUT_SECONDS` | `180`, range `1..900`, API readiness only |
| `DEMO_S3_ALLOWED_ORIGINS` | Explicit origins, otherwise external/derived UI URL |
| `DEMO_ALLOW_REMOTE` | `true`, needed for container-to-container API seed traffic |

Storage calls have connection, idle, maximum-operation timeouts and bounded
retries, with 2-second sleeps. Their total duration depends on request failures;
it is not controlled by the separate API-readiness timeout.

### Local-browser endpoint safety

S3Desk normally rejects loopback profile URLs when remote access is enabled.
Only the demo Compose sets `S3DESK_ALLOWED_LOOPBACK_PUBLIC_ENDPOINT` to the exact
configured browser S3 URL. That permits local presigned URLs without allowing a
loopback internal `endpoint`, other ports/hosts, metadata/link-local addresses,
or server HTTP requests to loopback. Ordinary remote templates do not enable
this opt-in. Do not use it to conceal a wrongly advertised LAN/proxy endpoint.

## Switching from the old MinIO demo

Back up existing data first. Keep the previous Compose project identity and
application encryption key. `up --remove-orphans` removes old MinIO service
containers in that project, not their named data volume. **Do not use `down -v`
or volume pruning as migration steps.**

Select `SeaweedFS Demo` after startup. The old `MinIO Demo` profile remains and
may no longer connect once its server stops. A browser's retained profile
selection does not automatically switch. Do not reuse the old profile name to
silently repoint it: the seed rejects mismatched targets.

**Objects are not automatically migrated.** The MinIO data directory is not
mounted as SeaweedFS data. To retain objects, run the old MinIO separately against
its old volume and configure source/destination S3 remotes. After configuring
`old-minio` and `new-seaweedfs` with the right endpoints and credentials:

```bash
rclone copy old-minio:demo-bucket new-seaweedfs:demo-bucket --dry-run
rclone copy old-minio:demo-bucket new-seaweedfs:demo-bucket --ignore-existing
rclone check old-minio:demo-bucket new-seaweedfs:demo-bucket --one-way --download
```

Review key collisions: `--ignore-existing` preserves destination contents but
may leave different versions of the same key. Inspect check failures. This is
ordinary object-content copying, not migration of historical versions, policies,
retention settings, identities, or all provider metadata. Keep the source until
verification finishes.

```bash
# Stop without deleting data.
DEMO_PUBLIC_HOST=127.0.0.1 ./scripts/compose.sh demo down
```

## Verification

```bash
# Offline checks; Python requires the repository's PyYAML dependency.
python3 scripts/check_demo_seaweedfs_test.py
python3 scripts/check_seaweedfs_unified_test.py
./scripts/check_backend_performance_offline.sh test
(cd backend && go test ./internal/profileendpoint ./internal/api ./internal/s3client)
./scripts/check.sh fast
```

The Python suite uses a fake rclone and mock Compose provider. It checks config,
seed ordering, retries, profile safety, and preservation logic, not actual S3 or
browser behavior. Full-stack acceptance additionally requires both seeders exit
`0`, signed CRUD, browser presigned single/multipart transfers, local/LAN/custom
ports, restart persistence, incorrect-credential rejection, and non-empty bucket
delete rejection on a container-enabled machine. Provider-governance features
are not promoted to a higher support tier by this change.

All local S3 fixtures now use SeaweedFS: `demo`, `e2e`, `portable-smoke`, and
`scripts/run_live_e2e_local.sh`. The Compose stacks share the same signed,
idempotent rclone seeder and filer configuration. No MinIO server/client image,
startup service, or MinIO-specific seeder is retained in these local stacks.
GitLab starts the integration services detached and then runs the API runner so
a successful one-shot seeder does not terminate the entire stack.

The standard S3-compatible provider still accepts external endpoints. Historical
migration evidence and preexisting database fixtures are not rewritten. This is
not an automatic data migration or permission upgrade for any provider.

The native S3 listing path is enabled by default. For an incompatible third-party
S3 implementation, set `S3_NATIVE_LIST=false` on the backend and refresh the
object view to discard old cursors. See
[backend investigation](SEAWEEDFS_BACKEND_INVESTIGATION.md) for ownership, tests,
measurements and the explicit live-validation boundary.

## Upstream references

- Release: https://github.com/seaweedfs/seaweedfs/releases/tag/4.47
- Tagged server flags: https://github.com/seaweedfs/seaweedfs/blob/4.47/weed/command/server.go
- Static identity loading: https://github.com/seaweedfs/seaweedfs/blob/4.47/weed/s3api/auth_credentials.go
- S3 API: https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API
- rclone S3: https://rclone.org/s3/
