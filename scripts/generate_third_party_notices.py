#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIR = REPO_ROOT / "frontend"
FRONTEND_LOCK = REPO_ROOT / "frontend" / "package-lock.json"
OUTPUT = REPO_ROOT / "THIRD_PARTY_NOTICES.md"
LICENSES_DIR = REPO_ROOT / "third_party" / "licenses"
GO_LICENSES_DIR = LICENSES_DIR / "go"
NPM_LICENSES_DIR = LICENSES_DIR / "npm"
EXTERNAL_LICENSES_DIR = LICENSES_DIR / "external"
MANUAL_LICENSES_DIR = REPO_ROOT / "third_party" / "licenses-manual"
MANUAL_GO_LICENSES_DIR = MANUAL_LICENSES_DIR / "go"
MANUAL_NPM_LICENSES_DIR = MANUAL_LICENSES_DIR / "npm"
MANUAL_EXTERNAL_LICENSES_DIR = MANUAL_LICENSES_DIR / "external"
RCLONE_LICENSE_URL = "https://raw.githubusercontent.com/rclone/rclone/master/COPYING"

LICENSE_RE = re.compile(r"^(licen[sc]e|copying|notice)(\..*)?$", re.I)

LICENSE_PATTERNS = {
    "Apache-2.0": re.compile(r"Apache License\s*Version\s*2", re.I),
    "MPL-2.0": re.compile(r"Mozilla Public License\s*Version\s*2", re.I),
    "GPL-3.0": re.compile(r"GNU GENERAL PUBLIC LICENSE\s*Version\s*3", re.I),
    "GPL-2.0": re.compile(r"GNU GENERAL PUBLIC LICENSE\s*Version\s*2", re.I),
    "LGPL": re.compile(r"GNU LESSER GENERAL PUBLIC LICENSE", re.I),
    "ISC": re.compile(r"ISC License", re.I),
    "0BSD": re.compile(r"BSD Zero Clause License", re.I),
    "CC-BY-4.0": re.compile(r"Creative Commons Attribution 4\.0", re.I),
}

MIT_PHRASE = re.compile(r"Permission is hereby granted, free of charge, to any person obtaining a copy", re.I)
BSD_PHRASE = re.compile(r"Redistribution and use in source and binary forms", re.I)
BSD_NEITHER = re.compile(r"Neither the name of", re.I)


def run(cmd: list[str], cwd: Path | None = None) -> str:
    return subprocess.check_output(cmd, cwd=str(cwd) if cwd else None, text=True)


def parse_go_modules() -> list[dict[str, str]]:
    raw = run(["go", "list", "-m", "-json", "all"], cwd=BACKEND_DIR)
    dec = json.JSONDecoder()
    idx = 0
    modules = []
    while idx < len(raw):
        while idx < len(raw) and raw[idx].isspace():
            idx += 1
        if idx >= len(raw):
            break
        obj, idx = dec.raw_decode(raw, idx)
        modules.append(obj)

    results: list[dict[str, str]] = []
    for mod in modules:
        if mod.get("Main"):
            continue
        name = mod.get("Path")
        version = mod.get("Version")
        if not name or not version:
            continue
        mod_dir = ensure_go_module_dir(name, version, mod.get("Dir"))
        license_file = find_license_file(Path(mod_dir)) if mod_dir else None
        license_id = "UNKNOWN"
        license_name = ""
        if license_file:
            license_name = license_file.name
            license_id = detect_license(license_file)
        results.append(
            {
                "name": name,
                "version": version,
                "license": license_id,
                "license_file": license_name,
                "license_path": str(license_file) if license_file else "",
            }
        )
    results.sort(key=lambda item: (item["name"], item["version"]))
    return results


def ensure_go_module_dir(name: str, version: str, existing: str | None) -> str | None:
    if existing and os.path.isdir(existing):
        return existing
    try:
        data = json.loads(run(["go", "mod", "download", "-json", f"{name}@{version}"], cwd=BACKEND_DIR))
        mod_dir = data.get("Dir")
        if mod_dir and os.path.isdir(mod_dir):
            return mod_dir
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None
    return None


def find_license_file(module_dir: Path) -> Path | None:
    files = [p for p in module_dir.iterdir() if p.is_file() and LICENSE_RE.match(p.name)]
    if not files:
        for entry in module_dir.iterdir():
            if not entry.is_dir():
                continue
            files.extend([p for p in entry.iterdir() if p.is_file() and LICENSE_RE.match(p.name)])
    if not files:
        return None

    def rank(p: Path) -> int:
        lower = p.name.lower()
        if lower.startswith("licen"):
            return 0
        if lower.startswith("copying"):
            return 1
        return 2

    files.sort(key=rank)
    return files[0]


