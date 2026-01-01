# Move After Upload Defaults Verification - Test Log Template

Purpose: verify that Settings defaults for "Move after upload" and "Auto-clean empty folders"
are applied to device folder uploads and that cleanup behavior matches the chosen defaults.

## Run Metadata
- Date:
- Tester:
- Environment: (dev/stage/prod)
- Build: (commit SHA or image tag)
- URL:
- Browser + Version:
- OS:
- Profile ID:
- Bucket:
- Notes:

## Preconditions
- Browser supports File System Access API (HTTPS or localhost).
- Test bucket exists and is writable.
- Local test folder with the following structure:
  - root/
    - file-a.txt
    - file-b.txt
    - sub-1/
      - file-c.txt
    - sub-empty/

## Checklist
### A. Defaults Propagation
- [ ] Set Settings: Move after upload = OFF, Auto-clean empty folders = OFF.
- [ ] Open Objects "Upload folder from this device" modal.
  - Expected: Move after upload unchecked; Auto-clean disabled and unchecked.
- [ ] Open Jobs "Upload local folder (device -> S3)" modal.
  - Expected: Move after upload unchecked; Auto-clean disabled and unchecked.
- [ ] Set Settings: Move after upload = ON, Auto-clean empty folders = OFF.
- [ ] Re-open both upload modals.
  - Expected: Move after upload checked; Auto-clean enabled but unchecked.
- [ ] Set Settings: Move after upload = ON, Auto-clean empty folders = ON.
- [ ] Re-open both upload modals.
  - Expected: Move after upload checked; Auto-clean enabled and checked.

### B. Behavior - Move ON + Auto-clean ON
- [ ] Upload the test folder from Objects page.
  - Expected: Upload succeeds in Transfers.
- [ ] Verify local files removed.
  - Expected: file-a.txt, file-b.txt, sub-1/file-c.txt removed.
- [ ] Verify empty folders removed.
  - Expected: sub-empty removed; sub-1 removed if empty.
- [ ] Verify cleanup report content (if shown).
  - Expected: removed list contains all files; removedDirs includes empty folders.

### C. Behavior - Move ON + Auto-clean OFF
- [ ] Set Settings: Move after upload = ON, Auto-clean empty folders = OFF.
- [ ] Upload the test folder from Jobs page (device -> S3).
  - Expected: Upload succeeds in Transfers.
- [ ] Verify local files removed.
  - Expected: files removed, folders remain (sub-1, sub-empty).
- [ ] Verify no empty-folder cleanup.
  - Expected: empty folders still present.

### D. Behavior - Move OFF
- [ ] Set Settings: Move after upload = OFF.
- [ ] Upload the test folder from Objects page.
  - Expected: Upload succeeds in Transfers.
- [ ] Verify local files and folders remain.
  - Expected: no local deletions.

## Result Summary
- Overall result: Pass / Fail
- Failing steps (if any):
- Bugs filed (IDs/links):

## Detailed Step Log (optional)
| Step ID | Action | Expected | Actual | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- |
| A1 |  |  |  |  |  |
| A2 |  |  |  |  |  |
| A3 |  |  |  |  |  |
| A4 |  |  |  |  |  |
| A5 |  |  |  |  |  |
| A6 |  |  |  |  |  |
| B1 |  |  |  |  |  |
| B2 |  |  |  |  |  |
| B3 |  |  |  |  |  |
| B4 |  |  |  |  |  |
| C1 |  |  |  |  |  |
| C2 |  |  |  |  |  |
| C3 |  |  |  |  |  |
| D1 |  |  |  |  |  |
| D2 |  |  |  |  |  |
