import io
import json
import os
import tarfile
import time
import urllib.request
import uuid


API_TOKEN = os.environ.get("API_TOKEN", "portable-token")
SOURCE_API_BASE = os.environ.get("SOURCE_API_BASE", "http://source:8080/api/v1").rstrip("/")
TARGET_API_BASE = os.environ.get("TARGET_API_BASE", "http://target:8080/api/v1").rstrip("/")
TARGET_DATA_DIR = os.environ.get("TARGET_DATA_DIR", "/target-data")
FIXTURE_PATH = os.environ.get("FIXTURE_PATH", "/artifacts/portable-fixture.json")
PORTABLE_BUNDLE_CONFIDENTIALITY = os.environ.get("PORTABLE_BUNDLE_CONFIDENTIALITY", "clear").strip().lower()
PORTABLE_BUNDLE_PASSWORD = os.environ.get("PORTABLE_BUNDLE_PASSWORD", "")
PORTABLE_BUNDLE_EXPORT_PASSWORD = os.environ.get("PORTABLE_BUNDLE_EXPORT_PASSWORD", PORTABLE_BUNDLE_PASSWORD)
PORTABLE_BUNDLE_IMPORT_PASSWORD = os.environ.get("PORTABLE_BUNDLE_IMPORT_PASSWORD", PORTABLE_BUNDLE_PASSWORD)
EXPECTED_SOURCE_DB_BACKEND = os.environ.get("EXPECTED_SOURCE_DB_BACKEND", "sqlite").strip().lower()
EXPECTED_TARGET_DB_BACKEND = os.environ.get("EXPECTED_TARGET_DB_BACKEND", "postgres").strip().lower()


def request(method: str, url: str, payload=None, profile_id: str | None = None, extra_headers: dict | None = None):
    body = None
    headers = {"X-Api-Token": API_TOKEN}
    if profile_id:
        headers["X-Profile-Id"] = profile_id
    if extra_headers:
        headers.update(extra_headers)
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=60)


def request_json(method: str, url: str, payload=None, profile_id: str | None = None, extra_headers: dict | None = None):
    with request(method, url, payload=payload, profile_id=profile_id, extra_headers=extra_headers) as resp:
        raw = resp.read()
        if not raw:
            return None
        return json.loads(raw.decode("utf-8"))


def request_error_json(method: str, url: str, payload=None, profile_id: str | None = None, extra_headers: dict | None = None):
    try:
        request_json(method, url, payload=payload, profile_id=profile_id, extra_headers=extra_headers)
    except urllib.error.HTTPError as err:
        raw = err.read()
        payload_obj = json.loads(raw.decode("utf-8")) if raw else None
        return err.code, payload_obj
    raise RuntimeError(f"expected {method} {url} to fail")


def wait_for_api(base_url: str):
    deadline = time.time() + 180
    while time.time() < deadline:
        try:
            request_json("GET", f"{base_url}/meta")
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f"API did not become ready in time: {base_url}")


def load_fixture():
    deadline = time.time() + 60
    while time.time() < deadline:
        if os.path.exists(FIXTURE_PATH):
            with open(FIXTURE_PATH, "r", encoding="utf-8") as fh:
                return json.load(fh)
        time.sleep(1)
    raise RuntimeError(f"fixture file did not appear: {FIXTURE_PATH}")


def download_portable_bundle() -> tuple[bytes, dict, list[str]]:
    if PORTABLE_BUNDLE_CONFIDENTIALITY not in {"clear", "encrypted"}:
        raise RuntimeError(f"unsupported PORTABLE_BUNDLE_CONFIDENTIALITY={PORTABLE_BUNDLE_CONFIDENTIALITY}")
    query = "?scope=portable&includeThumbnails=true"
    if PORTABLE_BUNDLE_CONFIDENTIALITY != "clear":
        query += f"&confidentiality={PORTABLE_BUNDLE_CONFIDENTIALITY}"
    headers = {}
    if PORTABLE_BUNDLE_EXPORT_PASSWORD:
        headers["X-S3Desk-Backup-Password"] = PORTABLE_BUNDLE_EXPORT_PASSWORD
    with request("GET", f"{SOURCE_API_BASE}/server/backup{query}", extra_headers=headers) as resp:
        archive = resp.read()
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tf:
        names = tf.getnames()
        manifest_member = tf.extractfile("manifest.json")
        if manifest_member is None:
            raise RuntimeError("portable bundle is missing manifest.json")
        manifest = json.load(manifest_member)
    return archive, manifest, names


