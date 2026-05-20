#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class Requirement:
    names: tuple[str, ...]
    any_of: bool = False

    @property
    def label(self) -> str:
        separator = " or " if self.any_of else ", "
        return separator.join(self.names)

    def is_satisfied(self) -> bool:
        values = [is_env_value_set(name) for name in self.names]
        return any(values) if self.any_of else all(values)

    def statuses(self) -> list[dict[str, str]]:
        return [
            {
                "name": name,
                "status": "set" if is_env_value_set(name) else "missing",
            }
            for name in self.names
        ]


@dataclass(frozen=True)
class Scope:
    name: str
    required: tuple[Requirement, ...]
    optional: tuple[str, ...] = ()


SCOPES: dict[str, Scope] = {
    "reverse-proxy": Scope(
        name="reverse-proxy",
        required=(
            Requirement(("DEPLOY_BASE_URL", "DEPLOY_HEALTHCHECK_URL"), any_of=True),
            Requirement(("DEPLOY_API_TOKEN",)),
            Requirement(("DEPLOY_PROFILE_ID",)),
            Requirement(("DEPLOY_SMOKE_BUCKET",)),
            Requirement(("DEPLOY_SMOKE_OBJECT_KEY",)),
        ),
        optional=(
            "DEPLOY_EXPECTED_EXTERNAL_BASE_URL",
            "DEPLOY_CURL_INSECURE",
            "DEPLOY_SMOKE_RETRIES",
            "DEPLOY_SMOKE_DELAY_SECONDS",
            "DEPLOY_SMOKE_EVIDENCE_FILE",
            "DEPLOY_RELEASE_CANDIDATE",
        ),
    ),
    "aws": Scope(
        name="aws",
        required=(
            Requirement(("S3DESK_LIVE_AWS_BUCKET",)),
            Requirement(("S3DESK_LIVE_AWS_REGION",)),
            Requirement(("S3DESK_LIVE_AWS_ACCESS_KEY_ID",)),
            Requirement(("S3DESK_LIVE_AWS_SECRET_ACCESS_KEY",)),
        ),
        optional=(
            "S3DESK_LIVE_AWS_ENDPOINT",
            "S3DESK_LIVE_AWS_SESSION_TOKEN",
            "S3DESK_LIVE_AWS_FORCE_PATH_STYLE",
            "S3DESK_LIVE_AWS_TLS_SKIP_VERIFY",
        ),
    ),
    "gcs": Scope(
        name="gcs",
        required=(
            Requirement(("S3DESK_LIVE_GCS_BUCKET",)),
            Requirement(("S3DESK_LIVE_GCS_SERVICE_ACCOUNT_JSON",)),
            Requirement(("S3DESK_LIVE_GCS_PROJECT_NUMBER",)),
        ),
        optional=(
            "S3DESK_LIVE_GCS_ENDPOINT",
            "S3DESK_LIVE_GCS_ANONYMOUS",
            "S3DESK_LIVE_GCS_TLS_SKIP_VERIFY",
        ),
    ),
    "azure": Scope(
        name="azure",
        required=(
            Requirement(("S3DESK_LIVE_AZURE_CONTAINER",)),
            Requirement(("S3DESK_LIVE_AZURE_ACCOUNT_NAME",)),
            Requirement(("S3DESK_LIVE_AZURE_ACCOUNT_KEY",)),
        ),
        optional=(
            "S3DESK_LIVE_AZURE_ENDPOINT",
            "S3DESK_LIVE_AZURE_USE_EMULATOR",
            "S3DESK_LIVE_AZURE_TLS_SKIP_VERIFY",
        ),
    ),
    "oci": Scope(
        name="oci",
        required=(
            Requirement(("S3DESK_LIVE_OCI_BUCKET",)),
            Requirement(("S3DESK_LIVE_OCI_REGION",)),
            Requirement(("S3DESK_LIVE_OCI_NAMESPACE",)),
            Requirement(("S3DESK_LIVE_OCI_COMPARTMENT",)),
            Requirement(("S3DESK_LIVE_OCI_ENDPOINT",)),
        ),
        optional=(
            "S3DESK_LIVE_OCI_AUTH_PROVIDER",
            "S3DESK_LIVE_OCI_CONFIG_FILE",
            "S3DESK_LIVE_OCI_CONFIG_PROFILE",
            "S3DESK_LIVE_OCI_TLS_SKIP_VERIFY",
        ),
    ),
    "minio": Scope(
        name="minio",
        required=(
            Requirement(("S3DESK_LIVE_MINIO_BUCKET",)),
            Requirement(("S3DESK_LIVE_MINIO_ENDPOINT",)),
            Requirement(("S3DESK_LIVE_MINIO_REGION",)),
            Requirement(("S3DESK_LIVE_MINIO_ACCESS_KEY_ID",)),
            Requirement(("S3DESK_LIVE_MINIO_SECRET_ACCESS_KEY",)),
        ),
        optional=(
            "S3DESK_LIVE_MINIO_PUBLIC_ENDPOINT",
            "S3DESK_LIVE_MINIO_FORCE_PATH_STYLE",
            "S3DESK_LIVE_MINIO_TLS_SKIP_VERIFY",
        ),
    ),
    "ceph": Scope(
        name="ceph",
        required=(
            Requirement(("S3DESK_LIVE_CEPH_BUCKET",)),
            Requirement(("S3DESK_LIVE_CEPH_ENDPOINT",)),
            Requirement(("S3DESK_LIVE_CEPH_REGION",)),
            Requirement(("S3DESK_LIVE_CEPH_ACCESS_KEY_ID",)),
            Requirement(("S3DESK_LIVE_CEPH_SECRET_ACCESS_KEY",)),
        ),
        optional=(
            "S3DESK_LIVE_CEPH_PUBLIC_ENDPOINT",
            "S3DESK_LIVE_CEPH_FORCE_PATH_STYLE",
            "S3DESK_LIVE_CEPH_TLS_SKIP_VERIFY",
        ),
    ),
}


