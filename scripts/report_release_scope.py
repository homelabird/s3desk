#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]

DEPENDENCY_METADATA = {
    "backend/go.mod",
    "backend/go.sum",
    "frontend/package.json",
    "frontend/package-lock.json",
    "THIRD_PARTY_NOTICES.md",
}
DEPENDENCY_NOTICE_UNIT = DEPENDENCY_METADATA
LICENSE_PREFIX = "third_party/licenses/"

ROOT_ARTIFACT_SUFFIXES = {
    ".gif",
    ".jpeg",
    ".jpg",
    ".md",
    ".png",
    ".webp",
}
ROOT_ARTIFACT_NAMES = {"process"}

RELEASE_UNIT_ORDER = [
    "dependency-notices",
    "release-scope-tooling",
    "release-gate-ci-deploy",
    "backend-api-provider-surface",
    "backend-runtime-store-jobs",
    "backend-other",
    "frontend-objects",
    "frontend-buckets",
    "frontend-jobs",
    "frontend-profiles",
    "frontend-uploads",
    "frontend-transfers",
    "frontend-shell-theme",
    "frontend-shared-components",
    "frontend-api-contracts",
    "frontend-lib",
    "frontend-e2e",
    "frontend-tooling",
    "frontend-docs",
    "frontend-other",
    "docs",
    "scripts-tooling",
    "third-party-other",
    "other",
]

RELEASE_UNIT_GUIDANCE = {
    "dependency-notices": "Keep dependency metadata, generated notices, and license snapshots together.",
    "release-scope-tooling": "Review release-scope scripts, reports, and ignore policy together.",
    "release-gate-ci-deploy": "Review CI, release gate, workflow, container, compose, deploy, and chart changes together.",
    "backend-api-provider-surface": "Review backend HTTP/API, provider, auth, realtime, and download-proxy behavior together.",
    "backend-runtime-store-jobs": "Review backend app, db, jobs, store, and websocket runtime behavior together.",
    "backend-other": "Review remaining backend changes by package.",
    "frontend-objects": "Review Objects page source, hooks, and tests together.",
    "frontend-buckets": "Review Buckets and governance UI changes together.",
    "frontend-jobs": "Review Jobs page source and tests together.",
    "frontend-profiles": "Review Profiles page source and tests together.",
    "frontend-uploads": "Review Uploads page source and tests together.",
    "frontend-transfers": "Review transfer runtime/source changes together.",
    "frontend-shell-theme": "Review app shell, routing, theme, and bootstrap changes together.",
    "frontend-shared-components": "Review shared component changes together.",
    "frontend-api-contracts": "Review frontend API client/query contract changes together.",
    "frontend-lib": "Review frontend shared library changes together.",
    "frontend-e2e": "Review Playwright specs, snapshots, and browser-lane config together.",
    "frontend-tooling": "Review frontend package scripts and tooling changes together.",
    "frontend-docs": "Review frontend documentation changes together.",
    "frontend-other": "Review remaining frontend changes by nearby owner.",
    "docs": "Review repository documentation and release docs together.",
    "scripts-tooling": "Review repository scripts together.",
    "third-party-other": "Review third-party files not covered by generated license snapshots.",
    "other": "Review remaining root or uncategorized files explicitly.",
}


@dataclass(frozen=True)
class StatusEntry:
    code: str
    path: str

    @property
    def is_untracked(self) -> bool:
        return self.code == "??"

    @property
    def is_deleted(self) -> bool:
        return "D" in self.code and not self.is_untracked

    @property
    def is_untracked_directory(self) -> bool:
        return self.is_untracked and self.path.endswith("/")

    @property
    def is_dependency_scope(self) -> bool:
        return self.path in DEPENDENCY_METADATA or self.path.startswith(LICENSE_PREFIX)

    @property
    def top_level(self) -> str:
        return self.path.split("/", 1)[0] if "/" in self.path else "(root)"