def encode_multipart(fields: dict[str, str], file_field: str, filename: str, content: bytes) -> tuple[bytes, str]:
    boundary = f"----s3desk-smoke-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )
    chunks.extend(
        [
            f"--{boundary}\r\n".encode("utf-8"),
            f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode("utf-8"),
            b"Content-Type: application/gzip\r\n\r\n",
            content,
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ]
    )
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def post_bundle(path: str, archive: bytes):
    fields = {}
    if PORTABLE_BUNDLE_IMPORT_PASSWORD:
        fields["password"] = PORTABLE_BUNDLE_IMPORT_PASSWORD
    body, content_type = encode_multipart(fields, "bundle", "portable-backup.tar.gz", archive)
    headers = {"X-Api-Token": API_TOKEN, "Content-Type": content_type}
    req = urllib.request.Request(f"{TARGET_API_BASE}{path}", data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
        return resp.status, payload


def find_entity(entities: list[dict], name: str) -> dict:
    for entity in entities:
        if entity.get("name") == name:
            return entity
    raise RuntimeError(f"portable import response is missing entity {name}")


def assert_true(condition: bool, message: str):
    if not condition:
        raise RuntimeError(message)


def main():
    wait_for_api(SOURCE_API_BASE)
    wait_for_api(TARGET_API_BASE)
    fixture = load_fixture()

    archive, manifest, names = download_portable_bundle()
    assert_true(manifest.get("bundleKind") == "portable", f"unexpected bundle kind: {manifest.get('bundleKind')}")
    assert_true(manifest.get("dbBackend") == EXPECTED_SOURCE_DB_BACKEND, f"manifest dbBackend={manifest.get('dbBackend')}")
    assert_true("manifest.json" in names, "portable archive is missing manifest.json")
    assert_true("data/s3desk.db" not in names, "portable archive must not contain data/s3desk.db")
    manifest_entries = set(manifest.get("entries") or [])
    assert_true("data/profiles.jsonl" in manifest_entries, "portable manifest is missing data/profiles.jsonl")
    if PORTABLE_BUNDLE_CONFIDENTIALITY == "encrypted":
        assert_true(manifest.get("confidentialityMode") == "encrypted", f"manifest.confidentialityMode={manifest.get('confidentialityMode')}")
        assert_true("payload.enc" in names, "encrypted portable archive is missing payload.enc")
        assert_true("data/profiles.jsonl" not in names, "encrypted portable archive must not expose clear data entries")
    else:
        assert_true("data/profiles.jsonl" in names, "portable archive is missing data/profiles.jsonl")

    preview_status, preview = post_bundle("/server/import-portable/preview", archive)
    assert_true(preview_status == 200, f"portable preview status={preview_status}")
    assert_true(preview.get("manifest", {}).get("bundleKind") == "portable", "preview manifest.bundleKind must be portable")
    assert_true(preview.get("targetDbBackend") == EXPECTED_TARGET_DB_BACKEND, f"preview targetDbBackend={preview.get('targetDbBackend')}")
    assert_true(not preview.get("preflight", {}).get("blockers"), f"preview blockers={preview.get('preflight', {}).get('blockers')}")
    assert_true(preview.get("preflight", {}).get("schemaReady") is True, "preview schemaReady must be true")
    assert_true(preview.get("preflight", {}).get("encryptionReady") is True, "preview encryptionReady must be true")
    assert_true(preview.get("preflight", {}).get("encryptionKeyHintVerified") is True, "preview encryptionKeyHintVerified must be true")
    assert_true(preview.get("preflight", {}).get("spaceReady") is True, "preview spaceReady must be true")

    import_status, imported = post_bundle("/server/import-portable", archive)
    assert_true(import_status == 201, f"portable import status={import_status}")
    assert_true(imported.get("targetDbBackend") == EXPECTED_TARGET_DB_BACKEND, f"import targetDbBackend={imported.get('targetDbBackend')}")
    assert_true(imported.get("verification", {}).get("entityChecksumsVerified") is True, "entityChecksumsVerified must be true")
    assert_true(imported.get("verification", {}).get("postImportHealthCheckPassed") is True, "postImportHealthCheckPassed must be true")

    minimum_counts = fixture.get("portableMinimumCounts") or {}
    for entity_name in [
        "profiles",
        "profile_connection_options",
        "jobs",
        "upload_sessions",
        "upload_multipart_uploads",
        "object_index",
        "object_favorites",
    ]:
        entity = find_entity(imported.get("entities", []), entity_name)
        assert_true(entity.get("checksumVerified") is True, f"{entity_name} checksumVerified must be true")
        minimum_count = int(minimum_counts.get(entity_name, 1))
        assert_true(entity.get("exportedCount", 0) >= minimum_count, f"{entity_name} exportedCount must be >= {minimum_count}")
        assert_true(entity.get("importedCount", 0) == entity.get("exportedCount", 0), f"{entity_name} importedCount must match exportedCount")

    profile_id = fixture["profileId"]
    profiles = request_json("GET", f"{TARGET_API_BASE}/profiles") or []
    imported_profile = next((item for item in profiles if item.get("id") == profile_id), None)
    assert_true(imported_profile is not None, f"imported profile {profile_id} not found")

    tls_status = request_json("GET", f"{TARGET_API_BASE}/profiles/{profile_id}/tls")
    assert_true(tls_status.get("mode") == "mtls", f"tls mode={tls_status.get('mode')}")
    assert_true(tls_status.get("hasClientCert") is True, "tls config missing client cert")
    assert_true(tls_status.get("hasClientKey") is True, "tls config missing client key")

    profile_test = request_json("POST", f"{TARGET_API_BASE}/profiles/{profile_id}/test")
    assert_true(bool(profile_test.get("ok")), f"imported profile connectivity test failed: {profile_test}")

    bucket = fixture["bucket"]
    favorites = request_json("GET", f"{TARGET_API_BASE}/buckets/{bucket}/objects/favorites?hydrate=false", profile_id=profile_id) or {}
    assert_true(favorites.get("count", 0) >= 1, f"favorites count={favorites.get('count')}")
    assert_true(fixture["favoriteKey"] in (favorites.get("keys") or []), f"favorite key missing: {fixture['favoriteKey']}")

    index_summary = request_json("GET", f"{TARGET_API_BASE}/buckets/{bucket}/objects/index-summary?sampleLimit=5", profile_id=profile_id) or {}
    assert_true(index_summary.get("objectCount", 0) >= 1, f"index objectCount={index_summary.get('objectCount')}")
    assert_true(bool(index_summary.get("indexedAt")), "index summary missing indexedAt")

    jobs = request_json("GET", f"{TARGET_API_BASE}/jobs", profile_id=profile_id) or {}
    items = jobs.get("items") or []
    assert_true(any(item.get("type") == "s3_index_objects" for item in items), "imported jobs do not include s3_index_objects")

    multipart_upload = fixture["multipartUpload"]
    commit_status, commit_error = request_error_json(
        "POST",
        f"{TARGET_API_BASE}/uploads/{multipart_upload['uploadId']}/commit",
        payload={},
        profile_id=profile_id,
    )
    assert_true(commit_status == 400, f"multipart commit status={commit_status}")
    error_code = ((commit_error or {}).get("error") or {}).get("code")
    assert_true(error_code == "upload_incomplete", f"multipart commit error.code={error_code}")

    thumbnail_path = os.path.join(TARGET_DATA_DIR, fixture["thumbnailRelPath"])
    assert_true(os.path.exists(thumbnail_path), f"imported thumbnail missing: {thumbnail_path}")

    result = {
        "sourceBackend": EXPECTED_SOURCE_DB_BACKEND,
        "targetBackend": EXPECTED_TARGET_DB_BACKEND,
        "profileId": profile_id,
        "bundleConfidentiality": PORTABLE_BUNDLE_CONFIDENTIALITY,
        "preview": preview,
        "import": imported,
        "favoritesCount": favorites.get("count"),
        "indexedObjectCount": index_summary.get("objectCount"),
        "jobsCount": len(items),
        "thumbnailPath": thumbnail_path,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
