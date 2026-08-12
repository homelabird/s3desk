# S3Desk

S3Desk is a self-hosted dashboard for multi-provider object storage.

## Usage

Use the local scripts as the entrypoint. The detailed operator and release docs stay under `docs/`.

## Quick Start

- `cp .env.example .env.local && ./scripts/compose.sh demo up --build -d`

## Storage Credentials

Create a least-privilege credential in the provider console, then add a profile in S3Desk. S3Desk does not create provider keys.

| Provider | Get credentials | Enter in S3Desk |
| --- | --- | --- |
| AWS S3 | [Create IAM user access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-keys-admin-managed.html) | `Access Key ID`, `Secret`, and `Region`; add `Session Token` only for temporary credentials and leave `Endpoint` empty. |
| S3-compatible | Ask the provider console or storage administrator for an S3 API key. | `Access Key ID`, `Secret`, `Endpoint`, and `Region`; add `Session Token` when issued and enable path-style mode only when required. |
| Azure Blob Storage | [View storage account keys](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-keys-manage) | `Storage Account Name` and `Account Key`. Azure ARM fields are optional and only needed for management features such as immutability editing. |
| Google Cloud Storage | [Create a service-account JSON key](https://cloud.google.com/iam/docs/keys-create-delete) | Paste the downloaded JSON into `Service Account JSON` and enter the numeric `Project Number`. Anonymous mode is only for public access. |
| OCI Object Storage | [Create an API signing key and config](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm) | Enter `Region`, `Namespace`, and `Compartment OCID`; provide the OCI `Config File`/`Config Profile` when the backend cannot use its default config. |

For container deployments, mount the OCI config and private key into the backend and use the container path (for example, `/data/oci/config`). Treat all keys as secrets, grant only the required bucket permissions, and rotate or revoke them if exposed.

### Run

- `./scripts/dev.sh`
- `./scripts/compose.sh demo up --build -d`
- `./scripts/compose.sh remote up -d`
- `./scripts/compose.sh caddy up -d`

### Build and Verify
- `./scripts/build.sh`
- `./scripts/check.sh`
- `helm upgrade --install s3desk ./charts/s3desk`

### Cleanup
- `./scripts/compose.sh remote down`
- `./scripts/compose.sh caddy down`

## Detailed Guides

- [Operations and deployment](docs/RUNBOOK.md)
- [Testing and checklists](docs/TESTING.md)
- [Release gate](docs/RELEASE_GATE.md)
- [Provider configuration](docs/PROVIDERS.md)
- [Backup and restore](docs/PORTABLE_BACKUP.md)
- [Helm chart details](charts/s3desk/README.md)
- [All docs index](docs/README.md)

## License

MPL-2.0, [LICENSE](LICENSE)
