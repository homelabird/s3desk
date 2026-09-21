#!/usr/bin/env python3
"""Offline demo regression checks; mocks here are not live-provider evidence."""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import urllib.error

import yaml

ROOT = Path(__file__).resolve().parents[1]


def seed_module(**environment):
    spec = importlib.util.spec_from_file_location("demo_seed", ROOT / "scripts/demo/seed-s3desk.py")
    module = importlib.util.module_from_spec(spec)
    with mock.patch.dict(os.environ, environment, clear=True):
        spec.loader.exec_module(module)
    return module


class ComposeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = yaml.safe_load((ROOT / "compose/demo/compose.yml").read_text())
        cls.services = cls.document["services"]

    def test_demo_has_no_minio_service_or_client(self):
        self.assertEqual(set(self.services), {"seaweedfs", "seaweedfs-seed", "s3desk", "s3desk-seed"})
        for service in self.services.values():
            self.assertNotIn("minio/", service.get("image", ""))
            self.assertFalse(any(key.startswith("MINIO_") for key in service.get("environment", {})))
        self.assertFalse((ROOT / "scripts/demo/seed-minio.sh").exists())

    def test_image_version_is_pinned_consistently(self):
        image = "docker.io/chrislusf/seaweedfs:4.47"
        self.assertIn(image, self.services["seaweedfs"]["image"])
        for name in (".env", ".env.example"):
            self.assertIn("SEAWEEDFS_IMAGE=" + image, (ROOT / name).read_text())

    def test_only_s3_and_ui_are_published(self):
        self.assertEqual(len(self.services["seaweedfs"]["ports"]), 1)
        self.assertTrue(self.services["seaweedfs"]["ports"][0].endswith(":8333"))
        self.assertEqual(len(self.services["s3desk"]["ports"]), 1)
        flags = self.services["seaweedfs"]["command"]
        for flag in ("-ip.bind=127.0.0.1", "-s3.ip.bind=0.0.0.0", "-s3.iam=false",
                     "-s3.allowDeleteBucketNotEmpty=false", "-s3.autoCreateBucket=false"):
            self.assertIn(flag, flags)

    def test_credentials_are_shared_with_both_seeders(self):
        server = self.services["seaweedfs"]["environment"]
        for name in ("seaweedfs-seed", "s3desk-seed"):
            env = self.services[name]["environment"]
            self.assertEqual(env["SEAWEEDFS_ACCESS_KEY"], server["AWS_ACCESS_KEY_ID"])
            self.assertEqual(env["SEAWEEDFS_SECRET_KEY"], server["AWS_SECRET_ACCESS_KEY"])
            self.assertIn("http://seaweedfs:8333", env["SEAWEEDFS_INTERNAL_ENDPOINT"])

    def test_local_public_endpoint_opt_in_is_only_in_demo(self):
        env = self.services["s3desk"]["environment"]
        self.assertEqual(env["S3DESK_ALLOWED_LOOPBACK_PUBLIC_ENDPOINT"],
                         self.services["s3desk-seed"]["environment"]["SEAWEEDFS_PUBLIC_ENDPOINT"])
        for path in (ROOT / "compose/remote").glob("*.yml"):
            self.assertNotIn("S3DESK_ALLOWED_LOOPBACK_PUBLIC_ENDPOINT", path.read_text())

    def test_order_waits_for_health_and_successful_s3_seed(self):
        self.assertEqual(self.services["seaweedfs-seed"]["depends_on"]["seaweedfs"]["condition"], "service_healthy")
        for name in ("s3desk", "s3desk-seed"):
            self.assertEqual(self.services[name]["depends_on"]["seaweedfs-seed"]["condition"], "service_completed_successfully")
        self.assertEqual(self.services["seaweedfs-seed"]["restart"], "no")

    def test_filer_and_application_data_are_persistent_and_separate(self):
        self.assertIn("seaweedfs-demo-data:/data", self.services["seaweedfs"]["volumes"])
        self.assertIn("s3desk-demo-data:/data", self.services["s3desk"]["volumes"])
        self.assertNotIn("minio-demo-data", self.document["volumes"])
        config = (ROOT / "compose/demo/filer.toml").read_text()
        self.assertIn("[leveldb2]", config)
        self.assertIn('dir = "/data/filerldb2"', config)
        self.assertIn("enabled = true", config)

    def test_every_demo_and_portable_bind_mount_exists(self):
        for relative in ("compose/demo/compose.yml", "compose/test/portable-smoke.yml"):
            path = ROOT / relative
            doc = yaml.safe_load(path.read_text())
            for service in doc["services"].values():
                for volume in service.get("volumes", []):
                    source = volume.split(":")[0] if isinstance(volume, str) else volume.get("source", "")
                    if source.startswith("."):
                        self.assertTrue((path.parent / source).exists(), (relative, source))
        self.assertFalse((ROOT / "scripts/portable/seed-minio.sh").exists())


