#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_DIR = ROOT / "docs" / "release" / "evidence"
EVIDENCE_TEMPLATE_NAMES = {
    "README.md",
    "PROVIDER_LIVE_VALIDATION_TEMPLATE.md",
    "REVERSE_PROXY_SMOKE_TEMPLATE.md",
}
EVIDENCE_SUPPORT_PREFIXES = (
    "LIVE_EVIDENCE_CHECKLIST_",
)

PROVIDER_CHANGE_PREFIXES = (
    "backend/internal/azureacl/",
    "backend/internal/azurearmimmutability/",
    "backend/internal/bucketgov/",
    "backend/internal/gcsbucket/",
    "backend/internal/gcsiam/",
    "backend/internal/ocicli/",
    "backend/internal/s3client/",
    "frontend/src/lib/providerCapabilities",
    "frontend/src/pages/buckets/governance/",
    "frontend/src/pages/profiles/",
)
PROVIDER_CHANGE_TOKENS = (
    "bucket_governance",
    "bucket_policy",
    "handlers_buckets",
    "handlers_objects",
    "handlers_profiles",
    "provider_capabilities",
    "provider_live_validation",
    "oci_native_smoke",
    "BucketGovernance",
    "BucketPolicy",
    "BucketModal",
)
PROVIDER_SCOPES = ("aws", "gcs", "azure", "oci", "minio", "ceph")
PROVIDER_LIVE_TESTS = {
    "aws": "TestLiveValidationAwsS3",
    "gcs": "TestLiveValidationGcpGcs",
    "azure": "TestLiveValidationAzureBlob",
    "oci": "TestLiveValidationOciObjectStorage",
    "minio": "TestLiveValidationMinioS3Compatible",
    "ceph": "TestLiveValidationCephS3Compatible",
}
GENERIC_PROVIDER_CHANGE_TOKENS = (
    "bucket_governance",
    "bucket_policy",
    "handlers_buckets",
    "handlers_objects",
    "handlers_profiles",
    "provider_capabilities",
    "provider_live_validation",
    "BucketGovernance",
    "BucketPolicy",
    "BucketModal",
)
PROVIDER_SCOPE_HINTS = {
    "aws": ("aws", "s3client/", "aws_s3"),
    "gcs": ("gcs", "gcp", "gcsiam/", "gcsbucket/"),
    "azure": ("azure",),
    "oci": ("oci", "ocicli/"),
    "minio": ("minio",),
    "ceph": ("ceph",),
}

REVERSE_PROXY_CHANGE_PREFIXES = (
    "charts/",
    "compose/remote/",
)
REVERSE_PROXY_CHANGE_TOKENS = (
    "download_proxy",
    "download-url",
    "handlers_object_download_url",
    "handlers_realtime",
    "realtime_origin",
    "realtime_ticket",
    "middleware",
    "EXTERNAL_BASE_URL",
    "ALLOWED_HOSTS",
    "deploy_smoke",
)
REVERSE_PROXY_EXACT_PATHS = {
    ".env.example",
    "Containerfile",
    "backend/cmd/server/main.go",
    "docs/RELEASE_GATE.md",
    "docs/TESTING.md",
    "docs/release/DEPLOYMENT_CHECKLIST.md",
    "scripts/deploy_smoke.sh",
}

