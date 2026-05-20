#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from typing import Any


def parse_required_checks(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def parse_time(value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip():
        return datetime.min.replace(tzinfo=timezone.utc)
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def run_sort_key(run: dict[str, Any]) -> tuple[datetime, datetime, int]:
    started_or_created = max(parse_time(run.get("started_at")), parse_time(run.get("created_at")))
    updated_or_completed = max(parse_time(run.get("completed_at")), parse_time(run.get("updated_at")))
    try:
        run_id = int(run.get("id") or 0)
    except (TypeError, ValueError):
        run_id = 0
    return started_or_created, updated_or_completed, run_id


def check_state(run: dict[str, Any]) -> str:
    return str(run.get("conclusion") or run.get("status") or "missing")


def latest_check_states(payload: dict[str, Any]) -> dict[str, str]:
    latest: dict[str, dict[str, Any]] = {}
    for run in payload.get("check_runs", []):
        if not isinstance(run, dict):
            continue
        name = str(run.get("name") or "").strip()
        if not name:
            continue
        current = latest.get(name)
        if current is None or run_sort_key(run) > run_sort_key(current):
            latest[name] = run
    return {name: check_state(run) for name, run in latest.items()}


def evaluate_required_checks(payload: dict[str, Any], required: list[str]) -> tuple[list[str], list[str]]:
    allowed = {"success"}
    states = latest_check_states(payload)
    missing: list[str] = []
    failed: list[str] = []
    for name in required:
        state = states.get(name)
        if state is None:
            missing.append(name)
        elif state not in allowed:
            failed.append(f"{name}={state}")
    return missing, failed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify required GitHub check-runs from API JSON.")
    parser.add_argument("--required-checks", required=True, help="Comma-separated required check names.")
    args = parser.parse_args(argv)

    payload = json.load(sys.stdin)
    missing, failed = evaluate_required_checks(payload, parse_required_checks(args.required_checks))
    if missing:
        print("Missing required checks: " + ", ".join(missing), file=sys.stderr)
    if failed:
        print("Non-passing required checks: " + ", ".join(failed), file=sys.stderr)
    return 1 if missing or failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
