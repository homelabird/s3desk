#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GITLAB_CI = ROOT / ".gitlab-ci.yml"


def parse_stages(text: str) -> list[str]:
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line == "stages:":
            stages: list[str] = []
            for item in lines[index + 1 :]:
                if not item.startswith("  "):
                    break
                match = re.match(r"^  -\s+(.+?)\s*$", item)
                if match:
                    stages.append(match.group(1).strip().strip("\"'"))
            return stages
    return []


def top_level_blocks(text: str) -> dict[str, str]:
    blocks: dict[str, list[str]] = {}
    current_name: str | None = None
    current_lines: list[str] = []
    top_level_re = re.compile(r"^([A-Za-z0-9_.-]+):(?:\s+&[A-Za-z0-9_-]+)?\s*$")

    for line in text.splitlines():
        match = top_level_re.match(line)
        if match:
            if current_name is not None:
                blocks[current_name] = current_lines
            current_name = match.group(1)
            current_lines = [line]
            continue
        if current_name is not None:
            current_lines.append(line)
    if current_name is not None:
        blocks[current_name] = current_lines
    return {name: "\n".join(lines) for name, lines in blocks.items()}


def job_stage(jobs: dict[str, str], name: str) -> str | None:
    block = jobs.get(name, "")
    match = re.search(r"^  stage:\s*(.+?)\s*$", block, re.MULTILINE)
    if not match:
        return None
    return match.group(1).strip().strip("\"'")


def job_needs(jobs: dict[str, str], name: str) -> list[str]:
    block = jobs.get(name, "")
    lines = block.splitlines()
    needs: list[str] = []
    in_needs = False
    for line in lines:
        if line == "  needs:":
            in_needs = True
            continue
        if in_needs and line and not line.startswith("    "):
            break
        if not in_needs:
            continue
        match = re.match(r"^    -\s+(.+?)\s*$", line)
        if not match:
            continue
        raw = match.group(1).strip()
        if raw.startswith("job:"):
            raw = raw.split(":", 1)[1].strip()
        if raw:
            needs.append(raw.strip("\"'"))
    return needs


def require_stage_order(stages: list[str], earlier: str, later: str, errors: list[str]) -> None:
    try:
        earlier_index = stages.index(earlier)
        later_index = stages.index(later)
    except ValueError:
        errors.append(f"missing required GitLab stage order entry: {earlier} before {later}")
        return
    if earlier_index >= later_index:
        errors.append(f"expected GitLab stage '{earlier}' before '{later}'")


def validate_publish_dag(text: str) -> list[str]:
    stages = parse_stages(text)
    jobs = top_level_blocks(text)
    errors: list[str] = []

    for stage in ("publish", "post-publish", "chart-publish", "deploy"):
        if stage not in stages:
            errors.append(f"missing GitLab stage '{stage}'")
    require_stage_order(stages, "publish", "post-publish", errors)
    require_stage_order(stages, "post-publish", "chart-publish", errors)
    require_stage_order(stages, "chart-publish", "deploy", errors)

    expected_stages = {
        "publish_dockerhub": "publish",
        "release_image_smoke": "post-publish",
        "publish_helm_chart": "chart-publish",
        "deploy_release_helm": "deploy",
    }
    for job, expected in expected_stages.items():
        actual = job_stage(jobs, job)
        if actual != expected:
            errors.append(f"expected {job} stage '{expected}', got '{actual or 'missing'}'")

    expected_needs = {
        "release_image_smoke": {"publish_dockerhub"},
        "publish_helm_chart": {"publish_dockerhub", "release_image_smoke"},
        "deploy_release_helm": {"publish_helm_chart", "release_image_smoke"},
    }
    for job, required in expected_needs.items():
        actual = set(job_needs(jobs, job))
        missing = sorted(required - actual)
        if missing:
            errors.append(f"expected {job} needs to include: {', '.join(missing)}")

    return errors


def main() -> int:
    errors = validate_publish_dag(GITLAB_CI.read_text(encoding="utf-8"))
    if errors:
        for error in errors:
            print(f"[gitlab-publish-dag] {error}", file=sys.stderr)
        return 1
    print("[gitlab-publish-dag] ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
