#!/usr/bin/env python3
"""Validate GitHub Actions workflow YAML structure.

This is not a full replacement for actionlint. It provides a local, dependency-light
syntax and shape check so workflow edits fail fast even when actionlint is not
available in the environment.
"""

from __future__ import annotations

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