def is_backend_go_mod_toolchain_only_change(root: Path, source: dict | None) -> bool:
    commands: list[list[str]]
    if source and source.get("mode") == "git-diff":
        commands = [["git", "diff", "--unified=0", source["base"], source["head"], "--", "backend/go.mod"]]
    else:
        commands = [
            ["git", "diff", "--unified=0", "--", "backend/go.mod"],
            ["git", "diff", "--cached", "--unified=0", "--", "backend/go.mod"],
        ]

    changed_lines: list[str] = []
    for command in commands:
        try:
            raw = subprocess.check_output(command, cwd=root, stderr=subprocess.DEVNULL).decode("utf-8", "surrogateescape")
        except subprocess.CalledProcessError:
            return False
        for line in raw.splitlines():
            if not line or line.startswith(("+++", "---", "@@")):
                continue
            if line[0] in {"+", "-"}:
                changed_lines.append(line[1:].strip())

    if not changed_lines:
        return False
    return all(line == "" or line.startswith("go ") or line.startswith("toolchain ") for line in changed_lines)


def is_third_party_notices_timestamp_only_change(root: Path, source: dict | None) -> bool:
    commands: list[list[str]]
    if source and source.get("mode") == "git-diff":
        commands = [["git", "diff", "--unified=0", source["base"], source["head"], "--", "THIRD_PARTY_NOTICES.md"]]
    else:
        commands = [
            ["git", "diff", "--unified=0", "--", "THIRD_PARTY_NOTICES.md"],
            ["git", "diff", "--cached", "--unified=0", "--", "THIRD_PARTY_NOTICES.md"],
        ]

    changed_lines: list[str] = []
    for command in commands:
        try:
            raw = subprocess.check_output(command, cwd=root, stderr=subprocess.DEVNULL).decode("utf-8", "surrogateescape")
        except subprocess.CalledProcessError:
            return False
        for line in raw.splitlines():
            if not line or line.startswith(("+++", "---", "@@")):
                continue
            if line[0] in {"+", "-"}:
                changed_lines.append(line[1:].strip())

    if not changed_lines:
        return False
    return all(line.startswith("Generated at ") for line in changed_lines)


def is_dependency_scope_entry(entry: StatusEntry, root: Path, source: dict | None) -> bool:
    if not entry.is_dependency_scope:
        return False
    if entry.path == "backend/go.mod" and is_backend_go_mod_toolchain_only_change(root, source):
        return False
    if entry.path == "THIRD_PARTY_NOTICES.md" and is_third_party_notices_timestamp_only_change(root, source):
        return False
    return True


