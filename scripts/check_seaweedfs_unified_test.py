#!/usr/bin/env python3
"""Offline contracts for local SeaweedFS stacks. Not live-provider evidence."""
from pathlib import Path
import re
import subprocess
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]
STACKS = ("compose/demo/compose.yml", "compose/test/e2e.yml", "compose/test/portable-smoke.yml")
LOCAL_FILES = (
    *STACKS, ".env", ".env.example", ".github/workflows/frontend-e2e.yml", ".gitlab-ci.yml",
    "scripts/run_live_e2e_local.sh", "scripts/run_portable_failure_smoke.sh",
    "scripts/run_portable_sqlite_to_postgres_smoke.sh", "scripts/portable/seed-source.py",
    "scripts/demo/seed-seaweedfs.sh", "scripts/demo/seed-s3desk.py", "e2e/runner/runner.py",
    "docs/ci/e2e_live.env.example",
)


class UnifiedSeaweedFSTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.docs = {name: yaml.safe_load((ROOT / name).read_text()) for name in STACKS}

    def test_no_local_minio_images_services_or_environment(self):
        # Historical migration evidence and external compatibility tests are not
        # local demo definitions and must not be rewritten as fabricated evidence.
        for name in LOCAL_FILES:
            text = (ROOT / name).read_text()
            with self.subTest(file=name):
                self.assertNotRegex(text, r"(?i)(?:quay\.io|docker\.io)/minio/|(?m:^\s*minio\s*:)|\bMINIO_[A-Z_]+\b|\bminioadmin\b|seed-minio\.sh")

    def test_no_obsolete_seed_script(self):
        self.assertFalse((ROOT / "scripts/demo/seed-minio.sh").exists())
        self.assertFalse((ROOT / "scripts/portable/seed-minio.sh").exists())

    def test_every_stack_uses_pinned_seaweedfs(self):
        for name, doc in self.docs.items():
            with self.subTest(stack=name):
                self.assertIn("seaweedfs", doc["services"])
                self.assertNotIn("minio", doc["services"])
                self.assertEqual(doc["services"]["seaweedfs"]["image"], "${SEAWEEDFS_IMAGE:-docker.io/chrislusf/seaweedfs:4.47}")

    def test_server_flags_are_consistent(self):
        common = {"server", "-dir=/data", "-ip=127.0.0.1", "-ip.bind=127.0.0.1", "-filer", "-s3",
                  "-s3.port=8333", "-s3.ip.bind=0.0.0.0", "-s3.autoCreateBucket=false", "-s3.allowDeleteBucketNotEmpty=false",
                  "-s3.iam=false", "-s3.port.iceberg=0", "-s3.port.lance=0", "-master.telemetry=false"}
        for name, doc in self.docs.items():
            with self.subTest(stack=name):
                self.assertTrue(common.issubset(set(doc["services"]["seaweedfs"]["command"])))

    def test_internal_management_ports_are_not_published(self):
        for name, doc in self.docs.items():
            with self.subTest(stack=name):
                for port in doc["services"]["seaweedfs"].get("ports", []):
                    self.assertTrue(port.rstrip('"').endswith(":8333"), port)

    def test_distinct_persistent_storage_and_shared_filer_config(self):
        data_volumes = []
        for name, doc in self.docs.items():
            service = doc["services"]["seaweedfs"]
            data = next(v.split(":")[0] for v in service["volumes"] if v.endswith(":/data"))
            data_volumes.append(data)
            self.assertIn(data, doc["volumes"])
            filer = next(v.split(":")[0] for v in service["volumes"] if ":/etc/seaweedfs/filer.toml:" in v)
            self.assertEqual((ROOT / name).parent.joinpath(filer).resolve(), ROOT / "compose/demo/filer.toml")
        self.assertEqual(len(set(data_volumes)), len(STACKS))
        self.assertIn('dir = "/data/filerldb2"', (ROOT / "compose/demo/filer.toml").read_text())

    def test_all_compose_dependencies_exist(self):
        for name, doc in self.docs.items():
            for service in doc["services"].values():
                for dep in service.get("depends_on", {}):
                    with self.subTest(stack=name, dependency=dep):
                        self.assertIn(dep, doc["services"])

    def test_all_bind_mounts_exist(self):
        for name, doc in self.docs.items():
            for service in doc["services"].values():
                for mount in service.get("volumes", []):
                    source = mount.split(":")[0]
                    if source.startswith("."):
                        with self.subTest(stack=name, mount=mount):
                            self.assertTrue((ROOT / name).parent.joinpath(source).exists())

    def test_credentials_match_seeders_and_server(self):
        for name, doc in self.docs.items():
            with self.subTest(stack=name):
                env = doc["services"]["seaweedfs"]["environment"]
                self.assertEqual(env["AWS_ACCESS_KEY_ID"], "${SEAWEEDFS_ACCESS_KEY:-demo-seaweedfs}")
                self.assertEqual(env["AWS_SECRET_ACCESS_KEY"], "${SEAWEEDFS_SECRET_KEY:-demo-seaweedfs-secret}")
                seeder = doc["services"]["seaweedfs-seed"]
                self.assertEqual(seeder["environment"]["SEAWEEDFS_ACCESS_KEY"], env["AWS_ACCESS_KEY_ID"])
                self.assertEqual(seeder["environment"]["SEAWEEDFS_SECRET_KEY"], env["AWS_SECRET_ACCESS_KEY"])

    def test_common_idempotent_seeder_used_by_all_stacks(self):
        for name, doc in self.docs.items():
            seed = doc["services"]["seaweedfs-seed"]
            self.assertIn("/seed-seaweedfs.sh", seed["entrypoint"])
            self.assertTrue(any("scripts/demo/seed-seaweedfs.sh" in v for v in seed["volumes"]))
            self.assertEqual(seed["depends_on"]["seaweedfs"]["condition"], "service_healthy")
        seed = (ROOT / "scripts/demo/seed-seaweedfs.sh").read_text()
        self.assertIn('lsd demo:', seed)
        self.assertIn('--ignore-existing', seed)
        self.assertIn('--max-duration', seed)

    def test_e2e_waits_for_signed_storage_readiness(self):
        services = self.docs["compose/test/e2e.yml"]["services"]
        self.assertEqual(services["s3desk"]["depends_on"]["seaweedfs-seed"]["condition"], "service_completed_successfully")

    def test_e2e_runner_uses_internal_s3_address(self):
        env = self.docs["compose/test/e2e.yml"]["services"]["runner"]["environment"]
        self.assertEqual(env["E2E_S3_ENDPOINT"], "${E2E_S3_ENDPOINT:-http://seaweedfs:8333}")
        self.assertIn("E2E_S3_ACCESS_KEY", env)
        self.assertIn("E2E_S3_SECRET_KEY", env)
        runner = (ROOT / "e2e/runner/runner.py").read_text()
        self.assertIn('"name": "e2e-seaweedfs"', runner)
        self.assertIn('"provider": "s3_compatible"', runner)

    def test_ci_uses_same_image_and_browser_endpoint(self):
        github = (ROOT / ".github/workflows/frontend-e2e.yml").read_text()
        gitlab = (ROOT / ".gitlab-ci.yml").read_text()
        for text in (github, gitlab):
            self.assertIn("docker.io/chrislusf/seaweedfs:4.47", text)
            self.assertIn("http://seaweedfs:8333", text)
        self.assertIn("E2E_S3_PUBLIC_ENDPOINT: http://127.0.0.1:8333", github)
        # A completed one-shot seeder must not abort the whole integration stack.
        self.assertNotIn("-f compose/test/e2e.yml up --abort-on-container-exit", gitlab)
        self.assertIn("-f compose/test/e2e.yml run --rm runner", gitlab)

    def test_live_harness_is_isolated_and_checks_signed_readiness(self):
        text = (ROOT / "scripts/run_live_e2e_local.sh").read_text()
        self.assertNotIn("minio", text.lower())
        self.assertIn("s3desk-seaweedfs-e2e-local-$$", text)
        self.assertIn('127.0.0.1:${SEAWEEDFS_API_PORT}:8333', text)
        self.assertIn('AWS_ACCESS_KEY_ID=${E2E_S3_ACCESS_KEY}', text)
        self.assertIn('AWS_SECRET_ACCESS_KEY=${E2E_S3_SECRET_KEY}', text)
        self.assertIn('lsd e2e:', text)
        self.assertIn('if [ "${storage_ready}" != true ]', text)
        self.assertIn('if [ "${backend_ready}" != true ]', text)
        self.assertLess(text.index("trap cleanup EXIT"), text.index("podman run -d"))
        subprocess.run(["bash", "-n", str(ROOT / "scripts/run_live_e2e_local.sh")], check=True)

    def test_portable_runner_uses_new_seeder(self):
        for name in ("scripts/run_portable_failure_smoke.sh", "scripts/run_portable_sqlite_to_postgres_smoke.sh"):
            text = (ROOT / name).read_text()
            self.assertIn("compose run --rm seaweedfs-seed", text)
            self.assertIn("seaweedfs postgres source target", text)

    def test_active_browser_fixtures_have_no_minio_credentials(self):
        for path in (ROOT / "frontend/tests").glob("*.spec.ts"):
            text = path.read_text()
            with self.subTest(file=path.name):
                self.assertNotIn("minioadmin", text)
                self.assertNotIn("e2e-minio", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
