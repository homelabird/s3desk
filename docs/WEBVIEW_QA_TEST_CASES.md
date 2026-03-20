# Webview / Browser QA Test Cases

## Purpose and scope

Use this document to run manual QA for a specific browser tab, mobile browser, or
top-level embedded webview target.

This is an execution guide, not a certification statement. A passing run applies
only to the exact host shell, OS version, engine version, device posture, and URL
shape that QA tested.

Use it together with:

- `docs/WEBVIEW_COMPATIBILITY.md`
- `docs/MOBILE_UX_AUDIT.md`

Do not use this document to justify iframe embedding or blanket support claims
for untested webviews.

## Current repo evidence this plan is based on

- `docs/WEBVIEW_COMPATIBILITY.md` documents the current support position and the
  existing validation matrix.
- `docs/MOBILE_UX_AUDIT.md` documents responsive/mobile coverage and current
  caveats for narrow, landscape, and foldable-style postures.
- `frontend/tests/webview-routing.spec.ts` covers browser-side top-level route
  landing (`WV-001`) and same-session refresh/navigation persistence
  (`WV-003`).
- `frontend/tests/webview-clipboard.spec.ts` covers secure-context
  `Copy location` success feedback in a browser context (`WV-008`
  browser-side evidence).
- `frontend/tests/webview-realtime.spec.ts` covers browser-side realtime
  connected/reconnect UX (`WV-010`, `WV-011`) using mocked transports.
- `frontend/tests/webview-environment-posture.spec.ts` covers one short
  landscape/split-view browser posture plus insecure-context warning paths that
  support `WV-013` and `WV-015`.
- `frontend/tests/mobile-smoke.spec.ts` covers portrait/mobile rendering,
  dialog/sheet reachability, uploads-hint stacking, and no-overflow checks that
  support `WV-012`.
- `frontend/tests/responsive-lists.spec.ts` covers compact-card/table switching
  and extra-small action stacking.
- `frontend/tests/uploads-folder.spec.ts` covers `webkitdirectory`-style
  folder-upload relative-path preservation (`WV-005` browser-side evidence
  only).
- `frontend/src/lib/deviceFs.ts` and
  `frontend/src/pages/uploads/uploadsFileSelection.ts` define current folder
  upload and local-folder-access behavior.
- `frontend/src/pages/objects/useObjectDownloads.ts` and
  `frontend/src/components/transfers/useTransfersDownloadQueue.ts` define
  current direct-to-device and browser-download fallback behavior.
- `frontend/src/lib/clipboard.ts` defines current clipboard behavior and
  insecure-origin failure messaging.
- `frontend/src/pages/jobs/useJobsRealtimeEvents.ts` defines current realtime,
  reconnect, and transport fallback behavior.
- `backend/internal/api/middleware.go` defines current iframe-blocking and
  trustworthy-origin behavior.

Treat the Playwright specs above as browser-side evidence only. They reduce
repeated manual checks, but they do not replace validation of the exact
embedded webview host, permission prompts, download manager, system clipboard
handoff, or background/foreground policy.

## Before you start

Record the environment you are validating:

- host shell or browser name
- host shell or browser version
- engine family/version if known
- OS version
- device model
- target URL and scheme (`https`, `http`, or `localhost`)
- whether the app is running as a top-level page or inside another container
- viewport/posture used for the run

Prepare these shared test assets:

- one valid API token
- at least one existing profile that can browse, upload, and download
- one writable test bucket
- one existing object for single-file download tests
- one existing prefix with nested content for folder and ZIP tests
- one local folder on the QA device with nested files, for example:

```text
webview-qa-folder/
  dir-a/alpha.txt
  dir-b/nested/beta.txt
```

Capture evidence for every case:

- screenshot of the final UI state
- screenshot of any warning, error, or permission prompt
- video for reconnect/background issues when a screenshot is not enough
- downloaded file name/path when the case touches downloads
- a short note with pass, fail, or documented limitation

## Execution matrix

Use the matrix below to decide which cases are required for the target you are
actually validating.

