#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Callable

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from release_candidate import default_candidate_id


ROOT = SCRIPT_DIR.parent
STRICT_SCOPE_COMMAND = [
    "python3",
    "scripts/report_release_scope.py",
    "--fail-on-root-artifacts",
    "--fail-on-dependency-scope-warning",
    "--fail-on-untracked-directories",
    "--fail-on-other-unit",
    "--untracked-files",
    "all",
]


def strict_scope_command(base: str = "", head: str = "HEAD") -> list[str]:
    if not base:
        return STRICT_SCOPE_COMMAND
    return [
        "python3",
        "scripts/report_release_scope.py",
        "--base",
        base,
        "--head",
        head,
        "--fail-on-root-artifacts",
        "--fail-on-dependency-scope-warning",
        "--fail-on-untracked-directories",
        "--fail-on-other-unit",
    ]


def display_command(command: list[str]) -> str:
    return shlex.join(command)


def tail_lines(text: str, limit: int = 20) -> str:
    lines = text.strip().splitlines()
    if len(lines) <= limit:
        return "\n".join(lines)
    return "\n".join(lines[-limit:])


def run_command(name: str, command: list[str]) -> dict:
    completed = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return {
        "name": name,
        "command": display_command(command),
        "passed": completed.returncode == 0,
        "returncode": completed.returncode,
        "stdout_tail": tail_lines(completed.stdout),
        "stderr_tail": tail_lines(completed.stderr),
    }


def load_evidence_summary(candidate_id: str, base: str = "", head: str = "HEAD") -> dict:
    command = ["python3", "scripts/check_release_evidence.py"]
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


def requirement_by_name(summary: dict, name: str) -> dict | None:
    for requirement in summary.get("requirements", []):
        if requirement.get("name") == name:
            return requirement
    return None


def required_env_scopes(summary: dict) -> list[str]:
    scopes: list[str] = []
    provider = requirement_by_name(summary, "provider-live-validation")
    if provider and provider.get("required") and not provider.get("satisfied"):
        scopes.extend(provider.get("missing_provider_scopes") or provider.get("provider_scopes") or [])

    reverse_proxy = requirement_by_name(summary, "reverse-proxy-smoke")
    if reverse_proxy and reverse_proxy.get("required") and not reverse_proxy.get("satisfied"):
        scopes.append("reverse-proxy")

    seen: set[str] = set()
    unique: list[str] = []
    for scope in scopes:
        if scope in seen:
            continue
        seen.add(scope)
        unique.append(scope)
    return unique


def env_preflight_command(scopes: list[str]) -> list[str]:
    command = ["python3", "scripts/check_live_evidence_env.py"]
    for scope in scopes:
        command.extend(["--scope", scope])
    return command


def evidence_strict_command(candidate_id: str, base: str = "", head: str = "HEAD") -> list[str]:
    command = [
        "python3",
        "scripts/check_release_evidence.py",
    ]
    if base:
        command.extend(["--base", base, "--head", head])
    command.extend(
        [
            "--strict",
            "--require-candidate-id",
            "--candidate-id",
            candidate_id,
        ]
    )
    return command


def resolve_candidate_id(candidate_id: str) -> str:
    normalized = candidate_id.strip().strip("\"'`")
    return normalized or default_candidate_id()


def evidence_blockers(summary: dict) -> list[str]:
    blockers: list[str] = []
    provider = requirement_by_name(summary, "provider-live-validation")
    if provider and provider.get("required") and not provider.get("satisfied"):
        missing_scopes = provider.get("missing_provider_scopes") or []
        if missing_scopes:
            blockers.append("Missing provider live evidence: " + ", ".join(missing_scopes))
        for scope, target in sorted((provider.get("evidence_targets") or {}).items()):
            if scope in missing_scopes:
                blockers.append(f"{scope} target: {target}")

    reverse_proxy = requirement_by_name(summary, "reverse-proxy-smoke")
    if reverse_proxy and reverse_proxy.get("required") and not reverse_proxy.get("satisfied"):
        target = reverse_proxy.get("evidence_target")
        blockers.append("Missing reverse-proxy smoke evidence" + (f": {target}" if target else ""))

    backup_portable = requirement_by_name(summary, "backup-portable-smoke")
    if backup_portable and backup_portable.get("required") and not backup_portable.get("satisfied"):
        target = backup_portable.get("evidence_target")
        blockers.append("Missing backup-portable smoke evidence" + (f": {target}" if target else ""))

    for rejected in summary.get("rejected_evidence_files", []):
        path = rejected.get("path", "<unknown>")
        blockers.append(f"Rejected evidence file: {path}")
    return blockers