def detect_license(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        text = ""
    for name, pattern in LICENSE_PATTERNS.items():
        if pattern.search(text):
            return name
    if MIT_PHRASE.search(text):
        return "MIT"
    if BSD_PHRASE.search(text):
        return "BSD-3-Clause" if BSD_NEITHER.search(text) else "BSD-2-Clause"
    return "UNKNOWN"


def parse_npm_packages() -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    if not FRONTEND_LOCK.exists():
        return [], []
    data = json.loads(FRONTEND_LOCK.read_text(encoding="utf-8"))
    packages = data.get("packages", {})

    merged: dict[tuple[str, str], dict[str, str]] = {}
    dev_only: dict[tuple[str, str], bool] = {}

    for path, info in packages.items():
        if not path.startswith("node_modules/"):
            continue
        name = info.get("name") or path.replace("node_modules/", "")
        version = info.get("version") or ""
        license_id = normalize_npm_license(info)
        package_dir = FRONTEND_DIR / path
        license_file = find_license_file(package_dir) if package_dir.exists() else None
        key = (name, version)
        if key not in merged:
            merged[key] = {
                "name": name,
                "version": version,
                "license": license_id,
                "license_path": str(license_file) if license_file else "",
            }
            dev_only[key] = bool(info.get("dev", False))
        else:
            if not info.get("dev", False):
                dev_only[key] = False
            if not merged[key]["license"] and license_id:
                merged[key]["license"] = license_id
            if not merged[key]["license_path"] and license_file:
                merged[key]["license_path"] = str(license_file)

    runtime = []
    dev = []
    for key, item in merged.items():
        if dev_only.get(key, False):
            dev.append(item)
        else:
            runtime.append(item)

    runtime.sort(key=lambda item: (item["name"], item["version"]))
    dev.sort(key=lambda item: (item["name"], item["version"]))
    return runtime, dev


def normalize_npm_license(info: dict) -> str:
    license_id = info.get("license") or ""
    if license_id:
        return str(license_id)
    licenses = info.get("licenses")
    if isinstance(licenses, list):
        parts = []
        for item in licenses:
            if isinstance(item, dict):
                val = item.get("type")
            else:
                val = item
            if val:
                parts.append(str(val))
        return " OR ".join(parts)
    if isinstance(licenses, dict):
        val = licenses.get("type")
        return str(val) if val else ""
    return ""


def write_notices(
    go_modules: list[dict[str, str]],
    npm_runtime: list[dict[str, str]],
    npm_dev: list[dict[str, str]],
    include_dev: bool,
) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    lines: list[str] = []
    lines.append("# Third-Party Notices")
    lines.append("")
    lines.append("This file is generated by scripts/generate_third_party_notices.py.")
    lines.append(f"Generated at {timestamp}.")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Go modules (backend): {len(go_modules)}")
    lines.append(f"- npm packages (frontend runtime): {len(npm_runtime)}")
    if include_dev:
        lines.append(f"- npm packages (frontend dev-only): {len(npm_dev)}")
    else:
        lines.append("- npm packages (frontend dev-only): omitted (use --include-dev)")
    lines.append("- External tools: 1")
    lines.append("")
    lines.append("## Go modules (backend)")
    for mod in go_modules:
        lines.append(f"- {mod['name']}@{mod['version']} - {mod['license']}")
    lines.append("")
    lines.append("## npm packages (frontend runtime)")
    for pkg in npm_runtime:
        license_id = pkg["license"] or "UNKNOWN"
        lines.append(f"- {pkg['name']}@{pkg['version']} - {license_id}")
    lines.append("")
    if include_dev:
        lines.append("## npm packages (frontend dev-only)")
        for pkg in npm_dev:
            license_id = pkg["license"] or "UNKNOWN"
            lines.append(f"- {pkg['name']}@{pkg['version']} - {license_id}")
        lines.append("")
    lines.append("## External tools")
    lines.append("- rclone - MIT (https://github.com/rclone/rclone)")
    lines.append("")
    lines.append("Notes:")
    lines.append("- License identifiers are best-effort and derived from dependency metadata or license files.")
    lines.append("- Dev-only npm packages are not bundled into production builds by default.")
    lines.append("- License texts are stored under third_party/licenses/.")
    lines.append("- If you redistribute dependency binaries or sources, include their license texts and notices.")
    lines.append("")

    OUTPUT.write_text("\n".join(lines), encoding="utf-8")


def copy_license_files(
    go_modules: list[dict[str, str]],
    npm_runtime: list[dict[str, str]],
    npm_dev: list[dict[str, str]],
    include_dev: bool,
) -> None:
    reset_dir(GO_LICENSES_DIR)
    reset_dir(NPM_LICENSES_DIR)
    reset_dir(EXTERNAL_LICENSES_DIR)

    seen: set[str] = set()
    for mod in go_modules:
        src = mod.get("license_path")
        if not src:
            continue
        dest_name = format_license_filename(mod["name"], mod["version"], Path(src).name)
        dest = GO_LICENSES_DIR / dest_name
        if dest_name in seen:
            continue
        shutil.copy2(src, dest)
        seen.add(dest_name)

    packages = npm_runtime + npm_dev if include_dev else npm_runtime
    for pkg in packages:
        src = pkg.get("license_path")
        if not src:
            continue
        dest_name = format_license_filename(pkg["name"], pkg["version"], Path(src).name)
        dest = NPM_LICENSES_DIR / dest_name
        if dest_name in seen:
            continue
        shutil.copy2(src, dest)
        seen.add(dest_name)

    rclone_license = EXTERNAL_LICENSES_DIR / "rclone-LICENSE"
    if not rclone_license.exists():
        try:
            content = run(["curl", "-fsSL", RCLONE_LICENSE_URL])
            rclone_license.write_text(content, encoding="utf-8")
        except subprocess.CalledProcessError:
            pass

    copy_manual_licenses(GO_LICENSES_DIR, MANUAL_GO_LICENSES_DIR, go_modules)
    copy_manual_licenses(NPM_LICENSES_DIR, MANUAL_NPM_LICENSES_DIR, packages)
    copy_manual_external_licenses(EXTERNAL_LICENSES_DIR, MANUAL_EXTERNAL_LICENSES_DIR)


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_manual_licenses(target_dir: Path, manual_dir: Path, packages: list[dict[str, str]]) -> None:
    if not manual_dir.exists():
        return
    allowed_prefixes = {
        f"{sanitize_identifier(pkg['name'])}@{sanitize_identifier(pkg['version'])}-" for pkg in packages
    }
    if not allowed_prefixes:
        return
    for manual_file in manual_dir.iterdir():
        if not manual_file.is_file():
            continue
        if any(manual_file.name.startswith(prefix) for prefix in allowed_prefixes):
            dest = target_dir / manual_file.name
            if dest.exists():
                continue
            shutil.copy2(manual_file, dest)


def copy_manual_external_licenses(target_dir: Path, manual_dir: Path) -> None:
    if not manual_dir.exists():
        return
    for manual_file in manual_dir.iterdir():
        if not manual_file.is_file():
            continue
        dest = target_dir / manual_file.name
        if dest.exists():
            continue
        shutil.copy2(manual_file, dest)


def format_license_filename(name: str, version: str, license_name: str) -> str:
    return f"{sanitize_identifier(name)}@{sanitize_identifier(version)}-{license_name}"


def sanitize_identifier(value: str) -> str:
    cleaned = value.replace("@", "").replace("/", "_")
    return re.sub(r"[^A-Za-z0-9._+-]", "_", cleaned)


def parse_args(argv: list[str]) -> dict[str, bool] | None:
    include_dev = False
    for arg in argv[1:]:
        if arg == "--include-dev":
            include_dev = True
        elif arg == "--runtime-only":
            include_dev = False
        elif arg in {"-h", "--help"}:
            print("Usage: scripts/generate_third_party_notices.py [--include-dev | --runtime-only]")
            print("")
            print("  --include-dev  Include dev-only npm packages and licenses.")
            print("  --runtime-only Generate runtime-only notices/licenses (default).")
            return None
        else:
            print(f"Unknown argument: {arg}", file=sys.stderr)
            return None
    return {"include_dev": include_dev}


def main() -> int:
    if not BACKEND_DIR.exists():
        print("backend directory not found", file=sys.stderr)
        return 1
    args = parse_args(sys.argv)
    if args is None:
        return 1
    go_modules = parse_go_modules()
    npm_runtime, npm_dev = parse_npm_packages()
    write_notices(go_modules, npm_runtime, npm_dev, args["include_dev"])
    copy_license_files(go_modules, npm_runtime, npm_dev, args["include_dev"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