def is_placeholder_value(value: str) -> bool:
    normalized = value.strip().strip("\"'`").lower()
    return (
        not normalized
        or normalized in {
            "...",
            "redacted",
            "<redacted>",
            "xxxx",
            "xxx",
            "****",
            "<token>",
            "<secret>",
            "<tag-or-sha>",
            "missing",
            "set",
            "todo",
            "change-me",
            "changeme",
            "replace-me",
            "replace_me",
            "replace-with-a-long-random-token",
            "your-token",
            "your-secret",
        }
        or normalized.startswith("<")
        or normalized.startswith("${")
        or "redacted" in normalized
    )


def is_env_value_set(name: str) -> bool:
    value = os.environ.get(name)
    return value is not None and not is_placeholder_value(value)


def expand_scopes(scope_names: list[str]) -> list[Scope]:
    if not scope_names:
        scope_names = ["reverse-proxy"]
    if "all" in scope_names:
        scope_names = list(SCOPES)

    seen: set[str] = set()
    scopes: list[Scope] = []
    for name in scope_names:
        if name in seen:
            continue
        seen.add(name)
        scopes.append(SCOPES[name])
    return scopes


def scope_result(scope: Scope) -> dict:
    required = [
        {
            "label": requirement.label,
            "satisfied": requirement.is_satisfied(),
            "variables": requirement.statuses(),
        }
        for requirement in scope.required
    ]
    optional = [
        {
            "name": name,
            "status": "set" if is_env_value_set(name) else "missing",
        }
        for name in scope.optional
    ]
    return {
        "scope": scope.name,
        "ready": all(item["satisfied"] for item in required),
        "required": required,
        "optional": optional,
    }


def print_markdown(results: list[dict]) -> None:
    print("# Live Evidence Environment Preflight")
    print()
    print("Values are intentionally not printed; only set/missing status is reported.")
    print("Blank and placeholder values are reported as missing.")
    print()
    for result in results:
        status = "ready" if result["ready"] else "blocked"
        print(f"## {result['scope']}")
        print()
        print(f"- Status: `{status}`")
        print()
        print("### Required")
        print()
        for item in result["required"]:
            item_status = "set" if item["satisfied"] else "missing"
            print(f"- `{item['label']}`: `{item_status}`")
            if len(item["variables"]) > 1:
                for variable in item["variables"]:
                    print(f"  - `{variable['name']}`: `{variable['status']}`")
        if result["optional"]:
            print()
            print("### Optional")
            print()
            for item in result["optional"]:
                print(f"- `{item['name']}`: `{item['status']}`")
        print()


def print_env_template(scopes: list[Scope]) -> None:
    print("# Live Evidence Environment Template")
    print("# Fill values locally. Do not commit secrets.")
    print()
    for scope in scopes:
        print(f"# {scope.name}")
        for requirement in scope.required:
            if requirement.any_of:
                print(f"# Required: set at least one of {requirement.label}")
            for name in requirement.names:
                print(f"export {name}=")
        if scope.optional:
            print("# Optional")
            for name in scope.optional:
                print(f"export {name}=")
        print()


def parse_args() -> argparse.Namespace:
    choices = sorted((*SCOPES.keys(), "all"))
    parser = argparse.ArgumentParser(
        description="Check whether live provider and reverse-proxy evidence environment variables are set."
    )
    parser.add_argument(
        "--scope",
        action="append",
        choices=choices,
        default=[],
        help="Scope to check. Repeat for multiple scopes. Defaults to reverse-proxy.",
    )
    parser.add_argument(
        "--format",
        choices=("markdown", "json", "env-template"),
        default="markdown",
        help="Output format.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    scopes = expand_scopes(args.scope)
    if args.format == "env-template":
        print_env_template(scopes)
        return 0

    results = [scope_result(scope) for scope in scopes]

    if args.format == "json":
        print(json.dumps({"results": results}, indent=2, sort_keys=True))
    else:
        print_markdown(results)

    if not all(result["ready"] for result in results):
        print("[live-evidence-env] required environment variable(s) are missing.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
