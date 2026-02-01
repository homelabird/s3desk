# Performance Profiling Plan

This document provides a concrete profiling plan plus a runnable script to capture
baseline API latency.

## What to measure

1) API latency (per route)
- `GET /api/v1/meta`
- `GET /api/v1/buckets`
- `GET /api/v1/buckets/{bucket}/objects`
- `GET /api/v1/buckets/{bucket}/objects/index-summary`
- `GET /api/v1/jobs`

2) Job system
- Queue: `jobs_queue_depth`, `jobs_queue_capacity`
- Throughput: `jobs_started_total`, `jobs_completed_total`
- Duration: `jobs_duration_ms` (p50/p95)
- Errors: `jobs_completed_total{status="failed"}` + `transfer_errors_total`

3) Transfers
- `transfer_bytes_total{direction="upload|download"}`
- rclone stats/ETA from job logs (if enabled)

4) Indexing
- `s3_index_objects` job duration and bytesDone
- object_index size growth (DB size on disk)

## Script: API latency baseline

Script: `scripts/perf_profile.sh`

Example:
```bash
export API_BASE="http://127.0.0.1:8080"
export API_TOKEN="change-me"
export PROFILE_ID="PROFILE_ULID"
export BUCKET="my-bucket"
export PREFIX="some/prefix"
export RUNS=5
export MAX_KEYS=200

./scripts/perf_profile.sh > /tmp/perf_profile.json
```

Notes:
- If `BUCKET` is empty, the script picks the first bucket returned by `/buckets`.
- Output includes per-endpoint samples and p50/p95/p99.

## Dashboard template

See: `docs/OBSERVABILITY_DASHBOARD.md` for PromQL panel suggestions.

## Latest run (2026-01-30)

Run context:
- Executed at: 2026-01-30T19:37:35+09:00
- API base: http://127.0.0.1:8080
- Profile: e2e-minio (01KG5D3YCB9YQA8BNMA83JGZ59), provider s3_compatible, endpoint http://minio:9000
- Bucket: perf-objects-1769711094
- Prefix: (empty)
- Runs: 5, maxKeys: 200
- Server: version 0.1.0, rclone v1.72.0, jobConcurrency 2

Results (ms):
| Endpoint | avg_ms | p50_ms | p95_ms | p99_ms | min_ms | max_ms |
|---|---:|---:|---:|---:|---:|---:|
| meta | 23.367 | 23.879 | 24.586 | 24.586 | 21.959 | 24.586 |
| buckets | 48.623 | 48.197 | 51.322 | 51.322 | 45.682 | 51.322 |
| objects | 49.543 | 50.894 | 51.816 | 51.816 | 45.789 | 51.816 |
| index_summary | 0.897 | 0.854 | 1.012 | 1.012 | 0.842 | 1.012 |
| jobs | 0.894 | 0.885 | 0.967 | 0.967 | 0.863 | 0.967 |