| Target environment | Required cases | Conditional / optional cases |
| --- | --- | --- |
| Desktop browser tab on `https://` or `localhost` | `WV-001`, `WV-003`, `WV-004` or `WV-005`, `WV-006` or `WV-007`, `WV-008`, `WV-010` | `WV-011`, `WV-012`, `WV-013`, `WV-014` |
| Mobile browser tab on `https://` or `localhost` | `WV-001`, `WV-003`, `WV-004` or `WV-005`, `WV-006` or `WV-007`, `WV-008`, `WV-010`, `WV-012` | `WV-011`, `WV-013`, `WV-014` |
| Embedded webview as a top-level host view on `https://` or `localhost` | `WV-001`, `WV-003`, `WV-004` or `WV-005`, `WV-006` or `WV-007`, `WV-008`, `WV-010`, `WV-011`, `WV-014` | `WV-012`, `WV-013`, `WV-015` |
| Non-secure deployment on `http://` (non-localhost) | `WV-001`, `WV-007`, `WV-009`, `WV-015` | `WV-005` if folder-upload fallback still exists |
| Any request to embed the app in an iframe | `WV-002` | none |

Notes:

- `WV-004` and `WV-006` are the File System Access / native directory-picker
  branch.
- `WV-005` and `WV-007` are the fallback branch when native local folder access
  is not available.
- `Required` means the case applies to the target environment. It does **not**
  mean the exact host shell already has full automated coverage.
- Browser-side automation currently directly exercises `WV-001`, `WV-003`,
  `WV-008`, `WV-010`, `WV-011`, selected `WV-012` portrait checks, one
  `WV-013` short-landscape posture, and selected insecure-context warnings used
  by `WV-015`.
- `WV-004`, `WV-006`, `WV-007`, and `WV-014` remain exact-host manual
  validation. `WV-005` only has automated relative-path evidence, not full
  chooser/download behavior.
- A documented incompatibility pass is still a pass for QA. Example:
  `WV-002` should confirm that iframe embedding is blocked as shipped.

## Choose the correct upload/download branch

Use the observed UI behavior below before starting the upload/download cases.

| What you observe | What it means | Cases to run |
| --- | --- | --- |
| `Choose folder` opens a native folder picker, and local download flows let you choose a destination folder | `showDirectoryPicker()` path is available | `WV-004` and `WV-006` |
| Folder upload works, but it opens a file chooser instead of a native folder picker | `webkitdirectory` upload fallback is in use | `WV-005` and `WV-007` |
| Upload/download flows warn that local folder access is not available | Native local folder access is unavailable in this environment | `WV-007` and `WV-015` |

## Test case index

| ID | Title |
| --- | --- |
| `WV-001` | Top-level load and final URL context |
| `WV-002` | Iframe embedding blocked |
| `WV-003` | In-session auth, profile, and navigation persistence |
| `WV-004` | Folder upload via native directory picker |
| `WV-005` | Folder upload via `webkitdirectory` fallback |
| `WV-006` | Download to device with native directory picker |
| `WV-007` | Browser download fallback and ZIP artifact fallback |
| `WV-008` | Clipboard actions in secure context |
| `WV-009` | Clipboard actions in non-secure context |
| `WV-010` | Realtime updates while connected |
| `WV-011` | Realtime reconnect after interruption |
| `WV-012` | Narrow/mobile portrait layout |
| `WV-013` | Landscape, split-view, or foldable posture |
| `WV-014` | Background/foreground resume in host shells |
| `WV-015` | Non-secure context incompatibility sweep |

## Detailed test cases

### `WV-001` — Top-level load and final URL context

**Required when:** every target environment

**Preconditions**

- target URL is known
- API token is available if the app requires it
- if the host has multiple launch modes, launch the app as its main view first

**Steps**

1. Open the app directly at the target URL.
2. Record the final URL after any redirects.
3. If the app opens at `/`, note whether it lands on `/setup` or `/objects`.
4. Confirm the app renders as a normal page and not as a blank frame or white
   screen.
5. If the host is nesting the app inside another page/frame, stop this case and
   run `WV-002`.

**Expected results**

- The app loads as a top-level page/view.
- `/` lands on `/setup` when no profile is already stored, or `/objects` when an
  active profile is already stored.