SECRET_PATTERNS = (
    ("aws_access_key_id", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("private_key_block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("private_key_json", re.compile(r'"private_key"\s*:')),
    ("aws_signed_url", re.compile(r"[?&]X-Amz-(?:Signature|Credential|Security-Token)=([^&\s`]+)")),
    ("gcs_signed_url", re.compile(r"[?&]X-Goog-(?:Signature|Credential)=([^&\s`]+)")),
    ("azure_signed_url", re.compile(r"[?&]sig=([^&\s`]+)", re.IGNORECASE)),
    (
        "credential_assignment",
        re.compile(
            r"\b[A-Z0-9_]*(?:"
            r"SESSION_TOKEN|SECRET_ACCESS_KEY|ACCESS_KEY_ID|ACCESS_KEY_SECRET|ACCOUNT_KEY|"
            r"SERVICE_ACCOUNT_JSON|CLIENT_SECRET|PRIVATE_KEY"
            r")[A-Z0-9_]*\s*[:=]\s*`?([^`\s]+)`?",
            re.IGNORECASE,
        ),
    ),
    ("authorization_header", re.compile(r"\bAuthorization\s*:\s*(?:Bearer|Basic)\s+([^`\s]+)", re.IGNORECASE)),
    (
        "cookie_token",
        re.compile(
            r"\b(?:Cookie|Set-Cookie)\s*:\s*[^`\n]*(?:api[_-]?token|s3desk[_-]?token|session|auth)[^=;`\s]*=([^;`\s]+)",
            re.IGNORECASE,
        ),
    ),
    ("api_token_assignment", re.compile(r"\b(?:DEPLOY_API_TOKEN|S3DESK_API_TOKEN|api[_-]?token)\s*[:=]\s*([^`\s]+)", re.IGNORECASE)),
)
SECRET_REMEDIATIONS = {
    "api_token_assignment": "Replace API token values with `<redacted>` and keep only the command shape.",
    "authorization_header": "Replace authorization header values with `<redacted>` and keep only the checked route or status.",
    "cookie_token": "Replace cookie token values with `<redacted>` and keep only the checked route or status.",
    "credential_assignment": "Replace provider credential assignment values with `<redacted>` or move them to local env only.",
    "aws_access_key_id": "Replace access key identifiers with `<redacted>`.",
    "private_key_block": "Remove private key material; record only the sanitized provider and command context.",
    "private_key_json": "Remove service account private key JSON; record only the sanitized provider and command context.",
    "aws_signed_url": "Redact `X-Amz-*` query values and keep only the route or external base URL.",
    "gcs_signed_url": "Redact `X-Goog-*` query values and keep only the route or external base URL.",
    "azure_signed_url": "Redact `sig` query values and keep only the route or external base URL.",
}
EVIDENCE_HEADERS = (
    "# Provider Live Validation Evidence",
    "# Reverse Proxy Smoke Evidence",
)
RELEASE_CANDIDATE_LABEL = "S3Desk commit SHA or release tag"
RELEASE_CANDIDATE_REMEDIATION = (
    "Fill `S3Desk commit SHA or release tag` with the release tag or commit SHA used for validation."
)
RELEASE_CANDIDATE_MISMATCH_REMEDIATION = (
    "Replace `S3Desk commit SHA or release tag` with the expected release candidate identifier."
)
PROVIDER_NAME_REMEDIATION = (
    "Fill `Provider name` with the affected provider, for example `AWS S3`, `GCS`, `Azure Blob`, `OCI Object Storage`, `MinIO`, or `Ceph`."
)
PROVIDER_METADATA_FIELDS = (
    ("Bucket or container name", "provider_bucket_or_container"),
    ("Profile identifier", "provider_profile_identifier"),
    ("Exact feature tested", "provider_feature_tested"),
    ("Command or manual workflow used", "provider_command_or_workflow"),
    ("Provider-native console or CLI confirmation on success", "provider_native_confirmation"),
)
PROVIDER_METADATA_REMEDIATION = (
    "Fill provider evidence metadata with sanitized, non-secret values for release review."
)
EVIDENCE_FILENAME_REMEDIATION = (
    "Rename the evidence file to include the release tag or commit SHA instead of a placeholder."
)
REVERSE_PROXY_METADATA_FIELDS = (
    (("Base URL",), "reverse_proxy_base_url"),
    (("Expected external base URL",), "reverse_proxy_expected_external_base_url"),
    (("Profile identifier",), "reverse_proxy_profile_identifier"),
    (("Bucket",), "reverse_proxy_bucket"),
    (("Object key",), "reverse_proxy_object_key"),
)
REVERSE_PROXY_CHECK_FIELDS = (
    (("GET `/healthz`",), "reverse_proxy_healthz"),
    (("Authenticated GET `/api/v1/meta`",), "reverse_proxy_meta"),
    (("POST `/api/v1/realtime-ticket?transport=ws`",), "reverse_proxy_realtime_ticket"),
    (("GET `/api/v1/buckets/{bucket}/objects/download-url?proxy=true`",), "reverse_proxy_download_url"),
    (
        ("Signed proxy URL root", "Signed proxy URL root matches expected external base URL"),
        "reverse_proxy_signed_proxy_root",
    ),
    (("HEAD signed proxy URL",), "reverse_proxy_head_signed_proxy_url"),
)
REVERSE_PROXY_EXPECTED_STATUSES = {
    "reverse_proxy_healthz": ("200",),
    "reverse_proxy_meta": ("200",),
    "reverse_proxy_realtime_ticket": ("201",),
    "reverse_proxy_download_url": ("200",),
    "reverse_proxy_head_signed_proxy_url": ("200",),
}
REVERSE_PROXY_EXPECTED_RESULTS = {
    "reverse_proxy_signed_proxy_root": "matches expected external base URL",
}
REVERSE_PROXY_METADATA_REMEDIATION = (
    "Fill reverse-proxy smoke evidence metadata with sanitized route, status, bucket, profile, and URL-root values."
)
REVERSE_PROXY_STATUS_REMEDIATION = (
    "Record the successful HTTP status from the reverse-proxy smoke run; rerun `scripts/deploy_smoke.sh` if the status differs."
)
REVERSE_PROXY_RESULT_REMEDIATION = (
    "Record a signed proxy URL root that matches `Expected external base URL`; rerun `scripts/deploy_smoke.sh` if the root differs."
)


@dataclass(frozen=True)
class StatusEntry:
    code: str
    path: str


def run_git_status(untracked_files: str) -> list[StatusEntry]:
    raw = subprocess.check_output(
        ["git", "status", "--porcelain=v1", "-z", f"--untracked-files={untracked_files}"],
        cwd=ROOT,
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


def is_provider_change(path: str) -> bool:
    return path.startswith(PROVIDER_CHANGE_PREFIXES) or any(token in path for token in PROVIDER_CHANGE_TOKENS)


def provider_scopes_for_path(path: str) -> tuple[str, ...]:
    if not is_provider_change(path):
        return ()
    if any(token in path for token in GENERIC_PROVIDER_CHANGE_TOKENS):
        return PROVIDER_SCOPES

    normalized = path.lower()
    scopes = [
        scope
        for scope, hints in PROVIDER_SCOPE_HINTS.items()
        if any(hint in normalized for hint in hints)
    ]
    if path.startswith("backend/internal/s3client/"):
        scopes.extend(scope for scope in ("aws", "minio", "ceph") if scope not in scopes)
    return tuple(scope for scope in PROVIDER_SCOPES if scope in scopes) or PROVIDER_SCOPES


def is_reverse_proxy_change(path: str) -> bool:
    return (
        path in REVERSE_PROXY_EXACT_PATHS
        or path.startswith(REVERSE_PROXY_CHANGE_PREFIXES)
        or any(token in path for token in REVERSE_PROXY_CHANGE_TOKENS)
    )


def evidence_files() -> list[Path]:
    if not EVIDENCE_DIR.is_dir():
        return []
    return sorted(
        path
        for path in EVIDENCE_DIR.glob("*.md")
        if path.name not in EVIDENCE_TEMPLATE_NAMES
        and not path.name.startswith(EVIDENCE_SUPPORT_PREFIXES)
        and path.is_file()
    )


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
            "missing",
            "set",
            "unknown",
            "`missing`",
            "`set`",
        }
        or normalized.startswith("<")
        or normalized.startswith("${")
        or "redacted" in normalized
    )


def is_metadata_placeholder_value(value: str) -> bool:
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
            "missing",
            "set",
            "unknown",
            "`missing`",
            "`set`",
        }
        or normalized.startswith("<")
        or normalized.startswith("${")
    )


