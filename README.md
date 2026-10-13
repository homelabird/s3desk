# S3Desk

S3Desk is a self-hosted web interface for managing buckets, objects, transfers, and access settings across object-storage providers.<br>
It supports AWS S3, S3-compatible storage, Azure Blob, Google Cloud Storage, and OCI Object Storage.

## Quick start

Docker or Podman with Compose is required (including conditional `depends_on` support).
All local S3 demo and integration-test environments use **SeaweedFS**; the demo creates a `SeaweedFS Demo` S3-compatible profile and a `demo-bucket` with sample objects.

```bash
DEMO_PUBLIC_HOST=127.0.0.1 ./scripts/compose.sh demo up --build -d --remove-orphans
```

Open <http://127.0.0.1:8080>. To expose the demo on a LAN, replace `127.0.0.1` with the host's LAN IP:

```bash
DEMO_PUBLIC_HOST=192.168.0.227 ./scripts/compose.sh demo up --build -d --remove-orphans
```

Stop the demo:

```bash
DEMO_PUBLIC_HOST=127.0.0.1 ./scripts/compose.sh demo down
```

The S3 API is published on port `8333`; the UI remains on `8080`. Select
`SeaweedFS Demo` in the profile picker. Internal master, volume, and filer ports
are not published. Known demo credentials are for local/trusted testing only.

A normal `down` preserves data; **do not use `down -v`** to switch from MinIO.
Existing MinIO volumes and profiles are left intact, but objects are **not**
automatically migrated or reused by SeaweedFS. `--remove-orphans` removes old
MinIO containers in the same Compose project without deleting their named volumes.
See [SeaweedFS demo setup and migration](docs/SEAWEEDFS_DEMO.md) for credentials,
custom ports, LAN/proxy access, readiness checks, and safe migration boundaries.
See [backend I/O investigation and regression results](docs/SEAWEEDFS_BACKEND_INVESTIGATION.md)
for native S3 pagination, connection reuse, multipart contention fixes, and the
limits of offline validation.

## Remote deployment

Run these commands **on the deployment server**. Docker or Podman with Compose
is required; setup also uses OpenSSL to generate secrets.

```bash
./scripts/compose.sh setup
./scripts/compose.sh up
```

Setup asks how you want to connect: this server/SSH tunnel (the default), a
trusted LAN, or a public domain with Caddy HTTPS. It creates a small private
`.env.local` with random secrets, the chosen URL, and a pinned image tag.
Use `API_TOKEN` from that file to log in. Public HTTPS requires DNS pointing to
the server and inbound ports 80/443. LAN mode uses HTTP and binds all interfaces.

```bash
./scripts/compose.sh status
./scripts/compose.sh logs
./scripts/compose.sh stop
```

`up` validates configuration before pulling images and starting containers.
`stop` preserves data; setup refuses to overwrite existing configuration.
Remote/Caddy commands load `.env.local` automatically; no shell export step is
needed. Exported variables still take precedence.

For an existing deployment, keep its secrets and volumes, edit `.env.local`,
and use the same stack as before. The explicit commands such as
`./scripts/compose.sh remote up -d` and `./scripts/compose.sh caddy up -d`
remain available. See [the runbook](docs/RUNBOOK.md#start-and-stop) for manual
configuration, updates, and troubleshooting; use `./scripts/compose.sh --help`
for all commands. Kubernetes deployments use the [Helm chart](charts/s3desk/README.md).

## Storage credentials

Add a profile in S3Desk with a least-privilege credential created by the provider.

| Provider | Credential source | Required fields |
| --- | --- | --- |
| AWS S3 (beta) | [IAM access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-keys-admin-managed.html) | `Access Key ID`, `Secret`, `Region` |
| S3-compatible | Provider console or storage administrator | `Access Key ID`, `Secret`, `Endpoint`, `Region` |
| Azure Blob (beta) | [Storage account keys](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-keys-manage) | `Storage Account Name`, `Account Key` |
| Google Cloud Storage (beta) | [Service-account JSON key](https://cloud.google.com/iam/docs/keys-create-delete) | `Service Account JSON`, `Project Number` |
| OCI Object Storage | [API signing key and config](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm) | `Region`, `Namespace`, `Compartment OCID`, OCI config |

Provider-specific optional fields and container mounts are documented in [Provider configuration](docs/PROVIDERS.md).

## Development and verification

```bash
./scripts/dev.sh
./scripts/build.sh
./scripts/check.sh
ansible-playbook ansible/portable-migration-smoke.yml
```

## Documentation

- [Operations and deployment](docs/RUNBOOK.md)
- [Testing and checklists](docs/TESTING.md)
- [PostgreSQL and SQLite backup/restore](docs/PORTABLE_BACKUP.md)
- [Release gate](docs/RELEASE_GATE.md)
- [Helm chart](charts/s3desk/README.md)
- [Documentation index](docs/README.md)

## License

MPL-2.0, [LICENSE](LICENSE)
