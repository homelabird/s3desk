import json
import os
import time
import uuid
import urllib.request
import urllib.error
import urllib.parse


BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")
API_TOKEN = os.environ.get("API_TOKEN", "change-me")


class HTTPFailure(RuntimeError):
    def __init__(
        self,
        status: int,
        method: str,
        path: str,
        *,
        headers: dict[str, str] | None = None,
        body_text: str | None = None,
        error_code: str | None = None,
        normalized_code: str | None = None,
        normalized_retryable: bool | None = None,
        retry_after: str | None = None,
        request_id: str | None = None,
    ) -> None:
        super().__init__(f"HTTP {status} {method} {path}")
        self.status = status
        self.method = method
        self.path = path
        self.headers = headers or {}
        self.body_text = body_text
        self.error_code = error_code
        self.normalized_code = normalized_code
        self.normalized_retryable = normalized_retryable
        self.retry_after = retry_after
        self.request_id = request_id


def log(msg: str) -> None:
    print(msg, flush=True)


def sleep_backoff(base_s: float, attempt: int, factor: float = 1.3, max_s: float = 5.0) -> float:
    # attempt starts at 1
    try:
        return min(max_s, base_s * (factor ** max(0, attempt - 1)))
    except Exception:
        return base_s


def retry(what: str, fn, *, attempts: int = 12, base_delay_s: float = 1.0):
    last_err: Exception | None = None
    for i in range(1, attempts + 1):
        try:
            return fn()
        except Exception as e:
            last_err = e
            if i >= attempts:
                break
            log(f"{what} failed (attempt {i}/{attempts}): {e}")
            time.sleep(sleep_backoff(base_delay_s, i))
    if last_err is None:
        raise RuntimeError(f"{what} failed")
    raise last_err


def _request(
    method: str,
    path: str,
    *,
    profile_id: str | None = None,
    json_body: object | None = None,
    body: bytes | None = None,
    content_type: str | None = None,
    accept: str | None = None,
    timeout_s: int = 30,
) -> tuple[int, dict[str, str], bytes]:
    url = f"{BASE_URL}{path}"
    headers = {"X-Api-Token": API_TOKEN}
    if profile_id:
        headers["X-Profile-Id"] = profile_id
    if accept:
        headers["Accept"] = accept

    data = None
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    elif body is not None:
        data = body
        if content_type:
            headers["Content-Type"] = content_type

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            resp_body = resp.read()
            resp_headers = {k: v for k, v in resp.headers.items()}
            return resp.status, resp_headers, resp_body
    except urllib.error.HTTPError as e:
        err_body = e.read()
        resp_headers = {k: v for k, v in e.headers.items()} if getattr(e, 'headers', None) is not None else {}
        retry_after = resp_headers.get('Retry-After')
        request_id = resp_headers.get('X-Request-Id') or resp_headers.get('X-Request-ID') or resp_headers.get('X-Amzn-Requestid')

        decoded = ''
        try:
            decoded = err_body.decode('utf-8', errors='replace')
        except Exception:
            decoded = repr(err_body)

        err_code = None
        norm_code = None
        norm_retryable = None
        try:
            parsed = json.loads(decoded)
            if isinstance(parsed, dict) and isinstance(parsed.get('error'), dict):
                er = parsed.get('error', {})
                err_code = er.get('code')
                norm = er.get('normalizedError')
                if isinstance(norm, dict):
                    norm_code = norm.get('code')
                    norm_retryable = norm.get('retryable')
        except Exception:
            pass

        log(f"HTTP {e.code} {method} {path}")
        if request_id:
            log(f"  X-Request-Id: {request_id}")
        if retry_after:
            log(f"  Retry-After: {retry_after}")
        if err_code:
            log(f"  ErrorResponse.code: {err_code}")
        if norm_code is not None:
            log(f"  ErrorResponse.normalizedError: {norm_code} retryable={norm_retryable}")
        if decoded:
            # Keep the body readable but avoid flooding logs.
            clipped = decoded if len(decoded) <= 4000 else decoded[:4000] + "...<clipped>"
            log(f"  Body: {clipped}")

        raise HTTPFailure(
            e.code,
            method,
            path,
            headers=resp_headers,
            body_text=decoded,
            error_code=err_code,
            normalized_code=norm_code,
            normalized_retryable=norm_retryable,
            retry_after=retry_after,
            request_id=request_id,
        )
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error {method} {path}: {e}")


