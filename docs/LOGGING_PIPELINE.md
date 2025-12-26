# Logging Pipeline (Grafana/Loki and Elasticsearch)

This guide assumes you enabled JSON logs so log shippers can parse fields.

## 1) Enable JSON log output

Set these envs on the server container:

- `LOG_FORMAT=json`
- `JOB_LOG_EMIT_STDOUT=true`
- `LOG_LEVEL=info` (optional: `debug`, `info`, `warn`, `error`)
- Optional: `LOG_SERVICE=object-storage`, `LOG_ENV=prod`, `LOG_VERSION=v0.1.0`, `LOG_COMPONENT=server`

Example (podman):

```bash
podman run -d --name object-storage --network host \
  -e LOG_FORMAT=json \
  -e JOB_LOG_EMIT_STDOUT=true \
  -e LOG_SERVICE=object-storage \
  -e LOG_ENV=prod \
  -e LOG_VERSION=v0.1.0 \
  -v object-storage-data:/data \
  object-storage:local
```

## 2) Log field schema (JSON Lines)

Common fields:
- `ts`, `level`, `msg`
- `service`, `env`, `version`, `component`
- `event`

HTTP request logs:
- `event=http.request`
- `method`, `path`, `route`, `status`, `duration_ms`, `bytes`, `remote_addr`, `user_agent`, `request_id`, `profile_id`

Job lifecycle logs:
- `event=job.queued|job.started|job.completed|job.log`
- `job_id`, `job_type`, `profile_id`, `status`, `duration_ms`, `error` (failed only)

## 3) Loki (Grafana) shipping

First check your log driver:

```bash
podman info --format '{{.Host.LogDriver}}'
```

### Option A: journald driver

Promtail example:

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: object-storage-journal
    journal:
      path: /var/log/journal
      labels:
        job: object-storage
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        regex: 'podman-.*object-storage.*\\.service'
        action: keep
    pipeline_stages:
      - json:
          expressions:
            ts: ts
            level: level
            msg: msg
            service: service
            env: env
            version: version
            component: component
            event: event
            method: method
            path: path
            route: route
            status: status
            duration_ms: duration_ms
            job_id: job_id
            job_type: job_type
            profile_id: profile_id
      - labels:
          service:
          env:
          component:
          event:
```

### Option B: k8s-file/json-file driver (tail log file)

Locate the container log file:

```bash
podman inspect object-storage --format '{{.Id}}'
```

Typical path (rootful):
`/var/lib/containers/storage/overlay-containers/<ID>/userdata/ctr.log`

Promtail example:

```yaml
scrape_configs:
  - job_name: object-storage-file
    static_configs:
      - targets: [localhost]
        labels:
          job: object-storage
          __path__: /var/lib/containers/storage/overlay-containers/<ID>/userdata/ctr.log
    pipeline_stages:
      - json:
          expressions:
            log: log
      - json:
          source: log
          expressions:
            ts: ts
            level: level
            msg: msg
            service: service
            env: env
            version: version
            component: component
            event: event
            status: status
            job_id: job_id
      - labels:
          service:
          env:
          component:
          event:
```

## 4) Elasticsearch shipping

### Option A: Filebeat (filestream)

```yaml
filebeat.inputs:
  - type: filestream
    id: object-storage
    paths:
      - /var/lib/containers/storage/overlay-containers/<ID>/userdata/ctr.log
    parsers:
      - ndjson:
          target: ""
          overwrite_keys: true
    processors:
      - decode_json_fields:
          fields: ["log"]
          target: ""
          overwrite_keys: true
      - drop_event:
          when:
            not:
              equals:
                service: "object-storage"

output.elasticsearch:
  hosts: ["http://elasticsearch:9200"]
```

### Option B: Fluent Bit (journald)

```ini
[INPUT]
  Name              systemd
  Tag               object-storage
  Systemd_Filter    _SYSTEMD_UNIT=podman-object-storage.service

[OUTPUT]
  Name              es
  Match             object-storage
  Host              elasticsearch
  Port              9200
  Index             object-storage-%Y.%m.%d
```

## 5) Recommended Grafana filters

- `service="object-storage"`
- `event="http.request" | event="job.completed"`
- `status>=500` (errors)
- `job_type="s3_delete_objects"` (job diagnostics)

## 6) Notes

- If you run behind a reverse proxy, set `X-Forwarded-For` so `remote_addr` is accurate.
- Use `LOG_ENV=prod` and `LOG_VERSION` to slice rollouts by version.
- `JOB_LOG_EMIT_STDOUT=true` duplicates job logs to stdout for centralized shipping.
