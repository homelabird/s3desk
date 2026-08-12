#!/usr/bin/env python3
"""Validate GitHub Actions workflow YAML structure.

This is not a full replacement for actionlint. It provides a local, dependency-light
syntax and shape check so workflow edits fail fast even when actionlint is not
available in the environment.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NoReturn

try:
    import yaml
except ModuleNotFoundError as exc:
    if exc.name == "yaml":
        print(
            "[workflow-check] PyYAML is not installed; install it with `python3 -m pip install PyYAML` "
            "or the OS package `python3-yaml`.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    raise


ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = ROOT / ".github" / "workflows"
REQUIRED_CANCEL_IN_PROGRESS_WORKFLOWS = {
    "frontend-e2e.yml": "frontend-e2e-",
    "release-gate.yml": "release-gate-",
    "license-audit.yml": "license-audit-",
}
REQUIRED_FRONTEND_E2E_BROWSER_FACING_PATHS = {
    "backend/go.mod",
    "backend/go.sum",
    "backend/internal/**",
}
DEPRECATED_ACTION_REFS = {
    "actions/checkout@v4": "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
    "actions/setup-go@v5": "actions/setup-go@924ae3a1cded613372ab5595356fb5720e22ba16",
    "actions/setup-node@v4": "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
    "actions/upload-artifact@v4": "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    "azure/setup-helm@v4": "azure/setup-helm@9bc31f4ebc9c6b171d7bfbaa5d006ae7abdb4310",
    "dorny/paths-filter@v3": "dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d",
}
IMMUTABLE_ACTION_REF = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[0-9a-f]{40}$")


class WorkflowLoader(yaml.BaseLoader):
    """A YAML loader that keeps scalars as strings and rejects duplicate keys."""


def _construct_mapping(loader: WorkflowLoader, node: yaml.nodes.MappingNode, deep: bool = False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            mark = key_node.start_mark
            raise ValueError(
                f"duplicate key {key!r} at line {mark.line + 1}, column {mark.column + 1}"
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


WorkflowLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_mapping,
)


def fail(message: str) -> NoReturn:
    print(f"[workflow-check] {message}", file=sys.stderr)
    raise SystemExit(1)


def load_workflow(path: Path):
    try:
        with path.open("r", encoding="utf-8") as handle:
            return yaml.load(handle, Loader=WorkflowLoader)
    except yaml.YAMLError as exc:
        fail(f"{path}: yaml parse error: {exc}")
    except ValueError as exc:
        fail(f"{path}: {exc}")


def require_mapping(value, context: str):
    if not isinstance(value, dict):
        fail(f"{context} must be a mapping")


def require_sequence(value, context: str):
    if not isinstance(value, list):
        fail(f"{context} must be a sequence")


def validate_step(path: Path, job_id: str, step_index: int, step):
    context = f"{path}: jobs.{job_id}.steps[{step_index}]"
    require_mapping(step, context)
    if "run" not in step and "uses" not in step:
        fail(f"{context} must define either 'run' or 'uses'")
    uses = step.get("uses")
    if isinstance(uses, str):
        replacement = DEPRECATED_ACTION_REFS.get(uses.strip().lower())
        if replacement:
            fail(f"{context}.uses uses deprecated action ref {uses!r}; use {replacement!r}")
        if not IMMUTABLE_ACTION_REF.fullmatch(uses.strip()):
            fail(
                f"{context}.uses must pin an external GitHub Action to a 40-character commit SHA; "
                f"got {uses!r}"
            )


def validate_job(path: Path, job_id: str, job):
    context = f"{path}: jobs.{job_id}"
    require_mapping(job, context)
    if "uses" not in job and "steps" not in job:
        fail(f"{context} must define either 'uses' or 'steps'")
    if "steps" in job:
        require_sequence(job["steps"], f"{context}.steps")
        if not job["steps"]:
            fail(f"{context}.steps must not be empty")
        for index, step in enumerate(job["steps"], start=1):
            validate_step(path, job_id, index, step)


def validate_required_concurrency(path: Path, workflow):
    group_prefix = REQUIRED_CANCEL_IN_PROGRESS_WORKFLOWS.get(path.name)
    if not group_prefix:
        return
    context = f"{path}: concurrency"
    if "concurrency" not in workflow:
        fail(f"{path}: missing top-level 'concurrency' key")
    concurrency = workflow["concurrency"]
    require_mapping(concurrency, context)
    group = concurrency.get("group")
    if not isinstance(group, str) or not group.startswith(group_prefix):
        fail(f"{context}.group must start with {group_prefix!r}")
    if concurrency.get("cancel-in-progress") != "true":
        fail(f"{context}.cancel-in-progress must be true")


def validate_frontend_e2e_browser_facing_scope(path: Path, workflow):
    if path.name != "frontend-e2e.yml":
        return
    steps = workflow.get("jobs", {}).get("changes", {}).get("steps", [])
    filters = ""
    for step in steps:
        if isinstance(step, dict) and step.get("id") == "filter":
            with_config = step.get("with", {})
            if isinstance(with_config, dict):
                filters = with_config.get("filters", "")
            break
    if not isinstance(filters, str) or "browser_facing:" not in filters:
        fail(f"{path}: changes filter must define a browser_facing scope")
    missing = sorted(
        required for required in REQUIRED_FRONTEND_E2E_BROWSER_FACING_PATHS if required not in filters
    )
    if missing:
        fail(f"{path}: browser_facing filter missing required backend scope(s): {', '.join(missing)}")


def validate_workflow(path: Path):
    workflow = load_workflow(path)
    require_mapping(workflow, f"{path}")

    for key in ("name", "on", "jobs"):
        if key not in workflow:
            fail(f"{path}: missing top-level '{key}' key")

    name = workflow["name"]
    if not isinstance(name, str) or not name.strip():
        fail(f"{path}: top-level 'name' must be a non-empty string")

    jobs = workflow["jobs"]
    require_mapping(jobs, f"{path}: jobs")
    if not jobs:
        fail(f"{path}: jobs must not be empty")

    for job_id, job in jobs.items():
        if not isinstance(job_id, str) or not job_id.strip():
            fail(f"{path}: job ids must be non-empty strings")
        validate_job(path, job_id, job)
    validate_required_concurrency(path, workflow)
    validate_frontend_e2e_browser_facing_scope(path, workflow)


def main() -> int:
    if not WORKFLOWS_DIR.is_dir():
        fail(f"{WORKFLOWS_DIR} not found")

    workflow_paths = sorted(WORKFLOWS_DIR.glob("*.yml"))
    if not workflow_paths:
        fail(f"no workflow files found in {WORKFLOWS_DIR}")

    for workflow_path in workflow_paths:
        validate_workflow(workflow_path)

    print(f"[workflow-check] ok ({len(workflow_paths)} workflows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
