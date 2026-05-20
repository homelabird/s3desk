# Reverse Proxy Smoke Evidence

- Base URL:
- Expected external base URL:
- Profile identifier:
- Bucket:
- Object key:
- S3Desk commit SHA or release tag:

## Checks

- GET `/healthz`:
- Authenticated GET `/api/v1/meta`:
- POST `/api/v1/realtime-ticket?transport=ws`:
- GET `/api/v1/buckets/{bucket}/objects/download-url?proxy=true`:
- Signed proxy URL root:
- HEAD signed proxy URL:

## Expected Statuses

- GET `/healthz`: `200`
- Authenticated GET `/api/v1/meta`: `200`
- POST `/api/v1/realtime-ticket?transport=ws`: `201`
- GET `/api/v1/buckets/{bucket}/objects/download-url?proxy=true`: `200`
- Signed proxy URL root matches expected external base URL: URL-root match, no HTTP status
- HEAD signed proxy URL: `200`

## Result

- Reverse-proxy smoke: pass

## Notes

- Do not include API tokens, backup passwords, provider secrets, or signed proxy URL signatures.
- Use `<redacted>` for any credential, token, or signature value that must be referenced for reviewer context.
- Replace `S3Desk commit SHA or release tag` with the release tag or commit SHA used for validation.
- Record `HTTP 200` for healthz, meta, download-url, and HEAD checks, and `HTTP 201` for realtime-ticket creation.
- Use `pass`, `passed`, `success`, `succeeded`, `ok`, or a `pass ...` phrase for a successful `Reverse-proxy smoke`.
- Only the `## Checks` lines are actual smoke results. `## Expected Statuses` is reference material and does not satisfy evidence requirements by itself.
