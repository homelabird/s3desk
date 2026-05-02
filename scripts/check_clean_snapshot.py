#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str], cwd: Path = ROOT) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, check=False)


def git_status_paths() -> list[str]:
    raw = subprocess.check_output(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
    )
    return sorted(path.decode("utf-8", "surrogateescape") for path in raw.split(b"\0") if path)


def copy_path(src: Path, dest: Path) -> bool:
    if not src.exists() and not src.is_symlink():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_symlink():
        if dest.exists() or dest.is_symlink():
            dest.unlink()
        os.symlink(os.readlink(src), dest)
        return True
    if src.is_file():
        shutil.copy2(src, dest)
        return True
    return False


def build_snapshot(dest: Path) -> int:
    copied = 0
    for relative_path in git_status_paths():
        if copy_path(ROOT / relative_path, dest / relative_path):
            copied += 1
    return copied


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Copy the current non-ignored workspace into a temporary directory and run the repository check there."
        )
    )
    parser.add_argument("mode", nargs="?", choices=("fast", "full"), default="fast")
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Keep the temporary snapshot directory after the command exits.",
    )
    parser.add_argument(
        "--skip-check",
        action="store_true",
        help="Only create the snapshot and print its path.",
    )
    parser.add_argument(
        "--tmpdir",
        type=Path,
        default=None,
        help="Parent directory for the temporary snapshot.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    snapshot = Path(tempfile.mkdtemp(prefix="s3desk-clean-snapshot-", dir=args.tmpdir))
    keep_snapshot = args.keep or args.skip_check
    try:
        copied = build_snapshot(snapshot)
        print(f"[clean-snapshot] copied {copied} non-ignored tracked/untracked paths to {snapshot}")
        if args.skip_check:
            return 0
        result = run(["bash", "./scripts/check.sh", args.mode], cwd=snapshot)
        if result.returncode != 0:
            keep_snapshot = True
            print(f"[clean-snapshot] check failed; kept snapshot at {snapshot}", file=sys.stderr)
        return result.returncode
    finally:
        if not keep_snapshot:
            shutil.rmtree(snapshot, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
