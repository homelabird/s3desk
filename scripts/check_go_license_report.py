#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path


def split_semicolon(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(";") if item.strip()]


def parse_overrides(raw: str) -> dict[str, str]:
    overrides: dict[str, str] = {}
    for item in split_semicolon(raw):
        if "=" not in item:
            continue
        name, license_id = item.split("=", 1)
        name = name.strip()
        license_id = license_id.strip()
        if name and license_id:
            overrides[name] = license_id
    return overrides


def split_license_expression(raw: str) -> list[str]:
    return [
        item.strip()
        for item in re.split(r"\s+OR\s+|\s+AND\s+|\s*;\s*|\s*,\s*", raw, flags=re.IGNORECASE)
        if item.strip()
    ]


def evaluate_report(
    report_text: str,
    allowed_licenses: set[str],
    blocked_pattern: str,
    overrides: dict[str, str],
) -> tuple[list[str], list[str], list[str]]:
    blocked_re = re.compile(blocked_pattern, re.IGNORECASE)
    blocked: list[str] = []
    unknown: list[str] = []
    disallowed: list[str] = []

    for row in csv.reader(report_text.splitlines()):
        if len(row) < 3:
            continue
        package = row[0].strip()
        raw_license = overrides.get(package, row[2].strip())
        licenses = split_license_expression(raw_license)
        if not licenses or any(item.lower() == "unknown" for item in licenses):
            unknown.append(f"{package} :: {raw_license or 'Unknown'}")
            continue
        if any(blocked_re.search(item) for item in licenses):
            blocked.append(f"{package} :: {', '.join(licenses)}")
            continue
        bad = [item for item in licenses if item not in allowed_licenses]
        if bad:
            disallowed.append(f"{package} :: {', '.join(licenses)}")

    return blocked, unknown, disallowed


def write_report(path: Path, rows: list[str]) -> None:
    path.write_text("\n".join(rows) + ("\n" if rows else ""), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check a go-licenses CSV report against an allow-list.")
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--blocked-re", required=True)
    parser.add_argument("--allowed-licenses", required=True)
    parser.add_argument("--overrides", default="")
    parser.add_argument("--blocked-out", required=True, type=Path)
    parser.add_argument("--unknown-out", required=True, type=Path)
    parser.add_argument("--disallowed-out", required=True, type=Path)
    args = parser.parse_args(argv)

    blocked, unknown, disallowed = evaluate_report(
        args.report.read_text(encoding="utf-8"),
        set(split_semicolon(args.allowed_licenses)),
        args.blocked_re,
        parse_overrides(args.overrides),
    )
    write_report(args.blocked_out, blocked)
    write_report(args.unknown_out, unknown)
    write_report(args.disallowed_out, disallowed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
