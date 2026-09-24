---
name: s3desk-release
description: Prepare or review S3Desk changelog entries, candidate scope, readiness, tags, or GitHub Releases. Use for release work, not ordinary implementation summaries.
---

# S3Desk Release

Use `CHANGELOG.md` and the latest existing release for formatting. Read `docs/RELEASE_GATE.md`, `docs/TESTING.md`, and `docs/release/evidence/README.md` only when relevant to the requested operation.

## Changelog and Scope

- Compare against the latest tag unless another base is specified; make every claim match that diff.
- Exclude unrelated dirty/untracked work. For dirty-worktree inventory use `python3 scripts/report_release_scope.py`; for committed scope use explicit `--base <tag-or-sha> --head <candidate>`.
- Add concrete versioned sections above prior releases, never under `Unreleased` or by rewriting old sections. Match existing section order, Markdown, and compare-link style.
- `python3 scripts/release_candidate.py` prints the current candidate; `python3 scripts/report_release_scope.py --base <base> --head <candidate> --format checklist` reviews its scope.

## Readiness and Publication

Use one explicit base/candidate pair for scope, evidence, and readiness:

```bash
python3 scripts/check_release_readiness.py --candidate-id <candidate> --base <base> --head <candidate>
bash scripts/check_gitlab_publish_readiness.sh <candidate>
```

Run `./scripts/check.sh full` when local release-gate proof is requested. Keep absent live, proxy, backup, deployment, and required-check evidence explicit; local checks do not satisfy them.

Tags and GitHub Releases are separate artifacts. Create or edit either only when explicitly requested. Use annotated tags and `gh release create`/`gh release edit` as appropriate; reuse the approved changelog section unless a shorter body is requested. For a requested rendered release page, verify with `gh release view <tag>`, including body and draft/prerelease state. Never force-update a branch.
