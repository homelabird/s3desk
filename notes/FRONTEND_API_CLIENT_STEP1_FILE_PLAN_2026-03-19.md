# Frontend API Client Step 1 File Plan

Date: `2026-03-19`

## Step 1 goal

Create the low-risk utility modules needed to shrink [`frontend/src/api/client.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts) before any domain API extraction starts.

## Step 1 target files

- [client.ts](/home/homelab/Downloads/project/s3desk/frontend/src/api/client.ts)
- `frontend/src/api/config.ts`
- `frontend/src/api/errors.ts`
- `frontend/src/api/headers.ts`
- `frontend/src/api/uploads.ts`
- `frontend/src/api/transport.ts`

## File creation plan

## 1. `config.ts`

### Move into this file

- `RETRY_COUNT_STORAGE_KEY`
- `RETRY_DELAY_STORAGE_KEY`
- `DEFAULT_TIMEOUT_MS`
- `DEFAULT_RETRY_COUNT`
- `DEFAULT_RETRY_DELAY_MS`
- `MAX_RETRY_DELAY_MS`
- `RETRY_COUNT_MIN`
- `RETRY_COUNT_MAX`
- `RETRY_DELAY_MIN_MS`
- `RETRY_DELAY_MAX_MS`
- `clampNumber`
- `readRetryDefaults`
- `parseRetryAfterSeconds`

### Notes

- This file must stay dependency-light.
- It should not import UI code.
- If `parseRetryAfterSeconds` fits better with `errors.ts`, move only the constants and defaults first.

## 2. `errors.ts`

### Move into this file

- `NormalizedError` type
- `APIError`
- `RequestAbortedError`
- `RequestTimeoutError`
- `isRecord`
- `parseNormalizedErrorFromBody`
- `readNormalizedErrorFromResponse`
- `parseAPIError`

### Notes

- Keep error-shape semantics identical.
- Avoid importing transport code here.
- `errors.ts` may depend on `config.ts` only if required for retry metadata types.

## 3. `headers.ts`

### Move into this file

- `createInvalidHeaderValueError`
- `setSafeFetchHeader`
- `setSafeXHRHeader`

### Notes

- This file should depend only on `../lib/httpHeaderValue`.
- Keep it utility-only.

## 4. `uploads.ts`

### Move into this file

- `UploadFileItem` type
- `UploadCommitItem` type
- `UploadCommitRequest` type
- `UploadFilesResult` type
- `resolveUploadFilename`
- `createMultipartUploadFile`

### Notes

- Keep file/path shaping logic local to upload helpers.
- If some of these types are used outside uploads later, re-export them from `client.ts`.

## 5. `transport.ts`

### Move into this file

- `RequestOptions` type
- `isIdempotentMethod`
- `shouldRetryStatus`
- `isRetryableFetchError`
- `retryDelayMs`
- `retryDelayLabel`
- `fetchWithTimeout`
- `fetchWithRetry`
- `rejectedTransferHandle` if it is only transport-adjacent

### Notes

- This file will likely depend on:
  - `config.ts`
  - `errors.ts`
  - `../lib/networkStatus`
- Keep it free of domain-specific request building.

## Initial import graph target

- `client.ts` imports from:
  - `config.ts`
  - `errors.ts`
  - `headers.ts`
  - `uploads.ts`
  - `transport.ts`
- `transport.ts` may import from:
  - `config.ts`
  - `errors.ts`
- `errors.ts` should not import from `transport.ts`
- `uploads.ts` should not import from `transport.ts`
- `headers.ts` should not import from `client.ts`

## Step 1 patch slices

## Slice A

Create `config.ts` and move constants/default helpers.

## Slice B

Create `errors.ts` and move error classes plus normalization helpers.

## Slice C

Create `headers.ts` and move safe-header helpers.

## Slice D

Create `uploads.ts` and move upload-specific types and helpers.

## Slice E

Create `transport.ts` and move retry/timeout behavior.

## Slice F

Reduce `client.ts` imports and keep behavior stable.

## Guardrails

- Do not rename public exports in step 1.
- Prefer re-exporting from `client.ts` instead of updating all callers immediately.
- Do not mix domain API method moves into step 1.
- Keep request semantics and retry defaults unchanged.

## Expected result after step 1

- `client.ts` is materially smaller.
- Transport and error logic become independently testable.
- Step 2 domain extraction can proceed without touching low-level transport semantics again.
