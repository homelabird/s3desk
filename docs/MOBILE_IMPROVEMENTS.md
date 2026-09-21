# Mobile interaction and transfer improvements

Baseline: `s3desk-seaweedfs-compact-ui.zip`, SHA-256 `5f9864f379c3c08ea9e6894b19a70a98b34cb32d36e1a00d2c751275a5a4f8ae`.

This change implements the mobile audit's interaction and browser-side safety work. It does **not** certify physical Android/iOS devices, implement a native WebView host, or guarantee background transfers after the OS discards a page. Existing SeaweedFS environments, object-list pagination/connection-pool fixes, data volumes and encryption settings remain in place. Deploy the frontend and backend together; the new ZIP download-link endpoint requires the updated server.

## Interaction and density

- On touch/pen input, select A, then B, then B again: the selection becomes A, A+B, A. Desktop mouse Ctrl/Command and Shift range selection remain available. The explicit filename Select button toggles selection without modifier keys.
- Mobile object cards no longer allocate an entire row to a per-card menu. Select an object and use **Selection tools** for its actions, including Favorite. A noninteractive check mark shows selection. Preview remains a separate action. Folder menus remain accessible; their decorative icon shares the action row instead of requiring an extra media row.
- Mobile retains four columns from an actual list width of 280 CSS px; actual list widths of at least 760px retain at least eight columns. The rules are list-container based, not a guarantee for every window with multiple panels open. Existing virtualization and measured row heights remain.
- Compact filenames preserve an identifying suffix/extension and Unicode code points. Full names remain in accessible labels and the selection/detail UI. Text is not made smaller to achieve density.
- The app header is one row below 576px, including the hamburger, profile selection and transfer entry. The separate object toolbar is not completely redesigned into a single row.
- Independent source-derived DOM/CSS fixtures measured mobile grid cards at about 102px high at 320/360/390/412px. These are **not full React/Ant Design application or physical-device measurements**.

## Transfer safety setting

Settings → Transfers → **Transfer safety**:

| Mode | Behavior |
|---|---|
| Auto (default) | Conservative when the primary pointer is coarse, Save-Data is enabled, available connection information indicates 3G or slower, or reported device memory is at most 4GB. Missing APIs do not prevent operation. |
| Conservative | Always apply the limits below. |
| Unrestricted | Keep the existing user/file-size based tuning. This is an explicit choice, not a recommended mobile default. |

Conservative limits: one upload task, one download-preparation task, one chunked file, at most two part requests and two batch requests; batches are limited to 16MiB. Parts start at 32MiB, or 16MiB with Save-Data. Part size is raised when necessary to stay within 10,000 parts, up to the application's existing 512MiB part ceiling; larger requirements fail with a clear application limit. The 512MiB ceiling is an **application** limit, not the S3 provider's general maximum.

Changing the mode affects new work/available queue capacity and does not abort active requests. This is conservative starting policy, **not measured-throughput/retry-driven adaptive congestion control**. Verify throughput, retries and resource use on the target device/network before choosing higher limits.

## Download behavior and security

All conservative-mode ordinary object downloads, objects with unknown size, objects larger than 32MiB, and all server-generated ZIP artifacts use a short-lived browser download link instead of accumulating a whole-file Blob in this page.

1. Choose Download and open Transfers.
2. When **Ready to save** appears, tap **Save file**. This explicit user action is important for browser/WebView download handling.
3. The task changes to **Sent to browser**. Check the browser or native download manager for actual progress, saving, failures and cancellation. The page does not claim confirmed disk storage.
4. An expired link is renewed by Retry. When a stale Save link is tapped, it renews without navigating; tap Save again after it is ready.

A link is valid for approximately five minutes at request admission; an already-open stream is not forcibly stopped at that time. A new Range request after expiry needs a renewed link. This is not a file-size or five-minute transfer-duration limit.

Known small desktop downloads can still use the existing Blob path, with a 128MiB response-size guard and **Sent to browser**, not confirmed Done. The guard is best effort and is not a hard RAM quota. A delayed Blob URL revocation avoids immediately revoking the browser's save source. The opt-in download-to-device directory API streams to a writable file; only successful stream completion and writable close are treated as confirmed completion. Cancellation, truncated uncompressed responses and write failures abort the writable. Device filesystem API availability and permissions still depend on the browser/host.

### ZIP artifact route

- Authenticated, profile-scoped `GET /api/v1/jobs/{jobId}/artifact-url` issues a link only for an existing completed ZIP artifact.
- Root-level `GET`/`HEAD /artifact-download-proxy` verifies a domain-separated HMAC of profile ID, job ID and expiry, then rechecks job ownership/state and opens the existing server-controlled artifact path. It does not accept a filesystem path from a URL. Range requests use `http.ServeContent`.
- Links are bearer capabilities: avoid access-log query strings, analytics and screenshots containing them. They do not contain the API token. Responses use no-store/no-referrer; the UI never writes signed links to transfer history.
- Cancellation inside the page cannot revoke a link already handed to a browser. Expiry limits subsequent use. Rotating/restarting the server's proxy secret invalidates links according to existing server secret lifecycle.
- Reverse proxies must forward both `/download-proxy` and `/artifact-download-proxy` to the backend, including any `EXTERNAL_BASE_URL` subpath. Do not route these to SPA fallback or strip Range headers. Existing all-path Caddy/Ingress configurations need no additional path rule; Vite development proxy entries have been added for both root routes. A standalone static Vercel frontend still requires a reachable configured backend; no invented backend address is added to `vercel.json`.