- No endless redirect, blank frame, or immediate render failure occurs.

**Evidence to capture**

- screenshot of the first usable screen
- final URL and scheme
- note whether the app landed on `/setup` or `/objects`

**Notes**

- Current Playwright coverage exercises top-level route landing in a browser
  context.
- QA still needs to record the exact final URL, scheme, and host launch mode
  for the target shell.
- Secure-context feature gating is covered later in the plan.

### `WV-002` — Iframe embedding blocked

**Required when:** an integrator asks to embed S3Desk inside another page/app,
or the target host shell uses an iframe internally

**Optional when:** iframe embedding is not part of the deployment

**Preconditions**

- the app URL is reachable
- you can attempt an iframe load or inspect response headers

**Steps**

1. Attempt to load the app inside an iframe in a parent page or host shell.
2. If you cannot create a parent page, inspect the app document response headers
   in browser devtools or host diagnostics.
3. Record the browser/host error and the response headers.

Example iframe check:

```html
<iframe src="https://target.example/" style="width:100vw;height:100vh;border:0"></iframe>
```

**Expected results**

- The embedded render is blocked.
- The response shows `X-Frame-Options: DENY` and/or a CSP containing
  `frame-ancestors 'none'`.
- QA records this as a shipped incompatibility, not as an unexpected bug.

**Evidence to capture**

- screenshot of the blocked frame or host-shell error
- response headers or console/network output

**Notes**

- Current repo evidence says iframe embedding is incompatible unless those
  headers are deliberately changed.

### `WV-003` — In-session auth, profile, and navigation persistence

**Required when:** every top-level browser/webview deployment

**Preconditions**

- valid API token
- at least one existing profile
- ability to refresh the current page

**Steps**

1. Open the app and enter the API token if prompted.
2. Select an existing profile.
3. Return to `/` and confirm it redirects into the main app instead of setup.
4. Navigate through `Profiles`, `Buckets`, `Objects`, `Jobs`, `Uploads`, and
   `Settings`.
5. Refresh on `Objects`.
6. Refresh on `Jobs`.
7. Confirm the same profile remains active and normal navigation still works.
8. If the exact host shell restart behavior is in scope, fully close and reopen
   the host once and record whether the session is restored or requires token
   re-entry.

**Expected results**

- Same-session page refresh does not drop the active profile.
- Same-session page refresh does not force re-authentication unexpectedly.
- Navigation between the main pages works without losing the current context.
- If a full host restart drops the token or reloads into setup, record that as
  host-specific session behavior rather than assuming a defect in the app shell.

**Evidence to capture**

- screenshot before refresh and after refresh
- note whether the active profile persisted
- note whether full host restart preserved or lost the session, if tested

**Notes**

- Current Playwright coverage exercises same-session refresh/navigation
  persistence on the main routes in a browser context.
- Current code persists the active profile separately from the API-token
  session. Do not treat full app termination as guaranteed session persistence;
  full host restart behavior remains manual.

### `WV-004` — Folder upload via native directory picker

**Required when:** the target exposes a native directory picker and operators
depend on folder upload

**Optional when:** the target does not expose native local folder access

**Preconditions**

- target URL is `https://` or `localhost`
- folder upload opens a native directory picker
- local test folder exists:

```text
webview-qa-folder/
  dir-a/alpha.txt
  dir-b/nested/beta.txt
```

- writable bucket/profile available

**Steps**

1. Open `Uploads`.
2. Select the target bucket and optional prefix.
3. Click `Add from device…`.
4. Click `Choose folder`.
5. Cancel the picker once and confirm no files are staged.
6. Repeat the action and select `webview-qa-folder`.
7. Confirm the staged selection shows nested files.
8. Click `Queue upload`.
9. Open `Transfers` and wait for the upload to complete.
10. Open `Objects` and verify the uploaded keys under the target prefix.

**Expected results**

- The native directory picker opens without a support warning.
- Canceling the picker leaves the staged selection unchanged.
- The queued upload succeeds.
- Nested paths are preserved.
- Uploaded keys do **not** gain an extra leading `webview-qa-folder/` segment.