def release_unit_for(path: str) -> str:
    if path in DEPENDENCY_METADATA or path.startswith(LICENSE_PREFIX):
        return "dependency-notices"
    if path in {
        ".gitignore",
        "docs/RELEASE_SCOPE_AUDIT_2026-04-30.md",
        "docs/CODEBASE_FINAL_QUALITY_REPORT_2026-04-30.md",
        "scripts/report_release_scope.py",
        "scripts/report_release_scope_test.py",
        "scripts/check_release_scope_audit.py",
    }:
        return "release-scope-tooling"
    if (
        path.startswith(".github/")
        or path.startswith("ansible/")
        or path.startswith("charts/")
        or path.startswith("compose/")
        or path.startswith("deploy/")
        or path == "e2e/runner/Dockerfile"
        or path.startswith("k8s/")
        or path in {".containerignore", ".dockerignore", ".env", ".env.example", ".gitlab-ci.yml", ".golangci.yml", "Containerfile", "Containerfile.deploy", "Containerfile.local"}
        or path in {
            "docs/RELEASE_GATE.md",
            "docs/TESTING.md",
            "docs/release/DEPLOYMENT_CHECKLIST.md",
            "docs/release/PR_BODY.md",
            "docs/release/PR_BODY_2026-04-02.md",
        }
        or path.startswith("scripts/check")
        or path == "scripts/Caddyfile"
        or path == "scripts/deploy_helm_release.sh"
        or path == "scripts/install_actionlint.sh"
        or path == "scripts/install_backend_security_tools.sh"
    ):
        return "release-gate-ci-deploy"
    if path.startswith("backend/internal/api/"):
        return "backend-api-provider-surface"
    if path.startswith(
        (
            "backend/internal/app/",
            "backend/internal/db/",
            "backend/internal/jobs/",
            "backend/internal/store/",
            "backend/internal/ws/",
        )
    ):
        return "backend-runtime-store-jobs"
    if path.startswith("backend/"):
        return "backend-other"
    if path.startswith("frontend/docs/"):
        return "frontend-docs"
    if path.startswith("frontend/tests/") or path in {"frontend/playwright.config.ts", "lighthouserc.js"}:
        return "frontend-e2e"
    if path.startswith("frontend/scripts/"):
        return "frontend-tooling"
    if path.startswith("frontend/src/pages/objects/") or path == "frontend/src/pages/ObjectsPageScreen.tsx":
        return "frontend-objects"
    if path.startswith("frontend/src/pages/buckets/"):
        return "frontend-buckets"
    if path.startswith("frontend/src/pages/jobs/"):
        return "frontend-jobs"
    if path.startswith("frontend/src/pages/profiles/"):
        return "frontend-profiles"
    if path.startswith("frontend/src/pages/uploads/") or path == "frontend/src/pages/UploadsPage.tsx":
        return "frontend-uploads"
    if path.startswith("frontend/src/components/transfers/") or path == "frontend/src/components/Transfers.tsx" or path == "frontend/src/components/TransfersShell.tsx":
        return "frontend-transfers"
    if path == "openapi.yml" or path.startswith("frontend/src/api/"):
        return "frontend-api-contracts"
    if path.startswith("frontend/src/lib/"):
        return "frontend-lib"
    if path.startswith("frontend/src/components/"):
        return "frontend-shared-components"
    if path.startswith("frontend/src/") and (
        "/__tests__/" in path
        or path.startswith("frontend/src/__tests__/")
        or path in {
            "frontend/src/App.tsx",
            "frontend/src/FullAppShellChrome.tsx",
            "frontend/src/LightApp.tsx",
            "frontend/src/index.css",
            "frontend/src/theme.ts",
        }
    ):
        return "frontend-shell-theme"
    if path.startswith("frontend/"):
        return "frontend-other"
    if path.startswith("docs/") or path.startswith("notes/") or path in {"CHANGELOG.md", "README.md"}:
        return "docs"
    if path.startswith("scripts/"):
        return "scripts-tooling"
    if path.startswith("third_party/"):
        return "third-party-other"
    return "other"


def run_git_status(root: Path, untracked_files: str) -> list[StatusEntry]:
    raw = subprocess.check_output(
        ["git", "status", "--porcelain=v1", "-z", f"--untracked-files={untracked_files}"],
        cwd=root,
    ).decode("utf-8", "surrogateescape")
    records = raw.split("\0")
    entries: list[StatusEntry] = []
    index = 0
    while index < len(records):
        record = records[index]
        index += 1
        if not record:
            continue
        code = record[:2]
        path = record[3:]
        if not path:
            continue
        entries.append(StatusEntry(code=code, path=path))
        if code[0] in {"R", "C"} or code[1] in {"R", "C"}:
            index += 1
    return entries


def run_git_diff(root: Path, base: str, head: str) -> list[StatusEntry]:
    raw = subprocess.check_output(
        ["git", "diff", "--name-status", "-z", "--find-renames", base, head],
        cwd=root,
    ).decode("utf-8", "surrogateescape")
    records = [record for record in raw.split("\0") if record]
    entries: list[StatusEntry] = []
    index = 0
    while index < len(records):
        status = records[index]
        index += 1
        if not status:
            continue
        status_type = status[0]
        if status_type in {"R", "C"}:
            if index + 1 >= len(records):
                break
            old_path = records[index]
            index += 1
            new_path = records[index]
            index += 1
            entries.append(StatusEntry(f" {status_type}", old_path))
            entries.append(StatusEntry(f" {status_type}", new_path))
            continue
        else:
            if index >= len(records):
                break
            path = records[index]
            index += 1
        entries.append(StatusEntry(f" {status_type}", path))
    return entries


def byte_size(root: Path, path: str) -> int | None:
    candidate = root / path
    if not candidate.is_file():
        return None
    try:
        return candidate.stat().st_size
    except OSError:
        return None


