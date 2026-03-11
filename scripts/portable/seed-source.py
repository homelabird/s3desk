import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid


API_TOKEN = os.environ.get("API_TOKEN", "portable-token")
SOURCE_API_BASE = os.environ.get("SOURCE_API_BASE", "http://source:8080/api/v1").rstrip("/")
SOURCE_DATA_DIR = os.environ.get("SOURCE_DATA_DIR", "/source-data")
FIXTURE_OUT = os.environ.get("FIXTURE_OUT", "/artifacts/portable-fixture.json")
PROFILE_NAME = os.environ.get("PROFILE_NAME", "Portable Smoke")
DEMO_BUCKET = os.environ.get("DEMO_BUCKET", "portable-bucket")
FAVORITE_KEY = os.environ.get("FAVORITE_KEY", "welcome.txt")
MINIO_ROOT_USER = os.environ.get("MINIO_ROOT_USER", "portable-minio")
MINIO_ROOT_PASSWORD = os.environ.get("MINIO_ROOT_PASSWORD", "portable-minio-secret")
MINIO_REGION = os.environ.get("MINIO_REGION", "us-east-1")
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://minio:9000")
MINIO_PUBLIC_ENDPOINT = os.environ.get("MINIO_PUBLIC_ENDPOINT", "http://minio:9000")
THUMBNAIL_NAME = os.environ.get("THUMBNAIL_NAME", "thumb.jpg")
TLS_CERT_PEM = """-----BEGIN CERTIFICATE-----
MIIDEzCCAfugAwIBAgIUTEJtDLQkCn3B8v0RkSi4+NeE74gwDQYJKoZIhvcNAQEL
BQAwGTEXMBUGA1UEAwwOcG9ydGFibGUtc21va2UwHhcNMjYwMzExMTcxMzE2WhcN
MjYwMzEyMTcxMzE2WjAZMRcwFQYDVQQDDA5wb3J0YWJsZS1zbW9rZTCCASIwDQYJ
KoZIhvcNAQEBBQADggEPADCCAQoCggEBAK3x3fxTTjVCHm0ZTXb5gxtwaRZk3wl8
l4e53LzQKuHF6TeN1dIMPyjP3dOnmJjoSOB9DSZflY4UneitXjSYY7z7cGpxRRx/
9FJXjzKDzL1PZzbdZIUqhPxJXnoHOOp6wZIm9r9oRpOiLmfEHAS0WgcEwgEZwBxX
5+bzmjEGaqDnvxxWiCk9UY9LhpDcewYP4+SIsJn5VG3Tjaayt9HAB+GbwRW9a2rB
Lkb57J4IDhZQbDpz92rjQQJfdDL0aSMjWTnbdK7gg7K028pfPaaRuvSFsSP/5uCP
Fp7IjLJo8BqnsSFpM97kIcO2ZulX9V1LVMDfDdshtYRweoDzOsVUYgECAwEAAaNT
MFEwHQYDVR0OBBYEFEWgXMcWPx1Y8ZHo4Mn2VFegYFW9MB8GA1UdIwQYMBaAFEWg
XMcWPx1Y8ZHo4Mn2VFegYFW9MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQEL
BQADggEBADKo+Ssmhj+OznR6DCakRGHhQP9UuK2rLX/QcpFvLN2qKzGp6+c2ftuE
uwvN7cUd+d6ue0UO5Baf6FN0QlTeHiIbVC93+d4ZEDkI3u08N8SRXAFFsnX4JkIh
wNVOoqAaHsqFzJBUUy9yFoIA9qmAzhJfeUUWePZ+GLtNC1xugLNAyZNamaZwxB9V
7mztyVATc6VxHSki6tlgh4eehdOqntBjw2wQFBQvkT1GZQlWL+Lln3U2rkFp5Nys
1qKW3UnoKwnVUkUP+bnHoIvOCus5KmfJzPchYiVaa9dCKraPKppL5Qk1oIIJcL8p
vehSEAZRmKZUCY34oJ93HBm2bTpfdRI=
-----END CERTIFICATE-----"""
TLS_KEY_PEM = """-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCt8d38U041Qh5t
GU12+YMbcGkWZN8JfJeHudy80Crhxek3jdXSDD8oz93Tp5iY6EjgfQ0mX5WOFJ3o
rV40mGO8+3BqcUUcf/RSV48yg8y9T2c23WSFKoT8SV56BzjqesGSJva/aEaToi5n
xBwEtFoHBMIBGcAcV+fm85oxBmqg578cVogpPVGPS4aQ3HsGD+PkiLCZ+VRt042m
srfRwAfhm8EVvWtqwS5G+eyeCA4WUGw6c/dq40ECX3Qy9GkjI1k523Su4IOytNvK
Xz2mkbr0hbEj/+bgjxaeyIyyaPAap7EhaTPe5CHDtmbpV/VdS1TA3w3bIbWEcHqA
8zrFVGIBAgMBAAECggEAHFDVtqgnAJN5WYA3dIkslxBnAv67shMmpbETZmcqu+MY
UnNT3eQhefbQoQ5U0HtrtaOVuuvvcBgaFpD2V3CBN/fkdmdm/Ts1Hhxj0rDS6PRe
lHdY0Da6PEmDSDEZyk3eafjOzRzf9FN/42NwvjFPwHm9TSmQdOy4cwevz5BAVl3u
bGOLsd9ZTwsjtCdfzKZrUtA0a4LOK/QNbknIwGSZ74Puji37Tj2DVpoVu2y387ep
gVDsiguavbYV1u45moaWbXex4z7WjoH9YwxjSh4f/nPxtnOCZcyqCi3SQAnVSpJV
a3Xw16cFyBgPdmYvszRb9rb2KCcfBD9VG3yY8Or9MwKBgQDmncur1h27GYJwlhuP
Si+qnt27/FJTu+pXDOelIjBGwCVcKnX3v7fbQXDLZAz4iZJ9EbCdd462Yg0DGU2i
9jdG8NR+s3r/uw7es+2QbuDMdnJa8JB2MvmCybp+OckGUi1SRpvEixIFPZB/ereP
IN8fDtD9ewbNiwesQKRxSaeA7wKBgQDBFzR2I+YBWjEEn5p39AVetk3DDyW+mqdS
yajtCDGfaejBwaU3UCsbzepB0ApJ3MDhX8Z8fkly06dEGHZNN98mmLDIfL2rSc8k
4khMtLxWxtUfmc7yhjrE2PtIDXsn1rdws1g4QTDx2DSsETsleUlsdt7zfl6FwBMq
+cFF6dFsDwKBgD63hS9LQLSkYFv8Bqy2UTZGlCjOmxkYjsdzw/+dx6FGGiLxjTl+
UyL2rhUyNXDWARewWubIH/Crw7wnAn0iFrBdSHzYlMe9eHLKXf4cmVghkkH3EGKE
xGR0Nhqj3m6wpJCukSgnZhQ0xPpWRltPZj6NCfsVnSkC+Wg4AECq9jnTAoGARgAy
na3QAad/48w0xM3rcHWo5VFFfr80b9f57MyuqLtNjYi1a8Mdjbvt9CQGxtZH+qyt
GY7y87T1i8NOiBn8RVLPrC9E16cveJCsY1qWeOMmeolZNCUjgx+ioXF5t2ypHit2
jRZdNyAJoGOyzJgW3UKO+zlR7S1ABbF7tuvYZ1MCgYANCrm2s+XzL2cNfWAsb92P
Ao8x+rd+teVcGshNahvC73tthaFFZWc/V7tEiC6voe2vOh2XkFy7Tjod+EVjdC8j
oB8tsv5067khTJ3NDZm+AMbuFrGKKxUb8yUMVZbJnfsmAvDBQNmnFrnnrEZC0Sq5
Mf0p4MczOY9mJu+L5TBf2A==
-----END PRIVATE KEY-----"""