**Evidence to capture**

- screenshot of the staged folder selection
- screenshot of upload completion in `Transfers`
- screenshot of uploaded keys in `Objects`

**Notes**

- No current browser-side automation covers this native picker success path.
- This case is the best-aligned path for environments that support
  `showDirectoryPicker()`.

### `WV-005` — Folder upload via `webkitdirectory` fallback

**Required when:** native directory picker support is absent but folder upload
is still expected to work

**Optional when:** folder upload is not part of the target workflow

**Preconditions**

- native directory picker is unavailable in this environment
- folder upload still opens a file chooser
- local test folder exists:

```text
webview-qa-folder/
  dir-a/alpha.txt
  dir-b/nested/beta.txt
```

- writable bucket/profile available

**Steps**

1. Open `Uploads`.
2. Select the target bucket and optional prefix.
3. Click `Add from device…`.
4. Click `Choose folder`.
5. Use the file chooser to select `webview-qa-folder`.
6. Confirm the staged selection shows nested files.
7. Click `Queue upload`.
8. Wait for completion in `Transfers`.
9. Verify the uploaded keys in `Objects`.

**Expected results**

- Folder upload still works through the file chooser fallback.
- Nested relative paths are preserved in the uploaded object keys.
- Uploaded keys do **not** keep a duplicate shared browser root folder segment.
- If the environment lacks native local folder access, direct-to-device download
  flows should remain unavailable elsewhere in the UI.

**Evidence to capture**

- screenshot of the staged folder selection
- screenshot of upload completion
- screenshot of resulting object keys
- screenshot of any local-folder-access warning shown in download flows

**Notes**

- Current Playwright coverage verifies relative-path preservation through the
  fallback chooser path.
- Native file-chooser UX, cancellation behavior, and full host-shell
  staging/completion still need manual validation.
- This fallback is upload-only. It is not equivalent to direct local read/write
  folder access.

### `WV-006` — Download to device with native directory picker

**Required when:** the target exposes a native directory picker and operators
depend on saving objects directly to a chosen local folder

**Optional when:** browser-managed downloads are sufficient for the target

**Preconditions**

- target URL is `https://` or `localhost`
- native directory picker is available
- test bucket contains at least one single file and one nested prefix
- QA can inspect the chosen local destination folder

**Steps**

1. Open `Objects`.
2. Download one object with `Download to folder…` or the equivalent
   device-download action.
3. Choose a writable local destination folder.
4. Open `Transfers` and wait for the file to finish.
5. Repeat with a folder/prefix download flow if the target depends on it.
6. Verify the saved file(s) on disk.
7. Optional negative check: deny local write permission once, if the host
   exposes the permission prompt, and confirm the app reports the failure.

**Expected results**

- The local destination picker opens.
- Downloads run through `Transfers` and complete.
- Saved files appear in the selected local folder with expected names/paths.
- Picker cancellation or permission denial does not crash the app.

**Evidence to capture**

- screenshot of the local destination selection UI
- screenshot of download progress/completion in `Transfers`
- filesystem screenshot showing the saved output
- screenshot of any permission error if you ran the optional negative check

**Notes**

- Current browser-side automation only covers the insecure-context warning when
  this path is unavailable.
- The successful direct-to-device path still needs manual validation in the
  exact host shell.
- This case covers the direct-to-device path, not ordinary browser downloads.

### `WV-007` — Browser download fallback and ZIP artifact fallback

**Required when:** native local folder access is unavailable, the deployment is
non-secure, or operators rely on browser-managed downloads

**Optional when:** the target only uses the native directory-picker path

**Preconditions**

- one single object is available for download
- one multi-object selection or prefix is available for ZIP download
- QA knows where the browser/host saves downloaded files

**Steps**

1. On `Objects`, download one single object with the standard client download
   action.
2. Confirm the browser/host download prompt or download shelf receives the
   file.
3. In the same environment, select multiple objects or use
   `Download folder (zip)` on a prefix.
4. Record the `Zip task started` message, then watch `Transfers` and/or `Jobs`.
5. Wait for the ZIP to finish downloading.