def format_size(size: int | None) -> str:
    if size is None:
        return "n/a"
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KiB"
    return f"{size / 1024 / 1024:.1f} MiB"


def is_root_artifact_candidate(entry: StatusEntry, root: Path) -> bool:
    if "/" in entry.path:
        return False
    if not entry.is_untracked and entry.code.strip() != "A":
        return False
    suffix = Path(entry.path).suffix.lower()
    if suffix in ROOT_ARTIFACT_SUFFIXES:
        return True
    if entry.path in ROOT_ARTIFACT_NAMES:
        return True
    return byte_size(root, entry.path) == 0


def summarize(
    entries: Iterable[StatusEntry],
    root: Path,
    *,
    source: dict | None = None,
    command_scope_args: list[str] | None = None,
) -> dict:
    entry_list = list(entries)
    untracked = [entry for entry in entry_list if entry.is_untracked]
    deleted = [entry for entry in entry_list if entry.is_deleted]
    tracked = [entry for entry in entry_list if not entry.is_untracked]
    dependency_scope = [entry for entry in entry_list if is_dependency_scope_entry(entry, root, source)]
    root_artifacts = [entry for entry in entry_list if is_root_artifact_candidate(entry, root)]

    untracked_by_group = Counter(entry.top_level for entry in untracked)
    tracked_by_group = Counter(entry.top_level for entry in tracked)
    release_unit_entries: dict[str, list[StatusEntry]] = defaultdict(list)
    for entry in entry_list:
        release_unit_entries[release_unit_for(entry.path)].append(entry)

    dependency_metadata_paths = {entry.path for entry in dependency_scope if entry.path in DEPENDENCY_METADATA}
    license_paths = {entry.path for entry in dependency_scope if entry.path.startswith(LICENSE_PREFIX)}
    dependency_metadata_touched = bool(dependency_metadata_paths)
    licenses_touched = bool(license_paths)
    dependency_scope_warning = ""
    dependency_scope_warnings: list[str] = []
    if dependency_metadata_touched and not licenses_touched:
        dependency_scope_warnings.append("Dependency metadata changed without a license snapshot change.")
    elif licenses_touched and not dependency_metadata_touched:
        dependency_scope_warnings.append("License snapshots changed without dependency metadata in the same status set.")

    missing_notice_unit_paths: list[str] = []
    if dependency_scope:
        missing_notice_unit_paths = sorted(DEPENDENCY_NOTICE_UNIT - dependency_metadata_paths)
    dependency_notice_unit_complete = not dependency_scope or (
        not missing_notice_unit_paths and licenses_touched
    )
    if dependency_scope and missing_notice_unit_paths:
        dependency_scope_warnings.append(
            "Dependency notice unit is missing metadata path(s): "
            + ", ".join(missing_notice_unit_paths)
        )
    if dependency_scope and not licenses_touched:
        dependency_scope_warnings.append("Dependency notice unit is missing generated license snapshots.")
    if dependency_scope_warnings:
        dependency_scope_warning = dependency_scope_warnings[0]

    return {
        "counts": {
            "tracked_changes_including_deleted": len(tracked),
            "deleted": len(deleted),
            "untracked": len(untracked),
            "total_status_entries": len(entry_list),
        },
        "untracked_by_group": dict(sorted(untracked_by_group.items())),
        "tracked_by_group": dict(sorted(tracked_by_group.items())),
        "dependency_scope": [
            {"status": entry.code, "path": entry.path} for entry in sorted(dependency_scope, key=lambda item: item.path)
        ],
        "dependency_notice_unit_complete": dependency_notice_unit_complete,
        "dependency_notice_unit_missing_metadata": missing_notice_unit_paths,
        "dependency_scope_warning": dependency_scope_warning,
        "dependency_scope_warnings": dependency_scope_warnings,
        "release_units": build_release_units(release_unit_entries, command_scope_args=command_scope_args),
        "root_artifact_candidates": [
            {
                "status": entry.code,
                "path": entry.path,
                "size": byte_size(root, entry.path),
                "size_human": format_size(byte_size(root, entry.path)),
            }
            for entry in sorted(root_artifacts, key=lambda item: item.path)
        ],
        "source": source or {"mode": "git-status"},
    }