class ProfileSeedTests(unittest.TestCase):
    def setUp(self):
        self.seed = seed_module()

    def test_default_payload_uses_generic_path_style_s3(self):
        p = self.seed._build_profile_payload()
        self.assertEqual(p["provider"], "s3_compatible")
        self.assertEqual(p["name"], "SeaweedFS Demo")
        self.assertEqual(p["endpoint"], "http://seaweedfs:8333")
        self.assertEqual(p["publicEndpoint"], "http://127.0.0.1:8333")
        self.assertTrue(p["forcePathStyle"])
        self.assertFalse(p["tlsInsecureSkipVerify"])
        self.seed.validate_config()

    def test_lan_public_endpoint_and_port_are_derived(self):
        seed = seed_module(DEMO_PUBLIC_HOST="192.168.1.20", SEAWEEDFS_API_PORT="18333")
        self.assertEqual(seed._build_profile_payload()["publicEndpoint"], "http://192.168.1.20:18333")
        self.assertEqual(seed.SEAWEEDFS_INTERNAL_ENDPOINT, "http://seaweedfs:8333")

    def test_explicit_https_endpoint_is_preserved(self):
        seed = seed_module(DEMO_PUBLIC_HOST="demo.internal", SEAWEEDFS_PUBLIC_ENDPOINT="https://s3.demo.internal/")
        self.assertEqual(seed._build_profile_payload()["publicEndpoint"], "https://s3.demo.internal")

    def test_remote_browser_cannot_use_local_or_container_endpoint(self):
        for endpoint in ("http://127.0.0.1:8333", "http://localhost:8333", "http://seaweedfs:8333", "http://0.0.0.0:8333"):
            with self.subTest(endpoint=endpoint), self.assertRaises(RuntimeError):
                self.seed._effective_public_endpoint(endpoint, "192.168.1.20")

    def test_invalid_endpoint_diagnostics_do_not_leak_secrets(self):
        for endpoint in ("ftp://s3.test", "http://user:private-secret@s3.test", "http://s3.test?token=private-secret", "http://s3.test:bad", "http://s3.test/prefix"):
            with self.subTest(endpoint=endpoint), self.assertRaises(RuntimeError) as caught:
                self.seed._validate_endpoint(endpoint, "ENDPOINT")
            self.assertNotIn("private-secret", str(caught.exception))

    def test_api_base_does_not_double_api_prefix(self):
        seed = seed_module(S3DESK_API_BASE=" http://s3desk:8080/api/v1/ ")
        self.assertEqual(seed.S3DESK_API_BASE, "http://s3desk:8080")

    def test_existing_minio_profile_is_not_replaced(self):
        existing = [{"id": "old", "name": "MinIO Demo", "provider": "s3_compatible", "endpoint": "http://minio:9000"}]
        with mock.patch.object(self.seed, "request_json", side_effect=[existing, {"id": "new"}]) as request:
            self.assertEqual(self.seed.ensure_profile(), "new")
        self.assertEqual([call.args[0] for call in request.call_args_list], ["GET", "POST"])
        self.assertEqual(existing[0]["endpoint"], "http://minio:9000")

    def test_existing_seaweedfs_profile_is_updated_not_duplicated(self):
        existing = [{"id": "demo", "name": "SeaweedFS Demo", "provider": "s3_compatible", "endpoint": "http://seaweedfs:8333/"}]
        with mock.patch.object(self.seed, "request_json", side_effect=[existing, None]) as request:
            self.assertEqual(self.seed.ensure_profile(), "demo")
        self.assertEqual(request.call_args.args[0], "PATCH")

    def test_colliding_profile_target_is_not_overwritten(self):
        for provider, endpoint in (("aws_s3", "http://seaweedfs:8333"), ("s3_compatible", "http://minio:9000")):
            with self.subTest(provider=provider), mock.patch.object(self.seed, "request_json", return_value=[{
                "id": "other", "name": "SeaweedFS Demo", "provider": provider, "endpoint": endpoint
            }]) as request, self.assertRaisesRegex(RuntimeError, "different storage target"):
                self.seed.ensure_profile()
            self.assertEqual(request.call_count, 1)

    def test_duplicate_names_fail_without_writes(self):
        with mock.patch.object(self.seed, "request_json", return_value=[{"name": "SeaweedFS Demo"}] * 2) as request:
            with self.assertRaisesRegex(RuntimeError, "Multiple profiles"):
                self.seed.ensure_profile()
            self.assertEqual(request.call_count, 1)

    def test_bucket_is_created_only_when_missing(self):
        for buckets, expected in (([{"name": "demo-bucket"}], ["GET"]), ([], ["GET", "POST"])):
            with mock.patch.object(self.seed, "request_json", side_effect=[buckets, {}]) as request:
                self.seed.ensure_bucket("demo")
            self.assertEqual([call.args[0] for call in request.call_args_list], expected)
            self.assertEqual(request.call_args.kwargs["profile_id"], "demo")

    def test_profile_test_requires_explicit_success(self):
        for response in (None, {}, {"ok": False}, {"ok": "true"}):
            with mock.patch.object(self.seed, "request_json", return_value=response), self.assertRaises(RuntimeError):
                self.seed.test_profile("demo")
        with mock.patch.object(self.seed, "request_json", return_value={"ok": True}):
            self.seed.test_profile("demo")

    def test_readiness_retries_transient_errors(self):
        errors = [urllib.error.URLError("not ready"), urllib.error.HTTPError("", 503, "", {}, None), {}]
        with mock.patch.object(self.seed, "request_json", side_effect=errors) as request, mock.patch.object(self.seed.time, "sleep"):
            self.seed.wait_for_meta()
        self.assertEqual(request.call_count, 3)

    def test_bad_auth_fails_without_retry(self):
        error = urllib.error.HTTPError("", 401, "private-secret", {}, None)
        with mock.patch.object(self.seed, "request_json", side_effect=error) as request, self.assertRaisesRegex(RuntimeError, "HTTP 401"):
            self.seed.wait_for_meta()
        self.assertEqual(request.call_count, 1)

    def test_readiness_has_finite_deadline(self):
        with mock.patch.object(self.seed.time, "monotonic", side_effect=[0, 181]), self.assertRaisesRegex(RuntimeError, "did not become ready"):
            self.seed.wait_for_meta()

    def test_request_timeout_cannot_exceed_remaining_budget(self):
        with mock.patch.dict(os.environ, {"DEMO_SEED_TIMEOUT_SECONDS": "5"}), mock.patch.object(self.seed.time, "monotonic", side_effect=[0, 4]), mock.patch.object(self.seed, "request_json") as request:
            self.seed.wait_for_meta()
        self.assertEqual(request.call_args.kwargs["timeout"], 1)

    def test_invalid_timeout_is_rejected(self):
        for value in ("0", "901", "bad"):
            with mock.patch.dict(os.environ, {"DEMO_SEED_TIMEOUT_SECONDS": value}), self.assertRaises(RuntimeError):
                self.seed._readiness_timeout()

    def test_json_request_keeps_auth_out_of_url(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"ok":true}'
        with mock.patch.object(self.seed.urllib.request, "urlopen", return_value=response) as urlopen:
            self.assertEqual(self.seed.request_json("POST", "http://s3desk:8080/api/v1/buckets", {"name": "demo-bucket"}, "profile"), {"ok": True})
        req = urlopen.call_args.args[0]
        self.assertEqual(req.get_header("X-api-token"), self.seed.API_TOKEN)
        self.assertEqual(req.get_header("X-profile-id"), "profile")
        self.assertNotIn(self.seed.API_TOKEN, req.full_url)