def request(method: str, url: str, payload=None, profile_id: str | None = None):
    body = None
    headers = {"X-Api-Token": API_TOKEN}
    if profile_id:
        headers["X-Profile-Id"] = profile_id
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=30)


def request_json(method: str, url: str, payload=None, profile_id: str | None = None):
    with request(method, url, payload=payload, profile_id=profile_id) as resp:
        raw = resp.read()
        if not raw:
            return None
        return json.loads(raw.decode("utf-8"))


def encode_multipart(file_field: str, filename: str, content: bytes) -> tuple[bytes, str]:
    boundary = f"----s3desk-seed-{uuid.uuid4().hex}"
    body = b"".join(
        [
            f"--{boundary}\r\n".encode("utf-8"),
            f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode("utf-8"),
            b"Content-Type: application/octet-stream\r\n\r\n",
            content,
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ]
    )
    return body, f"multipart/form-data; boundary={boundary}"


def wait_for_meta():
    deadline = time.time() + 120
    while time.time() < deadline:
        try:
            request_json("GET", f"{SOURCE_API_BASE}/meta")
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError("source API did not become ready in time")


def ensure_profile() -> dict:
    payload = {
        "provider": "s3_compatible",
        "name": PROFILE_NAME,
        "endpoint": MINIO_ENDPOINT,
        "publicEndpoint": MINIO_PUBLIC_ENDPOINT,
        "region": MINIO_REGION,
        "accessKeyId": MINIO_ROOT_USER,
        "secretAccessKey": MINIO_ROOT_PASSWORD,
        "forcePathStyle": True,
        "preserveLeadingSlash": False,
        "tlsInsecureSkipVerify": False,
    }
    profiles_url = f"{SOURCE_API_BASE}/profiles"
    profiles = request_json("GET", profiles_url) or []
    for profile in profiles:
        if profile.get("name") == PROFILE_NAME:
            request_json("PATCH", f"{profiles_url}/{profile['id']}", payload)
            return profile
    return request_json("POST", profiles_url, payload)