def build_release_units(
    release_unit_entries: dict[str, list[StatusEntry]], *, command_scope_args: list[str] | None = None
) -> list[dict]:
    def unit_sort_key(unit: str) -> tuple[int, str]:
        try:
            return (RELEASE_UNIT_ORDER.index(unit), unit)
        except ValueError:
            return (len(RELEASE_UNIT_ORDER), unit)

    units: list[dict] = []
    for unit in sorted(release_unit_entries, key=unit_sort_key):
        entries = sorted(release_unit_entries[unit], key=lambda item: item.path)
        units.append(
            {
                "unit": unit,
                "count": len(entries),
                "tracked": sum(1 for entry in entries if not entry.is_untracked),
                "untracked": sum(1 for entry in entries if entry.is_untracked),
                "untracked_directories": sum(1 for entry in entries if entry.is_untracked_directory),
                "untracked_directory_paths": [entry.path for entry in entries if entry.is_untracked_directory],
                "deleted": sum(1 for entry in entries if entry.is_deleted),
                "paths": [{"status": entry.code, "path": entry.path} for entry in entries],
                "sample_paths": [entry.path for entry in entries[:8]],
                "review_command": review_command(unit, scope_args=command_scope_args),
                "manifest_command": manifest_command(unit, scope_args=command_scope_args),
                "path_list_command": path_list_command(unit, scope_args=command_scope_args),
                "stage_command": stage_command(unit, scope_args=command_scope_args),
                "guidance": RELEASE_UNIT_GUIDANCE.get(unit, "Review this group explicitly."),
            }
        )
    return units


def find_release_unit(summary: dict, unit_name: str) -> dict | None:
    for unit in summary["release_units"]:
        if unit["unit"] == unit_name:
            return unit
    return None


def print_markdown(summary: dict) -> None:
    counts = summary["counts"]
    source = summary.get("source", {"mode": "git-status"})
    print("# Release Scope Inventory")
    print()
    print("## Status")
    print()
    if source.get("mode") == "git-diff":
        print(f"- Source: `git diff --name-status --find-renames {source['base']} {source['head']}`")
    else:
        print("- Source: `git status --porcelain=v1`")
    print(f"- Tracked changes including deleted: `{counts['tracked_changes_including_deleted']}`")
    print(f"- Deleted tracked paths: `{counts['deleted']}`")
    print(f"- Untracked paths: `{counts['untracked']}`")
    print(f"- Total status entries: `{counts['total_status_entries']}`")
    print()

    print("## Dependency And License Scope")
    print()
    dependency_scope = summary["dependency_scope"]
    if dependency_scope:
        for item in dependency_scope:
            print(f"- `{item['status']}` `{item['path']}`")
    else:
        print("- No dependency metadata or generated license snapshot changes detected.")
    if summary["dependency_scope_warning"]:
        print()
        print(f"Warning: {summary['dependency_scope_warning']}")
    if dependency_scope:
        status = "complete" if summary["dependency_notice_unit_complete"] else "incomplete"
        print()
        print(f"Dependency notice unit: `{status}`")
    print()

    print("## Root Artifact Candidates")
    print()
    root_artifacts = summary["root_artifact_candidates"]
    if root_artifacts:
        for item in root_artifacts:
            print(f"- `{item['path']}` ({item['size_human']})")
    else:
        print("- No untracked root evidence/artifact candidates detected.")
    print()

    print("## Untracked By Top-Level Group")
    print()
    for group, count in summary["untracked_by_group"].items():
        print(f"- `{group}`: `{count}`")
    print()

    print("## Tracked Changes By Top-Level Group")
    print()
    for group, count in summary["tracked_by_group"].items():
        print(f"- `{group}`: `{count}`")
    print()

    print("## Release Unit Candidates")
    print()
    for unit in summary["release_units"]:
        print(
            f"- `{unit['unit']}`: `{unit['count']}` paths "
            f"(`tracked={unit['tracked']}`, `untracked={unit['untracked']}`, `deleted={unit['deleted']}`)"
        )
        print(f"  - {unit['guidance']}")
        if unit["untracked_directories"]:
            print(
                "  - File-level review: "
                f"`{unit['manifest_command']}`"
            )
    print()

    print("## Suggested Next Actions")
    print()
    print("- Keep dependency metadata, `THIRD_PARTY_NOTICES.md`, and `third_party/licenses/` changes in one release review unit.")
    print("- If root artifact candidates appear, move intentional evidence under `docs/release/evidence/` or keep disposable local outputs ignored.")
    print("- Stage source, tests, docs, workflow, and chart changes by feature boundary instead of staging the whole worktree.")
    print("- Generate a repeatable staging checklist with `python3 scripts/report_release_scope.py --format checklist`.")
    print("- Inspect a specific unit with `python3 scripts/report_release_scope.py --unit <unit>`.")
    print("- Generate a staging-friendly path list with `python3 scripts/report_release_scope.py --unit <unit> --format paths --null --untracked-files all`.")
    print("- Print a unit staging command with `python3 scripts/report_release_scope.py --unit <unit> --format stage-command`.")
    print("- Re-run `./scripts/check.sh full` after scope selection and before clean-runner verification.")


