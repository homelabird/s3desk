# `s3desk` Helm Chart

This chart deploys S3Desk on Kubernetes with either:

- a sqlite-backed `DATA_DIR`
- a Postgres-backed database plus persistent `DATA_DIR` for thumbnails, staged restores, and job artifacts

## Quick Start

Install from the local chart with an explicit API token:

```bash
API_TOKEN="$(openssl rand -base64 32)"
helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set-string server.apiToken="${API_TOKEN}"
```

If you omit `server.apiToken`, the chart auto-generates and persists one in the release Secret by default. Retrieve it with:

```bash
kubectl get secret <release-name> -n <namespace> -o jsonpath='{.data.apiToken}' | base64 -d && echo
```

## Common Overrides

Remote/browser-facing deployment:

```bash
kubectl create secret generic s3desk-secrets \
  --namespace s3desk \
  --from-literal=apiToken="$(openssl rand -base64 32)" \
  --from-literal=encryptionKey="$(openssl rand -base64 32)"

helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --values ./charts/s3desk/values-production.yaml \
  --set-string image.repository='registry.example.com/s3desk' \
  --set-string image.tag='0.21v-rc3' \
  --set-string server.externalBaseURL='https://s3desk.example.com' \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=s3desk.example.com
```

For immutable release images, set `image.digests.sqlite` or
`image.digests.postgres` to a full `sha256:` registry digest. Release charts
populate both variant digests automatically.

Postgres-backed deployment:

```bash
API_TOKEN="$(openssl rand -base64 32)"
helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set-string server.apiToken="${API_TOKEN}" \
  --set db.backend=postgres \
  --set-string db.databaseUrl='postgres://s3desk:password@postgres:5432/s3desk?sslmode=disable'
```

Existing Secret-backed deployment:

```bash
kubectl create secret generic s3desk-secrets \
  --from-literal=apiToken="$(openssl rand -base64 32)" \
  --from-literal=encryptionKey="$(openssl rand -base64 32)" \
  --from-literal=databaseUrl='postgres://s3desk:password@postgres:5432/s3desk?sslmode=disable'

helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set secrets.existingSecret=s3desk-secrets \
  --set db.backend=postgres
```

Network policy:

```bash
API_TOKEN="$(openssl rand -base64 32)"
helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set-string server.apiToken="${API_TOKEN}" \
  --set networkPolicy.enabled=true \
  --set networkPolicy.policyTypes[0]=Ingress
```

Add `Egress` only with the explicit destination rules shown below; enabling it
without provider/database/proxy rules allows DNS but blocks those connections.

Production ingress allow-list for NGINX Ingress Controller:

```yaml
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
  ingress:
    allowSameNamespace: false
    extra:
      - from:
          - namespaceSelector:
              matchLabels:
                kubernetes.io/metadata.name: ingress-nginx
            podSelector:
              matchLabels:
                app.kubernetes.io/name: ingress-nginx
                app.kubernetes.io/component: controller
        ports:
          - protocol: TCP
            port: 8080
```

Production ingress allow-list for an Istio ingress gateway:

```yaml
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
  ingress:
    allowSameNamespace: false
    extra:
      - from:
          - namespaceSelector:
              matchLabels:
                kubernetes.io/metadata.name: istio-system
            podSelector:
              matchLabels:
                istio: ingressgateway
        ports:
          - protocol: TCP
            port: 8080
```

Replace the namespace and pod labels with labels from your controller pods when your NGINX or Istio gateway runs outside the example namespaces.

Escape hatches:

- Keep `ingress.allowSameNamespace=true` for in-namespace proxies.
- Add `ingress.extra: [{}]` only as a temporary allow-all ingress rule.
- Omit `Egress` from `policyTypes` to leave outbound database, proxy, identity-provider, and object-store traffic unrestricted.
- When enabling `Egress`, keep `egress.allowDns=true` and add `egress.extra` rules for your destinations. Use `egress.extra: [{}]` only as a short-lived unblocker.

