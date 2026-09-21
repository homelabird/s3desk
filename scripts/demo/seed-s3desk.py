"""Register the SeaweedFS demo without replacing other provider profiles."""

import ipaddress
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


API_TOKEN = os.environ.get("API_TOKEN", "s3desk-demo-local-only-token-0123456789abcdef012345")


def _normalize_url(raw: str | None) -> str:
    return (raw or "").strip().rstrip("/")


def _normalize_api_base(raw: str) -> str:
    normalized = _normalize_url(raw)
    if normalized.endswith("/api/v1"):
        normalized = normalized[: -len("/api/v1")]
    return normalized


def _is_local_only_host(host: str) -> bool:
    normalized = host.strip().lower().strip("[]").rstrip(".")
    if normalized == "localhost" or normalized.endswith(".localhost"):
        return True
    try:
        ip = ipaddress.ip_address(normalized)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_link_local


def _validate_endpoint(value: str, label: str, allow_path: bool = False) -> None:
    # Reject URLs containing credentials and never echo their value in errors.
    try:
        parsed = urllib.parse.urlsplit(value)
        valid = (
            parsed.scheme in {"http", "https"}
            and bool(parsed.hostname)
            and parsed.username is None
            and parsed.password is None
            and not parsed.query
            and not parsed.fragment
            and (allow_path or parsed.path in {"", "/"})
        )
        _ = parsed.port  # Validate malformed/non-numeric/out-of-range ports.
    except ValueError:
        valid = False
    if not valid:
        raise RuntimeError(f"{label} must be an HTTP(S) URL without credentials, query or fragment")


def _effective_public_endpoint(raw: str, public_host: str) -> str:
    value = _normalize_url(raw)
    _validate_endpoint(value, "SEAWEEDFS_PUBLIC_ENDPOINT")
    host = urllib.parse.urlsplit(value).hostname or ""
    # ALLOW_REMOTE also enables container-to-container traffic. It does not tell
    # us whether the user's browser runs locally, so use DEMO_PUBLIC_HOST here.
    if not _is_local_only_host(public_host) and _is_local_only_host(host):
        raise RuntimeError("SEAWEEDFS_PUBLIC_ENDPOINT is local-only but DEMO_PUBLIC_HOST is remote")
    if host.lower() in {"seaweedfs", "s3desk", "0.0.0.0", "::"}:
        raise RuntimeError("SEAWEEDFS_PUBLIC_ENDPOINT must be reachable by the browser, not a container-only address")
    return value


S3DESK_API_BASE = _normalize_api_base(os.environ.get("S3DESK_API_BASE", "http://s3desk:8080"))
DEMO_PUBLIC_HOST = os.environ.get("DEMO_PUBLIC_HOST", "127.0.0.1")
DEMO_PROFILE_NAME = os.environ.get("DEMO_PROFILE_NAME", "SeaweedFS Demo").strip()
DEMO_BUCKET = os.environ.get("DEMO_BUCKET", "demo-bucket")
SEAWEEDFS_ACCESS_KEY = os.environ.get("SEAWEEDFS_ACCESS_KEY", "demo-seaweedfs")
SEAWEEDFS_SECRET_KEY = os.environ.get("SEAWEEDFS_SECRET_KEY", "demo-seaweedfs-secret")
SEAWEEDFS_REGION = os.environ.get("SEAWEEDFS_REGION", "us-east-1")
SEAWEEDFS_INTERNAL_ENDPOINT = _normalize_url(
    os.environ.get("SEAWEEDFS_INTERNAL_ENDPOINT", "http://seaweedfs:8333")
)
SEAWEEDFS_PUBLIC_ENDPOINT = _normalize_url(
    os.environ.get("SEAWEEDFS_PUBLIC_ENDPOINT")
    or f"http://{DEMO_PUBLIC_HOST}:{os.environ.get('SEAWEEDFS_API_PORT', '8333')}"
)


def validate_config() -> None:
    if not API_TOKEN or not SEAWEEDFS_ACCESS_KEY or not SEAWEEDFS_SECRET_KEY:
        raise RuntimeError("API_TOKEN and SeaweedFS credentials must be non-empty")
    if not DEMO_PROFILE_NAME:
        raise RuntimeError("DEMO_PROFILE_NAME must be non-empty")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", DEMO_BUCKET):
        raise RuntimeError("DEMO_BUCKET must be 3-63 lowercase letters, digits or interior hyphens")
    _validate_endpoint(S3DESK_API_BASE, "S3DESK_API_BASE", allow_path=True)
    _validate_endpoint(SEAWEEDFS_INTERNAL_ENDPOINT, "SEAWEEDFS_INTERNAL_ENDPOINT")
    _effective_public_endpoint(SEAWEEDFS_PUBLIC_ENDPOINT, DEMO_PUBLIC_HOST)
    _readiness_timeout()