def print_unit_markdown(unit: dict) -> None:
    print(f"# Release Unit: {unit['unit']}")
    print()
    print(f"- Paths: `{unit['count']}`")
    print(f"- Tracked: `{unit['tracked']}`")
    print(f"- Untracked: `{unit['untracked']}`")
    if unit["untracked_directories"]:
        print(f"- Untracked directory entries: `{unit['untracked_directories']}`")
        print(
            "- File-level review: "
            f"`python3 scripts/report_release_scope.py --unit {unit['unit']} --format manifest --untracked-files all`"
        )
    print(f"- Deleted: `{unit['deleted']}`")
    print(f"- Guidance: {unit['guidance']}")
    print(f"- Path list: `{unit['path_list_command']}`")
    print(f"- Stage command: `{unit['stage_command']}`")
    print()
    print("## Paths")
    print()
    for item in unit["paths"]:
        print(f"- `{item['status']}` `{item['path']}`")


def print_checklist(summary: dict) -> None:
    counts = summary["counts"]
    print("# Release Scope Staging Checklist")
    print()
    print("## Status")
    print()
    print(f"- Tracked changes including deleted: `{counts['tracked_changes_including_deleted']}`")
    print(f"- Deleted tracked paths: `{counts['deleted']}`")
    print(f"- Untracked paths: `{counts['untracked']}`")
    print(f"- Total status entries: `{counts['total_status_entries']}`")
    print()
    print("## Preflight")
    print()
    print("- [ ] Keep dependency metadata, notices, and generated license snapshots in one review/staging unit.")
    print("- [ ] Keep provider-facing backend/API changes paired with provider live validation evidence.")
    print("- [ ] Keep reverse-proxy/auth/download-proxy changes paired with reverse-proxy smoke evidence.")
    print("- [ ] Re-run `./scripts/check.sh full` after selecting the staged release scope.")
    print("- [ ] Re-run `python3 scripts/check_clean_snapshot.py full` from the final candidate scope.")
    print()
    print("## Release Units")
    print()
    for unit in summary["release_units"]:
        print(
            f"- [ ] `{unit['unit']}`: `{unit['count']}` paths "
            f"(`tracked={unit['tracked']}`, `untracked={unit['untracked']}`, `deleted={unit['deleted']}`)"
        )
        print(f"  - Guidance: {unit['guidance']}")
        if unit["untracked_directories"]:
            print(f"  - Untracked directory entries: `{unit['untracked_directories']}`")
            print(
                "  - File-level review: "
                f"`{unit['manifest_command']}`"
            )
        print(f"  - Review: `{unit['review_command']}`")
        print(f"  - Path list: `{unit['path_list_command']}`")
        print(f"  - Stage command: `{unit['stage_command']}`")


