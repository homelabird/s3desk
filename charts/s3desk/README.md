# `s3desk` Helm Chart

This chart deploys S3Desk on Kubernetes with either:

- a sqlite-backed `DATA_DIR`
- a Postgres-backed database plus persistent `DATA_DIR` for thumbnails, staged restores, and job artifacts

## Quick Start

Install from the local chart with an explicit API token:

```bash
helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set-string server.apiToken='replace-me-with-a-strong-token'
```

If you omit `server.apiToken`, the chart auto-generates and persists one in the release Secret by default. Retrieve it with:

```bash
kubectl get secret <release-name> -n <namespace> -o jsonpath='{.data.apiToken}' | base64 -d && echo
```

## Common Overrides

Remote/browser-facing deployment:

```bash
helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set-string server.apiToken='replace-me-with-a-strong-token' \
  --set-string server.externalBaseURL='https://s3desk.example.com' \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=s3desk.example.com
```

Postgres-backed deployment:

```bash
helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set-string server.apiToken='replace-me-with-a-strong-token' \
  --set db.backend=postgres \
  --set-string db.databaseUrl='postgres://s3desk:password@postgres:5432/s3desk?sslmode=disable'
```

Existing Secret-backed deployment:

```bash
kubectl create secret generic s3desk-secrets \
  --from-literal=apiToken='replace-me' \
  --from-literal=encryptionKey='base64-encoded-key' \
  --from-literal=databaseUrl='postgres://s3desk:password@postgres:5432/s3desk?sslmode=disable'

helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set secrets.existingSecret=s3desk-secrets \
  --set db.backend=postgres
```

Network policy:

```bash
helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set-string server.apiToken='replace-me-with-a-strong-token' \
  --set networkPolicy.enabled=true \
  --set networkPolicy.policyTypes[0]=Ingress \
  --set networkPolicy.policyTypes[1]=Egress
```

Prometheus Operator objects:

```bash
helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set monitoring.serviceMonitor.enabled=true
```

## Operational Notes

- `server.externalBaseURL` should be set for ingress, reverse-proxy, and browser-facing download flows.
- `db.backend=postgres` requires either `db.databaseUrl` or `secrets.existingSecret`.
- The chart creates a dedicated ServiceAccount by default and disables service-account token automount unless you override it.
- `networkPolicy` is opt-in. The default policy type is ingress-only so existing outbound DB/provider traffic is not broken by accident.
- `ServiceMonitor` and `PodMonitor` are opt-in and default to the same API token Secret/key used by the app.
- `DATA_DIR` persistence is still useful on Postgres for thumbnails, staged restores, and job artifacts.
- In-product `Full backup` / `Cache + metadata` flows remain sqlite-only. Use portable backup/import for cross-backend migration.

## Validation

Run the local Helm checks with:

```bash
./scripts/check_helm_chart.sh
```
