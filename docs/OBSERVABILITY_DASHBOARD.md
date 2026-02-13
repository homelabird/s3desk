# Observability Dashboard Template (PromQL)

These panels are designed for the built-in metrics in `internal/metrics`.

## Import-ready dashboard JSON

- Grafana import file: `docs/grafana/s3desk-jobs-retry-failure.dashboard.json`
- Import path: Grafana `Dashboards` -> `New` -> `Import` -> upload the JSON file.
- Datasource: map `DS_PROMETHEUS` to your Prometheus datasource during import.

## HTTP

- **RPS by route**
  ```
  sum(rate(http_requests_total[5m])) by (route, status)
  ```

- **p95 latency by route**
  ```
  histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route))
  ```

- **p99 latency (overall)**
  ```
  histogram_quantile(0.99, sum(rate(http_request_duration_ms_bucket[5m])) by (le))
  ```

## Jobs

- **Queue depth / capacity**
  ```
  jobs_queue_depth
  jobs_queue_capacity
  ```

- **Jobs started / completed**
  ```
  sum(rate(jobs_started_total[5m])) by (type)
  sum(rate(jobs_completed_total[5m])) by (type, status)
  ```

- **Job duration p95**
  ```
  histogram_quantile(0.95, sum(rate(jobs_duration_ms_bucket[15m])) by (le, type, status))
  ```

- **Job failures by error code**
  ```
  sum(rate(jobs_completed_total{status="failed"}[15m])) by (type, error_code)
  ```

- **Retry attempts rate by type**
  ```
  sum(rate(jobs_retried_total[15m])) by (type)
  ```

- **Retry pressure (% of started jobs)**
  ```
  100 * sum(rate(jobs_retried_total[15m]))
    / clamp_min(sum(rate(jobs_started_total[15m])), 0.001)
  ```

- **Final failure ratio (overall %)**
  ```
  100 * sum(rate(jobs_completed_total{status="failed"}[15m]))
    / clamp_min(sum(rate(jobs_completed_total[15m])), 0.001)
  ```

- **Final failure ratio by type (%)**
  ```
  100 * sum(rate(jobs_completed_total{status="failed"}[15m])) by (type)
    / clamp_min(sum(rate(jobs_completed_total[15m])) by (type), 0.001)
  ```

- **Retry effectiveness (retries per failed completion)**
  ```
  sum(rate(jobs_retried_total[15m]))
    / clamp_min(sum(rate(jobs_completed_total{status="failed"}[15m])), 0.001)
  ```

## Transfers

- **Transfer throughput**
  ```
  sum(rate(transfer_bytes_total[5m])) by (direction)
  ```

- **Transfer errors**
  ```
  sum(rate(transfer_errors_total[15m])) by (code)
  ```

## Realtime events

- **Active event connections**
  ```
  events_connections
  ```

- **Reconnect rate**
  ```
  rate(events_reconnects_total[15m])
  ```
