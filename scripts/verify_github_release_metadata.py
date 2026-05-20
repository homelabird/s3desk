#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any


def is_release_candidate(tag: str) -> bool:
    return "rc" in tag.lower()


def evaluate_release_metadata(data: dict[str, Any], tag: str, base: str) -> list[str]:
    body = data.get("body") if isinstance(data.get("body"), str) else ""
    title = str(data.get("name") or "").strip()
    actual_tag = str(data.get("tag_name") or "").strip()
    prerelease = bool(data.get("prerelease"))
    expected_compare = f"/compare/{base}...{tag}"
    is_rc = is_release_candidate(tag)
    errors: list[str] = []

    if actual_tag != tag:
        errors.append(f"GitHub release tag_name is {actual_tag or '<missing>'}, expected '{tag}'.")
    if title != tag:
        errors.append(f"GitHub release title is {title or '<missing>'}, expected '{tag}'.")
    if data.get("draft"):
        errors.append(f"GitHub release for tag '{tag}' is still a draft.")
    if not body.strip():
        errors.append(f"GitHub release for tag '{tag}' has an empty body.")
    if "Full Changelog" not in body:
        errors.append(f"GitHub release for tag '{tag}' is missing a Full Changelog section.")
    if expected_compare not in body:
        errors.append(f"GitHub release for tag '{tag}' is missing expected compare link {expected_compare}.")
    if not re.search(r"^#{2,3}\s+", body, re.MULTILINE):
        errors.append(f"GitHub release for tag '{tag}' is missing Markdown release sections.")
    if is_rc and not prerelease:
        errors.append(f"GitHub release for tag '{tag}' is not marked as a prerelease.")
    if not is_rc and prerelease:
        errors.append(f"GitHub release for tag '{tag}' is unexpectedly marked as a prerelease.")

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify GitHub Release metadata from API JSON.")
    parser.add_argument("--tag", required=True, help="Expected release tag.")
    parser.add_argument("--base", required=True, help="Base tag used for the Full Changelog compare link.")
    args = parser.parse_args(argv)

    data = json.load(sys.stdin)
    if not isinstance(data, dict):
        print("GitHub release API response must be a JSON object.", file=sys.stderr)
        return 1

    errors = evaluate_release_metadata(data, args.tag, args.base)
    for item in errors:
        print(item, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
