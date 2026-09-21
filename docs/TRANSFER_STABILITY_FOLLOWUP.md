# Transfer stability follow-up

Date: 2026-09-21. Baseline: `s3desk-seaweedfs-transfer-hardening.zip`.

This changes source only. It does not deploy to a server, migrate data, remove
volumes, change keys, or alter the SeaweedFS/grid/sidebar configuration. Build
and deploy the frontend and backend together. No dependency upgrade or wire API
schema change is required; OpenAPI generated code is unchanged.

## Confirmed presigned PUTs, bounded failure and cancellation

A single PUT must receive a successful 2xx response before the presigned worker
can resolve successfully. A lost response is ambiguous, not success: HEAD/size
can describe an older object at the same key. A network failure or HTTP
408/429/500/502/503/504 is retried **once** using the same URL and body. Retry delay
is 500 ms by default; readable Retry-After values are bounded to 500 ms–10 s.
A failed retry rejects; the existing higher-level fallback/recovery policy can
then run. A manual retry can acquire a fresh URL. Permanent 4xx responses are
not automatically retried. Provider XML/HTML is not copied into the error text.

An XHR has a **120-second no-progress deadline**, reset by transfer progress,
rather than a 120-second total-file deadline. An idle request is aborted. This
policy is only for the presigned browser PUT path, not all network requests.
The application does not currently expose a user setting for this deadline.

The first terminal multipart failure stops sibling requests immediately and
preserves the original failure. In-flight XHR abort handles are stored in a Set
and removed when requests settle. Already completed requests are not retained
for the life of a many-file task. Abort also interrupts retry backoff and is
forwarded to presign/complete control-plane requests. A successfully completed
remote operation cannot be undone by a later abort; interrupted completion can
still require server reconciliation. Verified-session retention and expiration
policies from the baseline are preserved.

## Local file identity preparation is visible and cancelable

The existing full-content identity format (`s3desk-sha256-chain-v1`) and 8 MiB
blocks are unchanged. Both first-time identity preparation and re-selection
verification emit file index, path, local bytes read and percentage. The transfer
row shows **Checking files** / **Preparing resumable upload** or **Verifying
original file** and explicitly says **read locally (not uploaded)**. These bytes
are not added to upload bytes/speed. Intermediate same-file UI updates are
throttled to 100 ms; boundaries/completion are immediate. Preparation state is
not persisted. Long paths wrap rather than forcing a wide mobile row.

Cancel rejects the wait for an in-flight Blob read or WebCrypto operation
promptly, discards late results and schedules no further blocks. This does not
claim the browser's underlying crypto/filesystem operation itself is physically
canceled. A previously started bounded block can finish in the browser. The
identity algorithm still reads the whole file before resumable upload; hashing
cost on real phones was not benchmarked. WebCrypto absence still means safe new
sessions rather than unverified part reuse.

## Conditional object download responses

The S3-native objectdownload handler now implements GET/HEAD preconditions:

- Strong If-Match lists/wildcard and If-Unmodified-Since.
- Weak If-None-Match comparison and If-Modified-Since, with proper precedence.
- 304 without a body or stale range/length headers; failed preconditions return
  412 before evaluating an unsatisfiable range.
- Response validation uses actual GET metadata even if a provider ignores the
  upstream If-Match condition. Repeated/list ETag alternatives are not sent
  upstream as only their first member.
- Strong single-tag If-Match can still be forwarded to the provider. An ordinary
  unconditional full GET does not gain an extra HEAD request. HEAD never fetches
  the body; Range still uses the previous HEAD/conditional GET approach.

HEAD failures without an XML error code now preserve recognized wrapped HTTP
status codes (e.g. 403/404/412), rather than always becoming 502. This adapter
change has SDK-level test cases, but the full SDK package could not be executed
in the restricted validation environment. Error responses omit provider details.

This is **not** a complete implementation of every HTTP conditional variant.
Single-range, weak/date If-Range fallback, multi-range full-response fallback,
signed-link expiration and non-S3 provider limitations from
`TRANSFER_RESILIENCE.md` still apply.

## Reproducible checks

With normal project dependencies installed:

```bash
cd frontend
node --test ../scripts/tests/transfer_resilience.test.cjs
npm run test:unit -- src/components/transfers/__tests__/presignedUpload.test.ts \
  src/components/transfers/__tests__/presignedResume.test.ts \
  src/components/transfers/__tests__/TransferUploadRow.test.tsx
```

The dedicated source-function test is also called by `scripts/check.sh` before
Vitest in its frontend lane. This does not replace lint, typecheck, generated
OpenAPI checks, Vitest or browser tests.

A deliberately dependency-isolated check is available:

```bash
# Run at project root with frontend TypeScript installed:
./scripts/check_transfer_resilience_offline.sh
# Or point to an existing TypeScript package, without downloading anything:
TYPESCRIPT_PATH=/path/to/typescript ./scripts/check_transfer_resilience_offline.sh
```

This command runs actual TypeScript transfer functions with explicit XHR/API
doubles, then copies the actual standard-library-only Go packages into a
scratch module and runs race-enabled tests. It does not lower or replace the
project Go/Node pins, install dependencies, contact object storage or build the
application. Race checks need a supported Go toolchain and C compiler.

Full normal-environment gates still include:

```bash
cd frontend && npm ci && npm run gen:openapi && npm run build && npm run test:unit
cd ../backend && go test -race ./internal/objectdownload ./internal/streamlimit \
  ./internal/multipartverify ./internal/api
```

Real SeaweedFS/S3, browsers, Android/iOS/WebViews, CORS, stalled mobile networks,
whole-app layout and OS lifecycle behavior require separate integration/device
validation. Test doubles and local HTTP fixtures are not that evidence.

## Technical references

- RFC 9110 sections 13.1/13.2 and 14: https://www.rfc-editor.org/rfc/rfc9110.html
- S3 HEAD error behavior: https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html
- XHR abort lifecycle: https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/abort
