import json
import os
import sys
import time
import ipaddress
import urllib.error
import urllib.request
import urllib.parse


API_TOKEN = os.environ.get("API_TOKEN", "demo-token")


def _normalize_url(raw: str | None) -> str:
    return (raw or "").strip().rstrip("/")


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _is_local_only_host(host: str) -> bool:
    normalized = host.strip().lower().strip("[]").rstrip(".")
    if normalized == "":
        return False
    if normalized == "localhost" or normalized.endswith(".localhost"):
        return True
    try:
        ip = ipaddress.ip_address(normalized)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_link_local


def _effective_public_endpoint(raw: str | None, allow_remote: bool) -> str:
    value = _normalize_url(raw)
    if value == "":
        return ""
    parsed = urllib.parse.urlparse(value)
    host = parsed.hostname or ""
    if allow_remote and _is_local_only_host(host):
        return ""
    return value


def _build_profile_payload(public_endpoint: str, clear_public_endpoint: bool) -> dict:
    payload = {
        "provider": "s3_compatible",
        "name": DEMO_PROFILE_NAME,
        "endpoint": MINIO_INTERNAL_ENDPOINT,
        "region": MINIO_REGION,
        "accessKeyId": MINIO_ROOT_USER,
        "secretAccessKey": MINIO_ROOT_PASSWORD,
        "forcePathStyle": True,
        "preserveLeadingSlash": False,
        "tlsInsecureSkipVerify": False,
    }
    if public_endpoint:
        payload["publicEndpoint"] = public_endpoint
    elif clear_public_endpoint:
        payload["publicEndpoint"] = ""
    return payload


def _normalize_api_base(raw: str) -> str:
    normalized = _normalize_url(raw)
    if normalized.endswith("/api/v1"):
        normalized = normalized[: -len("/api/v1")]
    return normalized


S3DESK_API_BASE = _normalize_api_base(
    os.environ.get("S3DESK_API_BASE", "http://s3desk:8080")
)
DEMO_ALLOW_REMOTE = _env_bool("DEMO_ALLOW_REMOTE", True)
DEMO_PROFILE_NAME = os.environ.get("DEMO_PROFILE_NAME", "MinIO Demo")
DEMO_BUCKET = os.environ.get("DEMO_BUCKET", "demo-bucket")
MINIO_ROOT_USER = os.environ.get("MINIO_ROOT_USER", "minioadmin")
MINIO_ROOT_PASSWORD = os.environ.get("MINIO_ROOT_PASSWORD", "minioadmin")
MINIO_REGION = os.environ.get("MINIO_REGION", "us-east-1")
MINIO_INTERNAL_ENDPOINT = _normalize_url(
    os.environ.get("MINIO_INTERNAL_ENDPOINT", "http://minio:9000")
)
MINIO_PUBLIC_ENDPOINT = _effective_public_endpoint(
    os.environ.get("MINIO_PUBLIC_ENDPOINT", ""),
    DEMO_ALLOW_REMOTE,
)


def request_json(method: str, url: str, payload=None, profile_id: str | None = None):
    body = None
    headers = {"X-Api-Token": API_TOKEN}
    if profile_id:
        headers["X-Profile-Id"] = profile_id
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read()
        if not raw:
            return None
        return json.loads(raw.decode("utf-8"))


def wait_for_meta():
    meta_url = f"{S3DESK_API_BASE}/api/v1/meta"
    deadline = time.time() + 120
    while time.time() < deadline:
        try:
            request_json("GET", meta_url)
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError("s3desk API did not become ready in time")


def ensure_profile() -> str:
    profiles_url = f"{S3DESK_API_BASE}/api/v1/profiles"
    profiles = request_json("GET", profiles_url) or []
    for profile in profiles:
        if profile.get("name") == DEMO_PROFILE_NAME:
            payload = _build_profile_payload(
                MINIO_PUBLIC_ENDPOINT,
                clear_public_endpoint=bool(profile.get("publicEndpoint")) and not MINIO_PUBLIC_ENDPOINT,
            )
            request_json("PATCH", f"{profiles_url}/{profile['id']}", payload)
            return profile["id"]

    payload = _build_profile_payload(MINIO_PUBLIC_ENDPOINT, clear_public_endpoint=False)
    created = request_json("POST", profiles_url, payload)
    return created["id"]


def ensure_bucket(profile_id: str):
    buckets_url = f"{S3DESK_API_BASE}/api/v1/buckets"
    buckets = request_json("GET", buckets_url, profile_id=profile_id) or []
    for bucket in buckets:
        if bucket.get("name") == DEMO_BUCKET:
            return
    request_json("POST", buckets_url, {"name": DEMO_BUCKET}, profile_id=profile_id)


def test_profile(profile_id: str):
    request_json("POST", f"{S3DESK_API_BASE}/api/v1/profiles/{profile_id}/test")


def main():
    wait_for_meta()
    profile_id = ensure_profile()
    test_profile(profile_id)
    ensure_bucket(profile_id)
    sys.stdout.write(f"seeded profile={profile_id} bucket={DEMO_BUCKET}\n")


if __name__ == "__main__":
    main()