def print_manifest(summary: dict) -> None:
    counts = summary["counts"]
    print("# Release Scope Review Manifest")
    print()
    print("Use this manifest for manual review before staging. It intentionally does not stage, delete, or mutate files.")
    print()
    print("## Status")
    print()
    print(f"- Tracked changes including deleted: `{counts['tracked_changes_including_deleted']}`")
    print(f"- Deleted tracked paths: `{counts['deleted']}`")
    print(f"- Untracked paths: `{counts['untracked']}`")
    print(f"- Total status entries: `{counts['total_status_entries']}`")
    print()
    print("## Review Units")
    print()
    for unit in summary["release_units"]:
        print(f"### {unit['unit']}")
        print()
        print(f"- Paths: `{unit['count']}`")
        print(f"- Tracked: `{unit['tracked']}`")
        print(f"- Untracked: `{unit['untracked']}`")
        if unit["untracked_directories"]:
            print(f"- Untracked directory entries: `{unit['untracked_directories']}`")
            print(
                "- File-level review: "
                f"`{unit['manifest_command']}`"
            )
        print(f"- Deleted: `{unit['deleted']}`")
        print(f"- Guidance: {unit['guidance']}")
        print(f"- Path list: `{unit['path_list_command']}`")
        print(f"- Stage command: `{unit['stage_command']}`")
        print()
        for item in unit["paths"]:
            print(f"- [ ] `{item['status']}` `{item['path']}`")
        print()


def print_paths(unit: dict, null_terminated: bool) -> None:
    separator = "\0" if null_terminated else "\n"
    output = separator.join(item["path"] for item in unit["paths"])
    if output:
        print(output, end=separator)


def review_command(unit_name: str, scope_args: list[str] | None = None) -> str:
    parts = [
        "python3",
        "scripts/report_release_scope.py",
        *(scope_args or []),
        "--unit",
        unit_name,
    ]
    return " ".join(shlex.quote(part) for part in parts)


def manifest_command(
    unit_name: str,
    untracked_files: str = "all",
    scope_args: list[str] | None = None,
) -> str:
    parts = [
        "python3",
        "scripts/report_release_scope.py",
        *(scope_args or []),
        "--unit",
        unit_name,
        "--format",
        "manifest",
    ]
    if not scope_args:
        parts.extend(["--untracked-files", untracked_files])
    return " ".join(shlex.quote(part) for part in parts)


def path_list_command(
    unit_name: str,
    untracked_files: str = "all",
    scope_args: list[str] | None = None,
) -> str:
    parts = [
        "python3",
        "scripts/report_release_scope.py",
        *(scope_args or []),
        "--unit",
        unit_name,
        "--format",
        "paths",
        "--null",
    ]
    if not scope_args:
        parts.extend(["--untracked-files", untracked_files])
    return " ".join(shlex.quote(part) for part in parts)


def stage_command(unit_name: str, scope_args: list[str] | None = None) -> str:
    return f"{path_list_command(unit_name, scope_args=scope_args)} | git add --pathspec-from-file=- --pathspec-file-nul"


