# Data Flows: DB Settings, Indexes, and SQL

This document summarizes the actual database tables, indexes, and query patterns
used by S3Desk flows (based on `backend/internal/db/db.go` and Store methods).

## DB settings / engine behavior

- SQLite:
  - `PRAGMA busy_timeout=5000`
  - `PRAGMA foreign_keys=ON`
  - `PRAGMA journal_mode=WAL`
- Postgres:
  - Uses `DATABASE_URL` as-is (no extra pragmas).

## Tables and indexes (DDL summary)

From `backend/internal/db/db.go`:

- `profiles`
  - PK: `id`
- `profile_connection_options`
  - PK: `profile_id`
- `jobs`
  - PK: `id`
  - Indexes:
    - `idx_jobs_profile_id(profile_id)`
    - `idx_jobs_profile_id_id(profile_id, id)`
    - `idx_jobs_status(status)`
    - `idx_jobs_type(type)`
    - `idx_jobs_finished_at(finished_at)`
    - `idx_jobs_status_finished_at(status, finished_at)`
- `upload_sessions`
  - PK: `id`
  - Indexes:
    - `idx_upload_sessions_profile_id(profile_id)`
    - `idx_upload_sessions_expires_at(expires_at)`
- `upload_multipart_uploads`
  - PK: `(upload_id, path)`
  - Indexes:
    - `idx_upload_multipart_uploads_profile_id(profile_id)`
    - `idx_upload_multipart_uploads_upload_id(upload_id)`
- `object_index`
  - PK: `(profile_id, bucket, object_key)`
  - Indexes:
    - `idx_object_index_profile_bucket_key(profile_id, bucket, object_key)`
    - `idx_object_index_profile_bucket_indexed_at(profile_id, bucket, indexed_at)`
- `object_favorites`
  - PK: `(profile_id, bucket, object_key)`
  - Indexes:
    - `idx_object_favorites_profile_bucket_created_at(profile_id, bucket, created_at)`

## Flow → SQL query patterns

### Profiles (list/get/create/update/delete)

- List profiles
  - SQL:
    ```
    SELECT id, name, provider, config_json, endpoint, region, force_path_style,
           preserve_leading_slash, tls_insecure_skip_verify, created_at, updated_at
      FROM profiles
     ORDER BY created_at DESC;
    ```
- Get profile
  - SQL:
    ```
    SELECT id, name, provider, config_json, endpoint, region, force_path_style,
           preserve_leading_slash, tls_insecure_skip_verify, created_at, updated_at
      FROM profiles
     WHERE id = ?;
    ```
- Get profile secrets (provider-specific fields)
  - SQL:
    ```
    SELECT id, name, provider, config_json, secrets_json, endpoint, region,
           force_path_style, preserve_leading_slash, tls_insecure_skip_verify,
           access_key_id, secret_access_key, session_token
      FROM profiles
     WHERE id = ?;
    ```
- Create profile
  - SQL (insert):
    ```
    INSERT INTO profiles (...) VALUES (...);
    ```
- Update profile
  - SQL (partial update):
    ```
    UPDATE profiles SET <columns> = <values> WHERE id = ?;
    ```
- Delete profile
  - SQL:
    ```
    DELETE FROM profiles WHERE id = ?;
    ```
  - Cascades delete to jobs/uploads/index/favorites via FK.

### Profile TLS config (mTLS)

- Get TLS config
  - SQL:
    ```
    SELECT schema_version, options_enc, updated_at
      FROM profile_connection_options
     WHERE profile_id = ?;
    ```
- Upsert TLS config
  - SQL (upsert by profile_id):
    ```
    INSERT INTO profile_connection_options(...)
    ON CONFLICT(profile_id) DO UPDATE SET schema_version=?, options_enc=?, updated_at=?;
    ```
- Delete TLS config
  - SQL:
    ```
    DELETE FROM profile_connection_options WHERE profile_id = ?;
    ```

### Jobs (create/list/get/update/delete/cleanup)

- Create job
  - SQL:
    ```
    INSERT INTO jobs (id, profile_id, type, status, payload_json, created_at)
    VALUES (?, ?, ?, 'queued', ?, ?);
    ```
- List jobs (with optional filters)
  - SQL pattern:
    ```
    SELECT * FROM jobs
     WHERE profile_id = ?
       AND status = ?        -- optional
       AND type = ?          -- optional
       AND error_code = ?    -- optional
       AND id < ?            -- cursor
     ORDER BY id DESC
     LIMIT ?;
    ```
  - Indexes used: `idx_jobs_profile_id`, `idx_jobs_profile_id_id`, `idx_jobs_status`, `idx_jobs_type`.
