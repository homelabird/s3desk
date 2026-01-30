# Performance Notes

This document captures local performance measurements and tuning guidance for large object listings.

## Measurements (local, 2026-01-29)

Environment:
- S3Desk container on Podman network with MinIO (`endpoint=http://minio:9000`).
- rclone version reported by server: v1.72.0.
- Requests: 5 samples per prefix, measured via `/api/v1/buckets/{bucket}/objects?prefix=...&delimiter=/`.

Results (average, min, max):

| Prefix size | Avg (s) | Min (s) | Max (s) |
| --- | ---: | ---: | ---: |
| 10,000 objects | 0.774 | 0.539 | 1.123 |
| 50,000 objects | 2.030 | 1.527 | 3.971 |

Reference (smaller prefixes, same environment):

| Prefix size | Avg (s) | Notes |
| --- | ---: | --- |
| 100 objects | ~0.093 | small prefix
| 1,000 objects | ~0.284 | medium prefix
| 5,000 objects | ~0.719 | large prefix

These numbers reflect local networking and MinIO behavior. Real-world latency will vary by provider, region, and network.

## Caching / indexing strategy for large prefixes

- Prefer scoped listings: always use a specific `prefix` and `delimiter=/` to avoid scanning the entire bucket.
- Enable indexed search for large prefixes:
  - UI: Settings → Objects → **Auto index current prefix**
  - TTL: increase **Auto index TTL** for stable prefixes to reduce re-index frequency.
- For very large prefixes, create an index job explicitly:
  - API: `POST /api/v1/jobs` with `type=s3_index_objects` and a prefix payload.
  - Use `GET /api/v1/buckets/{bucket}/objects/index-summary` to confirm coverage.
- Use Global Search for frequent lookups instead of repeated full listings.
- Reduce UI overhead on large directories:
  - Disable thumbnails when listing large prefixes.
  - Use filters and type limits to reduce rendered rows.

## Automation

See `scripts/perf_objects_list.sh` for a reproducible local benchmark that creates a temporary bucket,
loads N objects per prefix, and measures list latency via the API.

Output:
- JSON to stdout (suitable for CI/cron ingestion).
- Markdown table appended to this file by default (`APPEND_PERF_NOTES=1`).
  - Includes environment metadata (server version/addr, transfer engine, container, host, networks when available).

## Measurement (2026-01-29 18:27 UTC)

Environment:
- API base: http://127.0.0.1:8080
- Profile ID: 01KG5D3YCB9YQA8BNMA83JGZ59
- Endpoint: http://minio:9000
- Requests per prefix: 5
- Bucket: perf-objects-1769711128

| Objects | Avg (s) | Min (s) | Max (s) |
| ---: | ---: | ---: | ---: |
| 100000 | 3.728 | 2.718 | 7.571 |

## Measurement (2026-01-29 18:53 UTC)

Environment:
- API base: http://127.0.0.1:8080
- Profile ID: 01KG5D3YCB9YQA8BNMA83JGZ59
- Container: s3desk_local
- Container networks: s3desk_default
- Host: fedora
- Endpoint: http://minio:9000
- Requests per prefix: 5
- Bucket: perf-objects-1769712729

| Objects | Avg (s) | Min (s) | Max (s) |
| ---: | ---: | ---: | ---: |
| 100000 | 2.803 | 2.717 | 2.952 |

## Measurement (2026-01-29 18:56 UTC)

Environment:
- API base: http://127.0.0.1:8080
- Profile ID: 01KG5D3YCB9YQA8BNMA83JGZ59
- Server version: 0.1.0
- Server addr: 0.0.0.0:8080
- Transfer engine version: rclone v1.72.0
- Transfer engine path: /usr/local/bin/rclone
- Container: s3desk_local
- Container networks: s3desk_default
- Host: fedora
- Endpoint: http://minio:9000
- Requests per prefix: 5
- Bucket: perf-objects-1769712878

| Objects | Avg (s) | Min (s) | Max (s) |
| ---: | ---: | ---: | ---: |
| 100000 | 2.867 | 2.801 | 3.074 |
