# Webview Compatibility

This note is for operators deciding whether to run S3Desk in a normal browser
tab, a mobile browser, or an embedded webview. It summarizes the current repo
evidence and current constraints. It is not a certification list.

## Current Position

- Treat S3Desk as a standalone web app first.
- Current repo evidence now includes browser-side Playwright coverage for
  top-level routing/session persistence, secure-context clipboard success,
  realtime/reconnect UX, and selected mobile/posture/insecure-context checks.
- That evidence covers mainstream browser usage and responsive mobile layouts
  more directly than embedded webview shells.
- The current codebase does not justify a blanket support claim for Android
  WebView, `WKWebView`, Electron-style embedded webviews, in-app browsers, or
  iframe embedding.

## Browser Tabs vs Embedded Webviews

Common desktop and mobile browsers are the closest match to how S3Desk is
implemented and tested today:

- top-level browser context
- standard browser permission prompts
- normal download, storage, clipboard, and navigation behavior
- selected portrait and short-landscape layouts already exercised by the repo's
  browser/mobile coverage

Embedded webviews are different operational targets:

- the host application can pin an older engine or disable APIs
- permissions, file pickers, downloads, clipboard, and networking may be
  mediated by the host shell
- the same engine family does not guarantee the same behavior as a full browser

If S3Desk must run inside a webview, treat that exact host shell as its own
platform and validate it directly.

Current automated webview specs are still browser-side checks. They do not
validate host-shell permission mediation, system clipboard handoff, browser
download chrome, or background suspension policy.

## Why Blanket Webview Support Cannot Be Claimed

- `frontend/playwright.config.ts` targets browser projects (`chromium`,
  `mobile-iphone-13`, and `mobile-pixel-7`), not dedicated embedded-webview
  shells.
- `frontend/tests/webview-routing.spec.ts`,
  `frontend/tests/webview-clipboard.spec.ts`,
  `frontend/tests/webview-realtime.spec.ts`, and
  `frontend/tests/webview-environment-posture.spec.ts` add browser-side
  evidence for routing/session persistence, secure clipboard success,
  realtime/reconnect UI, and selected posture/insecure-context checks.
- Those specs use browser emulation and mocked transports where appropriate.
  They do not certify Android WebView, `WKWebView`, Electron, or host-shell
  backgrounding behavior.
- The `mobile-iphone-13` project uses iPhone viewport and user-agent emulation
  on Chromium for Linux portability. That is useful responsive coverage, but it
  is not proof of Safari or `WKWebView` parity.
- `docs/MOBILE_UX_AUDIT.md` already states that current mobile/browser evidence
  is not a blanket guarantee for every embedded webview, every landscape or
  foldable posture, every zoom or text-scaling combination, or browser APIs
  that are not universally available across browsers and platforms.
- Several current workflows already depend on browser APIs and security
  properties that vary across host shells.
- The backend intentionally blocks iframe embedding.

## Technical Constraints Already Present in the Codebase

### File System Access API and `showDirectoryPicker`

- `frontend/src/lib/deviceFs.ts` uses `window.showDirectoryPicker()` as the
  preferred directory-selection path.
- The same module uses directory/file handles plus
  `queryPermission()`, `requestPermission()`, and writable handles.
- `frontend/src/pages/objects/useObjectDownloads.ts` calls
  `pickDirectory('readwrite')` for download-to-device flows.

Operationally, folder selection and direct-to-device download flows are best
aligned with browsers that expose the File System Access API. Many embedded
webviews do not.

### Secure-Context Requirements

- `frontend/src/lib/deviceFs.ts` rejects non-secure contexts with the message:
  `Directory picker requires HTTPS or localhost.`
- `frontend/src/lib/clipboard.ts` also warns that clipboard access is
  restricted on insecure origins.
- `backend/internal/api/middleware.go` only sets
  `Cross-Origin-Opener-Policy: same-origin` when the request origin is
  trustworthy (`https`, `localhost`, or loopback).

If S3Desk is served over plain HTTP (other than localhost) or inside a host
shell that does not satisfy secure-context rules, these flows will degrade or
fail.

### `webkitdirectory` Fallback Limitations

- When `showDirectoryPicker` is unavailable, the frontend falls back to file
  input directory selection using `webkitdirectory`
  (`frontend/src/pages/uploads/uploadsFileSelection.ts`,
  `frontend/src/components/transfers/transfersUploadUtils.ts`).
- That fallback is good enough to enumerate files for upload, but it is not
  equivalent to File System Access.
- It provides a file list and relative paths. It does not provide stable
  directory handles, read/write local filesystem access, or permission reuse.
- The code already contains normalization logic to strip a shared browser root
  folder name from returned relative paths, which shows that fallback behavior
  is browser-specific rather than uniform.

Do not assume that every webview exposes `webkitdirectory`, or that it behaves
the same way as a full browser.

### CSP Prevents iframe Embedding

