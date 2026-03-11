# Caddy Deployment

Use this path when you want a public HTTPS deployment with Caddy terminating TLS in
front of S3Desk.

Files involved:

- `./scripts/compose.sh caddy`
- `deploy/caddy/Caddyfile`
- `.env.example`

## Preconditions

- Public DNS for your final hostname points to this server
- Ports `80/tcp` and `443/tcp` are reachable from the internet
- No other service is already binding ports `80` or `443`

## Required Environment

Start from the remote template:

```bash
cp .env.example .env
$EDITOR .env
```

Set at least these values:

```dotenv
S3DESK_IMAGE=ghcr.io/homelabird/s3desk
S3DESK_TAG=0.21v-rc2

API_TOKEN=replace-with-a-long-random-token
POSTGRES_PASSWORD=replace-with-a-strong-db-password

S3DESK_DOMAIN=s3desk.example.com
EXTERNAL_BASE_URL=https://s3desk.example.com
ALLOWED_HOSTS=s3desk.example.com
```

Rules:

- `S3DESK_DOMAIN` must equal the hostname served by Caddy
- `EXTERNAL_BASE_URL` must equal the browser-facing origin users open
- `ALLOWED_HOSTS` must include that same hostname

The Caddy stack reuses the remote compose base file, so the backend still binds
`127.0.0.1:${S3DESK_PORT:-8080}` on the host by default. That port is loopback-only
unless you explicitly override `S3DESK_BIND_ADDRESS`.

## Start

```bash
./scripts/compose.sh caddy up -d
```

Useful logs:

```bash
./scripts/compose.sh caddy logs -f caddy s3desk
```

## What This Topology Does

- Postgres stays on the internal Docker network
- S3Desk listens inside the Compose network on `s3desk:8080` and is also bound on
  loopback at `127.0.0.1:${S3DESK_PORT:-8080}` for host-local diagnostics
- Caddy is the only public entrypoint and publishes `80` and `443`
- S3Desk sees requests from a private Docker subnet, so `ALLOW_REMOTE=true`
  remains enabled in this manifest

## Reverse Proxy Expectations

The shipped Caddyfile forwards these headers to S3Desk:

- `Host`
- `X-Forwarded-Host`
- `X-Forwarded-Proto`
- `X-Forwarded-For`

That keeps browser-facing download URLs and `/download-proxy` rooted at the
expected public hostname when `EXTERNAL_BASE_URL` is set correctly.

## Validation

Run the minimal reverse-proxy smoke:

```bash
curl -I https://s3desk.example.com/healthz
curl -H "X-Api-Token: <token>" https://s3desk.example.com/api/v1/meta
curl -X POST -H "X-Api-Token: <token>" \
  "https://s3desk.example.com/api/v1/realtime-ticket?transport=ws"
curl -H "X-Api-Token: <token>" -H "X-Profile-Id: <profile-id>" \
  "https://s3desk.example.com/api/v1/buckets/<bucket>/objects/download-url?key=<key>&proxy=true"
```

Expected results:

- `/healthz` returns `200`
- `/api/v1/meta` returns `200`
- `/api/v1/realtime-ticket` returns `201`
- the proxied download response contains a URL rooted at `https://s3desk.example.com`

## Storage Hostname Split

For S3-compatible profiles:

- use `endpoint` for the server-side storage hostname
- use `publicEndpoint` when the browser must use a different hostname for
  presigned links

If browsers should never touch the storage hostname directly, keep using the
download proxy path for downloads and previews.

## Common Failures

- Wrong host in `/download-proxy` URL:
  `EXTERNAL_BASE_URL`, `S3DESK_DOMAIN`, and `ALLOWED_HOSTS` do not match
- `403 forbidden` with host or origin details:
  `ALLOWED_HOSTS` is missing the public hostname
- `403 forbidden` with remote address details:
  traffic is bypassing the Compose network or not arriving from a private range