**Expected results**

- Single-object downloads complete as ordinary browser/host downloads.
- When native local folder access is unavailable, multi-object or prefix
  download falls back to a ZIP job/artifact flow.
- The ZIP file downloads successfully once the job completes.

**Evidence to capture**

- screenshot of the single-file browser download UI
- screenshot of the ZIP task/transfer state
- downloaded ZIP filename and path
- screenshot of any warning that local folder access is unavailable

**Notes**

- Current browser-side automation does not cover actual browser download UI or
  ZIP artifact delivery.
- Treat this as an exact-host manual check.
- This is the expected fallback path. Treat it as a normal compatibility result,
  not as a regression.

### `WV-008` — Clipboard actions in secure context

**Required when:** the target relies on copy/link/paste actions and is served on
`https://` or `localhost`

**Optional when:** clipboard-driven workflows are not used by operators

**Preconditions**

- secure target URL
- at least one object is visible on `Objects`
- if advanced object actions are enabled in the target workflow, use them for
  the optional paste steps below

**Steps**

1. On `Objects`, click `Copy location`.
2. Confirm the inline feedback shown next to the location.
3. Run one additional visible copy action in the current UI mode, such as
   `Copy key`, `Copy selected keys`, or `Copy URL`.
4. If the target workflow uses advanced object actions, copy one or more keys
   and then run `Paste` into a different prefix.
5. If practical in the host shell, paste the copied value into a plain-text
   field outside the app and record the result.

**Expected results**

- Secure-context copy actions do not show the insecure-origin failure hint.
- `Copy location` shows `Copied` or equivalent success feedback.
- At least one copy action works in the tested host shell.
- If you ran the optional paste step, the app creates a paste copy/move job or
  clearly reports why it could not.

**Evidence to capture**

- screenshot of the copy feedback
- screenshot of any job/toast created by the paste step
- note whether system clipboard write worked outside the app, if tested

**Notes**

- Current Playwright coverage exercises secure-context `Copy location` success
  feedback in a browser context.
- Other copy actions, paste flows, and host/system clipboard handoff still need
  manual validation.
- Internal in-app clipboard state can still matter even when the system
  clipboard is partially restricted by the host shell. Record exact behavior.

### `WV-009` — Clipboard actions in non-secure context

**Required when:** the target is intentionally reachable over `http://`
(non-localhost) or secure-context clipboard behavior is suspect in the host

**Optional when:** the target is only deployed on secure origins

**Preconditions**

- non-secure target URL or host behavior that removes secure-context clipboard
  access
- at least one visible clipboard action

**Steps**

1. Attempt `Copy location`.
2. Attempt one other copy action that is visible in the current UI mode.
3. If `Paste` is available, try it once and record whether it uses internal
   clipboard state or fails.
4. Record whether the copy action succeeds, partially works, or fails.

**Expected results**

- QA must not treat non-secure context as full clipboard support.
- If a copy/paste action fails, the app should surface:
  `Copy failed. Clipboard access is restricted on insecure origins (try HTTPS or localhost).`
- Some hosts may still allow limited legacy copy behavior. Record that exact
  behavior instead of assuming parity with a secure browser.

**Evidence to capture**

- screenshot of any failure hint
- note whether system clipboard write/read worked
- note whether in-app paste still worked from internal app state

**Notes**

- Current browser-side automation exercises the insecure-origin hint for
  `Copy location` only.
- This case documents observed host behavior. It does not change the current
  secure-context requirement or replace manual checks for other copy/paste
  actions.

### `WV-010` — Realtime updates while connected

**Required when:** operators use `Jobs` or `Transfers` as live monitoring
surfaces

**Optional when:** the target workflow never depends on live updates

**Preconditions**

- ability to create at least one job (upload, ZIP, copy, move, or similar)
- two sessions/tabs/windows for the same environment if possible
- same profile selected in both sessions

**Steps**

1. Open `Jobs` in session A.
2. Open `Jobs` in session B.
3. In session A, create a job.
4. In session B, watch the `Jobs` page without manually refreshing.
5. Note the realtime status tag shown in the toolbar.
6. Wait for the job to progress and finish.

