import io
import json
import os
import shutil
import tarfile
import time
import urllib.error
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
PORTABLE_FAILURE_SCENARIO = os.environ.get("PORTABLE_FAILURE_SCENARIO", "").strip().lower()


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


def request_json_with_status(method: str, url: str, payload=None, profile_id: str | None = None, extra_headers: dict | None = None):
    try:
        data = request_json(method, url, payload=payload, profile_id=profile_id, extra_headers=extra_headers)
        return 200, data
    except urllib.error.HTTPError as err:
        raw = err.read()
        payload_obj = json.loads(raw.decode("utf-8")) if raw else None
        return err.code, payload_obj


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
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            return resp.status, payload
    except urllib.error.HTTPError as err:
        raw = err.read()
        payload_obj = json.loads(raw.decode("utf-8")) if raw else None
        return err.code, payload_obj


def assert_true(condition: bool, message: str):
    if not condition:
        raise RuntimeError(message)


def error_message(payload: dict | None) -> str:
    error = (payload or {}).get("error") or {}
    return str(error.get("message") or "")


def error_details_error(payload: dict | None) -> str:
    error = (payload or {}).get("error") or {}
    details = error.get("details") or {}
    return str(details.get("error") or "")


def prepare_target_asset_failure():
    thumbnails_path = os.path.join(TARGET_DATA_DIR, "thumbnails")
    if os.path.isdir(thumbnails_path):
        shutil.rmtree(thumbnails_path)
    elif os.path.exists(thumbnails_path):
        os.remove(thumbnails_path)
    os.makedirs(thumbnails_path, exist_ok=True)
    os.chmod(TARGET_DATA_DIR, 0o500)


def verify_imported_profile(profile_id: str):
    profiles = request_json("GET", f"{TARGET_API_BASE}/profiles") or []
    imported_profile = next((item for item in profiles if item.get("id") == profile_id), None)
    assert_true(imported_profile is not None, f"imported profile {profile_id} not found")


def run_wrong_password():
    archive, _, names = download_portable_bundle()
    assert_true("payload.enc" in names, "encrypted bundle is missing payload.enc")

    preview_status, preview = post_bundle("/server/import-portable/preview", archive)
    assert_true(preview_status == 400, f"wrong_password preview status={preview_status}")
    assert_true(((preview or {}).get("error") or {}).get("code") == "portable_import_failed", f"wrong_password preview error.code={preview}")
    details_error = error_details_error(preview).lower()
    assert_true("signature mismatch" in details_error or "checksum mismatch" in details_error or "invalid" in details_error, f"wrong_password preview details.error={details_error}")

    import_status, imported = post_bundle("/server/import-portable", archive)
    assert_true(import_status == 400, f"wrong_password import status={import_status}")
    assert_true(((imported or {}).get("error") or {}).get("code") == "portable_import_failed", f"wrong_password import error.code={imported}")

    return {
        "scenario": "wrong_password",
        "previewStatus": preview_status,
        "importStatus": import_status,
        "previewError": preview,
        "importError": imported,
    }


def run_asset_copy_warning(profile_id: str):
    prepare_target_asset_failure()
    archive, _, _ = download_portable_bundle()
    import_status, imported = post_bundle("/server/import-portable", archive)
    assert_true(import_status == 201, f"asset_copy_warning import status={import_status}")
    warnings = imported.get("warnings") or []
    assert_true(
        any("failed to reset thumbnail assets" in item.lower() or "failed to copy thumbnail assets" in item.lower() for item in warnings),
        f"asset_copy_warning warnings={warnings}",
    )
    assert_true(not imported.get("assetStagingDir"), f"asset_copy_warning assetStagingDir={imported.get('assetStagingDir')}")
    verify_imported_profile(profile_id)

    return {
        "scenario": "asset_copy_warning",
        "importStatus": import_status,
        "warnings": warnings,
    }


def run_key_mismatch():
    archive, _, _ = download_portable_bundle()
    preview_status, preview = post_bundle("/server/import-portable/preview", archive)
    assert_true(preview_status == 200, f"key_mismatch preview status={preview_status}")
    blockers = ((preview or {}).get("preflight") or {}).get("blockers") or []
    assert_true(any("does not match the portable bundle encryption fingerprint" in item for item in blockers), f"key_mismatch preview blockers={blockers}")

    import_status, imported = post_bundle("/server/import-portable", archive)
    assert_true(import_status == 200, f"key_mismatch import status={import_status}")
    import_blockers = ((imported or {}).get("preflight") or {}).get("blockers") or []
    assert_true(any("does not match the portable bundle encryption fingerprint" in item for item in import_blockers), f"key_mismatch import blockers={import_blockers}")

    return {
        "scenario": "key_mismatch",
        "previewStatus": preview_status,
        "importStatus": import_status,
        "previewBlockers": blockers,
        "importBlockers": import_blockers,
    }


def run_preflight_blocker():
    archive, _, _ = download_portable_bundle()
    preview_status, preview = post_bundle("/server/import-portable/preview", archive)
    assert_true(preview_status == 200, f"preflight_blocker preview status={preview_status}")
    blockers = ((preview or {}).get("preflight") or {}).get("blockers") or []
    assert_true(any("missing ENCRYPTION_KEY required by the portable bundle" in item for item in blockers), f"preflight_blocker preview blockers={blockers}")

    import_status, imported = post_bundle("/server/import-portable", archive)
    assert_true(import_status == 200, f"preflight_blocker import status={import_status}")
    import_blockers = ((imported or {}).get("preflight") or {}).get("blockers") or []
    assert_true(any("missing ENCRYPTION_KEY required by the portable bundle" in item for item in import_blockers), f"preflight_blocker import blockers={import_blockers}")

    return {
        "scenario": "preflight_blocker",
        "previewStatus": preview_status,
        "importStatus": import_status,
        "previewBlockers": blockers,
        "importBlockers": import_blockers,
    }


def main():
    if PORTABLE_FAILURE_SCENARIO not in {"wrong_password", "asset_copy_warning", "key_mismatch", "preflight_blocker"}:
        raise RuntimeError(f"unsupported PORTABLE_FAILURE_SCENARIO={PORTABLE_FAILURE_SCENARIO!r}")

    wait_for_api(SOURCE_API_BASE)
    wait_for_api(TARGET_API_BASE)
    fixture = load_fixture()
    profile_id = fixture["profileId"]

    if PORTABLE_FAILURE_SCENARIO == "wrong_password":
        result = run_wrong_password()
    elif PORTABLE_FAILURE_SCENARIO == "asset_copy_warning":
        result = run_asset_copy_warning(profile_id)
    elif PORTABLE_FAILURE_SCENARIO == "key_mismatch":
        result = run_key_mismatch()
    else:
        result = run_preflight_blocker()

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