- Get job
  - SQL:
    ```
    SELECT * FROM jobs WHERE profile_id = ? AND id = ?;
    ```
- Update job status/progress
  - SQL:
    ```
    UPDATE jobs
       SET status=?, error=?, error_code=?, started_at=?, finished_at=?, progress_json=?
     WHERE id = ?;
    ```
- Delete job
  - SQL:
    ```
    DELETE FROM jobs WHERE profile_id = ? AND id = ?;
    ```
- Cleanup finished jobs
  - SQL:
    ```
    SELECT id FROM jobs
     WHERE finished_at IS NOT NULL
       AND finished_at < ?
       AND status IN ('succeeded','failed','canceled')
     ORDER BY finished_at ASC
     LIMIT ?;

    DELETE FROM jobs WHERE id IN (...);
    ```
  - Index: `idx_jobs_finished_at`, `idx_jobs_status_finished_at`.

### Upload sessions (staging/direct/presigned)

- Create upload session
  - SQL:
    ```
    INSERT INTO upload_sessions
      (id, profile_id, bucket, prefix, mode, staging_dir, bytes_tracked, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);
    ```
- Set staging_dir
  - SQL:
    ```
    UPDATE upload_sessions SET staging_dir = ? WHERE profile_id = ? AND id = ?;
    ```
- Get upload session
  - SQL:
    ```
    SELECT * FROM upload_sessions WHERE profile_id = ? AND id = ?;
    ```
- Add bytes (tracking)
  - SQL:
    ```
    UPDATE upload_sessions
       SET bytes_tracked = bytes_tracked + ?
     WHERE profile_id = ? AND id = ?;
    ```
- Delete upload session
  - SQL:
    ```
    DELETE FROM upload_sessions WHERE profile_id = ? AND id = ?;
    ```
- List expired sessions
  - SQL:
    ```
    SELECT * FROM upload_sessions
     WHERE expires_at < ?
     ORDER BY expires_at ASC
     LIMIT ?;
    ```
  - Index: `idx_upload_sessions_expires_at`.

### Multipart uploads (direct/presigned)

- Upsert multipart metadata
  - SQL:
    ```
    INSERT INTO upload_multipart_uploads(...)
    ON CONFLICT(upload_id, path) DO UPDATE
      SET bucket=?, object_key=?, s3_upload_id=?, chunk_size=?, file_size=?, updated_at=?;
    ```
- Get multipart
  - SQL:
    ```
    SELECT * FROM upload_multipart_uploads
     WHERE profile_id = ? AND upload_id = ? AND path = ?;
    ```
- List multipart uploads (by session)
  - SQL:
    ```
    SELECT * FROM upload_multipart_uploads
     WHERE profile_id = ? AND upload_id = ?
     ORDER BY path ASC;
    ```
- Delete multipart
  - SQL:
    ```
    DELETE FROM upload_multipart_uploads
     WHERE profile_id = ? AND upload_id = ? AND path = ?;
    ```

### Object index (search/index summary)

- Upsert index batch
  - SQL:
    ```
    INSERT INTO object_index(profile_id, bucket, object_key, size, etag, last_modified, indexed_at)
    VALUES ...
    ON CONFLICT(profile_id, bucket, object_key)
    DO UPDATE SET size=?, etag=?, last_modified=?, indexed_at=?;
    ```
- Search index
  - SQL pattern:
    ```
    SELECT object_key, size, etag, last_modified
      FROM object_index
     WHERE profile_id = ?
       AND bucket = ?
       AND object_key LIKE '<prefix>%'
       AND object_key LIKE '%<token1>%'
       AND object_key LIKE '%<token2>%'
     ORDER BY object_key ASC
     LIMIT ?;
    ```
  - Index: `idx_object_index_profile_bucket_key`.
- Index summary
  - SQL:
    ```
    SELECT COUNT(*) AS count,
           COALESCE(SUM(size), 0) AS total_bytes,
           MAX(indexed_at) AS indexed_at
      FROM object_index
     WHERE profile_id = ? AND bucket = ?
       AND object_key LIKE '<prefix>%';
    ```
  - Index: `idx_object_index_profile_bucket_indexed_at`.

### Object favorites

- List favorites
  - SQL:
    ```
    SELECT object_key, created_at
      FROM object_favorites
     WHERE profile_id = ? AND bucket = ?
     ORDER BY created_at DESC;
    ```
- Add favorite (upsert)
  - SQL:
    ```
    INSERT INTO object_favorites(profile_id, bucket, object_key, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_id, bucket, object_key) DO NOTHING;
    ```
- Delete favorite
  - SQL:
    ```
    DELETE FROM object_favorites
     WHERE profile_id = ? AND bucket = ? AND object_key = ?;
    ```

