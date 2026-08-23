---
name: s3desk-release
description: Prepare, review, create, or update S3Desk changelog sections, annotated tags, GitHub Releases, release-candidate scope, and readiness checks. Use for release notes or tag guidance; do not use for ordinary implementation summaries.
---

# S3Desk Release

Use `CHANGELOG.md` and the latest existing release as the formatting source of truth. Read `docs/RELEASE_GATE.md`, `docs/TESTING.md`, and `docs/release/evidence/README.md` only for the release operation being performed.

## Draft Metadata

1. Compare against the latest existing tag unless the user names another base.
2. Scope every claim to the actual diff between the compared refs. Exclude unrelated dirty or untracked work.
3. Add a concrete versioned section above the previous release; do not put a concrete release into `Unreleased` or rewrite older sections.
4. Preserve the current Markdown section order when applicable:
   `New Features`, `Improvements`, `Security`, `Bug Fixes`, `Chores`, `Release Candidate Notes`, `Known Limitations`, `Full Changelog`.
5. Keep headings, `-` bullets, blank lines, and backticks. Include the compare link used by existing releases.
6. Keep release notes in `CHANGELOG.md`, annotated tag messages, and GitHub Release bodies unless the user requests another artifact.

Use the latest versioned changelog candidate when needed:

```bash
python3 scripts/release_candidate.py
```

Review candidate scope without mutating the worktree:

```bash
python3 scripts/report_release_scope.py --base <base-tag> --head <candidate> --format checklist
```

## Tags And GitHub Releases

- A git tag and a GitHub Release are separate artifacts. Create or mutate either only when explicitly requested.
- Use `gh release create` for a missing release and `gh release edit` for an existing one when a rendered GitHub release page is requested.
- Reuse the approved Markdown changelog section as the annotated tag message and GitHub Release body unless the user requests a shorter body.
- Align the release title with the tag, mark `rc` tags as prereleases, and preserve the existing compare-link style.
- If only an existing annotation must change, replace and force-push that tag ref only; never force-push a branch.
- After creating or editing a GitHub Release, run `gh release view <tag>` and verify body sections plus draft/prerelease state.

## Readiness

Use one explicit base/candidate pair for scope, evidence, and readiness:

```bash
python3 scripts/check_release_readiness.py --candidate-id <candidate> --base <base> --head <candidate>
bash scripts/check_gitlab_publish_readiness.sh <candidate>
```

Run `./scripts/check.sh full` when local release-gate proof is requested. Keep missing live-provider, reverse-proxy, portable-backup, required-check, credential, or deployment evidence explicit; local checks do not close those gates.
