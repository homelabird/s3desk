# API 요청/응답 샘플

이 문서는 주요 API 그룹에 대한 curl 요청/응답 예시를 제공합니다.

기본 주소와 헤더

- Base URL: http://127.0.0.1:8080/api/v1
- X-Api-Token: API_TOKEN 설정 시 필수
- X-Profile-Id: 프로필 스코프 엔드포인트에 필수

권장 변수

```bash
BASE_URL="http://127.0.0.1:8080"
API_TOKEN="change-me"
PROFILE_ID="01PROFILE"
BUCKET="my-bucket"
PREFIX="path/"
OBJECT_KEY="path/to/object.txt"
UPLOAD_ID="01UPLOAD"
JOB_ID="01JOB"
```

에러 응답 형식

```json
{
  "error": {
    "code": "not_found",
    "message": "job not found",
    "normalizedError": { "code": "not_found", "retryable": false },
    "details": {
      "jobId": "01JOB"
    }
  }
}
```

System

```bash
# GET /meta
curl -sS "$BASE_URL/api/v1/meta" \
  -H "X-Api-Token: $API_TOKEN"
```

```json
{
  "version": "0.1.0",
  "serverAddr": "0.0.0.0:8080",
  "apiTokenEnabled": true,
  "capabilities": {
    "profileTls": { "enabled": false, "reason": "ENCRYPTION_KEY is required to store mTLS material" },
    "providers": {
      "s3_compatible": {
        "bucketCrud": true,
        "objectCrud": true,
        "jobTransfer": true,
        "bucketPolicy": true,
        "gcsIamPolicy": false,
        "azureContainerAccessPolicy": false,
        "presignedUpload": true,
        "presignedMultipartUpload": true,
        "directUpload": false,
        "reasons": {
          "gcsIamPolicy": "Supported only by gcp_gcs.",
          "azureContainerAccessPolicy": "Supported only by azure_blob.",
          "directUpload": "Direct upload mode is disabled on this server (UPLOAD_DIRECT_STREAM=false)."
        }
      }
    }
  },
  "jobConcurrency": 2,
  "uploadSessionTTLSeconds": 86400,
  "transferEngine": { "name": "rclone", "available": true, "version": "rclone v1.66.0" }
}
```

```bash
# GET /healthz
curl -sS "$BASE_URL/healthz"
```

```
ok
```

Events

```bash
# SSE 스트림 (EventSource 호환, apiToken 쿼리 사용)
curl -N "$BASE_URL/api/v1/events?apiToken=$API_TOKEN&afterSeq=0"
```

```
data: {"type":"job.progress","ts":"...","seq":12,"jobId":"01JOB","payload":{"status":"running","progress":{"bytesDone":123}}}
```

```bash
# WebSocket (wscat 예시)
wscat -c "ws://127.0.0.1:8080/api/v1/ws?apiToken=$API_TOKEN"
```

Profiles

```bash
# GET /profiles
curl -sS "$BASE_URL/api/v1/profiles" \
  -H "X-Api-Token: $API_TOKEN"
```

```json
[
  {
    "id": "01PROFILE",
    "name": "prod",
    "endpoint": "http://minio:9000",
    "region": "us-east-1",
    "forcePathStyle": false,
    "preserveLeadingSlash": false,
    "tlsInsecureSkipVerify": false,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
]
```

```bash
# POST /profiles
curl -sS -X POST "$BASE_URL/api/v1/profiles" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"prod",
    "endpoint":"http://minio:9000",
    "region":"us-east-1",
    "accessKeyId":"AKIA...",
    "secretAccessKey":"...",
    "forcePathStyle":false,
    "preserveLeadingSlash":false,
    "tlsInsecureSkipVerify":false
  }'
```

```json
{ "id": "01PROFILE", "name": "prod", "endpoint": "http://minio:9000", "region": "us-east-1" }
```

```bash
# PATCH /profiles/{profileId}
curl -sS -X PATCH "$BASE_URL/api/v1/profiles/$PROFILE_ID" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"prod-2","forcePathStyle":true,"preserveLeadingSlash":false}'
```

```bash
# DELETE /profiles/{profileId}
curl -sS -X DELETE "$BASE_URL/api/v1/profiles/$PROFILE_ID" \
  -H "X-Api-Token: $API_TOKEN"
```

```bash
# POST /profiles/{profileId}/test
curl -sS -X POST "$BASE_URL/api/v1/profiles/$PROFILE_ID/test" \
  -H "X-Api-Token: $API_TOKEN"
```

```json
{"ok":true,"message":"ok","details":{"buckets":3,"storageType":"s3-compatible"}}
```

```bash
# GET /profiles/{profileId}/tls
curl -sS "$BASE_URL/api/v1/profiles/$PROFILE_ID/tls" \
  -H "X-Api-Token: $API_TOKEN"
```

Buckets

```bash
# GET /buckets
curl -sS "$BASE_URL/api/v1/buckets" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```json
[{"name":"photos","createdAt":"2025-01-01T00:00:00Z"}]
```

```bash
# POST /buckets
curl -sS -X POST "$BASE_URL/api/v1/buckets" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID" \
  -H "Content-Type: application/json" \
  -d '{"name":"photos","region":"us-east-1"}'
```

```bash
# DELETE /buckets/{bucket}
curl -sS -X DELETE "$BASE_URL/api/v1/buckets/$BUCKET" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

Objects

