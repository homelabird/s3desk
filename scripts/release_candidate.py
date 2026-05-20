#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CHANGELOG = ROOT / "CHANGELOG.md"
CHANGELOG_HEADING_RE = re.compile(r"^##\s+(?P<title>.+?)\s*$")


def version_from_changelog_heading(line: str) -> str | None:
    match = CHANGELOG_HEADING_RE.match(line.strip())
    if not match:
        return None

    title = match.group("title").strip()
    if title.lower() == "unreleased":
        return None

    if title.startswith("`"):
        closing = title.find("`", 1)
        if closing > 1:
            return title[1:closing].strip()

    version = re.split(r"\s+-\s+", title, maxsplit=1)[0].strip().strip("`")
    if not version or version.lower() == "unreleased":
        return None
    return version


def latest_versioned_changelog_candidate(changelog_text: str) -> str:
    for line in changelog_text.splitlines():
        candidate = version_from_changelog_heading(line)
        if candidate:
            return candidate
    raise ValueError("latest versioned CHANGELOG.md section not found")


def default_candidate_id(changelog_path: Path = DEFAULT_CHANGELOG) -> str:
    return latest_versioned_changelog_candidate(changelog_path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Print the release candidate from the latest versioned CHANGELOG.md section."
    )
    parser.add_argument(
        "--changelog",
        default=str(DEFAULT_CHANGELOG),
        help="Changelog path. Defaults to repository CHANGELOG.md.",
    )
    args = parser.parse_args()

    try:
        print(default_candidate_id(Path(args.changelog)))
    except (OSError, ValueError) as exc:
        print(f"[release-candidate] {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
