# Project Features

## Overview

S3Desk is a local-first dashboard for managing object storage across multiple providers with a single UI and API. It focuses on safe, auditable bulk transfers and simple browsing.

## Core capabilities

- Profiles for multiple providers and credentials
- Bucket listing and object browsing
- Bulk transfer jobs (copy, sync, and move via rclone)
- Uploads and downloads with progress tracking
- Job history and logs for troubleshooting
- API access for automation

## Provider support tiers

Tier 1:
- AWS S3 and S3-compatible (MinIO, Ceph RGW, and similar)
- Azure Blob Storage
- Google Cloud Storage (GCS)

Tier 2:
- Oracle Cloud Infrastructure (OCI) S3-compatible
- OCI Object Storage (native)

## Security model

- Local-only by default (binds to 127.0.0.1 and rejects non-local requests)
- Remote access requires ALLOW_REMOTE=true and API_TOKEN
- Host and Origin allowlists enforced for API requests

## Deployment options

- Single container with bundled UI and sqlite
- Docker Compose with Postgres
- Podman on Linux/WSL2
- Helm chart for Kubernetes

## Observability

- Structured logs (text or JSON)
- Prometheus metrics endpoint
- Job-level logs with retention controls

## Roadmap highlights

- Expand provider test coverage and failure recovery
- Improve transfer orchestration UX
- Continue tightening provider compatibility and auth flows
