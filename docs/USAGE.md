# Usage

S3Desk is designed around a simple workflow: connect a provider, browse storage, and run transfer jobs safely.

## Before You Start

- Start the service and open `http://192.168.0.200:8080`
- If you access it from another machine, use:
  - `ADDR=0.0.0.0:8080`
  - `ALLOW_REMOTE=true`
  - `API_TOKEN`
- `ALLOWED_HOSTS` is only needed for non-private hostnames such as Ingress domains

## Typical Workflow

1. Create a profile
   - Open `Profiles`
   - Choose a provider
   - Enter the required credentials and endpoint details
   - Run the connection test before saving

2. Verify buckets or containers
   - Open `Buckets`
   - Confirm that the active profile can list storage
   - Create a bucket/container if the provider supports it

3. Browse objects
   - Open `Objects`
   - Navigate by bucket and prefix
   - Download, copy, move, rename, or delete objects

4. Queue uploads or bulk transfers
   - Open `Uploads` to stage files from your device
   - Open `Jobs` to monitor running and completed work
   - Use retry or delete actions when a job fails or is no longer needed

## API Access

S3Desk exposes built-in API documentation:

- Docs UI: `http://192.168.0.200:8080/docs`
- OpenAPI spec: `http://192.168.0.200:8080/openapi.yml`

If `API_TOKEN` is enabled, send it with `X-Api-Token` or `Authorization: Bearer <token>`.

## Notes

- The UI disables unsupported actions based on backend capabilities reported by `/meta`
- S3Desk is local-first by default; remote use should always be protected with an API token