Egress allow-list examples:

```yaml
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress
  egress:
    allowDns: true
    extra:
      # Same-namespace Postgres pods.
      - to:
          - podSelector:
              matchLabels:
                app.kubernetes.io/name: postgresql
        ports:
          - protocol: TCP
            port: 5432
      # HTTPS object-store, proxy, or identity-provider networks.
      # Kubernetes NetworkPolicy is IP/selector based; use your CNI's FQDN
      # policy extension if you need hostname-based egress rules.
      - to:
          - ipBlock:
              cidr: 10.0.0.0/8
        ports:
          - protocol: TCP
            port: 443
```

Raw Istio manifests under `k8s/` are operator references, not part of the
default Helm install path. Prefer the chart `istio.virtualService` settings and
`values-istio.yaml`; if you apply `k8s/istio-s3desk-upload-gw.yaml`, scope the
gateway labels, namespace, and matching `networkPolicy.ingress.extra` rule to
your dedicated gateway deployment before applying it. The chart defaults
`istio.virtualService.timeout` to `0s` for long browser uploads; set a finite
timeout only after testing it with your `uploads.maxBytes`, concurrent upload
count, gateway memory, and object-store latency.

Prometheus Operator objects:

```bash
helm upgrade --install s3desk ./charts/s3desk \
  --namespace s3desk \
  --create-namespace \
  --set monitoring.serviceMonitor.enabled=true \
  --set monitoring.prometheusRule.enabled=true
```

The optional `PrometheusRule` alerts only on invariant failures: a missing
metrics target, a queue held at full capacity, or a maintenance cleanup error.
Tune workload-specific latency and error-ratio alerts in your monitoring stack
after measuring the deployment baseline.

## Operational Notes

- The chart supports exactly one replica. S3Desk's job queue, realtime state, and `DATA_DIR` are single-writer; use external database backups and a separate deployment design before considering HA.
- `server.externalBaseURL` should be set for ingress, reverse-proxy, and browser-facing download flows.
- Istio VirtualService installs require at least one `istio.virtualService.hosts` entry and one `istio.virtualService.gateways` entry when enabled.
- Browser-facing remote deployments (`server.allowRemote=true` with ingress or Istio enabled) require `server.encryptionKey` or `secrets.existingSecret`, `networkPolicy.enabled=true`, resource requests/limits, and the non-root/read-only security context shown in `values-production.yaml`.
- `values-production.yaml` is the recommended baseline for internet-facing or shared-cluster installs; override image repository/tag, hostnames, ingress class, Secret name, and resource sizes for your cluster.
- `server.allowedLocalDirs` defaults to `/data` because remote mode fails closed unless at least one allowed local directory is configured.
- `db.backend=postgres` requires either `db.databaseUrl` or `secrets.existingSecret`.
- The chart creates a dedicated ServiceAccount by default and disables service-account token automount unless you override it.
- `networkPolicy` is opt-in. The default policy type is ingress-only so existing outbound DB/provider traffic is not broken by accident; `values-production.yaml` shows an NGINX controller ingress allow-list and leaves egress policy disabled until destinations are known.
- Every rclone subprocess still uses S3Desk's short-lived guarded loopback proxy, independent of the Kubernetes `networkPolicy` setting. If `Egress` is enabled, allow DNS and the actual provider/database/proxy destinations in `networkPolicy.egress.extra`.
- `ServiceMonitor`, `PodMonitor`, and `PrometheusRule` are opt-in. Monitors default to the same API token Secret/key used by the app.
- `DATA_DIR` persistence is still useful on Postgres for thumbnails, staged restores, and job artifacts.
- In-product `Full backup` / `Cache + metadata` flows remain sqlite-only. Use portable backup/import for cross-backend migration.

## Validation

Run the local Helm checks with:

```bash
./scripts/check_helm_chart.sh
```
