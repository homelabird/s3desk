# Client IP changes: authentication, safe replay, and reachability

Updated: 2026-09-21. Baseline: `s3desk-seaweedfs-transfer-stability.zip`.

## What is and is not guaranteed

The **client/source IP is not an authentication/session identity**. An authorized
client can send subsequent requests from another IPv4/IPv6 address without
changing its token, profile or upload identifier. Object and artifact download
signatures are also not bound to that address. Origin/Host restrictions refer to
the application's destination address, not a list of permitted client addresses.

This is not a promise that an already-open TCP connection survives a Wi-Fi/LTE
transition. Requests can time out or lose their response. Recovery must not turn
an uncertain mutation into an unrelated new action. A network event is only a
hint; neither `navigator.onLine` nor Network Information events prove API reachability.

The same HTTPS application origin must remain reachable from both networks.
A LAN-only server address cannot become reachable over LTE through retries.
Changing the application's URL is also different from changing the client's IP:
browser storage, origin rules and authentication scope may change with the URL.

## Changes in this version

### Valid credentials on a shared or newly assigned address

Token and valid single-use realtime-ticket verification occurs before applying
the source-IP **invalid credential** limiter. Invalid tokens are still limited;
a successful login does not erase another client's failure history. Ticket
Origin checks and one-time consumption remain in place. Loopback/private-peer
backend access guards, SSRF protections, CORS and endpoint validation have not
been removed. A directly exposed backend may still reject public TCP peers by
policy: use the supported trusted reverse-proxy deployment.

### Bounded durable control-operation receipts

The client checks the authenticated `GET /api/v1/operations/capabilities` before
enabling this protocol. An older server (404) never gains automatic POST replay.
Requests use an opaque `Idempotency-Key`, scoped to the API token and profile,
not the source address. The exact method, encoded path, query, content type and
body must match. Supported controls are:

- job creation/retry (including object copy/move/delete jobs), object deletion and folder creation;
- upload session creation, multipart completion and upload commit.

Bulk file bodies, arbitrary POSTs, profile changes, bucket policies and signed-URL
issuance are **not** automatically made replayable by this middleware.

A reservation is fsynced before the handler executes. A bounded response is
fsynced/atomically renamed before it is returned. A repeated completed request
receives the recorded status/body and `Idempotency-Replayed: true`. An accepted
control handler can continue for up to two minutes despite client disconnection;
server shutdown and its deadline still cancel it. This does not keep browser
upload streams alive after disconnection.

Outcomes:

| Situation | Result |
|---|---|
| Same key/request while original is active | 409 `operation_in_progress`, `Retry-After: 2` |
| Same key with a different intent | 409 `operation_key_conflict`; no new action |
| Completed result exists | Replay that result, including recorded failures |
| Reservation remains after process interruption | 409 `operation_outcome_unknown`; reconcile Jobs/object state |
| Persistence/capacity unavailable | 503; no **new** operation is executed |

This is **not a distributed exactly-once transaction with the object store**.
An unknown crash outcome is deliberately not executed again. Do not clear it or
submit a new intent until its existing job/object state is checked. Completed
receipts are retained at least 24 hours. The frontend refuses to reuse an
unresolved intent older than 23 hours; it does not silently manufacture a new key.

Receipts live in `DATA_DIR/operation-receipts`, with newly created directory/file
permissions 0700/0600. They contain hashes and small response bodies (which can
include private object/job metadata), not the API token. Treat the directory as
private application state. Keep it with the same DATA_DIR across container
replacement, backups and restores. One running server per DATA_DIR is required;
this is not shared-volume HA coordination. Losing the directory loses its replay
history. Limits: 16 simultaneous protected handlers, 16,384 receipts, 8 MiB control
request, 1 MiB response. Unknown pending records are not silently pruned; expired
completed entries are pruned on subsequent reservations. Fsync adds control-write
latency in exchange for durable recovery; no production latency benchmark is claimed.

The browser stores only hashed intent identifiers, random keys and timestamps in
sessionStorage when Web Crypto is available. No API token, request body, signed
URL or file bytes are persisted by this registry. It retains at most 64 unresolved
intents. If storage or Web Crypto is unavailable, replay protection remains in
memory for the current page, but refresh/OS-restart persistence is not promised.
Logging out/changing credentials clears browser recovery state. Do not interpret
that as canceling server work or as a safe way to repeat unknown mutations.

