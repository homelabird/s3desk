# AGENTS.md

## Release Metadata Rules

- When the user asks for release notes, changelog text, or tag guidance, compare against the latest existing tag by default unless the user names a different base tag.
- Write release-note drafts, changelog sections, and annotated tag messages in Markdown, not plain text blobs.
- Preserve Markdown structure in release metadata:
  - use headings for each section
  - use `-` bullets for change items
  - keep blank lines between sections
  - wrap tag names, version names, commands, and file names in backticks where appropriate
- Preserve this repository's existing changelog structure exactly unless the user explicitly requests a different format:
  - `New Features`
  - `Improvements`
  - `Security`
  - `Bug Fixes`
  - `Chores`
  - `Release Candidate Notes`
  - `Known Limitations` when still relevant
  - `Full Changelog`
- Do not write release summaries into unrelated files. For release-note work, use `CHANGELOG.md` and annotated tag messages unless the user explicitly asks for another document.
- Do not dump new release content into `## Unreleased` if the user is preparing a concrete version or tag. Add a versioned section like `## 0.21v-rc2 - 2026-03-12` and keep older release sections intact below it.
- For release-candidate updates, add the new section above the previous RC section instead of rewriting older release notes.
- If the user asks to use "the same style as before", treat the latest release section in `CHANGELOG.md` as the formatting source of truth.
- If the user asks to put the changelog text into the git tag, reuse the approved Markdown changelog text as the annotated tag message. Do not flatten it into plain text or invent a shorter or alternate summary unless the user asks for one.
- Before creating or recommending a new tag, summarize the diff from the latest existing tag in the same release-note structure when the user asks for a comparison first.
- If an annotated tag already exists and the user asks to replace its message, update the tag annotation and push only that tag ref with force. Do not force-push branches for tag-message-only changes.
- Keep release-note claims scoped to the actual diff between the compared tags or commits. Do not mix in unrelated untracked files, local-only experiments, or future work.

## GitHub Release Rules

- If the user wants changes to "show up like the previous release page" or points to a GitHub Releases URL, do not stop at creating a git tag. Create or update the GitHub `Release` object too.
- Treat git tags and GitHub Releases as separate artifacts:
  - git tag: source-control metadata
  - GitHub Release: the rendered release page with visible notes
- After creating a tag intended for release notes visibility, create a GitHub Release with `gh release create` or update the existing one with `gh release edit`.
- Use the approved Markdown changelog text as the GitHub Release body unless the user explicitly asks for a shorter release note.
- Keep the GitHub Release title aligned with the tag name unless the repository already uses a different naming convention.
- Mark release candidates as prereleases when the tag name or changelog indicates `rc`.
- Always include a compare link in the GitHub Release body when the repository already does so.
- After creating or editing a GitHub Release, verify it with `gh release view <tag>` and confirm:
  - the release exists
  - the body contains the expected Markdown sections
  - the prerelease/draft flags match the intended release state
- If the repository already has a previous release page style, mirror that style instead of inventing a new presentation.