**Expected results**

- The `Jobs` toolbar shows a realtime status tag such as `Realtime: WS` or
  `Realtime: SSE` while connected.
- The new job appears in the second session without manual refresh.
- Progress/completion updates arrive, or the job list refreshes automatically so
  the page does not stay stale.

**Evidence to capture**

- screenshot/video of the realtime tag
- screenshot of the job appearing in the second session
- screenshot of the final job state

**Notes**

- Current Playwright coverage exercises browser-side connected-state and live
  job updates using mocked WebSocket/SSE transports.
- Manual QA still needs the exact host/network stack, multi-session behavior,
  and any backgrounded-session behavior that matters for acceptance.
- Either WebSocket or SSE transport is acceptable if the UI remains current.

### `WV-011` — Realtime reconnect after interruption

**Required when:** network interruptions, proxy changes, device sleep, or host
connectivity churn are realistic for the target

**Optional when:** the target environment is stable and this failure mode is not
part of acceptance

**Preconditions**

- `Jobs` page open with a connected realtime state
- ability to interrupt network connectivity or the realtime connection

**Steps**

1. Start on `Jobs` with realtime connected.
2. Interrupt connectivity by disabling network, switching proxy/VPN, or using
   an equivalent host action.
3. Observe the page for 30 to 60 seconds.
4. Restore connectivity.
5. If the page exposes `Retry realtime`, use it only if the page does not
   recover on its own in a reasonable time.

**Expected results**

- The page shows a disconnected warning instead of silently freezing.
- The page may show `Reconnecting…` attempts and/or a `Retry realtime` control.
- After connectivity returns, realtime reconnects or manual retry succeeds.
- Job state refreshes after reconnect so missed events do not leave the list
  permanently stale.

**Evidence to capture**

- screenshot of the disconnected warning
- screenshot of reconnect or retry state
- elapsed time to recovery
- screenshot after recovery

**Notes**

- Current Playwright coverage exercises browser-side disconnect/retry/recovery
  UI using mocked transports.
- Manual QA still needs real network interruptions, proxy/VPN changes, device
  sleep, and host resume behavior.
- Current code uses both automatic retry and a manual retry control. Record the
  transport that ultimately recovers.

### `WV-012` — Narrow/mobile portrait layout

**Required when:** phone-width browser/webview use is in scope

**Optional when:** the target is desktop-only

**Preconditions**

- viewport around `360 × 740`, or a comparable native phone portrait size
- access to `Profiles`, `Buckets`, `Objects`, `Jobs`, `Uploads`, and `Settings`

**Steps**

1. Open `Profiles` and confirm the compact mobile layout.
2. Open `Buckets` and confirm the compact mobile layout.
3. Open `Settings` and confirm tabs are scrollable and still usable.
4. Open `Objects`, then open `New folder`.
5. Open `Jobs`, then open `Filters`.
6. Open `Uploads` and confirm the add-source action and hint text remain
   reachable.
7. On a content-heavy page such as `Buckets`, scroll vertically to the end and
   confirm there is no page-wide horizontal overflow.

**Expected results**

- No full-page horizontal overflow occurs.
- Core actions remain visible and tappable.
- Settings tabs can scroll horizontally instead of clipping.
- Dialogs/sheets fit within the portrait viewport.
- Jobs filters open in a phone-friendly sheet.
- Uploads/settings controls stack rather than overlap.

**Evidence to capture**

- screenshots of `Profiles`, `Buckets`, `Settings`, `Objects` dialog, `Jobs`
  filters, and `Uploads`
- screenshot of any overflow or clipped control if found

**Notes**

- Current mobile-smoke and responsive tests provide browser-side evidence for
  portrait layouts, dialogs/sheets, uploads hint reachability, and extra-small
  action stacking.
- They do not replace manual validation in the exact host shell, with native
  keyboard/safe-area behavior, or on other phone/browser combinations.

### `WV-013` — Landscape, split-view, or foldable posture

**Required when:** the target device can rotate, split the app, or run in a
foldable-style posture

**Optional when:** the target never uses those postures

**Preconditions**