def request_json(
    method: str, path: str, *, profile_id: str | None = None, json_body: object | None = None
) -> object:
    status, headers, body = _request(method, path, profile_id=profile_id, json_body=json_body, accept="application/json")
    if status < 200 or status >= 300:
        raise RuntimeError(f"Unexpected HTTP {status} {method} {path}")
    if not body:
        return {}
    return json.loads(body.decode("utf-8"))


def request_bytes(method: str, path: str, *, profile_id: str | None = None) -> bytes:
    status, headers, body = _request(method, path, profile_id=profile_id)
    if status < 200 or status >= 300:
        raise RuntimeError(f"Unexpected HTTP {status} {method} {path}")
    return body


def request_text(method: str, path: str, *, profile_id: str | None = None) -> str:
    status, headers, body = _request(method, path, profile_id=profile_id, accept="text/plain")
    if status < 200 or status >= 300:
        raise RuntimeError(f"Unexpected HTTP {status} {method} {path}")
    try:
        return body.decode("utf-8", errors="replace")
    except Exception:
        return repr(body)

def multipart_form(files: list[tuple[str, bytes]]) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    parts: list[bytes] = []

    for filename, content in files:
        parts.append(f"--{boundary}\r\n".encode("utf-8"))
        parts.append(
            (
                f"Content-Disposition: form-data; name=\"files\"; filename=\"{filename}\"\r\n"
                "Content-Type: application/octet-stream\r\n\r\n"
            ).encode("utf-8")
        )
        parts.append(content)
        parts.append(b"\r\n")

    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(parts)
    return body, f"multipart/form-data; boundary={boundary}"


def wait_for_server(timeout_s: int = 120) -> None:
    deadline = time.time() + timeout_s
    last_err = None
    while time.time() < deadline:
        try:
            meta = request_json("GET", "/meta")
            log(f"Server ready: version={meta.get('version')}")
            return
        except Exception as e:
            last_err = e
            time.sleep(1)
    raise RuntimeError(f"Server did not become ready within {timeout_s}s: {last_err}")


def poll_job(job_id: str, *, profile_id: str) -> None:
    deadline = time.time() + 180
    while time.time() < deadline:
        job = request_json("GET", f"/jobs/{job_id}", profile_id=profile_id)
        status = job.get("status")
        if status == "succeeded":
            return
        if status in ("failed", "canceled"):
            # Try to surface the most relevant context for CI visibility.
            try:
                tail = request_text(
                    "GET", f"/jobs/{job_id}/logs?tailBytes=65536", profile_id=profile_id
                )
                if tail.strip():
                    log("---- job logs (tail) ----")
                    log(tail.rstrip())
                    log("---- end job logs ----")
            except Exception as e:
                log(f"(warn) failed to fetch job logs: {e}")

            raise RuntimeError(f"Job {job_id} ended with status={status}: {job.get('error')}")
        time.sleep(1)
    raise RuntimeError(f"Job {job_id} did not finish within 180s")


