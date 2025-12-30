# Phase 1 UX Audit (Template + Checklist)

## Purpose
Identify user flow friction and UX issues under real data conditions. Produce a prioritized backlog with clear repro steps and suggested fixes.

## Scope
- Pages: Profiles, Buckets, Objects, Uploads, Jobs, Settings
- Modes: Empty state, Partial data, Realistic data
- Platforms: Desktop + Mobile

## Success Criteria
- Onboarding path is discoverable and actionable in 2 clicks or less
- Primary actions are visible without scrolling on desktop and within 1 screen on mobile
- Search, filter, sort are understandable without documentation
- Errors and empty states provide a next step
- Keyboard navigation and focus are usable for core actions

## Environment
- App URL: http://172.18.34.4:8080/
- API token (if required): dev-token

---

## Scenario Defaults (Real Data)
These defaults should be created unless otherwise requested.

### Profiles
- 2 profiles
  - Local MinIO (valid, used for most tests)
  - Secondary profile (valid, to test profile switching)

### Buckets
- 3 buckets
  - ux-audit (primary, deep folders)
  - reports (documents, small set)
  - archive (older data, medium set)

### Objects (per bucket)
- ux-audit
  - Folder depth: 3 levels (e.g., /docs/2024/q4/)
  - Total objects: ~120
  - Mix: 60% files, 40% folders
  - File sizes: 0 B, 1 KB, 10 MB, 200 MB (optional for perf test)
  - File name variety: short, long (60+ chars), numeric, hyphenated
- reports
  - Total objects: ~20
  - File sizes: 1 KB to 5 MB
- archive
  - Total objects: ~200
  - Older timestamps (several months old)

### Transfers/Jobs
- At least 2 completed jobs
- 1 failed job (if possible)

---

## Audit Template (for each issue)
- Issue ID:
- Page/Flow:
- Severity: Critical / High / Medium / Low
- Impact:
- Steps to Reproduce:
- Expected:
- Actual:
- Evidence (screenshot/video):
- Suggested Fix:
- Notes:

---

## Checklist (by flow)

### 1) Onboarding / First Run
- Can user understand what a profile is in under 10 seconds?
- Is the next step obvious when no profile exists?
- Are CTA labels unambiguous (Create Profile vs Settings)?
- Can user recover from missing API token without leaving page context?

### 2) Profiles
- Create, edit, delete profile is clear and safe
- Errors (invalid endpoint, auth) show exact fix
- Switching profile updates context immediately
- Empty state provides CTA with copy that matches action

### 3) Buckets
- Empty state offers Create Bucket and guidance
- List is scannable (name, created date, actions)
- Destructive actions are guarded and reversible
- Date format is short and readable

### 4) Objects
- Upload and New Folder are prominent
- Search scope (local vs global) is clear
- Filters and sorting are discoverable and reversible
- Folder navigation is obvious (breadcrumbs + tree)
- Multi-select and bulk actions are clear
- Empty folder explains how to add content

### 5) Uploads / Transfers
- Required fields are clear before action
- Error states are actionable
- Progress, pause, retry are visible

### 6) Jobs
- Status and failures are understandable
- Logs are readable and actionable
- Empty state provides next action

### 7) Settings
- API token handling is clear
- Sensitive fields are labeled and explained

### 8) Accessibility (fast pass)
- All icon-only buttons have labels (aria-label)
- Keyboard: can reach primary actions and close drawers/modals
- Focus state is visible on key controls
- Touch targets are at least 44px on mobile

---

## Capture Criteria (Desktop / Mobile)

### Desktop (1440x900)
- Profiles (empty + data)
- Buckets (empty + data)
- Objects (empty folder + data + search + filters)
- Uploads (empty + in-progress)
- Jobs (empty + failed + completed)
- Settings

### Mobile (390x844)
- Navigation drawer open/closed
- Profiles (empty + data)
- Buckets (empty + data)
- Objects (empty folder + data + search)
- Uploads
- Jobs
- Settings

---

## Deliverables
- UX audit report (issues + severity + repro)
- Prioritized backlog (Phase 2/3/4 mapping)
- Updated capture set for before/after comparison