- same environment as `WV-012`
- ability to rotate the device or resize to a short/wide posture

**Steps**

1. Rotate the device or resize the viewport to a short/wide posture.
2. Repeat the key checks from `WV-012`.
3. Pay special attention to:
   - header actions
   - settings tabs
   - dialog/sheet height
   - jobs filters
   - on-screen keyboard overlap, if applicable
4. If practical, open a dialog while the keyboard is visible.

**Expected results**

- No critical action is permanently clipped off-screen.
- Tabs, sheets, and dialogs remain reachable.
- Safe-area padding prevents obvious notch/home-indicator overlap.
- Any layout stress in this posture is recorded as posture-specific evidence.

**Evidence to capture**

- screenshots in landscape/split/folded posture
- screenshot/video of keyboard overlap if observed
- note whether the issue is cosmetic, blocking, or acceptable for the target

**Notes**

- Current Playwright coverage exercises one short/wide browser posture
  (`780 × 420`) around the jobs download drawer.
- Foldables, keyboard overlap, text scaling, and host-specific split-view
  behavior still need manual validation.
- Current repo docs explicitly say these postures need direct validation. Treat
  a pass here as specific to the tested posture only.

### `WV-014` — Background/foreground resume in host shells

**Required when:** validating an embedded webview host or any environment that
commonly backgrounds/suspends the page

**Optional when:** the target is a normal desktop tab and background behavior is
not part of acceptance

**Preconditions**

- a job or transfer is in progress, or `Jobs` is open with realtime connected
- ability to send the app to background for at least 30 to 60 seconds

**Steps**

1. Start an upload, download, or other job with visible progress.
2. Send the app to background or switch away from it.
3. Wait 30 to 60 seconds.
4. Return to the app.
5. Inspect the active page, `Jobs`, and `Transfers`.

**Expected results**

- The app returns to a usable state without an unexpected blank screen.
- Realtime may reconnect on return; if it does not, the page should expose a
  reconnect warning or retry control.
- If the host discarded/reloaded the page, interrupted transfers may reappear as
  canceled and instruct the user to select the same file(s) and retry.
- QA records whether the host preserved, suspended, or reloaded the session.

**Evidence to capture**

- before/after screenshots or video
- screenshot of any reconnect warning
- screenshot of any interrupted-transfer message
- note whether the host preserved or reloaded the page

**Notes**

- No current browser-side automation covers host background/foreground
  transitions.
- Current repo evidence does not show special background/resume event handling.
- Treat this case as required before making host-shell compatibility claims.

### `WV-015` — Non-secure context incompatibility sweep

**Required when:** the target can be reached over plain `http://`
(non-localhost), or QA needs an explicit record of unsupported secure-context
behavior

**Optional when:** the target is only deployed on `https://` or `localhost`

**Preconditions**

- app served over non-localhost `http://`, or host shell fails secure-context
  checks

**Steps**

1. Run `WV-001` first and record the non-secure final URL.
2. Open a folder upload path and record any warning about local folder access.
3. Open a download-to-device flow and record whether local folder access is
   unavailable.
4. Attempt one clipboard action.
5. Attempt one ordinary single-object browser download.
6. Record the final compatibility verdict for this environment.

**Expected results**

- Local folder picker flows are unavailable or degraded in a clearly visible
  way.
- Browser-managed single-file downloads may still work.
- Clipboard behavior is degraded or host-specific; if it fails, the insecure
  failure hint appears.
- QA marks the environment as **not suitable for full functionality** even if
  basic page navigation still works.

**Evidence to capture**

- screenshot of the non-secure URL
- screenshot of local-folder-access warnings
- screenshot of clipboard failure hint, if shown
- screenshot or file record for the browser-managed download
- written pass/fail note stating that this is a documented limitation

**Notes**

- Current Playwright coverage exercises browser-side warnings for unavailable
  local folder access and insecure clipboard feedback on `Objects`.
- Manual QA still needs the full non-secure sweep: upload path,
  browser-managed downloads, and the final compatibility verdict for the exact
  host.
- This case confirms the existing non-secure-context limitation already
  documented elsewhere in the repo.