def exercise_bucket_policy(profile_id: str, bucket: str) -> None:
    """
    Exercise bucket policy endpoints (S3-compatible only):
      - GET (expect exists=false or true)
      - PUT (set a basic GetObject public-read policy)
      - GET (expect exists=true)
      - DELETE
      - GET (expect exists=false)
    """
    log("Bucket policy: GET (initial)")
    initial = request_json("GET", f"/buckets/{bucket}/policy", profile_id=profile_id)
    if not isinstance(initial, dict):
        raise RuntimeError(f"Unexpected bucket policy response: {initial!r}")
    if initial.get("bucket") != bucket:
        raise RuntimeError(f"Unexpected bucket in policy response: {initial!r}")
    if "exists" not in initial:
        raise RuntimeError(f"Missing 'exists' in policy response: {initial!r}")

    policy_doc = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "PublicReadGetObject",
                "Effect": "Allow",
                "Principal": "*",
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{bucket}/*"],
            }
        ],
    }

    log("Bucket policy: VALIDATE (static)")
    v = request_json("POST", f"/buckets/{bucket}/policy/validate", profile_id=profile_id, json_body={"policy": policy_doc})
    if isinstance(v, dict) and v.get("ok") is False:
        raise RuntimeError(f"Static validation failed: {v!r}")

    log("Bucket policy: PUT")
    request_json("PUT", f"/buckets/{bucket}/policy", profile_id=profile_id, json_body={"policy": policy_doc})

    log("Bucket policy: GET (after put)")
    after_put = request_json("GET", f"/buckets/{bucket}/policy", profile_id=profile_id)
    if not isinstance(after_put, dict) or after_put.get("exists") is not True:
        raise RuntimeError(f"Policy should exist after PUT: {after_put!r}")

    log("Bucket policy: DELETE")
    request_json("DELETE", f"/buckets/{bucket}/policy", profile_id=profile_id)

    log("Bucket policy: GET (after delete)")
    after_del = request_json("GET", f"/buckets/{bucket}/policy", profile_id=profile_id)
    if not isinstance(after_del, dict) or after_del.get("exists") is not False:
        raise RuntimeError(f"Policy should not exist after DELETE: {after_del!r}")

    log("Bucket policy OK")




def exercise_azure_container_policy(profile_id: str, bucket: str) -> None:
    """
    Exercise bucket policy endpoints (Azure Blob via container ACL):
      - GET
      - PUT (set public access + stored access policy)
      - GET (verify)
      - DELETE (reset)
      - GET (verify private + empty)
    """
    log("Azure container policy: GET (initial)")
    initial = request_json("GET", f"/buckets/{bucket}/policy", profile_id=profile_id)
    if not isinstance(initial, dict):
        raise RuntimeError(f"Unexpected bucket policy response: {initial!r}")

    policy_doc = {
        "publicAccess": "container",
        "storedAccessPolicies": [
            {
                "id": "e2e-read",
                "permission": "r",
            }
        ],
    }

    log("Azure container policy: VALIDATE (static)")
    v = request_json("POST", f"/buckets/{bucket}/policy/validate", profile_id=profile_id, json_body={"policy": policy_doc})
    if isinstance(v, dict) and v.get("ok") is False:
        raise RuntimeError(f"Static validation failed: {v!r}")

    log("Azure container policy: PUT")
    request_json("PUT", f"/buckets/{bucket}/policy", profile_id=profile_id, json_body={"policy": policy_doc})

    log("Azure container policy: GET (after put)")
    after_put = request_json("GET", f"/buckets/{bucket}/policy", profile_id=profile_id)
    if not isinstance(after_put, dict) or after_put.get("exists") is not True:
        raise RuntimeError(f"Policy should exist after PUT: {after_put!r}")
    pol = after_put.get("policy")
    if not isinstance(pol, dict):
        raise RuntimeError(f"Expected policy object: {after_put!r}")
    if pol.get("publicAccess") != "container":
        raise RuntimeError(f"Expected publicAccess=container: {after_put!r}")
    stored = pol.get("storedAccessPolicies")
    if not isinstance(stored, list) or not any(isinstance(x, dict) and x.get("id") == "e2e-read" for x in stored):
        raise RuntimeError(f"Expected stored access policy e2e-read: {after_put!r}")

    log("Azure container policy: RESET (DELETE)")
    request_json("DELETE", f"/buckets/{bucket}/policy", profile_id=profile_id)

    log("Azure container policy: GET (after reset)")
    after_reset = request_json("GET", f"/buckets/{bucket}/policy", profile_id=profile_id)
    pol2 = after_reset.get("policy") if isinstance(after_reset, dict) else None
    if not isinstance(pol2, dict):
        raise RuntimeError(f"Expected policy object after reset: {after_reset!r}")
    if pol2.get("publicAccess") != "private":
        raise RuntimeError(f"Expected publicAccess=private after reset: {after_reset!r}")
    stored2 = pol2.get("storedAccessPolicies")
    if stored2 not in ([], None):
        if isinstance(stored2, list) and len(stored2) != 0:
            raise RuntimeError(f"Expected storedAccessPolicies=[] after reset: {after_reset!r}")

    log("Azure container policy OK")


def exercise_gcs_iam_policy(profile_id: str, bucket: str) -> None:
    """
    Exercise bucket policy endpoints (GCS via IAM policy).

    NOTE: Some fake-gcs-server versions/environments may not support the /iam endpoint.
    In that case we skip unless E2E_GCS_IAM=1 is set.
    """
    required = os.environ.get("E2E_GCS_IAM", "").lower() in ("1", "true", "yes", "y")

    def skip(where: str, e: Exception) -> None:
        if required:
            raise e
        if isinstance(e, HTTPFailure):
            log(
                f"Skipping GCS IAM policy scenario ({where}): status={e.status} code={e.error_code} normalized={e.normalized_code} retryAfter={e.retry_after}"
            )
        else:
            log(f"Skipping GCS IAM policy scenario ({where}): {e}")

    log("GCS IAM policy: GET (initial)")
    try:
        initial = request_json("GET", f"/buckets/{bucket}/policy", profile_id=profile_id)
    except Exception as e:
        skip("get", e)
        return

    if not isinstance(initial, dict):
        raise RuntimeError(f"Unexpected bucket policy response: {initial!r}")

    original = initial.get("policy")
    if not isinstance(original, dict):
        original = {"version": 1, "bindings": []}

    # Deep-copy for safe mutation.
    try:
        modified = json.loads(json.dumps(original))
    except Exception:
        modified = {"version": 1, "bindings": []}

    if not isinstance(modified, dict):
        modified = {"version": 1, "bindings": []}

    bindings = modified.get("bindings")
    if not isinstance(bindings, list):
        bindings = []

    # Ensure public read binding (allUsers) exists.
    role = "roles/storage.objectViewer"
    found = False
    for b in bindings:
        if not isinstance(b, dict):
            continue
        if b.get("role") != role:
            continue
        members = b.get("members")
        if not isinstance(members, list):
            members = []
        if "allUsers" not in members:
            members.append("allUsers")
        b["members"] = members
        found = True
    if not found:
        bindings.append({"role": role, "members": ["allUsers"]})

    modified["bindings"] = bindings
    if "version" not in modified:
        modified["version"] = 1

    log("GCS IAM policy: VALIDATE (static)")
    try:
        v = request_json("POST", f"/buckets/{bucket}/policy/validate", profile_id=profile_id, json_body={"policy": modified})
        if isinstance(v, dict) and v.get("ok") is False:
            raise RuntimeError(f"Static validation failed: {v!r}")
    except Exception as e:
        skip("validate", e)
        return

    log("GCS IAM policy: PUT")
    try:
        request_json("PUT", f"/buckets/{bucket}/policy", profile_id=profile_id, json_body={"policy": modified})
    except Exception as e:
        skip("put", e)
        return

    log("GCS IAM policy: GET (after put)")
    try:
        after = request_json("GET", f"/buckets/{bucket}/policy", profile_id=profile_id)
    except Exception as e:
        skip("get-after-put", e)
        return

    pol = after.get("policy") if isinstance(after, dict) else None
    if not isinstance(pol, dict):
        raise RuntimeError(f"Expected policy object after PUT: {after!r}")

    # Restore original policy to leave the emulator in a clean state.
    log("GCS IAM policy: RESTORE")
    try:
        request_json("PUT", f"/buckets/{bucket}/policy", profile_id=profile_id, json_body={"policy": original})
    except Exception as e:
        # Restore is best-effort for emulators.
        if required:
            raise
        log(f"GCS IAM policy restore failed (ignored): {e}")

    # DELETE should be rejected by API (we deliberately don't support delete for GCS IAM).
    log("GCS IAM policy: DELETE (expected to fail)")
    try:
        request_json("DELETE", f"/buckets/{bucket}/policy", profile_id=profile_id)
        raise RuntimeError("Expected GCS IAM delete to fail")
    except HTTPFailure as e:
        if e.error_code != "bucket_policy_delete_unsupported":
            raise RuntimeError(f"Expected bucket_policy_delete_unsupported, got {e.error_code} (status={e.status})")

    log("GCS IAM policy OK")

def run_scenario(name: str, create_profile_payload: dict, bucket: str, endpoint_note: str) -> None:
    log(f"\n=== Scenario: {name} ===")
    log(f"Profile endpoint hint: {endpoint_note}")

    profile = request_json("POST", "/profiles", json_body=create_profile_payload)
    profile_id = profile["id"]
    log(f"Created profile id={profile_id} provider={profile.get('provider')}")

    test = retry(
        f"Profile test ({name})",
        lambda: request_json("POST", f"/profiles/{profile_id}/test"),
        attempts=15,
        base_delay_s=1.0,
    )
    if not test.get("ok"):
        raise RuntimeError(f"Profile test failed: {test}")
    log("Profile test OK")

    def ensure_bucket() -> None:
        request_json("POST", "/buckets", profile_id=profile_id, json_body={"name": bucket})
        buckets = request_json("GET", "/buckets", profile_id=profile_id)
        if not isinstance(buckets, list):
            raise RuntimeError(f"Unexpected /buckets response: {buckets!r}")
        bucket_names = [b.get("name") for b in buckets if isinstance(b, dict)]
        if bucket not in bucket_names:
            raise RuntimeError(f"Bucket not found after create. expected={bucket} got={bucket_names}")

    retry(f"Ensure bucket ({name})", ensure_bucket, attempts=10, base_delay_s=0.8)
    log(f"Bucket OK: {bucket}")

    provider = create_profile_payload.get("provider")
    if provider in ("aws_s3", "s3_compatible", "oci_s3_compat"):
        retry(f"Bucket policy ({name})", lambda: exercise_bucket_policy(profile_id, bucket), attempts=6, base_delay_s=0.8)
    elif provider == "azure_blob":
        retry(f"Container policy ({name})", lambda: exercise_azure_container_policy(profile_id, bucket), attempts=6, base_delay_s=0.8)
    elif provider == "gcp_gcs":
        retry(f"Bucket policy ({name})", lambda: exercise_gcs_iam_policy(profile_id, bucket), attempts=3, base_delay_s=0.8)

    upload = request_json("POST", "/uploads", profile_id=profile_id, json_body={"bucket": bucket, "prefix": ""})
    upload_id = upload["uploadId"]
    log(f"Created upload session id={upload_id}")

    hello_key = "hello.txt"
    hello_content = f"hello from {name}\n".encode("utf-8")
    mp_body, mp_type = multipart_form([(hello_key, hello_content)])
    _request(
        "POST",
        f"/uploads/{upload_id}/files",
        profile_id=profile_id,
        body=mp_body,
        content_type=mp_type,
        accept="application/json",
    )
    log("Uploaded file to staging")

    created = request_json("POST", f"/uploads/{upload_id}/commit", profile_id=profile_id, json_body={})
    job_id = created["jobId"]
    log(f"Commit started job={job_id}")
    poll_job(job_id, profile_id=profile_id)
    log("Commit job succeeded")

    downloaded = request_bytes(
        "GET",
        f"/buckets/{bucket}/objects/download?key={urllib.parse.quote(hello_key)}",
        profile_id=profile_id,
    )
    if downloaded != hello_content:
        raise RuntimeError(f"Downloaded content mismatch: expected={hello_content!r} got={downloaded!r}")
    log("Download OK")


def main() -> int:
    wait_for_server()

    # MinIO (S3 compatible)
    run_scenario(
        "minio",
        {
            "provider": "s3_compatible",
            "name": "e2e-minio",
            "endpoint": "http://minio:9000",
            "region": "us-east-1",
            "accessKeyId": "minioadmin",
            "secretAccessKey": "minioadmin",
            "forcePathStyle": True,
            "preserveLeadingSlash": False,
            "tlsInsecureSkipVerify": False,
        },
        bucket="e2e-minio",
        endpoint_note="minio:9000",
    )

    # Azurite (Azure Blob)
    # Well-known Azurite dev account key (devstoreaccount1).
    # https://learn.microsoft.com/en-us/azure/storage/common/storage-configure-connection-string
    azurite_key = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="
    run_scenario(
        "azurite",
        {
            "provider": "azure_blob",
            "name": "e2e-azurite",
            "accountName": "devstoreaccount1",
            "accountKey": azurite_key,
            "endpoint": "http://azurite:10000/devstoreaccount1",
            "useEmulator": True,
            "preserveLeadingSlash": False,
            "tlsInsecureSkipVerify": False,
        },
        bucket="e2e-azurite",
        endpoint_note="azurite:10000",
    )

    # fake-gcs-server (GCP GCS)
    run_scenario(
        "fake-gcs",
        {
            "provider": "gcp_gcs",
            "name": "e2e-fake-gcs",
            # Needed for list/create/delete buckets in rclone's GCS backend.
            # (Value is arbitrary for the fake-gcs-server emulator.)
            "projectNumber": "1234567890",
            "anonymous": True,
            "endpoint": "http://fake-gcs-server:4443",
            "preserveLeadingSlash": False,
            "tlsInsecureSkipVerify": False,
        },
        bucket="e2e-fake-gcs",
        endpoint_note="fake-gcs-server:4443",
    )

    log("\nAll E2E scenarios passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        log(f"E2E failed: {e}")
        raise
