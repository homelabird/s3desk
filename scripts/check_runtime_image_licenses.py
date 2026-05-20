#!/usr/bin/env python3
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import tarfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ApkPackage:
    image: str
    name: str
    version: str
    license: str


def split_semicolon(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(";") if item.strip()]


def normalize_tar_path(raw: str) -> str:
    path = raw.lstrip("/")
    while path.startswith("./"):
        path = path[2:]
    return path


def split_license_expression(raw: str) -> list[str]:
    normalized = raw.replace("(", " ").replace(")", " ")
    return [
        item.strip()
        for item in re.split(r"\s+(?:AND|OR|WITH)\s+|\s*;\s*|\s*,\s*", normalized, flags=re.IGNORECASE)
        if item.strip()
    ]


def parse_apk_installed(text: str, image: str) -> list[ApkPackage]:
    packages: list[ApkPackage] = []
    for block in re.split(r"\n\s*\n", text.strip()):
        fields: dict[str, str] = {}
        for line in block.splitlines():
            if len(line) >= 2 and line[1] == ":":
                fields[line[0]] = line[2:].strip()
        name = fields.get("P", "")
        if not name:
            continue
        packages.append(
            ApkPackage(
                image=image,
                name=name,
                version=fields.get("V", ""),
                license=fields.get("L", ""),
            )
        )
    packages.sort(key=lambda item: (item.image, item.name, item.version))
    return packages


def read_docker_archive_apk_db(path: Path) -> str:
    apk_db = ""
    with tarfile.open(path, "r:*") as outer:
        manifest_member = outer.getmember("manifest.json")
        manifest_file = outer.extractfile(manifest_member)
        if manifest_file is None:
            raise ValueError(f"{path} has no readable manifest.json")
        manifest = json.loads(manifest_file.read().decode("utf-8"))
        if not manifest:
            raise ValueError(f"{path} has an empty manifest.json")
        for layer_name in manifest[0].get("Layers", []):
            layer_member = outer.getmember(layer_name)
            layer_file = outer.extractfile(layer_member)
            if layer_file is None:
                continue
            layer_bytes = layer_file.read()
            with tarfile.open(fileobj=io.BytesIO(layer_bytes), mode="r:*") as layer:
                for member in layer.getmembers():
                    member_path = normalize_tar_path(member.name)
                    if member_path == "lib/apk/db/.wh.installed":
                        apk_db = ""
                        continue
                    if member_path != "lib/apk/db/installed" or not member.isfile():
                        continue
                    installed_file = layer.extractfile(member)
                    if installed_file is None:
                        continue
                    apk_db = installed_file.read().decode("utf-8", errors="replace")
    return apk_db


def packages_from_archives(paths: list[Path]) -> list[ApkPackage]:
    packages: list[ApkPackage] = []
    for path in paths:
        apk_db = read_docker_archive_apk_db(path)
        if not apk_db:
            raise ValueError(f"{path} does not contain lib/apk/db/installed")
        packages.extend(parse_apk_installed(apk_db, path.name))
    return packages


def evaluate_packages(
    packages: list[ApkPackage],
    allowed_licenses: set[str],
    blocked_pattern: str,
) -> tuple[list[str], list[str], list[str]]:
    blocked_re = re.compile(blocked_pattern, re.IGNORECASE) if blocked_pattern else None
    blocked: list[str] = []
    unknown: list[str] = []
    disallowed: list[str] = []

    for package in packages:
        licenses = split_license_expression(package.license)
        label = f"{package.image}:{package.name}@{package.version} :: {package.license or 'Unknown'}"
        if not licenses or any(item.lower() == "unknown" for item in licenses):
            unknown.append(label)
            continue
        if blocked_re is not None and any(blocked_re.search(item) for item in licenses):
            blocked.append(label)
            continue
        bad = [item for item in licenses if item not in allowed_licenses]
        if bad:
            disallowed.append(label)

    return blocked, unknown, disallowed


def write_lines(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check Alpine APK package licenses from Docker archive image tar files.")
    parser.add_argument("--image-tar", action="append", default=[], type=Path)
    parser.add_argument("--allowed-licenses", required=True)
    parser.add_argument("--blocked-re", default="")
    parser.add_argument("--packages-out", required=True, type=Path)
    parser.add_argument("--blocked-out", required=True, type=Path)
    parser.add_argument("--unknown-out", required=True, type=Path)
    parser.add_argument("--disallowed-out", required=True, type=Path)
    args = parser.parse_args(argv)

    packages = packages_from_archives(args.image_tar)
    package_lines = [
        f"{package.image},{package.name},{package.version},{package.license or 'Unknown'}"
        for package in packages
    ]
    blocked, unknown, disallowed = evaluate_packages(
        packages,
        set(split_semicolon(args.allowed_licenses)),
        args.blocked_re,
    )
    write_lines(args.packages_out, package_lines)
    write_lines(args.blocked_out, blocked)
    write_lines(args.unknown_out, unknown)
    write_lines(args.disallowed_out, disallowed)
    if blocked or unknown or disallowed:
        for label, rows in (("blocked", blocked), ("unknown", unknown), ("disallowed", disallowed)):
            for row in rows:
                print(f"[runtime-image-license:{label}] {row}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