def _readiness_timeout() -> int:
    try:
        value = int(os.environ.get("DEMO_SEED_TIMEOUT_SECONDS", "180"))
    except ValueError:
        raise RuntimeError("DEMO_SEED_TIMEOUT_SECONDS must be an integer from 1 to 900") from None
    if not 1 <= value <= 900:
        raise RuntimeError("DEMO_SEED_TIMEOUT_SECONDS must be an integer from 1 to 900")
    return value


def _build_profile_payload() -> dict:
    return {
        "provider": "s3_compatible",
        "name": DEMO_PROFILE_NAME,
        "endpoint": SEAWEEDFS_INTERNAL_ENDPOINT,
        "publicEndpoint": _effective_public_endpoint(SEAWEEDFS_PUBLIC_ENDPOINT, DEMO_PUBLIC_HOST),
        "region": SEAWEEDFS_REGION,
        "accessKeyId": SEAWEEDFS_ACCESS_KEY,
        "secretAccessKey": SEAWEEDFS_SECRET_KEY,
        "forcePathStyle": True,
        "preserveLeadingSlash": False,
        "tlsInsecureSkipVerify": False,
    }


def request_json(method: str, url: str, payload=None, profile_id: str | None = None, timeout: float = 10):
    body = None
    headers = {"X-Api-Token": API_TOKEN}
    if profile_id:
        headers["X-Profile-Id"] = profile_id
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        return json.loads(raw.decode("utf-8")) if raw else None


def wait_for_meta() -> None:
    deadline = time.monotonic() + _readiness_timeout()
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("S3Desk API did not become ready before DEMO_SEED_TIMEOUT_SECONDS")
        try:
            request_json("GET", f"{S3DESK_API_BASE}/api/v1/meta", timeout=min(10, remaining))
            return
        except urllib.error.HTTPError as exc:
            # Bad auth/host configuration is not a service-startup delay.
            if exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise RuntimeError(f"S3Desk readiness returned HTTP {exc.code}; check API_TOKEN and ALLOWED_HOSTS") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(1, remaining))


def ensure_profile() -> str:
    profiles_url = f"{S3DESK_API_BASE}/api/v1/profiles"
    profiles = request_json("GET", profiles_url) or []
    matches = [profile for profile in profiles if profile.get("name") == DEMO_PROFILE_NAME]
    if len(matches) > 1:
        raise RuntimeError("Multiple profiles use DEMO_PROFILE_NAME; select a unique demo profile name")
    payload = _build_profile_payload()
    if matches:
        profile = matches[0]
        if (profile.get("provider") != "s3_compatible"
                or _normalize_url(profile.get("endpoint")) != SEAWEEDFS_INTERNAL_ENDPOINT):
            raise RuntimeError("DEMO_PROFILE_NAME belongs to a different storage target; use a new name to preserve it")
        profile_id = profile["id"]
        request_json("PATCH", f"{profiles_url}/{urllib.parse.quote(profile_id, safe='')}", payload)
        return profile_id
    created = request_json("POST", profiles_url, payload)
    return created["id"]


def ensure_bucket(profile_id: str) -> None:
    buckets_url = f"{S3DESK_API_BASE}/api/v1/buckets"
    buckets = request_json("GET", buckets_url, profile_id=profile_id) or []
    if not any(bucket.get("name") == DEMO_BUCKET for bucket in buckets):
        request_json("POST", buckets_url, {"name": DEMO_BUCKET}, profile_id=profile_id)


def test_profile(profile_id: str) -> None:
    encoded_id = urllib.parse.quote(profile_id, safe="")
    result = request_json("POST", f"{S3DESK_API_BASE}/api/v1/profiles/{encoded_id}/test")
    if not isinstance(result, dict) or result.get("ok") is not True:
        raise RuntimeError("SeaweedFS profile connection test failed; check storage readiness, credentials and rclone")


def main() -> None:
    validate_config()
    wait_for_meta()
    profile_id = ensure_profile()
    test_profile(profile_id)
    ensure_bucket(profile_id)
    # Do not dump profile payloads, credentials, tokens, or provider error bodies.
    sys.stdout.write(f"[s3desk-seed] ready: SeaweedFS profile registered, bucket={DEMO_BUCKET}\n")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as exc:
        sys.stderr.write(f"[s3desk-seed] API request failed (HTTP {exc.code}); check configuration\n")
        sys.exit(1)
    except RuntimeError as exc:
        sys.stderr.write(f"[s3desk-seed] {exc}\n")
        sys.exit(1)
    except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError, KeyError, TypeError):
        sys.stderr.write("[s3desk-seed] API connection or response failed; check S3Desk health and configuration\n")
        sys.exit(1)