```bash
# GET /buckets/{bucket}/objects
curl -sS "$BASE_URL/api/v1/buckets/$BUCKET/objects?prefix=$PREFIX&delimiter=/&maxKeys=500" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```json
{"bucket":"photos","prefix":"2024/","delimiter":"/","commonPrefixes":["2024/01/"],"items":[],"isTruncated":false}
```

```bash
# DELETE /buckets/{bucket}/objects
curl -sS -X DELETE "$BASE_URL/api/v1/buckets/$BUCKET/objects" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID" \
  -H "Content-Type: application/json" \
  -d '{"keys":["path/a.txt","path/b.txt"]}'
```

```json
{"deleted":2,"errors":[]}
```

```bash
# GET /buckets/{bucket}/objects/search
curl -sS "$BASE_URL/api/v1/buckets/$BUCKET/objects/search?q=report&prefix=$PREFIX&limit=50" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# GET /buckets/{bucket}/objects/index-summary
curl -sS "$BASE_URL/api/v1/buckets/$BUCKET/objects/index-summary?prefix=$PREFIX&sampleLimit=5" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# GET /buckets/{bucket}/objects/meta
curl -sS "$BASE_URL/api/v1/buckets/$BUCKET/objects/meta?key=$OBJECT_KEY" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# POST /buckets/{bucket}/objects/folder
curl -sS -X POST "$BASE_URL/api/v1/buckets/$BUCKET/objects/folder" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID" \
  -H "Content-Type: application/json" \
  -d '{"key":"2024/new-folder/"}'
```

```bash
# GET /buckets/{bucket}/objects/download
curl -L -o file.bin "$BASE_URL/api/v1/buckets/$BUCKET/objects/download?key=$OBJECT_KEY" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# GET /buckets/{bucket}/objects/download-url
curl -sS "$BASE_URL/api/v1/buckets/$BUCKET/objects/download-url?key=$OBJECT_KEY&expiresSeconds=900" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# GET /buckets/{bucket}/objects/download-url?proxy=true
# Returns a signed proxy URL that enforces Content-Disposition.
PROXY_URL=$(curl -sS "$BASE_URL/api/v1/buckets/$BUCKET/objects/download-url?key=$OBJECT_KEY&proxy=true" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID" | jq -r .url)
curl -L -o file.bin "$PROXY_URL"
```

```bash
# Favorites
curl -sS "$BASE_URL/api/v1/buckets/$BUCKET/objects/favorites?prefix=$PREFIX" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"

curl -sS -X POST "$BASE_URL/api/v1/buckets/$BUCKET/objects/favorites" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID" \
  -H "Content-Type: application/json" \
  -d '{"key":"path/a.txt"}'

curl -sS -X DELETE "$BASE_URL/api/v1/buckets/$BUCKET/objects/favorites?key=path/a.txt" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# Thumbnail
curl -L -o thumb.jpg "$BASE_URL/api/v1/buckets/$BUCKET/objects/thumbnail?key=$OBJECT_KEY&size=96" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

Uploads

```bash
# POST /uploads
curl -sS -X POST "$BASE_URL/api/v1/uploads" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID" \
  -H "Content-Type: application/json" \
  -d '{"bucket":"my-bucket","prefix":"path/"}'
```

```json
{"uploadId":"01UPLOAD","expiresAt":"2025-01-01T00:00:00Z","maxBytes":null}
```

```bash
# POST /uploads/{uploadId}/files (multipart)
curl -sS -X POST "$BASE_URL/api/v1/uploads/$UPLOAD_ID/files" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID" \
  -F "files=@./file1.txt" -F "files=@./file2.txt"
```

```bash
# POST /uploads/{uploadId}/commit
curl -sS -X POST "$BASE_URL/api/v1/uploads/$UPLOAD_ID/commit" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID" \
  -H "Content-Type: application/json" \
  -d '{"label":"batch-1","rootKind":"folder","totalFiles":2,"totalBytes":12345}'
```

```json
{"jobId":"01JOB"}
```

```bash
# DELETE /uploads/{uploadId}
curl -sS -X DELETE "$BASE_URL/api/v1/uploads/$UPLOAD_ID" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

Jobs

```bash
# GET /jobs
curl -sS "$BASE_URL/api/v1/jobs?status=running&limit=50" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```json
{"items":[{"id":"01JOB","type":"transfer_copy_prefix","status":"running"}],"nextCursor":null}
```

```bash
# POST /jobs
curl -sS -X POST "$BASE_URL/api/v1/jobs" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID" \
  -H "Content-Type: application/json" \
  -d '{"type":"transfer_copy_prefix","payload":{"srcBucket":"a","srcPrefix":"p/","dstBucket":"b","dstPrefix":"q/","include":[],"exclude":[],"dryRun":false}}'
```

```bash
# GET /jobs/{jobId}
curl -sS "$BASE_URL/api/v1/jobs/$JOB_ID" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# GET /jobs/{jobId}/logs
curl -i -sS "$BASE_URL/api/v1/jobs/$JOB_ID/logs?tailBytes=65536" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# GET /jobs/{jobId}/artifact
curl -L -o job.zip "$BASE_URL/api/v1/jobs/$JOB_ID/artifact" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# POST /jobs/{jobId}/cancel
curl -sS -X POST "$BASE_URL/api/v1/jobs/$JOB_ID/cancel" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# POST /jobs/{jobId}/retry
curl -sS -X POST "$BASE_URL/api/v1/jobs/$JOB_ID/retry" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

```bash
# DELETE /jobs/{jobId}
curl -sS -X DELETE "$BASE_URL/api/v1/jobs/$JOB_ID" \
  -H "X-Api-Token: $API_TOKEN" \
  -H "X-Profile-Id: $PROFILE_ID"
```

비고

- Job 큐가 가득 차면 HTTP 429와 error.code=job_queue_full, Retry-After 헤더가 반환됩니다.
- SSE/WS는 브라우저 제약으로 apiToken 쿼리 파라미터를 사용해야 합니다.
