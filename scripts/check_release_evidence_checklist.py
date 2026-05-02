#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_DIR = ROOT / "docs" / "release" / "evidence"
README = EVIDENCE_DIR / "README.md"
RELEASE_EVIDENCE_CHECK = ROOT / "scripts" / "check_release_evidence.py"
CHECKLIST_NAME_RE = re.compile(r"LIVE_EVIDENCE_CHECKLIST_\d{4}-\d{2}-\d{2}\.md")


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


def check_output(candidate_id: str) -> dict:
    raw = subprocess.check_output(
        [
            sys.executable,
            str(RELEASE_EVIDENCE_CHECK),
            "--format",
            "json",
            "--require-candidate-id",
            "--candidate-id",
            candidate_id,
        ],
        cwd=ROOT,
        text=True,
    )
    return json.loads(raw)


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


def check_provider_targets(checklist: str, provider: dict, errors: list[str]) -> None:
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


def check_reverse_proxy_targets(checklist: str, reverse_proxy: dict, errors: list[str]) -> None:
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
    for check, statuses in reverse_proxy.get("check_status_expectations", {}).items():
        for status in statuses:
            require_text(checklist, f"{check}: `{status}`", f"{check} expected status", errors)
    for check, expectation in reverse_proxy.get("check_result_expectations", {}).items():
        require_text(checklist, f"{check} {expectation}", f"{check} expected result", errors)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify the current live-evidence checklist matches release evidence checker remediation output."
    )
    parser.add_argument("--candidate-id", default="rc1", help="Concrete release candidate identifier.")
    parser.add_argument(
        "--checklist",
        default="",
        help="Live evidence checklist Markdown file. Defaults to the current checklist linked from docs/release/evidence/README.md.",
    )
    args = parser.parse_args()

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
    summary = check_output(args.candidate_id)
    errors: list[str] = []

    if not args.checklist:
        require_text(readme, checklist_path.name, "README current checklist link", errors)
    require_text(checklist, f"--candidate-id {args.candidate_id}", "candidate-specific final gate", errors)

    check_provider_targets(checklist, requirement(summary, "provider-live-validation"), errors)
    check_reverse_proxy_targets(checklist, requirement(summary, "reverse-proxy-smoke"), errors)
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
