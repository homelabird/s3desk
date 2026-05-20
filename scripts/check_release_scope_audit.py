#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "docs" / "RELEASE_SCOPE_AUDIT_2026-04-30.md"
RELEASE_SCOPE_REPORT = ROOT / "scripts" / "report_release_scope.py"
DYNAMIC_SCOPE_MARKER = "<!-- release-scope-audit: dynamic-current-scope -->"
STRICT_SCOPE_COMMAND = (
    "python3 scripts/report_release_scope.py --fail-on-root-artifacts "
    "--fail-on-dependency-scope-warning --fail-on-untracked-directories "
    "--fail-on-other-unit --untracked-files all"
)

STATUS_RE = re.compile(
    r"`tracked changes=(?P<tracked>\d+)` including `deleted=(?P<deleted>\d+)`, "
    r"`untracked=(?P<untracked>\d+)`, `total status entries=(?P<total>\d+)`"
)
GROUP_ROW_RE = re.compile(r"^\| `(?P<group>[^`]+)` \| (?P<count>\d+) \|")
UNIT_ROW_RE = re.compile(
    r"^\| `(?P<unit>[^`]+)` \| (?P<count>\d+) \| (?P<tracked>\d+) \| "
    r"(?P<untracked>\d+) \| (?P<deleted>\d+) \| (?P<guidance>[^|]+) \|$"
)


def is_git_worktree() -> bool:
    return (
        subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        ).returncode
        == 0
    )


def load_scope_summary() -> dict:
    raw = subprocess.check_output(
        [
            sys.executable,
            str(RELEASE_SCOPE_REPORT),
            "--format",
            "json",
            "--untracked-files",
            "all",
        ],
        cwd=ROOT,
        text=True,
    )
    return json.loads(raw)


def section(text: str, heading: str) -> str:
    marker = f"## {heading}"
    start = text.find(marker)
    if start == -1:
        return ""
    next_heading = text.find("\n## ", start + len(marker))
    if next_heading == -1:
        return text[start:]
    return text[start:next_heading]


def counts_for_compare(summary: dict) -> dict[str, int]:
    counts = summary["counts"]
    return {
        "tracked": counts["tracked_changes_including_deleted"],
        "deleted": counts["deleted"],
        "untracked": counts["untracked"],
        "total": counts["total_status_entries"],
    }


def parse_status_counts(line: str) -> dict[str, int] | None:
    match = STATUS_RE.search(line)
    if not match:
        return None
    return {key: int(value) for key, value in match.groupdict().items()}


def check_status_section(section_text: str, section_name: str, expected: dict[str, int], errors: list[str]) -> None:
    for line in section_text.splitlines():
        parsed = parse_status_counts(line)
        if parsed is None:
            continue
        if parsed != expected:
            errors.append(f"{section_name} status counts {parsed} do not match current scope {expected}")
        return
    errors.append(f"{section_name} status count line is missing")


def normalize_group(label: str) -> str:
    if label != "(root)" and label.endswith("/"):
        return label[:-1]
    return label


def parse_group_table(section_text: str) -> dict[str, int]:
    groups: dict[str, int] = {}
    for line in section_text.splitlines():
        match = GROUP_ROW_RE.match(line)
        if not match:
            continue
        groups[normalize_group(match.group("group"))] = int(match.group("count"))
    return groups


def parse_unit_table(section_text: str) -> dict[str, dict[str, int | str]]:
    units: dict[str, dict[str, int | str]] = {}
    for line in section_text.splitlines():
        match = UNIT_ROW_RE.match(line)
        if not match:
            continue
        units[match.group("unit")] = {
            "count": int(match.group("count")),
            "tracked": int(match.group("tracked")),
            "untracked": int(match.group("untracked")),
            "deleted": int(match.group("deleted")),
            "guidance": match.group("guidance").strip(),
        }
    return units


def check_mapping(name: str, documented: dict, expected: dict, errors: list[str]) -> None:
    if documented == expected:
        return
    missing = sorted(set(expected) - set(documented))
    extra = sorted(set(documented) - set(expected))
    if missing:
        errors.append(f"{name} missing entries: {', '.join(missing)}")
    if extra:
        errors.append(f"{name} unexpected entries: {', '.join(extra)}")
    for key in sorted(set(expected) & set(documented)):
        if documented[key] != expected[key]:
            errors.append(f"{name} entry {key} is {documented[key]} but expected {expected[key]}")


def expected_units(summary: dict) -> dict[str, dict[str, int | str]]:
    return {
        unit["unit"]: {
            "count": unit["count"],
            "tracked": unit["tracked"],
            "untracked": unit["untracked"],
            "deleted": unit["deleted"],
            "guidance": unit["guidance"],
        }
        for unit in summary["release_units"]
    }


def check_dynamic_scope_marker(text: str, errors: list[str]) -> bool:
    if DYNAMIC_SCOPE_MARKER not in text:
        return False
    if STRICT_SCOPE_COMMAND not in text:
        errors.append("dynamic scope audit marker requires the strict report_release_scope.py command guidance")
    return True


def check_audit_text(text: str, summary: dict, *, enforce_current_snapshot: bool = False) -> list[str]:
    errors: list[str] = []
    if check_dynamic_scope_marker(text, errors) and not enforce_current_snapshot:
        return errors

    expected_counts = counts_for_compare(summary)
    check_status_section(section(text, "Summary"), "Summary", expected_counts, errors)
    latest_section = section(text, "2026-05-02 Live Evidence Recheck")
    if latest_section:
        check_status_section(latest_section, "2026-05-02 Live Evidence Recheck", expected_counts, errors)

    check_mapping(
        "untracked group table",
        parse_group_table(section(text, "Source/Test/Docs Candidate Sets")),
        summary["untracked_by_group"],
        errors,
    )
    check_mapping(
        "release unit table",
        parse_unit_table(section(text, "Release Unit Candidate Summary")),
        expected_units(summary),
        errors,
    )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify RELEASE_SCOPE_AUDIT current counts and unit tables match report_release_scope.py."
    )
    parser.add_argument(
        "--audit",
        default=str(AUDIT.relative_to(ROOT)),
        help="Release scope audit Markdown file to verify.",
    )
    parser.add_argument(
        "--enforce-current-snapshot",
        action="store_true",
        help="Require dated audit counts and release-unit tables to match the current git status.",
    )
    args = parser.parse_args()

    if not is_git_worktree():
        print("[release-scope-audit] skipping audit sync outside a git worktree")
        return 0

    audit = Path(args.audit)
    audit_path = audit if audit.is_absolute() else ROOT / audit
    if not audit_path.is_file():
        print(f"[release-scope-audit] missing audit: {audit_path}", file=sys.stderr)
        return 1

    summary = load_scope_summary()
    if summary["counts"]["total_status_entries"] == 0:
        print("[release-scope-audit] skipping audit sync for a clean worktree")
        return 0

    audit_text = audit_path.read_text(encoding="utf-8")
    errors = check_audit_text(audit_text, summary, enforce_current_snapshot=args.enforce_current_snapshot)
    if errors:
        for error in errors:
            print(f"[release-scope-audit] {error}", file=sys.stderr)
        return 1
    if DYNAMIC_SCOPE_MARKER in audit_text and not args.enforce_current_snapshot:
        print("[release-scope-audit] ok (current scope generated by report_release_scope.py)")
        return 0
    print("[release-scope-audit] ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