def ensure_bucket(profile_id: str):
    buckets_url = f"{SOURCE_API_BASE}/buckets"
    buckets = request_json("GET", buckets_url, profile_id=profile_id) or []
    for bucket in buckets:
        if bucket.get("name") == DEMO_BUCKET:
            return
    request_json("POST", buckets_url, {"name": DEMO_BUCKET}, profile_id=profile_id)


def test_profile(profile_id: str):
    request_json("POST", f"{SOURCE_API_BASE}/profiles/{profile_id}/test")


def ensure_favorite(profile_id: str):
    favorites_url = f"{SOURCE_API_BASE}/buckets/{DEMO_BUCKET}/objects/favorites?hydrate=false"
    favorites = request_json("GET", favorites_url, profile_id=profile_id) or {}
    keys = favorites.get("keys") or []
    if FAVORITE_KEY in keys:
        return
    request_json(
        "POST",
        f"{SOURCE_API_BASE}/buckets/{DEMO_BUCKET}/objects/favorites",
        {"key": FAVORITE_KEY},
        profile_id=profile_id,
    )


def create_index_job(profile_id: str) -> str:
    job = request_json(
        "POST",
        f"{SOURCE_API_BASE}/jobs",
        {"type": "s3_index_objects", "payload": {"bucket": DEMO_BUCKET, "prefix": "", "fullReindex": True}},
        profile_id=profile_id,
    )
    return job["id"]


def wait_for_job(profile_id: str, job_id: str):
    deadline = time.time() + 180
    while time.time() < deadline:
        job = request_json("GET", f"{SOURCE_API_BASE}/jobs/{job_id}", profile_id=profile_id)
        status = (job or {}).get("status", "")
        if status == "succeeded":
            return job
        if status in {"failed", "canceled"}:
            raise RuntimeError(f"index job {job_id} finished with status={status}: {job}")
        time.sleep(1)
    raise RuntimeError(f"index job {job_id} did not finish in time")