### Upload commit recovery

When file transmission has finished but the commit response is lost, the task
keeps its original upload ID and exact commit JSON body. Retry first requests that
same commit result, without selecting/re-uploading files or creating a new upload
session. A session with an uncertain commit outcome is not deleted by task cleanup.
The descriptor survives normal transfer-history restoration. Once a job ID is
confirmed the descriptor is cleared and normal job reconciliation resumes.

Bulk upload interruption still uses the existing content-identity checks and
multipart/chunk resume flow. Page/OS termination can require reselecting the same
file. Presigned PUT retries are bounded (runtime maximum: four retries), preserve
cancellation, and do not turn authentication errors into repeated writes. Retrying
object PUTs is not a claim of exactly one storage version in a versioned bucket.

### Stable server-to-storage path

`UPLOAD_PROXY_ONLY=true` prevents **new** browser-to-storage presigned uploads.
Use it when clients move between networks that cannot all reach the storage
endpoint. Uploads use S3Desk-to-storage direct multipart/staging instead. The
server-side S3 multipart capability remains independent of browser presigning.
Existing presigned sessions can still finish; this switch does not revoke them.

The SeaweedFS demo defaults this setting to true. Dev/remote defaults stay false
for compatibility; set it explicitly there when the stable proxy path is needed.
This uses backend bandwidth and CPU; it is a reachability/recovery tradeoff, not
a claim that proxying every byte is always faster. Ordinary object downloads
already use the backend proxy by default; native S3 Range handling is preserved.

### Read/state recovery

Online/connection-change hints refresh active read queries and foreground transfer
state. Events are debounced/rate-limited. Safe GET/HEAD and acknowledged
receipt-protected controls have bounded retry/backoff. Arbitrary mutations and
bulk file POSTs are not replayed just because the network changed. Cancellation
while waiting for a shared capability query does not submit a mutation later.

## Deployment checklist

Use a stable DNS name and trusted HTTPS certificate reachable on Wi-Fi, LTE and
VPN. Keep the application URL/origin the same across transitions. Keep backend
access private/loopback behind the supported proxy and use its existing
`ALLOW_REMOTE`/`ALLOWED_HOSTS` configuration correctly. Do not set wildcard CORS,
trust arbitrary X-Forwarded-For values, or remove SSRF checks to solve mobility.

Review WAF, VPN, proxy-session and storage policies that explicitly bind access
to a source address. With proxy-only transfers, storage policy should authorize
the controlled **backend egress** identity/address rather than transient mobile
client addresses. Do not remove an intentional security policy blindly.

Preserve API_TOKEN, ENCRYPTION_KEY, the whole DATA_DIR and its volumes. Deploy
frontend and backend together. No DB schema or object-data migration is needed.
Do not run `down -v`. Keep existing demo/public host values; a LAN-only demo does
not by itself constitute a public HTTPS deployment.

A signed download URL still expires (normally around five minutes). An active
stream is not stopped solely because its URL expires, but a new Range request
may need a new link. The external browser download manager cannot necessarily
obtain that new link automatically. `Download again` remains an explicit action;
the page does not report browser handoff as verified file storage.

## Verification

Run `scripts/check_ip_mobility_offline.sh` for real TypeScript transport/registry/
commit logic with explicitly substituted HTTP/React dependencies, and the real
stdlib receipt package under `go test -race`. Run the normal full frontend build,
API tests, OpenAPI regeneration and SeaweedFS E2E in a provisioned environment.

Acceptance on an actual deployment: keep one authenticated session, change real
client network, then list/read/create/update/delete; interrupt responses after
acceptance; confirm the same job ID and single action, original object checksum,
Range resume, invalid-token rejection, and eventual failure/cancel behavior.
Repeat with the real reverse proxy, TLS, WAF and storage policy in place. Local
127.0.0.2→127.0.0.3 TCP tests do not certify LTE/iOS/Android/SeaweedFS integration.

References (general protocol/platform behavior, not project test evidence):
- https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