## Lifecycle and recovery

Transfer descriptors are flushed synchronously on hidden/freeze/pagehide transitions as well as the existing periodic write. Foreground, pageshow, online and resume notifications are coalesced; waiting server upload jobs and ZIP-artifact jobs are rechecked without replacing terminal/canceled tasks with stale poll results.

Existing sessionStorage scope is retained. Signed URLs, browser File objects and filesystem handles are not persisted as recoverable credentials. After reload, committed uploads with a job ID resume server-status reconciliation. Interrupted file sending requires selecting the original files again; the existing chunk-resume logic can reuse confirmed parts. Interrupted ordinary downloads show an explicit retry state. A native browser download already handed off remains a handoff record, not an assertion of successful saving.

This does **not** add cross-device or durable cross-session recovery, guaranteed background execution, or automatic access to files after the OS kills the page. A frozen in-flight network operation is still subject to browser/network behavior; foreground reconciliation is for known server jobs, not a new native transfer engine.

## Back and keyboard

Mobile browser Back prioritizes: top application overlay → clear selection → previous folder in the current tab → ordinary router/browser history. One finite same-URL History entry represents pending local state; manual closing and unmounting clean it up. Route state is preserved, and exhausting local state must allow leaving the page. Desktop-only pointer layouts retain ordinary Back behavior.

The shared overlay layer consumes `visualViewport` resize/scroll and focus events. Fixed backdrops follow the visible height/top, focused text fields can scroll into view, and headers/footers do not flex-shrink away. The viewport meta includes `interactive-widget=resizes-content`. Pinch zoom is not disabled or converted into a smaller layout.

These are browser-side implementations. Android WebView must send system Back to its browser history/appropriate host handler; a host that intercepts Back and immediately closes the view will bypass this behavior. Actual iOS swipe-back, IME resizing, address-bar transitions and orientation behavior remain physical-device acceptance items.

## WebView and deployment acceptance contract

The repository contains a web app, not an Android/iOS native host. The host owner must verify file chooser delegation, download-manager/WKDownload delegation, permission denial, external target handling and returning from background. Do not expose arbitrary JavaScript-to-native filesystem bridges or put the API token into a download URL. Use HTTPS with a certificate trusted by the device for remote/LAN service use. HTTPS alone does not add unsupported directory-picker APIs.

| Physical acceptance scenario | Required observation | Status in this delivery |
|---|---|---|
| Android Chrome and Safari, A→B→B selection, Preview and Selection tools | Correct selection and independent actions, no overlap | Browser/source fixtures only; physical pending |
| Android WebView / WKWebView choose multiple files or folder fallback | Host opens chooser; cancel/permission denial is recoverable | Host implementation/verification pending |
| Small file, large video, generated ZIP, expired download link | User-activated save; browser/native outcome shown outside page; renewal works | Queue and ticket modules tested independently; physical pending |
| App switch, lock, refresh, OS discard | Descriptors retained where supported, server state reconciled, reselection explained | Lifecycle APIs and restore functions tested; physical pending |
| Navigation/selection/details plus Back and swipe | Close in order, then exit normally | Actual Chromium History API tested without React Router; integrated/device pending |
| Search, rename, new folder, profile form with keyboard and rotation | Focus and confirmation controls reachable, no unwanted zoom suppression | Geometry/CSS tested; actual IME pending |
| Restrained cellular/Wi-Fi and multiple large uploads | Request limits, retries, memory/storage pressure measured | Policy tests only; real performance pending |

HEIC/HEIF decoding and native thumbnail conversion from the audit's additional photo candidate were not added in this change.

## Reproducible full validation in a dependency-enabled environment

Use Node 22.22.0 or newer within 22.x (the existing React Router lockfile requires it), Go 1.25.13, and the browser/system dependencies. Registry/toolchain/network access is required. Container image digests were not replaced with unverified values; ensure the pinned Node image meets the lockfile's engine requirement.

```bash
cd frontend
npm ci
npm run gen:openapi
npm run check:openapi
npm run typecheck
npm run test:unit
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e:mobile-responsive
npm run test:e2e:mobile-webkit
cd ../backend
go test -race ./internal/downloadticket ./internal/api
cd ..
bash scripts/validate_openapi.sh
```

The historical `mobile-iphone-13` project remains Chromium emulation for compatibility and is explicitly labeled as such. `mobile-iphone-13-webkit` is a real Playwright WebKit engine project. A nightly/manual GitHub workflow lane has been added; it has **not been run here or on the user's repository**. Neither project replaces a real iPhone/WKWebView test.

The delivery report and evidence archive distinguish strict pure-module checks, identity-hook/HTTP/file-handle mocks, production-TSX-derived CSS fixtures, actual browser APIs, and missing full React/API/device tests. Existing visual snapshots are not auto-approved. Review them in a working application before updating baselines.