FAKE_RCLONE = r'''
import json, os, pathlib, shutil, sys
args = sys.argv[1:]
command = next(x for x in args if x in ("lsd", "mkdir", "copy"))
position = args.index(command)
with open(os.environ["FAKE_LOG"], "a") as log:
    log.write(json.dumps({"args": args, "endpoint": os.environ.get("RCLONE_CONFIG_DEMO_ENDPOINT"),
        "provider": os.environ.get("RCLONE_CONFIG_DEMO_PROVIDER"),
        "pathStyle": os.environ.get("RCLONE_CONFIG_DEMO_FORCE_PATH_STYLE")}) + "\n")
if os.environ.get("FAKE_ALWAYS_FAIL") == "1":
    print("provider error with private-secret and signed-URL", file=sys.stderr)
    sys.exit(1)
root = pathlib.Path(os.environ["FAKE_STORAGE"])
if command == "lsd":
    counter = root / "attempts"
    count = int(counter.read_text()) + 1 if counter.exists() else 1
    counter.write_text(str(count))
    sys.exit(1 if count <= int(os.environ.get("FAKE_STARTUP_FAILURES", "0")) else 0)
if command == "mkdir":
    (root / args[position+1].split(":", 1)[1]).mkdir(exist_ok=True)
if command == "copy":
    source = pathlib.Path(args[position+1])
    dest = root / args[position+2].split(":", 1)[1]
    assert "--ignore-existing" in args
    for path in source.rglob("*"):
        if path.is_file():
            target = dest / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copyfile(path, target)
'''


class ObjectSeedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.log = self.dir / "calls.jsonl"
        (self.dir / "storage").mkdir()
        for name, code in (("rclone", "#!" + sys.executable + "\n" + FAKE_RCLONE), ("sleep", "#!/bin/sh\nexit 0\n")):
            p = self.dir / name
            p.write_text(code)
            p.chmod(0o755)
        self.env = {"PATH": str(self.dir) + ":" + os.defpath, "FAKE_LOG": str(self.log), "FAKE_STORAGE": str(self.dir / "storage"), "DEMO_SEED_ATTEMPTS": "2"}

    def run_seed(self, **env):
        return subprocess.run(["sh", str(ROOT / "scripts/demo/seed-seaweedfs.sh")], env={**self.env, **env}, capture_output=True, text=True, timeout=15)

    def test_retry_and_s3_configuration(self):
        result = self.run_seed(FAKE_STARTUP_FAILURES="1", SEAWEEDFS_INTERNAL_ENDPOINT="http://storage.test:8333")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [json.loads(line) for line in self.log.read_text().splitlines()]
        self.assertEqual(len(calls), 4)
        self.assertTrue(all(c["endpoint"] == "http://storage.test:8333" and c["provider"] == "Other" and c["pathStyle"] == "true" for c in calls))
        self.assertTrue(all("--max-duration" in c["args"] for c in calls))

    def test_rerun_preserves_modified_and_unrelated_objects(self):
        self.assertEqual(self.run_seed().returncode, 0)
        bucket = self.dir / "storage/demo-bucket"
        self.assertEqual(json.loads((bucket / "about.json").read_text())["storage"], "seaweedfs")
        (bucket / "welcome.txt").write_text("user changed this")
        (bucket / "uploaded.txt").write_text("user data")
        (bucket / "notes/readme.md").unlink()
        self.assertEqual(self.run_seed().returncode, 0)
        self.assertEqual((bucket / "welcome.txt").read_text(), "user changed this")
        self.assertEqual((bucket / "uploaded.txt").read_text(), "user data")
        self.assertTrue((bucket / "notes/readme.md").exists())

    def test_failure_is_bounded_and_secrets_are_not_logged(self):
        result = self.run_seed(FAKE_ALWAYS_FAIL="1", SEAWEEDFS_SECRET_KEY="private-secret")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("failed after 2 attempts", result.stderr)
        self.assertNotIn("private-secret", result.stderr + result.stdout + self.log.read_text())
        self.assertEqual(len(self.log.read_text().splitlines()), 2)

    def test_invalid_bucket_and_retry_settings_fail_before_s3_calls(self):
        for settings in ({"DEMO_BUCKET": "BAD/bucket"}, {"DEMO_BUCKET": "-bad"}, {"DEMO_BUCKET": "xy"}, {"DEMO_SEED_ATTEMPTS": "0"}, {"DEMO_SEED_ATTEMPTS": "121"}, {"DEMO_SEED_ATTEMPTS": "oops"}):
            with self.subTest(settings=settings):
                self.assertNotEqual(self.run_seed(**settings).returncode, 0)
        self.assertFalse(self.log.exists())


class ComposeWrapperTests(unittest.TestCase):
    def run_wrapper(self, host, bind=None):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            docker = path / "docker"
            docker.write_text("#!" + sys.executable + '\nimport json, os, sys\nprint(json.dumps({"args":sys.argv[1:], "bind":os.environ.get("S3DESK_BIND_HOST")}))\n')
            docker.chmod(0o755)
            env = {"PATH": directory + ":" + os.defpath, "S3DESK_COMPOSE_PROVIDER": "docker"}
            if host is not None:
                env["DEMO_PUBLIC_HOST"] = host
            if bind is not None:
                env["S3DESK_BIND_HOST"] = bind
            return subprocess.run(["bash", str(ROOT / "scripts/compose.sh"), "demo", "config"], env=env, capture_output=True, text=True, timeout=10)

    def test_local_and_lan_bind_derivation(self):
        for host, expected in (("127.0.0.1", "127.0.0.1"), ("localhost", "127.0.0.1"), ("192.168.1.20", "0.0.0.0")):
            result = self.run_wrapper(host)
            self.assertEqual(result.returncode, 0, result.stderr)
            output = json.loads(result.stdout)
            self.assertEqual(output["bind"], expected)
            self.assertIn(str(ROOT / "compose/demo/compose.yml"), output["args"])

    def test_explicit_bind_is_preserved(self):
        result = self.run_wrapper("192.168.1.20", "192.168.1.20")
        self.assertEqual(json.loads(result.stdout)["bind"], "192.168.1.20")

    def test_missing_or_invalid_public_host_is_rejected(self):
        for host in (None, "http://localhost", "localhost:8080", "localhost/path"):
            self.assertNotEqual(self.run_wrapper(host).returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
