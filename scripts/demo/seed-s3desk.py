import json
import os
import sys
import time
import urllib.error
import urllib.request


API_TOKEN = os.environ.get("API_TOKEN", "demo-token")


def _normalize_url(raw: str) -> str:
    return raw.rstrip("/")


def _normalize_api_base(raw: str) -> str:
    normalized = _normalize_url(raw)
    if normalized.endswith("/api/v1"):
        normalized = normalized[: -len("/api/v1")]
    return normalized


S3DESK_API_BASE = _normalize_api_base(
    os.environ.get("S3DESK_API_BASE", "http://s3desk:8080")
)
DEMO_PROFILE_NAME = os.environ.get("DEMO_PROFILE_NAME", "MinIO Demo")
DEMO_BUCKET = os.environ.get("DEMO_BUCKET", "demo-bucket")
MINIO_ROOT_USER = os.environ.get("MINIO_ROOT_USER", "minioadmin")
MINIO_ROOT_PASSWORD = os.environ.get("MINIO_ROOT_PASSWORD", "minioadmin")
MINIO_REGION = os.environ.get("MINIO_REGION", "us-east-1")
MINIO_INTERNAL_ENDPOINT = _normalize_url(
    os.environ.get("MINIO_INTERNAL_ENDPOINT", "http://minio:9000")
)
MINIO_PUBLIC_ENDPOINT = _normalize_url(
    os.environ.get("MINIO_PUBLIC_ENDPOINT", "http://127.0.0.1:9000")
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
    payload = {
        "provider": "s3_compatible",
        "name": DEMO_PROFILE_NAME,
        "endpoint": MINIO_INTERNAL_ENDPOINT,
        "publicEndpoint": MINIO_PUBLIC_ENDPOINT,
        "region": MINIO_REGION,
        "accessKeyId": MINIO_ROOT_USER,
        "secretAccessKey": MINIO_ROOT_PASSWORD,
        "forcePathStyle": True,
        "preserveLeadingSlash": False,
        "tlsInsecureSkipVerify": False,
    }
    profiles = request_json("GET", profiles_url) or []
    for profile in profiles:
        if profile.get("name") == DEMO_PROFILE_NAME:
            request_json("PATCH", f"{profiles_url}/{profile['id']}", payload)
            return profile["id"]

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
