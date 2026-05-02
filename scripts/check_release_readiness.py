#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Callable


ROOT = Path(__file__).resolve().parents[1]
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


def load_evidence_summary(candidate_id: str) -> dict:
    raw = subprocess.check_output(
        [
            "python3",
            "scripts/check_release_evidence.py",
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


def evidence_strict_command(candidate_id: str) -> list[str]:
    return [
        "python3",
        "scripts/check_release_evidence.py",
        "--strict",
        "--require-candidate-id",
        "--candidate-id",
        candidate_id,
    ]


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

    for rejected in summary.get("rejected_evidence_files", []):
        path = rejected.get("path", "<unknown>")
        blockers.append(f"Rejected evidence file: {path}")
    return blockers


def build_report(
    candidate_id: str,
    *,
    include_release_gate: bool,
    command_runner: Callable[[str, list[str]], dict] = run_command,
    evidence_loader: Callable[[str], dict] = load_evidence_summary,
) -> dict:
    checks: list[dict] = []
    if include_release_gate:
        checks.append(command_runner("release gate", ["bash", "./scripts/check_release_gate.sh"]))

    checks.append(command_runner("strict release scope", STRICT_SCOPE_COMMAND))
    checks.append(command_runner("release-scope audit sync", ["python3", "scripts/check_release_scope_audit.py"]))

    evidence_summary = evidence_loader(candidate_id)
    checks.append(command_runner("strict release evidence", evidence_strict_command(candidate_id)))

    scopes = required_env_scopes(evidence_summary)
    if scopes:
        checks.append(command_runner("live evidence env preflight", env_preflight_command(scopes)))

    blockers = evidence_blockers(evidence_summary)
    failed_checks = [check["name"] for check in checks if not check["passed"]]
    return {
        "candidate_id": candidate_id,
        "ready": not failed_checks and not blockers and evidence_summary.get("ready", False),
        "checks": checks,
        "failed_checks": failed_checks,
        "evidence_ready": evidence_summary.get("ready", False),
        "evidence_blockers": blockers,
        "env_scopes": scopes,
    }


def print_markdown(report: dict) -> None:
    status = "ready" if report["ready"] else "blocked"
    print("# Release Readiness Preflight")
    print()
    print(f"- Candidate: `{report['candidate_id']}`")
    print(f"- Status: `{status}`")
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
    parser.add_argument("--candidate-id", default="rc1", help="Concrete release candidate identifier.")
    parser.add_argument(
        "--skip-release-gate",
        action="store_true",
        help="Skip bash ./scripts/check_release_gate.sh when only blocker summarization is needed.",
    )
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    args = parser.parse_args()

    report = build_report(args.candidate_id, include_release_gate=not args.skip_release_gate)
    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_markdown(report)
    return 0 if report["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