def resolve_git_commit(ref: str) -> str:
    if not ref.strip():
        return ""
    completed = subprocess.run(
        ["git", "rev-parse", "--verify", "-q", f"{ref}^{{commit}}"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return completed.stdout.strip() if completed.returncode == 0 else ""


def candidate_identity_blockers(candidate_id: str, head: str = "HEAD") -> list[str]:
    candidate_commit = resolve_git_commit(candidate_id)
    if not candidate_commit:
        return []

    head_commit = resolve_git_commit(head)
    if not head_commit:
        return [f"Head ref `{head}` could not be resolved while checking candidate `{candidate_id}`."]
    if candidate_commit == head_commit:
        return []

    return [
        "Candidate identity mismatch: "
        f"`{candidate_id}` resolves to `{candidate_commit[:12]}`, "
        f"but `{head}` resolves to `{head_commit[:12]}`. "
        "Use a new RC tag or validate an exact HEAD commit SHA."
    ]


def build_report(
    candidate_id: str,
    *,
    include_release_gate: bool,
    base: str = "",
    head: str = "HEAD",
    command_runner: Callable[[str, list[str]], dict] = run_command,
    evidence_loader: Callable[[str, str, str], dict] = load_evidence_summary,
    candidate_checker: Callable[[str, str], list[str]] = candidate_identity_blockers,
) -> dict:
    checks: list[dict] = []
    if include_release_gate:
        checks.append(command_runner("release gate", ["bash", "./scripts/check_release_gate.sh"]))

    checks.append(command_runner("strict release scope", strict_scope_command(base, head)))
    checks.append(command_runner("release-scope audit sync", ["python3", "scripts/check_release_scope_audit.py"]))

    evidence_summary = evidence_loader(candidate_id, base, head)
    checks.append(command_runner("strict release evidence", evidence_strict_command(candidate_id, base, head)))

    scopes = required_env_scopes(evidence_summary)
    if scopes:
        checks.append(command_runner("live evidence env preflight", env_preflight_command(scopes)))

    blockers = evidence_blockers(evidence_summary)
    candidate_blockers = candidate_checker(candidate_id, head)
    failed_checks = [check["name"] for check in checks if not check["passed"]]
    return {
        "candidate_id": candidate_id,
        "scope_source": {"mode": "git-diff", "base": base, "head": head} if base else {"mode": "git-status"},
        "ready": not failed_checks and not blockers and not candidate_blockers and evidence_summary.get("ready", False),
        "checks": checks,
        "failed_checks": failed_checks,
        "evidence_ready": evidence_summary.get("ready", False),
        "evidence_blockers": blockers,
        "candidate_blockers": candidate_blockers,
        "env_scopes": scopes,
    }


def print_markdown(report: dict) -> None:
    status = "ready" if report["ready"] else "blocked"
    print("# Release Readiness Preflight")
    print()
    print(f"- Candidate: `{report['candidate_id']}`")
    print(f"- Status: `{status}`")
    source = report.get("scope_source") or {"mode": "git-status"}
    if source.get("mode") == "git-diff":
        print(f"- Change source: `git diff --name-status --find-renames {source['base']} {source['head']}`")
    else:
        print("- Change source: `git status --porcelain=v1`")
    print(f"- Evidence ready: `{'yes' if report['evidence_ready'] else 'no'}`")
    if report["env_scopes"]:
        print(f"- Live env scopes checked: `{', '.join(report['env_scopes'])}`")
    print()
    print("## Checks")
    print()
    print("| Check | Status | Command |")
    print("|---|---|---|")
    for check in report["checks"]:
        check_status = "pass" if check["passed"] else f"fail ({check['returncode']})"
        print(f"| {check['name']} | `{check_status}` | `{check['command']}` |")

    if report["evidence_blockers"]:
        print()
        print("## Evidence Blockers")
        print()
        for blocker in report["evidence_blockers"]:
            print(f"- {blocker}")

    if report.get("candidate_blockers"):
        print()
        print("## Candidate Blockers")
        print()
        for blocker in report["candidate_blockers"]:
            print(f"- {blocker}")

    failed = [check for check in report["checks"] if not check["passed"]]
    if failed:
        print()
        print("## Failed Check Tails")
        for check in failed:
            print()
            print(f"### {check['name']}")
            if check["stderr_tail"]:
                print()
                print("stderr:")
                print("```")
                print(check["stderr_tail"])
                print("```")
            if check["stdout_tail"]:
                print()
                print("stdout:")
                print("```")
                print(check["stdout_tail"])
                print("```")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run local release-readiness preflight and summarize remaining blockers."
    )
    parser.add_argument(
        "--candidate-id",
        default="",
        help="Concrete release candidate identifier. Defaults to the latest versioned CHANGELOG.md section.",
    )
    parser.add_argument(
        "--base",
        default="",
        help="Use explicit base ref for release-scope and evidence checks instead of dirty git status.",
    )
    parser.add_argument(
        "--head",
        default="HEAD",
        help="Head ref for --base diff mode. Defaults to HEAD.",
    )
    parser.add_argument(
        "--skip-release-gate",
        action="store_true",
        help="Skip bash ./scripts/check_release_gate.sh when only blocker summarization is needed.",
    )
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    args = parser.parse_args()
    if args.head != "HEAD" and not args.base:
        print("[release-readiness] --head requires --base", file=sys.stderr)
        return 2

    try:
        candidate_id = resolve_candidate_id(args.candidate_id)
    except (OSError, ValueError) as exc:
        print(f"[release-readiness] {exc}", file=sys.stderr)
        return 2

    report = build_report(candidate_id, include_release_gate=not args.skip_release_gate, base=args.base, head=args.head)
    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_markdown(report)
    return 0 if report["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