def collect_failures(
    summary: dict,
    fail_on_root_artifacts: bool,
    fail_on_dependency_scope_warning: bool,
    fail_on_untracked_directories: bool = False,
    fail_on_other_unit: bool = False,
) -> list[str]:
    failures: list[str] = []
    if fail_on_root_artifacts and summary["root_artifact_candidates"]:
        failures.append(
            f"{len(summary['root_artifact_candidates'])} root artifact candidate(s) are still untracked."
        )
    if fail_on_dependency_scope_warning and summary["dependency_scope_warning"]:
        failures.extend(summary["dependency_scope_warnings"])
    if fail_on_untracked_directories:
        units = [unit for unit in summary["release_units"] if unit["untracked_directories"]]
        if units:
            unit_summary = ", ".join(
                f"{unit['unit']} ({unit['untracked_directories']})" for unit in units
            )
            failures.append(
                "Untracked directory entries need file-level review with "
                f"`--untracked-files all`: {unit_summary}."
            )
    if fail_on_other_unit:
        other_unit = find_release_unit(summary, "other")
        if other_unit is not None and other_unit["count"]:
            sample = ", ".join(f"`{item['path']}`" for item in other_unit["paths"][:5])
            suffix = f": {sample}" if sample else ""
            failures.append(
                f"{other_unit['count']} uncategorized release scope path(s) remain in `other`{suffix}."
            )
    return failures


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Report release-scope risks from git status or an explicit git diff.")
    parser.add_argument(
        "--base",
        default="",
        help="Use git diff --name-status between this base ref and --head instead of dirty git status.",
    )
    parser.add_argument(
        "--head",
        default="HEAD",
        help="Head ref for --base diff mode. Defaults to HEAD.",
    )
    parser.add_argument(
        "--format",
        choices=("markdown", "json", "paths", "checklist", "manifest", "stage-command"),
        default="markdown",
        help="Output format.",
    )
    parser.add_argument(
        "--unit",
        default="",
        help="Limit output to one release unit, for example frontend-objects or dependency-notices.",
    )
    parser.add_argument(
        "-z",
        "--null",
        action="store_true",
        help="Use NUL separators with --format paths.",
    )
    parser.add_argument(
        "--untracked-files",
        choices=("normal", "all"),
        default="normal",
        help="Match git status untracked-file expansion. Use 'all' for file-level inventory inside untracked directories.",
    )
    parser.add_argument(
        "--fail-on-root-artifacts",
        action="store_true",
        help="Exit non-zero when untracked root evidence/artifact candidates are present.",
    )
    parser.add_argument(
        "--fail-on-dependency-scope-warning",
        action="store_true",
        help="Exit non-zero when dependency metadata and generated license snapshots appear split.",
    )
    parser.add_argument(
        "--fail-on-untracked-directories",
        action="store_true",
        help="Exit non-zero when untracked directory entries are collapsed instead of file-level expanded.",
    )
    parser.add_argument(
        "--fail-on-other-unit",
        action="store_true",
        help="Exit non-zero when release-scope paths are still classified in the catch-all other unit.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.head != "HEAD" and not args.base:
        print("[release-scope] --head requires --base", file=sys.stderr)
        return 2
    if args.format in {"paths", "stage-command"} and not args.unit:
        print(f"[release-scope] --format {args.format} requires --unit", file=sys.stderr)
        return 2

    if args.base:
        command_scope_args = ["--base", args.base, "--head", args.head]
        summary = summarize(
            run_git_diff(ROOT, args.base, args.head),
            ROOT,
            source={"mode": "git-diff", "base": args.base, "head": args.head},
            command_scope_args=command_scope_args,
        )
    else:
        summary = summarize(run_git_status(ROOT, args.untracked_files), ROOT)

    selected_unit = None
    if args.unit:
        selected_unit = find_release_unit(summary, args.unit)
        if selected_unit is None:
            available = ", ".join(unit["unit"] for unit in summary["release_units"])
            print(f"[release-scope] unknown or empty release unit: {args.unit}", file=sys.stderr)
            print(f"[release-scope] available units: {available}", file=sys.stderr)
            return 2

    if args.format == "json":
        payload = selected_unit if selected_unit is not None else summary
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "paths":
        assert selected_unit is not None
        print_paths(selected_unit, null_terminated=args.null)
    elif args.format == "stage-command":
        assert selected_unit is not None
        print(selected_unit["stage_command"])
    elif args.format == "checklist":
        if selected_unit is not None:
            print_checklist({"counts": summary["counts"], "release_units": [selected_unit]})
        else:
            print_checklist(summary)
    elif args.format == "manifest":
        if selected_unit is not None:
            print_manifest({"counts": summary["counts"], "release_units": [selected_unit]})
        else:
            print_manifest(summary)
    elif selected_unit is not None:
        print_unit_markdown(selected_unit)
    else:
        print_markdown(summary)

    failures = collect_failures(
        summary,
        fail_on_root_artifacts=args.fail_on_root_artifacts,
        fail_on_dependency_scope_warning=args.fail_on_dependency_scope_warning,
        fail_on_untracked_directories=args.fail_on_untracked_directories,
        fail_on_other_unit=args.fail_on_other_unit,
    )
    if failures:
        for failure in failures:
            print(f"[release-scope] {failure}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
