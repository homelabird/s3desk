#!/usr/bin/env python3
"""Validate Go toolchain declarations across local, container, and CI paths."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXPECTED_GO_DIRECTIVE = "1.25.0"
EXPECTED_TOOLCHAIN = "1.25.13"
EXPECTED_TOOLCHAIN_DIRECTIVE = f"go{EXPECTED_TOOLCHAIN}"


def fail(message: str) -> None:
    print(f"[go-toolchain] {message}", file=sys.stderr)
    raise SystemExit(1)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        fail(f"{path.relative_to(ROOT)}: {exc}")


def require_match(pattern: str, text: str, context: str) -> re.Match[str]:
    match = re.search(pattern, text, flags=re.MULTILINE)
    if not match:
        fail(f"{context}: missing {pattern!r}")
    return match


def check_go_mod() -> None:
    path = ROOT / "backend" / "go.mod"
    text = read_text(path)
    go_directive = require_match(r"^go\s+([0-9.]+)$", text, "backend/go.mod").group(1)
    if go_directive != EXPECTED_GO_DIRECTIVE:
        fail(f"backend/go.mod go directive is {go_directive}, want {EXPECTED_GO_DIRECTIVE}")
    toolchain = require_match(r"^toolchain\s+(go[0-9.]+)$", text, "backend/go.mod").group(1)
    if toolchain != EXPECTED_TOOLCHAIN_DIRECTIVE:
        fail(f"backend/go.mod toolchain is {toolchain}, want {EXPECTED_TOOLCHAIN_DIRECTIVE}")


def check_containerfile(path_name: str) -> None:
    text = read_text(ROOT / path_name)
    image_version = require_match(r"golang:([0-9.]+)-alpine", text, path_name).group(1)
    if image_version != EXPECTED_TOOLCHAIN:
        fail(f"{path_name} Go image is {image_version}, want {EXPECTED_TOOLCHAIN}")


def check_gitlab() -> None:
    text = read_text(ROOT / ".gitlab-ci.yml")
    # Images are declared as literal job `image:` fields (they must not be
    # overridable CI variables), so match the inlined Go image reference.
    image_version = require_match(r'image:\s*"[^"]*golang:([0-9.]+)"', text, ".gitlab-ci.yml").group(1)
    if image_version != EXPECTED_TOOLCHAIN:
        fail(f".gitlab-ci.yml Go image is {image_version}, want {EXPECTED_TOOLCHAIN}")


def check_github_workflows() -> None:
    workflow_dir = ROOT / ".github" / "workflows"
    found = False
    for path in sorted(workflow_dir.glob("*.yml")):
        text = read_text(path)
        for match in re.finditer(r"go-version:\s*[\"']?([^\"'\n]+)[\"']?", text):
            found = True
            version = match.group(1).strip()
            if version != EXPECTED_TOOLCHAIN:
                fail(f"{path.relative_to(ROOT)} go-version is {version}, want {EXPECTED_TOOLCHAIN}")
    if not found:
        fail(".github/workflows: no setup-go go-version declarations found")


def main() -> int:
    check_go_mod()
    check_containerfile("Containerfile")
    check_containerfile("Containerfile.local")
    check_gitlab()
    check_github_workflows()
    print(f"[go-toolchain] ok ({EXPECTED_TOOLCHAIN})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
