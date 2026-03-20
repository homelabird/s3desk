# Mobile Responsive E2E

Release gate expectations and required check policy live in [RELEASE_GATE.md](../../docs/RELEASE_GATE.md).
`Objects`-specific QA and flow checks live in [OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md](./OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md).

## Scope

- `Objects`
- `Jobs`
- `Uploads`
- `Profiles`
- `Buckets`
- `Settings`
- `Login`

## Page Checklists

- `Objects`:
  - [OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md](./OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Jobs`:
  - [JOBS_MOBILE_RESPONSIVE_CHECKLIST.md](./JOBS_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Uploads`:
  - [UPLOADS_MOBILE_RESPONSIVE_CHECKLIST.md](./UPLOADS_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Profiles`:
  - [PROFILES_MOBILE_RESPONSIVE_CHECKLIST.md](./PROFILES_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Buckets`:
  - [BUCKETS_MOBILE_RESPONSIVE_CHECKLIST.md](./BUCKETS_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Settings`:
  - [SETTINGS_MOBILE_RESPONSIVE_CHECKLIST.md](./SETTINGS_MOBILE_RESPONSIVE_CHECKLIST.md)
- `Login`:
  - [LOGIN_MOBILE_RESPONSIVE_CHECKLIST.md](./LOGIN_MOBILE_RESPONSIVE_CHECKLIST.md)

## Local Commands

- Full mobile responsive suite:
  - `npm run test:e2e:mobile-responsive`
- `Settings` and `Login` only:
  - `npm run test:e2e:mobile-responsive:settings-login`
- Core desktop/mock suite without mobile responsive coverage:
  - `npm run test:e2e:core`

## CI Equivalents

- `Core Mock E2E`
  - equivalent local command: `npm run test:e2e:core`
- `Mobile Responsive E2E (Required)`
  - equivalent local command: `npm run test:e2e:mobile-responsive`

## Required Check

- Branch protection and release gate should include `Frontend E2E / Mobile Responsive E2E (Required)`.
- Release approval policy and required check context:
  - [RELEASE_GATE.md](../../docs/RELEASE_GATE.md)
- Page-specific QA checklists:
  - [OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md](./OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [JOBS_MOBILE_RESPONSIVE_CHECKLIST.md](./JOBS_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [UPLOADS_MOBILE_RESPONSIVE_CHECKLIST.md](./UPLOADS_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [PROFILES_MOBILE_RESPONSIVE_CHECKLIST.md](./PROFILES_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [BUCKETS_MOBILE_RESPONSIVE_CHECKLIST.md](./BUCKETS_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [SETTINGS_MOBILE_RESPONSIVE_CHECKLIST.md](./SETTINGS_MOBILE_RESPONSIVE_CHECKLIST.md)
  - [LOGIN_MOBILE_RESPONSIVE_CHECKLIST.md](./LOGIN_MOBILE_RESPONSIVE_CHECKLIST.md)

## Dedicated Page Issue Template Policy

Use the shared mobile responsive issue form by default. Add a page-specific issue form only when the page meets most of the conditions below:

- the page has multiple distinct mobile sub-areas that need different triage options
- the page has page-specific terminology that would make the shared form too vague
- the page has a stable owner path that differs from the general shared frontend owner
- the page has repeated mobile regressions that benefit from a dedicated checklist in the issue form itself
- the page needs page-specific labels beyond the shared mobile responsive label set

Do not split into a dedicated page form when the page mainly needs:

- the shared mobile labels
- the shared ownership routing
- the shared viewport, overflow, drawer, sheet, tab, or form questions
- a checklist document without page-specific issue metadata

## Current Template Decision

- `Objects`: keep a dedicated issue form
  - reason: highest layout complexity, distinct drawers and global search states, page-specific labels, and separate ownership routing
- `Jobs`: keep using the shared mobile responsive issue form
  - reason: page-specific checklist is enough for current scope
- `Uploads`: keep using the shared mobile responsive issue form
  - reason: page-specific checklist is enough for current scope
- `Profiles`: keep using the shared mobile responsive issue form
  - reason: compact-card issues fit the shared form
- `Buckets`: keep using the shared mobile responsive issue form
  - reason: compact-card issues fit the shared form
- `Settings`: keep using the shared mobile responsive issue form
  - reason: tab and drawer issues fit the shared form
- `Login`: keep using the shared mobile responsive issue form
  - reason: form visibility and theme-toggle issues fit the shared form
