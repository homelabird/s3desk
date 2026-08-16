# S3Desk

S3Desk is a self-hosted web interface for managing buckets, objects, transfers, and access settings across object-storage providers.<br>
It supports AWS S3, S3-compatible storage, Azure Blob, Google Cloud Storage, and OCI Object Storage.

![Basic demo flow](frontend/docs/assets/gifs/latest.gif)

## Quick start

Docker or Podman with Compose is required.

```bash
DEMO_PUBLIC_HOST=127.0.0.1 ./scripts/compose.sh demo up --build -d
```

Open <http://127.0.0.1:8080>. To expose the demo on a LAN, replace `127.0.0.1` with the host's LAN IP:

```bash
DEMO_PUBLIC_HOST=192.168.0.227 ./scripts/compose.sh demo up --build -d
```

Stop the demo:

```bash
DEMO_PUBLIC_HOST=127.0.0.1 ./scripts/compose.sh demo down
```

## Remote deployment

```bash
cp .env.example .env.local
# Edit .env.local, then load it into the shell.
set -a; . ./.env.local; set +a
./scripts/compose.sh remote up -d
```

Set these values before starting: `API_TOKEN`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `S3DESK_BIND_ADDRESS`, `ALLOWED_HOSTS`, and `ALLOWED_LOCAL_DIRS`. Use `./scripts/compose.sh caddy up -d` for the Caddy stack.

```bash
./scripts/compose.sh remote ps
./scripts/compose.sh remote logs -f
./scripts/compose.sh remote down
```

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
