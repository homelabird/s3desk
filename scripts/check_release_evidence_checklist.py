#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from release_candidate import default_candidate_id


ROOT = SCRIPT_DIR.parent
EVIDENCE_DIR = ROOT / "docs" / "release" / "evidence"
README = EVIDENCE_DIR / "README.md"
RELEASE_EVIDENCE_CHECK = ROOT / "scripts" / "check_release_evidence.py"
CHECKLIST_NAME_RE = re.compile(r"LIVE_EVIDENCE_CHECKLIST_\d{4}-\d{2}-\d{2}\.md")
PROVIDER_EVIDENCE_FILENAME_RE = re.compile(
    r"provider-live-(?P<scope>aws|gcs|azure|oci|minio|ceph)-(?P<candidate>[^`\s\])]+)\.md"
)
REVERSE_PROXY_EVIDENCE_FILENAME_RE = re.compile(
    r"reverse-proxy-smoke-(?P<candidate>[^`\s\])]+)\.md"
)
BACKUP_PORTABLE_EVIDENCE_FILENAME_RE = re.compile(
    r"backup-portable-smoke-(?P<candidate>[^`\s\])]+)\.md"
)
CHECKLIST_DIFF_SCOPE_RE = re.compile(
    r"python3 scripts/check_release_evidence\.py[^\n`]*?--base\s+(?P<base>[^\s`]+)\s+--head\s+(?P<head>[^\s`]+)"
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


def check_output(candidate_id: str, base: str = "", head: str = "HEAD") -> dict:
    command = [sys.executable, str(RELEASE_EVIDENCE_CHECK)]
    if base:
        command.extend(["--base", base, "--head", head])
    command.extend(
        [
            "--format",
            "json",
            "--require-candidate-id",
            "--candidate-id",
            candidate_id,
        ]
    )
    raw = subprocess.check_output(command, cwd=ROOT, text=True)
    return json.loads(raw)


def checklist_diff_scope(checklist_text: str) -> tuple[str, str]:
    match = CHECKLIST_DIFF_SCOPE_RE.search(checklist_text)
    if not match:
        return "", "HEAD"
    return match.group("base"), match.group("head")


def checklist_from_readme(readme_text: str) -> Path | None:
    match = CHECKLIST_NAME_RE.search(readme_text)
    if not match:
        return None
    return EVIDENCE_DIR / match.group(0)


def latest_checklist() -> Path | None:
    candidates = sorted(EVIDENCE_DIR.glob("LIVE_EVIDENCE_CHECKLIST_*.md"))
    return candidates[-1] if candidates else None


def resolve_checklist_path(checklist_arg: str, readme_text: str) -> Path | None:
    if checklist_arg:
        path = Path(checklist_arg)
        return path if path.is_absolute() else ROOT / path
    return checklist_from_readme(readme_text) or latest_checklist()


def requirement(summary: dict, name: str) -> dict:
    for item in summary.get("requirements", []):
        if item.get("name") == name:
            return item
    raise KeyError(name)


def require_text(text: str, needle: str, description: str, errors: list[str]) -> None:
    if needle not in text:
        errors.append(f"missing {description}: {needle}")


def require_any_text(text: str, needles: list[str], description: str, errors: list[str]) -> None:
    if any(needle in text for needle in needles):
        return
    formatted = " or ".join(needles)
    errors.append(f"missing {description}: {formatted}")


def is_candidate_placeholder(value: str) -> bool:
    normalized = value.strip().strip("\"'`").lower()
    return normalized in {"<tag-or-sha>", "tag-or-sha"}


def require_candidate_filename_match(
    path: str,
    candidate_id: str,
    description: str,
    errors: list[str],
) -> None:
    expected = candidate_id.strip().strip("\"'`")
    if not expected:
        return
    name = Path(path).name
    match = (
        PROVIDER_EVIDENCE_FILENAME_RE.fullmatch(name)
        or REVERSE_PROXY_EVIDENCE_FILENAME_RE.fullmatch(name)
        or BACKUP_PORTABLE_EVIDENCE_FILENAME_RE.fullmatch(name)
    )
    if not match:
        return
    actual = match.group("candidate")
    if actual != expected:
        errors.append(
            f"{description} must use candidate `{expected}` in filename: {path}"
        )


def check_candidate_filenames(checklist: str, candidate_id: str, errors: list[str]) -> None:
    expected = candidate_id.strip().strip("\"'`")
    if not expected:
        return
    seen: set[tuple[str, str]] = set()
    for pattern, description in (
        (PROVIDER_EVIDENCE_FILENAME_RE, "provider evidence filename"),
        (REVERSE_PROXY_EVIDENCE_FILENAME_RE, "reverse-proxy smoke evidence filename"),
        (BACKUP_PORTABLE_EVIDENCE_FILENAME_RE, "backup portable smoke evidence filename"),
    ):
        for match in pattern.finditer(checklist):
            actual = match.group("candidate")
            if actual == expected or is_candidate_placeholder(actual):
                continue
            key = (description, match.group(0))
            if key in seen:
                continue
            seen.add(key)
            errors.append(
                f"{description} `{match.group(0)}` must use candidate `{expected}`"
            )


def resolve_candidate_id(candidate_id: str) -> str:
    normalized = candidate_id.strip().strip("\"'`")
    return normalized or default_candidate_id()


def check_provider_targets(
    checklist: str,
    provider: dict,
    errors: list[str],
    candidate_id: str = "",
) -> None:
    if not provider.get("required"):
        return
    require_text(checklist, provider["preflight_command"], "provider preflight command", errors)
    require_any_text(
        checklist,
        [
            provider["env_template_command"],
            "python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --scope reverse-proxy --format env-template",
        ],
        "provider env-template command",
        errors,
    )
    require_text(checklist, provider["provider_test_command"], "provider test command", errors)
    require_any_text(
        checklist,
        [provider["evidence_template"], Path(provider["evidence_template"]).name],
        "provider evidence template path",
        errors,
    )
    for scope, target in provider.get("evidence_targets", {}).items():
        require_text(checklist, target, f"{scope} provider evidence target", errors)
        require_candidate_filename_match(
            target,
            candidate_id,
            f"{scope} provider evidence target",
            errors,
        )


def check_reverse_proxy_targets(
    checklist: str,
    reverse_proxy: dict,
    errors: list[str],
    candidate_id: str = "",
) -> None:
    if not reverse_proxy.get("required"):
        return
    require_text(checklist, reverse_proxy["preflight_command"], "reverse-proxy preflight command", errors)
    require_any_text(
        checklist,
        [
            reverse_proxy["env_template_command"],
            "python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --scope reverse-proxy --format env-template",
        ],
        "reverse-proxy env-template command",
        errors,
    )
    require_text(checklist, reverse_proxy["smoke_command"], "reverse-proxy smoke command", errors)
    require_text(checklist, reverse_proxy["evidence_target"], "reverse-proxy evidence target", errors)
    require_candidate_filename_match(
        reverse_proxy["evidence_target"],
        candidate_id,
        "reverse-proxy evidence target",
        errors,
    )
    for check, statuses in reverse_proxy.get("check_status_expectations", {}).items():
        for status in statuses:
            require_text(checklist, f"{check}: `{status}`", f"{check} expected status", errors)
    for check, expectation in reverse_proxy.get("check_result_expectations", {}).items():
        require_text(checklist, f"{check} {expectation}", f"{check} expected result", errors)


def check_backup_portable_targets(
    checklist: str,
    backup_portable: dict,
    errors: list[str],
    candidate_id: str = "",
) -> None:
    if not backup_portable.get("required"):
        return
    require_text(checklist, backup_portable["smoke_command"], "backup/portable smoke command", errors)
    require_any_text(
        checklist,
        [backup_portable["evidence_template"], Path(backup_portable["evidence_template"]).name],
        "backup/portable evidence template path",
        errors,
    )
    require_text(checklist, backup_portable["evidence_target"], "backup/portable evidence target", errors)
    require_candidate_filename_match(
        backup_portable["evidence_target"],
        candidate_id,
        "backup/portable evidence target",
        errors,
    )
    for check in backup_portable.get("required_check_fields", []):
        require_text(checklist, f"{check}: pass/success", f"{check} backup/portable result", errors)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify the current live-evidence checklist matches release evidence checker remediation output."
    )
    parser.add_argument(
        "--candidate-id",
        default="",
        help="Concrete release candidate identifier. Defaults to the latest versioned CHANGELOG.md section.",
    )
    parser.add_argument(
        "--checklist",
        default="",
        help="Live evidence checklist Markdown file. Defaults to the current checklist linked from docs/release/evidence/README.md.",
    )
    parser.add_argument(
        "--base",
        default="",
        help="Use git diff --name-status between this base ref and --head when checking generated evidence commands.",
    )
    parser.add_argument(
        "--head",
        default="HEAD",
        help="Head ref for --base diff mode. Defaults to HEAD.",
    )
    args = parser.parse_args()
    if args.head != "HEAD" and not args.base:
        print("[release-evidence-checklist] --head requires --base", file=sys.stderr)
        return 2

    if not is_git_worktree():
        print("[release-evidence-checklist] skipping checklist sync outside a git worktree")
        return 0

    if not README.is_file():
        print(f"[release-evidence-checklist] missing README: {README}", file=sys.stderr)
        return 1

    readme = README.read_text(encoding="utf-8")
    checklist_path = resolve_checklist_path(args.checklist, readme)
    if checklist_path is None:
        print("[release-evidence-checklist] no LIVE_EVIDENCE_CHECKLIST_*.md file found", file=sys.stderr)
        return 1
    if not checklist_path.is_file():
        print(f"[release-evidence-checklist] missing checklist: {checklist_path}", file=sys.stderr)
        return 1

    checklist = checklist_path.read_text(encoding="utf-8")
    try:
        candidate_id = resolve_candidate_id(args.candidate_id)
    except (OSError, ValueError) as exc:
        print(f"[release-evidence-checklist] {exc}", file=sys.stderr)
        return 2

    base = args.base
    head = args.head
    if not base:
        base, head = checklist_diff_scope(checklist)

    summary = check_output(candidate_id, base, head)
    errors: list[str] = []

    if not args.checklist:
        require_text(readme, checklist_path.name, "README current checklist link", errors)
    require_text(checklist, f"--candidate-id {candidate_id}", "candidate-specific final gate", errors)
    check_candidate_filenames(checklist, candidate_id, errors)

    check_provider_targets(checklist, requirement(summary, "provider-live-validation"), errors, candidate_id)
    check_reverse_proxy_targets(checklist, requirement(summary, "reverse-proxy-smoke"), errors, candidate_id)
    check_backup_portable_targets(checklist, requirement(summary, "backup-portable-smoke"), errors, candidate_id)
    for command_name, command in summary.get("final_gate_commands", {}).items():
        require_text(checklist, command, f"{command_name} final gate command", errors)

    if errors:
        for error in errors:
            print(f"[release-evidence-checklist] {error}", file=sys.stderr)
        return 1
    print("[release-evidence-checklist] ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
