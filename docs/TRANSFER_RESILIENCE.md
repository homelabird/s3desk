# Transfer resilience: verified resume and bounded downloads

This update builds on the SeaweedFS/mobile-improvements snapshot. It does not
change database schemas, stored credentials, encryption keys or object volumes.
Deploy frontend and backend together: the frontend can now request multipart
completion with an empty `parts` array, which requires the updated backend.

## Resuming uploads without mixing files

Before reusing a session, the frontend verifies the selected file's **entire
content**, not just its filename, length or modification date. The internal
`s3desk-sha256-chain-v1` identity combines SHA-256 digests of successive 8 MiB
blocks, binding the block size and total length. It is an internal file identity,
**not the ordinary `sha256sum` of the file**, an S3 ETag, or a provider checksum.
It avoids constructing a whole-file ArrayBuffer but requires an additional
complete local read before the first resumable upload / after file reselection.
No actual device memory, preparation-time or throughput claim is made here.

Identity verification requires Web Crypto. On insecure HTTP/LAN origins where
`crypto.subtle` is unavailable, ordinary uploads continue but old parts are **not
reused**. Legacy history without an identity also starts a new session. Use a
trusted HTTPS origin to enable verified resume on supported mobile browsers.
Different content is rejected before querying staged parts; selecting the
original file again is supported even when an incorrect File was remembered.
This protects the application's reselection flow; it does not add a server-side
end-to-end checksum enforcement protocol for independent API clients.

Presigned multipart uploads now retain resume descriptors and reuse existing
zero-based part indices. Geometry is preserved despite changed tuning settings.
The backend's authenticated ListParts inventory supplies current ETags on resumed
completion; every expected part and its byte length must be present. Incorrect,
missing, duplicate and unexpected parts are rejected. Fresh completion requests
must also contain the full ordered set of part numbers.

Verified sessions are retained on interruption instead of being deleted on every
failure. Existing expiry and maintenance cleanup still apply (`UPLOAD_TTL`,
default 24 hours). Presign failures before metadata exists, expired sessions,
completed files whose multipart metadata is already gone, and unverified legacy
state may require a fresh session. Removing a row does not bypass expiry cleanup.
This is not a promise of uninterrupted background upload after the OS kills a page.

## S3 / SeaweedFS object downloads

`S3_NATIVE_DOWNLOAD=true` (default) uses the existing guarded, pooled S3 SDK
transport for `aws_s3` and `s3_compatible` profiles. No rclone child process is
started for these object streams. Server requests still use the internal profile
endpoint, not its browser/public endpoint, and the existing endpoint/TLS guards
remain in force.

Full GET uses metadata from the same GetObject response. UI/listing size hints
remain compatible with old signed links but never determine the HTTP body's
Content-Length. Single byte ranges support bounded, open-ended and suffix forms.
With a strong ETag, a range is bound to a current HEAD using If-Match and, where
available, VersionId. Response range, length and validators are checked before
sending headers. Invalid/unsatisfiable single ranges return 416; changed If-Range
validators fall back to a full response. Date/weak validators are not accepted
as proof for partial reuse. Multipart range responses are not implemented; those
requests receive a full response. Provider short reads abort the HTTP stream.

This is an S3-native feature, not universal Range support for every rclone provider.
`S3_NATIVE_DOWNLOAD=false` restores the generic rclone path. Generic GET responses
avoid stale fixed lengths/validators and advertise no byte-range support; they
still read the whole object. Generic downstream write failures now cancel the
child before waiting, and late errors abort rather than cleanly finish the stream.

Signed links keep their existing short lifetime (about five minutes). An already
open stream is not stopped by link expiry; a later request after expiry needs a
new link. Automatic URL refresh inside an external browser download manager is
not implemented. Browser handoff is still **not confirmed device storage**.

## Download admission and observability

All object/artifact proxy streams, including authenticated object/artifact
endpoints, share a process-local admission limiter:

| Environment / CLI flag | Default |
|---|---:|
| `DOWNLOAD_MAX_CONCURRENT_REQUESTS` / `--download-max-concurrent-requests` | 8 |
| `DOWNLOAD_MAX_CONCURRENT_PER_PROFILE` / `--download-max-concurrent-per-profile` | 4 |
| `S3_NATIVE_DOWNLOAD` / `--s3-native-download` | true |

Limits must be positive. Excess streams get HTTP 429 with `Retry-After: 2` rather
than allocating an unbounded internal waiting queue. HEAD metadata requests do
not reserve a stream. Disconnect, completion and errors return the slot. Limits
apply **per server process**, not across a multi-replica cluster. Parallel range
requests count as separate streams. These are safe starting defaults, not a
measured optimal configuration for a particular host.

The demo, dev and remote Compose stacks pass these settings through. Metrics are
`download_streams_active`, `download_streams_rejected_total`, and
`download_stream_duration_seconds` (seconds; includes interrupted streams).
Profile IDs and signed URLs are not metric labels. The frontend concurrency
setting limits in-page downloads and link preparation, not the OS/browser's
external transfer queue. Download responses bypass compression middleware so
byte offsets refer to the actual stored bytes.

## History, handoff and engine coverage

Persist all nonterminal descriptors, then cap completed history at 200 per
transfer direction. If sessionStorage is full, retry with active descriptors only;
warn when completed history was omitted or persistence failed entirely. Signed
URLs are never serialized. This does not turn sessionStorage into durable storage
across all browser/OS resets.

A `Sent to browser` row now offers **Download again**. This is explicit user action,
not an automatic declaration of failure; users should check the browser manager
first to avoid duplicates. The CDP safe-area test is Chromium-only; other platform
tests remain enabled on WebKit, and uploads/jobs mobile suites are now included.
Desktop WebKit automation does not certify physical iOS or a native WebView host.

## Validation in a dependency-enabled environment

Use the repository's declared Node 22.22+ (22.x) and Go toolchain 1.25.13:

```sh
cd backend
go test -race ./internal/objectdownload ./internal/multipartverify ./internal/streamlimit ./internal/api ./internal/metrics
cd ../frontend
npm ci
npm run gen:openapi
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e:mobile-webkit
```

Then run the existing SeaweedFS demo/provider E2E and physical Android/iOS tests.
Cover modified-object downloads, Range and expiry, multiple Save actions, lost
connections, part failures, same-size replacements, full sessionStorage, and
HTTPS versus HTTP origins. Test files in this update include source-level tests
and real HTTP kernel tests; mocked IO tests are not live storage certification.

Technical references: AWS GetObject API (Range / IfMatch / VersionId), RFC 9110
(Range / If-Range), and Playwright BrowserContext.newCDPSession (Chromium-only).