def is_release_evidence_document(text: str) -> bool:
    return any(header in text for header in EVIDENCE_HEADERS)


def normalized_candidate_identifier(value: str) -> str:
    return value.strip().strip("\"'`")


def is_placeholder_filename(value: str) -> bool:
    normalized = value.lower()
    return (
        "<tag-or-sha>" in normalized
        or "tag-or-sha" in normalized
        or "todo" in normalized
        or "replace-me" in normalized
        or normalized.endswith("-unknown.md")
    )


def release_evidence_line(raw_line: str) -> str:
    line = raw_line.strip()
    if line.startswith("- "):
        return line[2:].strip()
    return line


def release_evidence_field_value(raw_line: str, label: str) -> str | None:
    line = release_evidence_line(raw_line)
    prefix = f"{label}:"
    if not line.lower().startswith(prefix.lower()):
        return None
    return line.split(":", 1)[1].strip()


def markdown_section_lines(lines: list[str], heading: str) -> list[tuple[int, str]]:
    section_lines: list[tuple[int, str]] = []
    in_section = False
    normalized_heading = heading.strip().lower()
    for line_number, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if re.match(r"^#{1,6}\s+", stripped):
            current_heading = stripped.lstrip("#").strip().lower()
            if in_section:
                break
            if current_heading == normalized_heading:
                in_section = True
            continue
        if in_section:
            section_lines.append((line_number, raw_line))
    return section_lines