def put_profile_tls(profile_id: str):
    request_json(
        "PUT",
        f"{SOURCE_API_BASE}/profiles/{profile_id}/tls",
        {
            "mode": "mtls",
            "caCertPem": TLS_CERT_PEM,
            "clientCertPem": TLS_CERT_PEM,
            "clientKeyPem": TLS_KEY_PEM,
        },
    )


def write_thumbnail(profile_id: str) -> str:
    rel_path = f"thumbnails/{profile_id}/{DEMO_BUCKET}/{THUMBNAIL_NAME}"
    abs_path = os.path.join(SOURCE_DATA_DIR, rel_path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "wb") as fh:
        fh.write(b"portable-smoke-thumbnail")
    return rel_path


def create_upload_session(profile_id: str, mode: str, prefix: str) -> dict:
    return request_json(
        "POST",
        f"{SOURCE_API_BASE}/uploads",
        {"bucket": DEMO_BUCKET, "prefix": prefix, "mode": mode},
        profile_id=profile_id,
    )


def upload_staging_file(profile_id: str, upload_id: str, relative_path: str, content: bytes):
    body, content_type = encode_multipart("files", relative_path, content)
    req = urllib.request.Request(
        f"{SOURCE_API_BASE}/uploads/{upload_id}/files",
        data=body,
        headers={"X-Api-Token": API_TOKEN, "X-Profile-Id": profile_id, "Content-Type": content_type},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 204:
            raise RuntimeError(f"unexpected staging upload status={resp.status}")


def create_presigned_multipart_metadata(profile_id: str, upload_id: str) -> dict:
    file_size = 11 * 1024 * 1024
    part_size = 5 * 1024 * 1024
    return request_json(
        "POST",
        f"{SOURCE_API_BASE}/uploads/{upload_id}/presign",
        {
            "path": "multipart/portable-large.bin",
            "contentType": "application/octet-stream",
            "multipart": {
                "fileSize": file_size,
                "partSizeBytes": part_size,
                "partNumbers": [1, 2, 3],
            },
        },
        profile_id=profile_id,
    )


def write_fixture(data: dict):
    os.makedirs(os.path.dirname(FIXTURE_OUT), exist_ok=True)
    with open(FIXTURE_OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")


def main():
    wait_for_meta()
    profile = ensure_profile()
    profile_id = profile["id"]
    ensure_bucket(profile_id)
    test_profile(profile_id)
    ensure_favorite(profile_id)
    job_id = create_index_job(profile_id)
    completed_job = wait_for_job(profile_id, job_id)
    put_profile_tls(profile_id)
    staging_upload = create_upload_session(profile_id, "staging", "seed-staging")
    upload_staging_file(profile_id, staging_upload["uploadId"], "notes/seed.txt", b"portable-seed-upload")
    presigned_upload = create_upload_session(profile_id, "presigned", "seed-presigned")
    multipart_presign = create_presigned_multipart_metadata(profile_id, presigned_upload["uploadId"])
    thumbnail_rel_path = write_thumbnail(profile_id)

    fixture = {
        "profileId": profile_id,
        "profileName": PROFILE_NAME,
        "bucket": DEMO_BUCKET,
        "favoriteKey": FAVORITE_KEY,
        "indexJobId": completed_job["id"],
        "uploadSessionIds": [staging_upload["uploadId"], presigned_upload["uploadId"]],
        "multipartUpload": {
            "uploadId": presigned_upload["uploadId"],
            "path": "multipart/portable-large.bin",
            "partCount": (multipart_presign.get("multipart") or {}).get("partCount"),
        },
        "thumbnailRelPath": thumbnail_rel_path,
        "portableMinimumCounts": {
            "profiles": 1,
            "profile_connection_options": 1,
            "jobs": 1,
            "upload_sessions": 2,
            "upload_multipart_uploads": 1,
            "object_index": 1,
            "object_favorites": 1,
        },
    }
    write_fixture(fixture)
    sys.stdout.write(json.dumps(fixture, indent=2) + "\n")


if __name__ == "__main__":
    main()