- `backend/internal/api/middleware.go` sends
  `Content-Security-Policy: ... frame-ancestors 'none' ...`
- The same middleware sets `X-Frame-Options: DENY`

As shipped, S3Desk cannot be embedded inside an iframe. Any host architecture
that depends on iframe embedding is incompatible unless those security headers
are deliberately changed.

### Responsive Layouts Help, but They Are Not Webview Certification

- `frontend/index.html` sets `viewport-fit=cover`
- `frontend/tests/mobile-smoke.spec.ts` covers phone-width portrait layouts,
  dialogs/sheets, uploads hints, and touch targets
- `frontend/tests/responsive-lists.spec.ts` covers responsive table/card
  switching and extra-small widths
- `frontend/tests/webview-environment-posture.spec.ts` covers one short
  landscape/split-view posture around the jobs download drawer
- `docs/MOBILE_UX_AUDIT.md` documents narrow-screen, landscape, and foldable
  caveats explicitly

This is useful evidence for mainstream browser layouts. It is not enough to
claim that every embedded webview, foldable posture, keyboard/zoom state, or
backgrounded host shell is supported.

## Compatibility Summary

| Environment | Current position | Operator guidance |
| --- | --- | --- |
| Desktop browser tab on `https://` or `localhost` | Best-aligned baseline | Closest match to current app model. Browser-side automation covers routing/session persistence, secure copy success, and realtime/reconnect UI; still validate File System Access workflows if you depend on folder pickers or download-to-device. |
| Mobile browser tab on `https://` or `localhost` | Reasonable baseline for core UI | Current repo has portrait/mobile and responsive coverage plus one short-landscape posture check. Validate exact browser/OS combinations, keyboard overlap, and file-system-heavy flows. |
| Embedded webview in a top-level host shell | Case-by-case only | Only browser-side evidence exists here. Do not claim general support without targeted validation of permissions, file pickers, downloads, clipboard handoff, realtime behavior, and background/resume handling in the exact host app. |
| Embedded webview in a non-secure context | Not suitable for full functionality | Secure-context-gated features already fail or degrade. |
| iframe inside another page/app | Not compatible as shipped | Blocked by `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| Very narrow screens (around `360px` and below) | Usable with extra validation | Extra-small breakpoints and tests exist, but tab overflow, action density, dialogs, and keyboard overlap should still be checked. |
| Landscape, foldables, split view | Validate explicitly | Responsive handling exists, but the repo does not claim blanket coverage for every posture or text-scaling combination. |

## Practical Validation Matrix

When webview support matters, validate the exact host application, OS version,
engine version, and deployment URL shape. A generic label such as
`Chromium-based webview` is not enough.
Use [WEBVIEW_QA_TEST_CASES.md](WEBVIEW_QA_TEST_CASES.md) as the operator-facing
test case reference alongside this matrix.

| Area | What to validate |
| --- | --- |
| Entry context | Browser-side automation covers top-level route landing. Still manually confirm S3Desk loads as a top-level page, not an iframe, and record the final URL/scheme for the exact host shell. |
| Basic shell and auth | Browser-side automation covers same-session profile/route persistence across the main pages. Manually validate full host termination/relaunch behavior and any shell-specific auth-storage expectations. |
| Folder uploads | Browser-side automation covers `webkitdirectory` relative-path preservation only. Test `showDirectoryPicker()` if available, then test the actual chooser/cancellation flow in the target host. |
| Download to device | Automated browser checks only cover the warning state when secure-context folder access is unavailable. If operators depend on this flow, manually verify directory selection, permission prompts, file creation, and failure handling. |
| Browser downloads fallback | Verify ordinary browser/host downloads and multi-object ZIP download behavior manually when directory-handle flows are unavailable. |
| Clipboard flows | Browser-side automation covers secure-context `Copy location` success and one insecure-origin failure hint. Test additional copy actions, paste behavior, and host/system clipboard handoff in the exact deployment context. |
| Realtime updates | Browser-side automation covers connected status plus disconnect/retry UI with mocked WebSocket/SSE transports. Validate real network behavior, host transport policy, and any background/resume interaction manually. |
| Narrow/mobile layouts | Browser-side coverage exists at several portrait widths, extra-small stacks, and one short landscape dialog posture. Still test exact device/browser/webview combinations, safe-area insets, and on-screen keyboard overlap manually. |
| Backgrounding/resume | No current automation. If the host shell commonly suspends pages, confirm transfers, realtime state, and reconnect behavior after background/foreground transitions. |

## Operator Guidance

- If you are deploying S3Desk to normal desktop/mobile browsers, use the
  browser/viewport combinations already represented in the repo as the starting
  point for validation.
- If you are deploying to an embedded webview, do not advertise blanket support
  unless your team has tested the exact host shell and accepted the current
  constraints above.
- If iframe embedding is a requirement, the current shipped headers make that a
  policy mismatch, not just a testing gap.