def candidate_identifier_findings_for_evidence(
    path: Path, expected_candidate_id: str | None = None
) -> list[dict[str, str | int]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if not is_release_evidence_document(text):
        return []

    expected = normalized_candidate_identifier(expected_candidate_id or "")
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        value = release_evidence_field_value(raw_line, RELEASE_CANDIDATE_LABEL)
        if value is None:
            continue
        value = normalized_candidate_identifier(value)
        if not is_placeholder_value(value):
            if expected and value != expected:
                return [
                    {
                        "type": "candidate_identifier_mismatch",
                        "line": line_number,
                        "remediation": f"{RELEASE_CANDIDATE_MISMATCH_REMEDIATION} Expected `{expected}`.",
                    }
                ]
            return []
        return [
            {
                "type": "candidate_identifier_placeholder",
                "line": line_number,
                "remediation": RELEASE_CANDIDATE_REMEDIATION,
            }
        ]

    return [
        {
            "type": "candidate_identifier_missing",
            "line": 1,
            "remediation": RELEASE_CANDIDATE_REMEDIATION,
        }
    ]


def filename_findings_for_evidence(path: Path) -> list[dict[str, str | int]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if not is_release_evidence_document(text):
        return []
    if not is_placeholder_filename(path.name):
        return []
    return [
        {
            "type": "evidence_filename_placeholder",
            "line": 1,
            "remediation": EVIDENCE_FILENAME_REMEDIATION,
        }
    ]


def provider_identity_findings_for_evidence(path: Path) -> list[dict[str, str | int]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if "# Provider Live Validation Evidence" not in text:
        return []

    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        value = release_evidence_field_value(raw_line, "Provider name")
        if value is None:
            continue
        if is_placeholder_value(value):
            return [
                {
                    "type": "provider_name_placeholder",
                    "line": line_number,
                    "remediation": PROVIDER_NAME_REMEDIATION,
                }
            ]
        if normalize_provider_scope(value) is None:
            return [
                {
                    "type": "provider_name_unknown",
                    "line": line_number,
                    "remediation": PROVIDER_NAME_REMEDIATION,
                }
            ]
        return []

    return [
        {
            "type": "provider_name_missing",
            "line": 1,
            "remediation": PROVIDER_NAME_REMEDIATION,
        }
    ]


def provider_metadata_findings_for_evidence(path: Path) -> list[dict[str, str | int]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if "# Provider Live Validation Evidence" not in text:
        return []

    findings: list[dict[str, str | int]] = []
    lines = text.splitlines()
    for label, finding_prefix in PROVIDER_METADATA_FIELDS:
        found = False
        for line_number, raw_line in enumerate(lines, start=1):
            value = release_evidence_field_value(raw_line, label)
            if value is None:
                continue
            found = True
            if is_metadata_placeholder_value(value):
                findings.append(
                    {
                        "type": f"{finding_prefix}_placeholder",
                        "line": line_number,
                        "remediation": PROVIDER_METADATA_REMEDIATION,
                    }
                )
            break
        if not found:
            findings.append(
                {
                    "type": f"{finding_prefix}_missing",
                    "line": 1,
                    "remediation": PROVIDER_METADATA_REMEDIATION,
                }
            )
    return findings


def is_expected_reverse_proxy_status(value: str, expected_statuses: tuple[str, ...]) -> bool:
    statuses = re.findall(r"\b[1-5][0-9]{2}\b", value)
    if statuses:
        return any(status in expected_statuses for status in statuses)
    return is_pass_outcome(value)


def normalized_url_root(value: str) -> str:
    return value.strip().strip("\"'`").rstrip("/")


def is_expected_reverse_proxy_signed_root(value: str, expected_external_base_url: str) -> bool:
    if is_pass_outcome(value):
        return True
    actual_root = normalized_url_root(value)
    expected_root = normalized_url_root(expected_external_base_url)
    return bool(actual_root and expected_root and actual_root == expected_root)


def reverse_proxy_metadata_findings_for_evidence(path: Path) -> list[dict[str, str | int]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if "# Reverse Proxy Smoke Evidence" not in text:
        return []

    findings: list[dict[str, str | int]] = []
    lines = text.splitlines()
    checks_section_lines = markdown_section_lines(lines, "Checks")
    metadata_values: dict[str, str] = {}
    for labels, finding_prefix in REVERSE_PROXY_METADATA_FIELDS:
        found = False
        for line_number, raw_line in enumerate(lines, start=1):
            value = next(
                (
                    field_value
                    for label in labels
                    if (field_value := release_evidence_field_value(raw_line, label)) is not None
                ),
                None,
            )
            if value is None:
                continue
            found = True
            metadata_values[finding_prefix] = value
            if is_metadata_placeholder_value(value):
                findings.append(
                    {
                        "type": f"{finding_prefix}_placeholder",
                        "line": line_number,
                        "remediation": REVERSE_PROXY_METADATA_REMEDIATION,
                    }
                )
            elif (
                finding_prefix in REVERSE_PROXY_EXPECTED_STATUSES
                and not is_expected_reverse_proxy_status(
                    value,
                    REVERSE_PROXY_EXPECTED_STATUSES[finding_prefix],
                )
            ):
                findings.append(
                    {
                        "type": f"{finding_prefix}_unexpected_status",
                        "line": line_number,
                        "remediation": REVERSE_PROXY_STATUS_REMEDIATION,
                    }
                )
            break
        if not found:
            findings.append(
                {
                    "type": f"{finding_prefix}_missing",
                    "line": 1,
                    "remediation": REVERSE_PROXY_METADATA_REMEDIATION,
                }
            )
    for labels, finding_prefix in REVERSE_PROXY_CHECK_FIELDS:
        found = False
        for line_number, raw_line in checks_section_lines:
            value = next(
                (
                    field_value
                    for label in labels
                    if (field_value := release_evidence_field_value(raw_line, label)) is not None
                ),
                None,
            )
            if value is None:
                continue
            found = True
            if is_metadata_placeholder_value(value):
                findings.append(
                    {
                        "type": f"{finding_prefix}_placeholder",
                        "line": line_number,
                        "remediation": REVERSE_PROXY_METADATA_REMEDIATION,
                    }
                )
            elif (
                finding_prefix in REVERSE_PROXY_EXPECTED_STATUSES
                and not is_expected_reverse_proxy_status(
                    value,
                    REVERSE_PROXY_EXPECTED_STATUSES[finding_prefix],
                )
            ):
                findings.append(
                    {
                        "type": f"{finding_prefix}_unexpected_status",
                        "line": line_number,
                        "remediation": REVERSE_PROXY_STATUS_REMEDIATION,
                    }
                )
            elif (
                finding_prefix == "reverse_proxy_signed_proxy_root"
                and not is_expected_reverse_proxy_signed_root(
                    value,
                    metadata_values.get("reverse_proxy_expected_external_base_url", ""),
                )
            ):
                findings.append(
                    {
                        "type": f"{finding_prefix}_unexpected_result",
                        "line": line_number,
                        "remediation": REVERSE_PROXY_RESULT_REMEDIATION,
                    }
                )
            break
        if not found:
            findings.append(
                {
                    "type": f"{finding_prefix}_missing",
                    "line": 1,
                    "remediation": REVERSE_PROXY_METADATA_REMEDIATION,
                }
            )
    return findings


def secret_findings_for_evidence(path: Path) -> list[dict[str, str | int]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    findings: list[dict[str, str | int]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        for name, pattern in SECRET_PATTERNS:
            match = pattern.search(line)
            if not match:
                continue
            if match.groups() and is_placeholder_value(match.group(1)):
                continue
            findings.append(
                {
                    "type": name,
                    "line": line_number,
                    "remediation": SECRET_REMEDIATIONS[name],
                }
            )
    return findings


def has_reverse_proxy_pass(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if "# Reverse Proxy Smoke Evidence" not in text:
        return False
    for raw_line in text.splitlines():
        value = release_evidence_field_value(raw_line, "Reverse-proxy smoke")
        if value is None:
            continue
        return is_pass_outcome(value)
    return False


def has_provider_live_outcome(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if "# Provider Live Validation Evidence" not in text:
        return False
    for raw_line in text.splitlines():
        value = release_evidence_field_value(raw_line, "Actual outcome")
        if value is None:
            continue
        return is_pass_outcome(value)
    return False


def is_pass_outcome(value: str) -> bool:
    normalized = value.strip().lower()
    if not normalized:
        return False
    return normalized in {"pass", "passed", "success", "succeeded", "ok"} or normalized.startswith("pass ")


def normalize_provider_scope(value: str) -> str | None:
    normalized = value.lower().replace("_", "-").strip()
    if "minio" in normalized:
        return "minio"
    if "ceph" in normalized:
        return "ceph"
    if "azure" in normalized:
        return "azure"
    if "gcs" in normalized or "gcp" in normalized or "google" in normalized:
        return "gcs"
    if "oci" in normalized or "oracle" in normalized:
        return "oci"
    if "aws" in normalized or "s3" in normalized:
        return "aws"
    return None


def provider_scope_from_evidence(path: Path) -> str | None:
    text = path.read_text(encoding="utf-8", errors="ignore")
    for raw_line in text.splitlines():
        value = release_evidence_field_value(raw_line, "Provider name")
        if value is not None:
            return normalize_provider_scope(value)
    return None


def provider_live_test_command(scopes: list[str] | tuple[str, ...]) -> str:
    tests = [PROVIDER_LIVE_TESTS[scope] for scope in scopes if scope in PROVIDER_LIVE_TESTS]
    if not tests:
        tests = list(PROVIDER_LIVE_TESTS.values())
    selector = "|".join(tests)
    return f"cd backend && go test ./internal/api -run '^({selector})$' -count=1"


def provider_scope_args(scopes: list[str] | tuple[str, ...]) -> str:
    selected_scopes = [scope for scope in scopes if scope in PROVIDER_SCOPES] or list(PROVIDER_SCOPES)
    return " ".join(f"--scope {scope}" for scope in selected_scopes)


def provider_evidence_metadata_summary() -> str:
    labels = ", ".join(f"`{label}`" for label, _finding_prefix in PROVIDER_METADATA_FIELDS)
    return f"{labels}, `Provider name`, `S3Desk commit SHA or release tag`, and pass/success `Actual outcome`"


def provider_required_metadata_fields() -> list[str]:
    return [
        "Provider name",
        *(label for label, _finding_prefix in PROVIDER_METADATA_FIELDS),
        RELEASE_CANDIDATE_LABEL,
        "Actual outcome",
    ]


def reverse_proxy_evidence_metadata_summary() -> str:
    def markdown_label(label: str) -> str:
        if "`" in label:
            return label
        return f"`{label}`"

    metadata_labels = [
        markdown_label(labels[0]) for labels, _finding_prefix in REVERSE_PROXY_METADATA_FIELDS
    ]
    check_labels = [
        markdown_label(labels[0]) for labels, _finding_prefix in REVERSE_PROXY_CHECK_FIELDS
    ]
    return (
        f"`S3Desk commit SHA or release tag`, {', '.join(metadata_labels)}, "
        f"{', '.join(check_labels)}, expected HTTP 200/201 statuses, "
        "and pass/success `Reverse-proxy smoke`"
    )


def reverse_proxy_required_metadata_fields() -> list[str]:
    return [
        RELEASE_CANDIDATE_LABEL,
        *(labels[0] for labels, _finding_prefix in REVERSE_PROXY_METADATA_FIELDS),
        "Reverse-proxy smoke",
    ]


def reverse_proxy_required_check_fields() -> list[str]:
    return [labels[0] for labels, _finding_prefix in REVERSE_PROXY_CHECK_FIELDS]


def reverse_proxy_check_status_expectations() -> dict[str, list[str]]:
    return {
        labels[0]: list(REVERSE_PROXY_EXPECTED_STATUSES[finding_prefix])
        for labels, finding_prefix in REVERSE_PROXY_CHECK_FIELDS
        if finding_prefix in REVERSE_PROXY_EXPECTED_STATUSES
    }


def reverse_proxy_check_result_expectations() -> dict[str, str]:
    return {
        labels[0]: REVERSE_PROXY_EXPECTED_RESULTS[finding_prefix]
        for labels, finding_prefix in REVERSE_PROXY_CHECK_FIELDS
        if finding_prefix in REVERSE_PROXY_EXPECTED_RESULTS
    }


def evidence_candidate_identifier(candidate_id: str | None = None) -> str:
    return normalized_candidate_identifier(candidate_id or "") or "<tag-or-sha>"


def provider_evidence_target(scope: str, candidate_id: str | None = None) -> str:
    return f"docs/release/evidence/provider-live-{scope}-{evidence_candidate_identifier(candidate_id)}.md"


def reverse_proxy_evidence_target(candidate_id: str | None = None) -> str:
    return f"docs/release/evidence/reverse-proxy-smoke-{evidence_candidate_identifier(candidate_id)}.md"


def reverse_proxy_smoke_command(candidate_id: str | None = None) -> str:
    candidate = evidence_candidate_identifier(candidate_id)
    evidence_target = reverse_proxy_evidence_target(candidate_id)
    return (
        f"DEPLOY_RELEASE_CANDIDATE={candidate} "
        f"DEPLOY_SMOKE_EVIDENCE_FILE={evidence_target} "
        "bash ./scripts/deploy_smoke.sh"
    )


def provider_remediation_fields(
    scopes: list[str] | tuple[str, ...],
    candidate_id: str | None = None,
) -> dict[str, object]:
    selected_scopes = list(scopes) or list(PROVIDER_SCOPES)
    scope_args = provider_scope_args(selected_scopes)
    return {
        "preflight_command": f"python3 scripts/check_live_evidence_env.py {scope_args}",
        "env_template_command": f"python3 scripts/check_live_evidence_env.py {scope_args} --format env-template",
        "provider_test_command": provider_live_test_command(selected_scopes),
        "evidence_template": "docs/release/evidence/PROVIDER_LIVE_VALIDATION_TEMPLATE.md",
        "evidence_targets": {
            scope: provider_evidence_target(scope, candidate_id) for scope in selected_scopes
        },
        "required_metadata": provider_evidence_metadata_summary(),
        "required_metadata_fields": provider_required_metadata_fields(),
    }


def reverse_proxy_remediation_fields(candidate_id: str | None = None) -> dict[str, object]:
    return {
        "preflight_command": "python3 scripts/check_live_evidence_env.py --scope reverse-proxy",
        "env_template_command": "python3 scripts/check_live_evidence_env.py --scope reverse-proxy --format env-template",
        "smoke_command": reverse_proxy_smoke_command(candidate_id),
        "evidence_target": reverse_proxy_evidence_target(candidate_id),
        "required_metadata": reverse_proxy_evidence_metadata_summary(),
        "required_metadata_fields": reverse_proxy_required_metadata_fields(),
        "required_check_fields": reverse_proxy_required_check_fields(),
        "check_status_expectations": reverse_proxy_check_status_expectations(),
        "check_result_expectations": reverse_proxy_check_result_expectations(),
    }


def release_scope_final_gate_command() -> str:
    return (
        "python3 scripts/report_release_scope.py "
        "--fail-on-root-artifacts "
        "--fail-on-dependency-scope-warning "
        "--fail-on-untracked-directories "
        "--fail-on-other-unit "
        "--untracked-files all"
    )


def release_evidence_final_gate_command(candidate_id: str | None = None) -> str:
    candidate = normalized_candidate_identifier(candidate_id or "") or "<tag-or-sha>"
    return (
        "python3 scripts/check_release_evidence.py "
        "--strict "
        "--require-candidate-id "
        f"--candidate-id {candidate}"
    )


def final_gate_commands(candidate_id: str | None = None) -> dict[str, str]:
    return {
        "release_scope": release_scope_final_gate_command(),
        "release_evidence": release_evidence_final_gate_command(candidate_id),
    }


def evidence_rejection(path: Path, expected_candidate_id: str | None = None) -> dict | None:
    findings = (
        filename_findings_for_evidence(path)
        + candidate_identifier_findings_for_evidence(path, expected_candidate_id)
        + provider_identity_findings_for_evidence(path)
        + provider_metadata_findings_for_evidence(path)
        + reverse_proxy_metadata_findings_for_evidence(path)
        + secret_findings_for_evidence(path)
    )
    if not findings:
        return None
    return {
        "path": str(path.relative_to(ROOT)),
        "reason": "invalid release evidence",
        "findings": findings,
    }


def print_rejected_evidence(rejections: list[dict], indent: str = "") -> None:
    for rejected in rejections:
        print(f"{indent}- `{rejected['path']}`: {rejected['reason']}")
        for finding in rejected["findings"]:
            print(
                f"{indent}  - line `{finding['line']}`: `{finding['type']}` - {finding['remediation']}"
            )


def print_reverse_proxy_status_expectations(item: dict, indent: str = "") -> None:
    status_expectations = item.get("check_status_expectations") or {}
    result_expectations = item.get("check_result_expectations") or {}
    if status_expectations:
        print(f"{indent}- Expected statuses:")
        for check in item.get("required_check_fields", []):
            statuses = status_expectations.get(check)
            if not statuses:
                continue
            expected = ", ".join(f"`{status}`" for status in statuses)
            print(f"{indent}  - {check}: {expected}")
    if not result_expectations:
        return
    print(f"{indent}- Expected non-status checks:")
    for check in item.get("required_check_fields", []):
        expected_result = result_expectations.get(check)
        if not expected_result:
            continue
        print(f"{indent}  - {check}: {expected_result}")


def print_markdown_remediation(item: dict) -> None:
    if not item["required"]:
        return

    if item["name"] == "provider-live-validation":
        scopes = item.get("provider_scopes") or list(PROVIDER_SCOPES)
        print("### Remediation")
        print()
        print(f"- Preflight: `{item['preflight_command']}`")
        print(f"- Env template: `{item['env_template_command']}`")
        print(f"- Provider test: `{item['provider_test_command']}`")
        print(f"- Evidence template: `{item['evidence_template']}`")
        print(f"- Required metadata: {item['required_metadata']}")
        print("- Evidence targets:")
        for scope in scopes:
            print(f"  - `{scope}`: `{item['evidence_targets'][scope]}`")
        print()
        return

    if item["name"] == "reverse-proxy-smoke":
        print("### Remediation")
        print()
        print(f"- Preflight: `{item['preflight_command']}`")
        print(f"- Env template: `{item['env_template_command']}`")
        print(f"- Smoke command: `{item['smoke_command']}`")
        print(f"- Evidence target: `{item['evidence_target']}`")
        print(f"- Required metadata: {item['required_metadata']}")
        print_reverse_proxy_status_expectations(item)
        print()


def summarize(entries: list[StatusEntry], expected_candidate_id: str | None = None) -> dict:
    normalized_expected_candidate_id = normalized_candidate_identifier(expected_candidate_id or "")
    provider_paths = sorted(entry.path for entry in entries if is_provider_change(entry.path))
    provider_scopes = sorted(
        {
            scope
            for path in provider_paths
            for scope in provider_scopes_for_path(path)
        },
        key=PROVIDER_SCOPES.index,
    )
    reverse_proxy_paths = sorted(entry.path for entry in entries if is_reverse_proxy_change(entry.path))
    evidence = evidence_files()
    rejections = {path: evidence_rejection(path, normalized_expected_candidate_id) for path in evidence}
    rejected_evidence = [rejection for rejection in rejections.values() if rejection]
    provider_evidence = [
        path for path in evidence if has_provider_live_outcome(path) and not rejections[path]
    ]
    provider_evidence_by_scope = {
        scope: [str(path.relative_to(ROOT)) for path in provider_evidence if provider_scope_from_evidence(path) == scope]
        for scope in PROVIDER_SCOPES
    }
    missing_provider_scopes = [
        scope for scope in provider_scopes if not provider_evidence_by_scope.get(scope)
    ]
    reverse_proxy_evidence = [
        path for path in evidence if has_reverse_proxy_pass(path) and not rejections[path]
    ]

    requirements = [
        {
            "name": "provider-live-validation",
            "required": bool(provider_paths),
            "satisfied": not missing_provider_scopes if provider_paths else True,
            "trigger_paths": provider_paths,
            "evidence_files": [str(path.relative_to(ROOT)) for path in provider_evidence],
            "evidence_by_provider_scope": provider_evidence_by_scope,
            "missing_provider_scopes": missing_provider_scopes,
            "provider_scopes": provider_scopes,
            "guidance": "Run affected provider live validation and record one evidence file per affected provider.",
            **provider_remediation_fields(provider_scopes, normalized_expected_candidate_id),
        },
        {
            "name": "reverse-proxy-smoke",
            "required": bool(reverse_proxy_paths),
            "satisfied": bool(reverse_proxy_evidence) if reverse_proxy_paths else True,
            "trigger_paths": reverse_proxy_paths,
            "evidence_files": [str(path.relative_to(ROOT)) for path in reverse_proxy_evidence],
            "evidence_by_provider_scope": {},
            "missing_provider_scopes": [],
            "provider_scopes": [],
            "guidance": "Run scripts/deploy_smoke.sh with DEPLOY_SMOKE_EVIDENCE_FILE and keep the generated evidence file.",
            **reverse_proxy_remediation_fields(normalized_expected_candidate_id),
        },
    ]

    return {
        "ready": not rejected_evidence and all(not item["required"] or item["satisfied"] for item in requirements),
        "candidate_id": normalized_expected_candidate_id,
        "requirements": requirements,
        "evidence_files": [str(path.relative_to(ROOT)) for path in evidence],
        "rejected_evidence_files": rejected_evidence,
        "final_gate_commands": final_gate_commands(normalized_expected_candidate_id),
    }


def print_markdown(summary: dict) -> None:
    print("# Release Evidence Audit")
    print()
    print(f"- Status: `{'ready' if summary['ready'] else 'blocked'}`")
    if summary.get("candidate_id"):
        print(f"- Expected candidate: `{summary['candidate_id']}`")
    print()
    if summary.get("rejected_evidence_files"):
        print("## Rejected Evidence Findings")
        print()
        print_rejected_evidence(summary["rejected_evidence_files"])
        print()
    for item in summary["requirements"]:
        status = "not required"
        if item["required"]:
            status = "satisfied" if item["satisfied"] else "missing evidence"
        print(f"## {item['name']}")
        print()
        print(f"- Required: `{'yes' if item['required'] else 'no'}`")
        print(f"- Status: `{status}`")
        print(f"- Guidance: {item['guidance']}")
        if item.get("provider_scopes"):
            scopes = ", ".join(f"`{scope}`" for scope in item["provider_scopes"])
            print(f"- Suggested provider scopes: {scopes}")
        if item.get("missing_provider_scopes"):
            scopes = ", ".join(f"`{scope}`" for scope in item["missing_provider_scopes"])
            print(f"- Missing provider scopes: {scopes}")
        print()
        print_markdown_remediation(item)
        print("### Evidence Files")
        print()
        if item["evidence_files"]:
            for path in item["evidence_files"]:
                print(f"- `{path}`")
        else:
            print("- None detected.")
        print()
        print("### Trigger Paths")
        print()
        if item["trigger_paths"]:
            for path in item["trigger_paths"][:40]:
                print(f"- `{path}`")
            if len(item["trigger_paths"]) > 40:
                remaining = len(item["trigger_paths"]) - 40
                print(f"- ... `{remaining}` more path(s)")
        else:
            print("- None detected.")
        print()
    print_final_gate(summary)


def print_final_gate(summary: dict, checkbox: bool = False) -> None:
    print("## Final Gate")
    print()
    commands = summary["final_gate_commands"]
    prefix = "- [ ]" if checkbox else "-"
    print(f"{prefix} `{commands['release_scope']}` passes from the final candidate scope.")
    print(f"{prefix} `{commands['release_evidence']}` passes after evidence files are recorded.")


def print_checklist(summary: dict) -> None:
    print("# Release Evidence Checklist")
    print()
    print(f"- Status: `{'ready' if summary['ready'] else 'blocked'}`")
    if summary.get("candidate_id"):
        print(f"- Expected candidate: `{summary['candidate_id']}`")
    if summary.get("rejected_evidence_files"):
        print("- Rejected evidence must be sanitized before release approval:")
        print_rejected_evidence(summary["rejected_evidence_files"], indent="  ")
    print()
    for item in summary["requirements"]:
        required = bool(item["required"])
        satisfied = bool(item["satisfied"])
        checkbox = "x" if not required or satisfied else " "
        status = "not required"
        if required:
            status = "satisfied" if satisfied else "missing evidence"
        print(f"- [{checkbox}] `{item['name']}`: `{status}`")
        print(f"  - Guidance: {item['guidance']}")
        if item["name"] == "provider-live-validation" and required:
            scopes = item.get("provider_scopes") or list(PROVIDER_SCOPES)
            scope_list = ", ".join(f"`{scope}`" for scope in scopes)
            print(f"  - Suggested provider scopes: {scope_list}")
            print(f"  - Preflight: `{item['preflight_command']}`")
            print(f"  - Env template: `{item['env_template_command']}`")
            print(f"  - Provider test: `{item['provider_test_command']}`")
            print(f"  - Evidence template: `{item['evidence_template']}`")
            print(f"  - Required metadata: {item['required_metadata']}")
            print("  - Evidence targets:")
            for scope in scopes:
                print(f"    - `{scope}`: `{item['evidence_targets'][scope]}`")
        if item["name"] == "reverse-proxy-smoke" and required:
            print(f"  - Preflight: `{item['preflight_command']}`")
            print(f"  - Env template: `{item['env_template_command']}`")
            print(f"  - Smoke command: `{item['smoke_command']}`")
            print(f"  - Evidence target: `{item['evidence_target']}`")
            print(f"  - Required metadata: {item['required_metadata']}")
            print_reverse_proxy_status_expectations(item, indent="  ")
        if item["evidence_files"]:
            print("  - Detected evidence:")
            for path in item["evidence_files"]:
                print(f"    - `{path}`")
        if item.get("missing_provider_scopes"):
            scopes = ", ".join(f"`{scope}`" for scope in item["missing_provider_scopes"])
            print(f"  - Missing provider scopes: {scopes}")
        if item["trigger_paths"]:
            shown = item["trigger_paths"][:8]
            print("  - Trigger sample:")
            for path in shown:
                print(f"    - `{path}`")
            if len(item["trigger_paths"]) > len(shown):
                print(f"    - ... `{len(item['trigger_paths']) - len(shown)}` more path(s)")
    print()
    print_final_gate(summary, checkbox=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report whether current changed files require provider or reverse-proxy release evidence."
    )
    parser.add_argument(
        "--format",
        choices=("markdown", "json", "checklist"),
        default="markdown",
        help="Output format.",
    )
    parser.add_argument(
        "--untracked-files",
        choices=("normal", "all"),
        default="normal",
        help="Match git status untracked-file expansion. Use 'all' for file-level inventory inside untracked directories.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when required live evidence is missing.",
    )
    parser.add_argument(
        "--candidate-id",
        default="",
        help="Require evidence `S3Desk commit SHA or release tag` values to match this tag or commit SHA.",
    )
    parser.add_argument(
        "--require-candidate-id",
        action="store_true",
        help="Fail unless --candidate-id is provided. Use this for final release-candidate approval gates.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    candidate_id = normalized_candidate_identifier(args.candidate_id)
    if args.require_candidate_id and not candidate_id:
        print(
            "[release-evidence] --require-candidate-id requires --candidate-id <tag-or-sha>.",
            file=sys.stderr,
        )
        return 2
    if candidate_id and is_placeholder_value(candidate_id):
        print("[release-evidence] --candidate-id must be a concrete tag or commit SHA.", file=sys.stderr)
        return 2
    summary = summarize(run_git_status(args.untracked_files), candidate_id)
    if args.format == "json":
        print(json.dumps(summary, indent=2, sort_keys=True))
    elif args.format == "checklist":
        print_checklist(summary)
    else:
        print_markdown(summary)

    if args.strict and not summary["ready"]:
        print("[release-evidence] required release evidence is missing.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
