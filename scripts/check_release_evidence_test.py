import importlib.util
import contextlib
import io
import pathlib
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT_PATH = pathlib.Path(__file__).with_name("check_release_evidence.py")
SPEC = importlib.util.spec_from_file_location("check_release_evidence_script", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ReleaseEvidenceAuditTests(unittest.TestCase):
    def test_run_git_diff_parses_name_status_entries(self):
        raw = "M\0backend/internal/gcsbucket/client.go\0R100\0old.go\0backend/internal/api/download_proxy.go\0"

        with mock.patch.object(MODULE.subprocess, "check_output", return_value=raw.encode("utf-8")) as check_output:
            entries = MODULE.run_git_diff("v1.0.0", "HEAD")

        check_output.assert_called_once_with(
            ["git", "diff", "--name-status", "-z", "--find-renames", "v1.0.0", "HEAD"],
            cwd=MODULE.ROOT,
        )
        self.assertEqual(
            [(entry.code, entry.path) for entry in entries],
            [
                (" M", "backend/internal/gcsbucket/client.go"),
                (" R", "old.go"),
                (" R", "backend/internal/api/download_proxy.go"),
            ],
        )

    def test_detects_provider_and_reverse_proxy_trigger_paths(self):
        self.assertTrue(MODULE.is_provider_change("backend/internal/gcsbucket/client.go"))
        self.assertTrue(MODULE.is_provider_change("backend/internal/gcsauth/token_uri.go"))
        self.assertTrue(MODULE.is_provider_change("backend/internal/bucketgov/aws_lifecycle.go"))
        self.assertTrue(MODULE.is_provider_change("backend/internal/profileendpoint/profile.go"))
        self.assertTrue(MODULE.is_provider_change("backend/internal/profiletls/config.go"))
        self.assertTrue(MODULE.is_provider_change("backend/internal/rcloneconfig/config.go"))
        self.assertTrue(MODULE.is_provider_change("backend/internal/jobs/rclone_attempt.go"))
        self.assertTrue(MODULE.is_provider_change("backend/internal/s3policy/s3policy.go"))
        self.assertTrue(MODULE.is_provider_change("backend/internal/store/store_profile_secrets.go"))
        self.assertTrue(MODULE.is_provider_change("openapi.yml"))
        self.assertTrue(MODULE.is_provider_change("frontend/src/pages/buckets/governance/BucketGovernanceModal.tsx"))
        self.assertTrue(MODULE.is_provider_change("backend/internal/api/handlers_bucket_policy.go"))
        self.assertFalse(MODULE.is_provider_change("frontend/src/pages/settings/SettingsPage.tsx"))

        self.assertTrue(MODULE.is_reverse_proxy_change(".env.example"))
        self.assertTrue(MODULE.is_reverse_proxy_change("charts/s3desk/templates/ingress.yaml"))
        self.assertTrue(MODULE.is_reverse_proxy_change("deploy/caddy/Caddyfile"))
        self.assertTrue(MODULE.is_reverse_proxy_change("k8s/s3desk-caddy.yaml"))
        self.assertTrue(MODULE.is_reverse_proxy_change("scripts/Caddyfile"))
        self.assertTrue(MODULE.is_reverse_proxy_change("backend/internal/api/download_proxy.go"))
        self.assertTrue(MODULE.is_reverse_proxy_change("backend/internal/ws/hub.go"))
        self.assertFalse(MODULE.is_reverse_proxy_change("frontend/src/lib/profileCapabilityContext.ts"))

    def test_detects_backup_portable_trigger_paths(self):
        self.assertTrue(MODULE.is_backup_portable_change("backend/internal/api/handlers_server_backup.go"))
        self.assertTrue(MODULE.is_backup_portable_change("backend/internal/api/handlers_server_portable_apply.go"))
        self.assertTrue(MODULE.is_backup_portable_change("backend/internal/store/store_portable.go"))
        self.assertTrue(MODULE.is_backup_portable_change("scripts/portable/run-smoke.py"))
        self.assertTrue(MODULE.is_backup_portable_change("scripts/run_portable_sqlite_to_postgres_smoke.sh"))
        self.assertTrue(MODULE.is_backup_portable_change("compose/test/portable-smoke.yml"))
        self.assertTrue(MODULE.is_backup_portable_change("docs/PORTABLE_BACKUP.md"))
        self.assertFalse(MODULE.is_backup_portable_change("docs/release/evidence/BACKUP_PORTABLE_SMOKE_TEMPLATE.md"))
        self.assertFalse(MODULE.is_backup_portable_change("frontend/src/pages/settings/SettingsPage.tsx"))

    def test_suggests_provider_scopes_from_trigger_paths(self):
        self.assertEqual(MODULE.provider_scopes_for_path("backend/internal/gcsbucket/client.go"), ("gcs",))
        self.assertEqual(MODULE.provider_scopes_for_path("backend/internal/gcsauth/token_uri.go"), ("gcs",))
        self.assertEqual(
            MODULE.provider_scopes_for_path("backend/internal/s3client/client.go"),
            ("aws", "minio", "ceph"),
        )
        self.assertEqual(
            MODULE.provider_scopes_for_path("backend/internal/s3policy/s3policy.go"),
            ("aws", "minio", "ceph"),
        )
        self.assertEqual(
            MODULE.provider_scopes_for_path("backend/internal/rcloneconfig/config.go"),
            MODULE.PROVIDER_SCOPES,
        )
        self.assertEqual(
            MODULE.provider_scopes_for_path("backend/internal/profiletls/config.go"),
            MODULE.PROVIDER_SCOPES,
        )
        self.assertEqual(
            MODULE.provider_scopes_for_path("backend/internal/profileendpoint/profile.go"),
            MODULE.PROVIDER_SCOPES,
        )
        self.assertEqual(
            MODULE.provider_scopes_for_path("backend/internal/api/handlers_bucket_policy.go"),
            MODULE.PROVIDER_SCOPES,
        )

    def test_blocks_when_triggered_changes_have_no_evidence(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/api/handlers_bucket_policy.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/handlers_server_backup.go"),
            ],
            evidence_files={},
        )

        self.assertFalse(summary["ready"])
        requirements = {item["name"]: item for item in summary["requirements"]}
        self.assertTrue(requirements["provider-live-validation"]["required"])
        self.assertFalse(requirements["provider-live-validation"]["satisfied"])
        self.assertEqual(requirements["provider-live-validation"]["provider_scopes"], list(MODULE.PROVIDER_SCOPES))
        self.assertTrue(requirements["reverse-proxy-smoke"]["required"])
        self.assertFalse(requirements["reverse-proxy-smoke"]["satisfied"])
        self.assertTrue(requirements["backup-portable-smoke"]["required"])
        self.assertFalse(requirements["backup-portable-smoke"]["satisfied"])

    def test_ignores_templates_and_incomplete_provider_outcomes(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/handlers_bucket_policy.go")],
            evidence_files={
                "README.md": "# Provider Live Validation Evidence\n\n- Actual outcome: pass\n",
                "LIVE_EVIDENCE_CHECKLIST_2026-04-30.md": "# Provider Live Validation Evidence\n\n- Actual outcome: pass\n",
                "PROVIDER_LIVE_VALIDATION_TEMPLATE.md": "# Provider Live Validation Evidence\n\n- Actual outcome: pass\n",
                "provider-empty.md": "# Provider Live Validation Evidence\n\n- Actual outcome:\n",
                "provider-failed.md": "# Provider Live Validation Evidence\n\n- Provider name: AWS S3\n- Actual outcome: failed\n",
            },
        )

        provider = self._requirement(summary, "provider-live-validation")
        self.assertTrue(provider["required"])
        self.assertFalse(provider["satisfied"])
        self.assertEqual(provider["evidence_files"], [])

    def test_provider_outcome_requires_pass_semantics(self):
        self.assertTrue(MODULE.is_pass_outcome("pass"))
        self.assertTrue(MODULE.is_pass_outcome("PASSED"))
        self.assertTrue(MODULE.is_pass_outcome("pass - live bucket workflow succeeded"))
        self.assertTrue(MODULE.is_pass_outcome("success"))
        self.assertFalse(MODULE.is_pass_outcome(""))
        self.assertFalse(MODULE.is_pass_outcome("failed"))
        self.assertFalse(MODULE.is_pass_outcome("blocked"))

    def test_reverse_proxy_outcome_requires_pass_semantics(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            passed = root / "passed.md"
            passed.write_text("# Reverse Proxy Smoke Evidence\n\n- Reverse-proxy smoke: passed\n", encoding="utf-8")
            failed = root / "failed.md"
            failed.write_text("# Reverse Proxy Smoke Evidence\n\n- Reverse-proxy smoke: failed\n", encoding="utf-8")
            missing_header = root / "missing-header.md"
            missing_header.write_text("- Reverse-proxy smoke: pass\n", encoding="utf-8")

            self.assertTrue(MODULE.has_reverse_proxy_pass(passed))
            self.assertFalse(MODULE.has_reverse_proxy_pass(failed))
            self.assertFalse(MODULE.has_reverse_proxy_pass(missing_header))

    def test_satisfies_required_evidence_when_matching_files_exist(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
            ],
            evidence_files={
                "provider-live-gcs-2026-04-30.md": self._provider_evidence("GCS"),
                "reverse-proxy-smoke-2026-04-30.md": self._reverse_proxy_evidence(),
            },
        )

        self.assertTrue(summary["ready"])
        provider = self._requirement(summary, "provider-live-validation")
        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertEqual(provider["provider_scopes"], ["gcs"])
        self.assertEqual(provider["missing_provider_scopes"], [])
        self.assertEqual(provider["evidence_files"], ["docs/release/evidence/provider-live-gcs-2026-04-30.md"])
        self.assertEqual(reverse_proxy["evidence_files"], ["docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"])

    def test_accepts_reverse_proxy_evidence_generated_by_deploy_smoke(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go")],
            evidence_files={
                "reverse-proxy-smoke-2026-04-30.md": "\n".join(
                    [
                        "# Reverse Proxy Smoke Evidence",
                        "",
                        "- Generated at: `2026-04-30 12:34:56Z`",
                        "- Commit SHA: `def456`",
                        "- S3Desk commit SHA or release tag: `abc123`",
                        "- Base URL: `https://s3desk.example.com`",
                        "- Expected external base URL: `https://s3desk.example.com`",
                        "- Profile identifier: `release-profile`",
                        "- Bucket: `release-bucket`",
                        "- Object key: `smoke/object.txt`",
                        "",
                        "## Checks",
                        "",
                        "- GET `/healthz`: HTTP `200`",
                        "- Authenticated GET `/api/v1/meta`: HTTP `200`",
                        "- POST `/api/v1/realtime-ticket?transport=ws`: HTTP `201`",
                        "- GET `/api/v1/buckets/{bucket}/objects/download-url?proxy=true`: HTTP `200`",
                        "- Signed proxy URL root: `https://s3desk.example.com`",
                        "- HEAD signed proxy URL: HTTP `200`",
                        "",
                        "## Expected Statuses",
                        "",
                        "- GET `/healthz`: `200`",
                        "- Authenticated GET `/api/v1/meta`: `200`",
                        "- POST `/api/v1/realtime-ticket?transport=ws`: `201`",
                        "- GET `/api/v1/buckets/{bucket}/objects/download-url?proxy=true`: `200`",
                        "- Signed proxy URL root matches expected external base URL: URL-root match, no HTTP status",
                        "- HEAD signed proxy URL: `200`",
                        "",
                        "## Result",
                        "",
                        "- Reverse-proxy smoke: pass",
                    ]
                )
                + "\n",
            },
        )

        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertTrue(summary["ready"])
        self.assertTrue(reverse_proxy["satisfied"])
        self.assertEqual(
            reverse_proxy["evidence_files"],
            ["docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"],
        )

    def test_accepts_backup_portable_smoke_evidence(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/handlers_server_backup.go")],
            evidence_files={
                "backup-portable-smoke-2026-04-30.md": self._backup_portable_evidence(),
            },
        )

        backup_portable = self._requirement(summary, "backup-portable-smoke")
        self.assertTrue(summary["ready"])
        self.assertTrue(backup_portable["satisfied"])
        self.assertEqual(
            backup_portable["evidence_files"],
            ["docs/release/evidence/backup-portable-smoke-2026-04-30.md"],
        )

    def test_accepts_indented_release_evidence_fields(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
            ],
            evidence_files={
                "provider-live-gcs-2026-04-30.md": "\n".join(
                    [
                        "# Provider Live Validation Evidence",
                        "",
                        "  - Provider name: GCS",
                        "  - Bucket or container name: release-bucket",
                        "  - Profile identifier: release-profile",
                        "  - S3Desk commit SHA or release tag: abc123",
                        "  - Exact feature tested: bucket governance controls",
                        "  - Command or manual workflow used: go test ./internal/api -run TestLiveValidationGcpGcs",
                        "  - Provider-native console or CLI confirmation on success: gcloud storage listed release-bucket",
                        "  - Actual outcome: passed",
                    ]
                ),
                "reverse-proxy-smoke-2026-04-30.md": "\n".join(
                    [
                        "# Reverse Proxy Smoke Evidence",
                        "",
                        "  - S3Desk commit SHA or release tag: abc123",
                        "  - Base URL: https://s3desk.example.com",
                        "  - Expected external base URL: https://s3desk.example.com",
                        "  - Profile identifier: release-profile",
                        "  - Bucket: release-bucket",
                        "  - Object key: smoke/object.txt",
                        "",
                        "## Checks",
                        "",
                        "  - GET `/healthz`: HTTP `200`",
                        "  - Authenticated GET `/api/v1/meta`: HTTP `200`",
                        "  - POST `/api/v1/realtime-ticket?transport=ws`: HTTP `201`",
                        "  - GET `/api/v1/buckets/{bucket}/objects/download-url?proxy=true`: HTTP `200`",
                        "  - Signed proxy URL root: https://s3desk.example.com",
                        "  - HEAD signed proxy URL: HTTP `200`",
                        "",
                        "## Result",
                        "",
                        "  - Reverse-proxy smoke: passed",
                    ]
                ),
            },
        )

        self.assertTrue(summary["ready"])
        provider = self._requirement(summary, "provider-live-validation")
        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertEqual(provider["evidence_by_provider_scope"]["gcs"], ["docs/release/evidence/provider-live-gcs-2026-04-30.md"])
        self.assertEqual(provider["missing_provider_scopes"], [])
        self.assertEqual(reverse_proxy["evidence_files"], ["docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"])

    def test_requires_evidence_for_each_suggested_provider_scope(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/handlers_bucket_policy.go")],
            evidence_files={
                "provider-live-aws-2026-04-30.md": self._provider_evidence("AWS S3"),
            },
        )

        provider = self._requirement(summary, "provider-live-validation")
        self.assertFalse(provider["satisfied"])
        self.assertEqual(provider["evidence_by_provider_scope"]["aws"], ["docs/release/evidence/provider-live-aws-2026-04-30.md"])
        self.assertEqual(provider["missing_provider_scopes"], ["gcs", "azure", "oci", "minio", "ceph"])

    def test_rejects_evidence_with_suspected_secret_values(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
            ],
            evidence_files={
                "provider-live-gcs-2026-04-30.md": "\n".join(
                    [
                        "# Provider Live Validation Evidence",
                        "",
                        "- Provider name: GCS",
                        "- Bucket or container name: release-bucket",
                        "- Profile identifier: release-profile",
                        "- S3Desk commit SHA or release tag: abc123",
                        "- Exact feature tested: bucket governance controls",
                        "- Actual outcome: pass",
                        "- Command or manual workflow used: S3DESK_LIVE_GCS_SERVICE_ACCOUNT_JSON={\"type\":\"service_account\"} go test ./internal/api",
                        "- Provider-native console or CLI confirmation on success: https://storage.googleapis.com/bucket/object?X-Goog-Signature=abc123",
                    ]
                ),
                "reverse-proxy-smoke-2026-04-30.md": self._reverse_proxy_evidence(
                    command="DEPLOY_API_TOKEN=secret-token bash ./scripts/deploy_smoke.sh"
                ),
            },
        )

        self.assertFalse(summary["ready"])
        provider = self._requirement(summary, "provider-live-validation")
        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertEqual(provider["evidence_files"], [])
        self.assertEqual(reverse_proxy["evidence_files"], [])
        rejected_paths = {item["path"] for item in summary["rejected_evidence_files"]}
        self.assertEqual(
            rejected_paths,
            {
                "docs/release/evidence/provider-live-gcs-2026-04-30.md",
                "docs/release/evidence/reverse-proxy-smoke-2026-04-30.md",
            },
        )
        provider_rejection = next(
            item
            for item in summary["rejected_evidence_files"]
            if item["path"] == "docs/release/evidence/provider-live-gcs-2026-04-30.md"
        )
        self.assertIn(
            "credential_assignment",
            {finding["type"] for finding in provider_rejection["findings"]},
        )
        self.assertTrue(
            all("remediation" in finding for finding in provider_rejection["findings"])
        )
        reverse_proxy_rejection = next(
            item
            for item in summary["rejected_evidence_files"]
            if item["path"] == "docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"
        )
        reverse_proxy_finding_types = {
            finding["type"] for finding in reverse_proxy_rejection["findings"]
        }
        self.assertEqual(reverse_proxy_finding_types, {"api_token_assignment"})

    def test_rejects_pass_evidence_without_release_candidate_identifier(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
            ],
            evidence_files={
                "provider-live-gcs-2026-04-30.md": "\n".join(
                    [
                        "# Provider Live Validation Evidence",
                        "",
                        "- Provider name: GCS",
                        "- Bucket or container name: release-bucket",
                        "- Profile identifier: release-profile",
                        "- Exact feature tested: bucket governance controls",
                        "- Command or manual workflow used: go test ./internal/api -run TestLiveValidationGcpGcs",
                        "- Provider-native console or CLI confirmation on success: gcloud storage listed release-bucket",
                        "- Actual outcome: pass",
                    ]
                ),
                "reverse-proxy-smoke-2026-04-30.md": self._reverse_proxy_evidence(candidate="<tag-or-sha>"),
            },
        )

        self.assertFalse(summary["ready"])
        provider = self._requirement(summary, "provider-live-validation")
        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertEqual(provider["evidence_files"], [])
        self.assertEqual(reverse_proxy["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/provider-live-gcs-2026-04-30.md"],
            {"candidate_identifier_missing"},
        )
        self.assertEqual(
            rejected_by_path["docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"],
            {"candidate_identifier_placeholder"},
        )

    def test_candidate_id_option_rejects_evidence_from_a_different_candidate(self):
        entries = [
            MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go"),
            MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
        ]
        matching_evidence_files = {
            "provider-live-gcs-rc1.md": self._provider_evidence("GCS", candidate="rc1"),
            "reverse-proxy-smoke-rc1.md": self._reverse_proxy_evidence(candidate="rc1"),
        }
        mismatched_evidence_files = {
            "provider-live-gcs-rc2.md": self._provider_evidence("GCS", candidate="rc1"),
            "reverse-proxy-smoke-rc2.md": self._reverse_proxy_evidence(candidate="rc1"),
        }

        matching = self._summarize_with_evidence(entries, matching_evidence_files, candidate_id="rc1")
        mismatched = self._summarize_with_evidence(entries, mismatched_evidence_files, candidate_id="rc2")

        self.assertTrue(matching["ready"])
        self.assertEqual(matching["candidate_id"], "rc1")
        self.assertFalse(mismatched["ready"])
        self.assertEqual(mismatched["candidate_id"], "rc2")
        finding_types = {
            finding["type"]
            for rejection in mismatched["rejected_evidence_files"]
            for finding in rejection["findings"]
        }
        self.assertEqual(finding_types, {"candidate_identifier_mismatch"})
        self.assertTrue(
            all("Expected `rc2`." in finding["remediation"] for rejection in mismatched["rejected_evidence_files"] for finding in rejection["findings"])
        )

    def test_candidate_id_option_rejects_evidence_from_a_different_filename_candidate(self):
        entries = [
            MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go"),
            MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
        ]
        summary = self._summarize_with_evidence(
            entries,
            {
                "provider-live-gcs-rc1.md": self._provider_evidence("GCS", candidate="rc2"),
                "reverse-proxy-smoke-rc1.md": self._reverse_proxy_evidence(candidate="rc2"),
            },
            candidate_id="rc2",
        )

        self.assertFalse(summary["ready"])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/provider-live-gcs-rc1.md"],
            {"evidence_filename_candidate_mismatch"},
        )
        self.assertEqual(
            rejected_by_path["docs/release/evidence/reverse-proxy-smoke-rc1.md"],
            {"evidence_filename_candidate_mismatch"},
        )
        self.assertTrue(
            all(
                "Expected `rc2`." in finding["remediation"]
                for rejection in summary["rejected_evidence_files"]
                for finding in rejection["findings"]
            )
        )

    def test_candidate_id_option_accepts_resolved_tag_commit_sha_in_evidence_body(self):
        entries = [
            MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go"),
            MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
        ]
        commit_sha = "0123456789abcdef0123456789abcdef01234567"
        with mock.patch.object(MODULE.subprocess, "check_output", return_value=commit_sha):
            summary = self._summarize_with_evidence(
                entries,
                {
                    "provider-live-gcs-0.21v-rc3.md": self._provider_evidence("GCS", candidate=commit_sha),
                    "reverse-proxy-smoke-0.21v-rc3.md": self._reverse_proxy_evidence(candidate=commit_sha),
                },
                candidate_id="0.21v-rc3",
            )

        self.assertTrue(summary["ready"])
        self.assertEqual(summary["candidate_id"], "0.21v-rc3")
        self.assertEqual(summary["rejected_evidence_files"], [])

    def test_rejects_placeholder_evidence_filenames(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go")],
            evidence_files={
                "provider-live-gcs-<tag-or-sha>.md": self._provider_evidence("GCS", candidate="abc123"),
            },
        )

        provider = self._requirement(summary, "provider-live-validation")
        self.assertFalse(summary["ready"])
        self.assertEqual(provider["evidence_files"], [])
        self.assertEqual(provider["missing_provider_scopes"], ["gcs"])
        self.assertEqual(
            summary["rejected_evidence_files"][0]["path"],
            "docs/release/evidence/provider-live-gcs-<tag-or-sha>.md",
        )
        self.assertEqual(
            {finding["type"] for finding in summary["rejected_evidence_files"][0]["findings"]},
            {"evidence_filename_placeholder"},
        )

    def test_rejects_provider_evidence_without_supported_provider_name(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go")],
            evidence_files={
                "provider-live-gcs-2026-04-30.md": "\n".join(
                    [
                        "# Provider Live Validation Evidence",
                        "",
                        "- Bucket or container name: release-bucket",
                        "- Profile identifier: release-profile",
                        "- S3Desk commit SHA or release tag: abc123",
                        "- Exact feature tested: bucket governance controls",
                        "- Command or manual workflow used: go test ./internal/api -run TestLiveValidationGcpGcs",
                        "- Provider-native console or CLI confirmation on success: gcloud storage listed release-bucket",
                        "- Actual outcome: pass",
                    ]
                ),
                "provider-live-unknown-2026-04-30.md": self._provider_evidence("Provider X"),
            },
        )

        provider = self._requirement(summary, "provider-live-validation")
        self.assertFalse(summary["ready"])
        self.assertEqual(provider["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/provider-live-gcs-2026-04-30.md"],
            {"provider_name_missing"},
        )
        self.assertEqual(
            rejected_by_path["docs/release/evidence/provider-live-unknown-2026-04-30.md"],
            {"provider_name_unknown"},
        )

    def test_rejects_provider_evidence_without_required_review_metadata(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go")],
            evidence_files={
                "provider-live-gcs-missing-metadata.md": "# Provider Live Validation Evidence\n\n- Provider name: GCS\n- S3Desk commit SHA or release tag: abc123\n- Actual outcome: pass\n",
                "provider-live-gcs-placeholder-metadata.md": "\n".join(
                    [
                        "# Provider Live Validation Evidence",
                        "",
                        "- Provider name: GCS",
                        "- Bucket or container name: <bucket>",
                        "- Profile identifier: release-profile",
                        "- S3Desk commit SHA or release tag: abc123",
                        "- Exact feature tested: ...",
                        "- Command or manual workflow used: go test ./internal/api -run TestLiveValidationGcpGcs",
                        "- Provider-native console or CLI confirmation on success: <confirmation>",
                        "- Actual outcome: pass",
                    ]
                ),
            },
        )

        provider = self._requirement(summary, "provider-live-validation")
        self.assertFalse(summary["ready"])
        self.assertEqual(provider["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/provider-live-gcs-missing-metadata.md"],
            {
                "provider_bucket_or_container_missing",
                "provider_profile_identifier_missing",
                "provider_feature_tested_missing",
                "provider_command_or_workflow_missing",
                "provider_native_confirmation_missing",
            },
        )
        self.assertEqual(
            rejected_by_path["docs/release/evidence/provider-live-gcs-placeholder-metadata.md"],
            {
                "provider_bucket_or_container_placeholder",
                "provider_feature_tested_placeholder",
                "provider_native_confirmation_placeholder",
            },
        )

    def test_rejects_reverse_proxy_evidence_without_required_review_metadata(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go")],
            evidence_files={
                "reverse-proxy-smoke-missing-metadata.md": "# Reverse Proxy Smoke Evidence\n\n- S3Desk commit SHA or release tag: abc123\n- Reverse-proxy smoke: pass\n",
            },
        )

        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertFalse(summary["ready"])
        self.assertEqual(reverse_proxy["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/reverse-proxy-smoke-missing-metadata.md"],
            {
                "reverse_proxy_base_url_missing",
                "reverse_proxy_expected_external_base_url_missing",
                "reverse_proxy_profile_identifier_missing",
                "reverse_proxy_bucket_missing",
                "reverse_proxy_object_key_missing",
                "reverse_proxy_healthz_missing",
                "reverse_proxy_meta_missing",
                "reverse_proxy_realtime_ticket_missing",
                "reverse_proxy_download_url_missing",
                "reverse_proxy_signed_proxy_root_missing",
                "reverse_proxy_head_signed_proxy_url_missing",
            },
        )

    def test_rejects_reverse_proxy_evidence_with_failed_check_statuses(self):
        evidence = (
            self._reverse_proxy_evidence()
            .replace("- GET `/healthz`: HTTP `200`", "- GET `/healthz`: HTTP `503`")
            .replace(
                "- POST `/api/v1/realtime-ticket?transport=ws`: HTTP `201`",
                "- POST `/api/v1/realtime-ticket?transport=ws`: HTTP `200`",
            )
        )
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go")],
            evidence_files={"reverse-proxy-smoke-2026-04-30.md": evidence},
        )

        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertFalse(summary["ready"])
        self.assertEqual(reverse_proxy["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"],
            {
                "reverse_proxy_healthz_unexpected_status",
                "reverse_proxy_realtime_ticket_unexpected_status",
            },
        )

    def test_rejects_reverse_proxy_evidence_with_status_free_check_prose(self):
        evidence = self._reverse_proxy_evidence().replace(
            "- Authenticated GET `/api/v1/meta`: HTTP `200`",
            "- Authenticated GET `/api/v1/meta`: passed",
        )
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go")],
            evidence_files={"reverse-proxy-smoke-2026-04-30.md": evidence},
        )

        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertFalse(summary["ready"])
        self.assertEqual(reverse_proxy["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"],
            {"reverse_proxy_meta_unexpected_status"},
        )

    def test_rejects_reverse_proxy_evidence_when_failure_mentions_expected_status(self):
        evidence = self._reverse_proxy_evidence().replace(
            "- GET `/healthz`: HTTP `200`",
            "- GET `/healthz`: HTTP `503`, expected `200`",
        )
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go")],
            evidence_files={"reverse-proxy-smoke-2026-04-30.md": evidence},
        )

        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertFalse(summary["ready"])
        self.assertEqual(reverse_proxy["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"],
            {"reverse_proxy_healthz_unexpected_status"},
        )

    def test_rejects_reverse_proxy_evidence_with_mismatched_signed_proxy_root(self):
        evidence = self._reverse_proxy_evidence().replace(
            "- Signed proxy URL root: https://s3desk.example.com",
            "- Signed proxy URL root: https://unexpected.example.com",
        )
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go")],
            evidence_files={"reverse-proxy-smoke-2026-04-30.md": evidence},
        )

        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertFalse(summary["ready"])
        self.assertEqual(reverse_proxy["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"],
            {"reverse_proxy_signed_proxy_root_unexpected_result"},
        )

    def test_rejects_reverse_proxy_evidence_with_pass_like_signed_proxy_root(self):
        evidence = self._reverse_proxy_evidence().replace(
            "- Signed proxy URL root: https://s3desk.example.com",
            "- Signed proxy URL root: pass",
        )
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go")],
            evidence_files={"reverse-proxy-smoke-2026-04-30.md": evidence},
        )

        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertFalse(summary["ready"])
        self.assertEqual(reverse_proxy["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"],
            {"reverse_proxy_signed_proxy_root_unexpected_result"},
        )

    def test_rejects_reverse_proxy_evidence_with_expected_status_examples_only(self):
        evidence = "\n".join(
            [
                "# Reverse Proxy Smoke Evidence",
                "",
                "- S3Desk commit SHA or release tag: abc123",
                "- Base URL: https://s3desk.example.com",
                "- Expected external base URL: https://s3desk.example.com",
                "- Profile identifier: release-profile",
                "- Bucket: release-bucket",
                "- Object key: smoke/object.txt",
                "",
                "## Expected Statuses",
                "",
                "- GET `/healthz`: `200`",
                "- Authenticated GET `/api/v1/meta`: `200`",
                "- POST `/api/v1/realtime-ticket?transport=ws`: `201`",
                "- GET `/api/v1/buckets/{bucket}/objects/download-url?proxy=true`: `200`",
                "- Signed proxy URL root: https://s3desk.example.com",
                "- HEAD signed proxy URL: `200`",
                "",
                "## Result",
                "",
                "- Reverse-proxy smoke: pass",
            ]
        )
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go")],
            evidence_files={"reverse-proxy-smoke-expected-status-only.md": evidence},
        )

        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertFalse(summary["ready"])
        self.assertEqual(reverse_proxy["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path[
                "docs/release/evidence/reverse-proxy-smoke-expected-status-only.md"
            ],
            {
                "reverse_proxy_healthz_missing",
                "reverse_proxy_meta_missing",
                "reverse_proxy_realtime_ticket_missing",
                "reverse_proxy_download_url_missing",
                "reverse_proxy_signed_proxy_root_missing",
                "reverse_proxy_head_signed_proxy_url_missing",
            },
        )

    def test_rejects_backup_portable_evidence_without_required_review_metadata(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/handlers_server_portable.go")],
            evidence_files={
                "backup-portable-smoke-missing-metadata.md": "# Backup Portable Smoke Evidence\n\n- S3Desk commit SHA or release tag: abc123\n- Backup portable smoke: pass\n",
            },
        )

        backup_portable = self._requirement(summary, "backup-portable-smoke")
        self.assertFalse(summary["ready"])
        self.assertEqual(backup_portable["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/backup-portable-smoke-missing-metadata.md"],
            {
                "backup_portable_source_database_missing",
                "backup_portable_target_database_missing",
                "backup_portable_export_workflow_missing",
                "backup_portable_import_workflow_missing",
                "backup_portable_verification_workflow_missing",
                "backup_portable_staged_restore_target_missing",
                "backup_portable_failure_smoke_missing",
                "backup_portable_postgres_to_sqlite_failure_smoke_missing",
                "backup_portable_postgres_to_sqlite_smoke_missing",
                "backup_portable_sqlite_to_postgres_smoke_missing",
            },
        )

    def test_rejects_backup_portable_evidence_without_per_script_results(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/handlers_server_portable.go")],
            evidence_files={
                "backup-portable-smoke-summary-only.md": self._backup_portable_evidence(
                    include_smoke_results=False
                ),
            },
        )

        backup_portable = self._requirement(summary, "backup-portable-smoke")
        self.assertFalse(summary["ready"])
        self.assertEqual(backup_portable["evidence_files"], [])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/backup-portable-smoke-summary-only.md"],
            {
                "backup_portable_failure_smoke_missing",
                "backup_portable_postgres_to_sqlite_failure_smoke_missing",
                "backup_portable_postgres_to_sqlite_smoke_missing",
                "backup_portable_sqlite_to_postgres_smoke_missing",
            },
        )

    def test_rejected_evidence_blocks_ready_even_when_required_evidence_exists(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
            ],
            evidence_files={
                "provider-live-gcs-2026-04-30.md": self._provider_evidence("GCS"),
                "reverse-proxy-smoke-2026-04-30.md": self._reverse_proxy_evidence(),
                "provider-live-aws-secret.md": self._provider_evidence(
                    "AWS S3",
                    command="S3DESK_LIVE_AWS_SECRET_ACCESS_KEY=secret-value go test ./internal/api",
                ),
            },
        )

        provider = self._requirement(summary, "provider-live-validation")
        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        self.assertTrue(provider["satisfied"])
        self.assertTrue(reverse_proxy["satisfied"])
        self.assertFalse(summary["ready"])
        self.assertEqual(
            [item["path"] for item in summary["rejected_evidence_files"]],
            ["docs/release/evidence/provider-live-aws-secret.md"],
        )

    def test_allows_redacted_secret_placeholders_in_evidence(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
            ],
            evidence_files={
                "provider-live-gcs-2026-04-30.md": self._provider_evidence(
                    "GCS",
                    command="S3DESK_LIVE_GCS_SERVICE_ACCOUNT_JSON=<redacted> go test ./internal/api",
                    extra_lines=["- Notes: https://storage.googleapis.com/bucket/object?X-Goog-Signature=<redacted>"],
                ),
                "reverse-proxy-smoke-2026-04-30.md": self._reverse_proxy_evidence(
                    command="DEPLOY_API_TOKEN=missing bash ./scripts/deploy_smoke.sh"
                ),
            },
        )

        self.assertTrue(summary["ready"])
        self.assertEqual(summary["rejected_evidence_files"], [])

    def test_rejects_authorization_cookie_and_access_key_id_evidence(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/s3client/client.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
            ],
            evidence_files={
                "provider-live-minio-2026-04-30.md": self._provider_evidence(
                    "MinIO",
                    command="S3DESK_LIVE_MINIO_ACCESS_KEY_ID=minio-user go test ./internal/api",
                ),
                "reverse-proxy-smoke-2026-04-30.md": self._reverse_proxy_evidence(
                    command="curl -H 'Authorization: Bearer live-token' -H 'Cookie: s3desk_api_token=cookie-token' /api/v1/meta"
                ),
            },
        )

        self.assertFalse(summary["ready"])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/provider-live-minio-2026-04-30.md"],
            {"credential_assignment"},
        )
        self.assertEqual(
            rejected_by_path["docs/release/evidence/reverse-proxy-smoke-2026-04-30.md"],
            {"authorization_header", "cookie_token", "api_token_assignment"},
        )

    def test_rejects_backup_password_values_in_evidence(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/api/handlers_server_backup.go")],
            evidence_files={
				"provider-live-minio-2026-04-30.md": self._provider_evidence(
					"MinIO",
					command="PORTABLE_BUNDLE_PASSWORD=operator-secret curl -H 'X-S3Desk-Backup-Password: restore-secret' /api/v1/server/backup\nBackup password: operator-secret",
				),
			},
		)

        self.assertFalse(summary["ready"])
        rejected_by_path = {
            item["path"]: {finding["type"] for finding in item["findings"]}
            for item in summary["rejected_evidence_files"]
        }
        self.assertEqual(
            rejected_by_path["docs/release/evidence/provider-live-minio-2026-04-30.md"],
            {"backup_password_assignment"},
        )

    def test_unrelated_changes_do_not_require_live_evidence(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "frontend/src/pages/settings/SettingsPage.tsx")],
            evidence_files={},
        )

        self.assertTrue(summary["ready"])
        for requirement in summary["requirements"]:
            self.assertFalse(requirement["required"])
            self.assertTrue(requirement["satisfied"])

    def test_checklist_output_includes_evidence_commands(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/api/handlers_bucket_policy.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/handlers_server_backup.go"),
            ],
            evidence_files={},
        )

        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            MODULE.print_checklist(summary)
        checklist = output.getvalue()

        self.assertIn("# Release Evidence Checklist", checklist)
        self.assertIn("- [ ] `provider-live-validation`: `missing evidence`", checklist)
        self.assertIn("Suggested provider scopes: `aws`, `gcs`, `azure`, `oci`, `minio`, `ceph`", checklist)
        self.assertIn(
            "python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph",
            checklist,
        )
        self.assertIn(
            "cd backend && go test ./internal/api -run '^(TestLiveValidationAwsS3|TestLiveValidationGcpGcs|TestLiveValidationAzureBlob|TestLiveValidationOciObjectStorage|TestLiveValidationMinioS3Compatible|TestLiveValidationCephS3Compatible)$' -count=1",
            checklist,
        )
        self.assertIn("`aws`: `docs/release/evidence/provider-live-aws-<tag-or-sha>.md`", checklist)
        self.assertIn("`ceph`: `docs/release/evidence/provider-live-ceph-<tag-or-sha>.md`", checklist)
        self.assertIn("Required metadata:", checklist)
        self.assertIn("`Provider-native console or CLI confirmation on success`", checklist)
        self.assertIn("python3 scripts/check_live_evidence_env.py --scope reverse-proxy --format env-template", checklist)
        self.assertIn("DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md", checklist)
        self.assertIn("Authenticated GET `/api/v1/meta`", checklist)
        self.assertIn("expected HTTP 200/201 statuses", checklist)
        self.assertIn("  - Expected statuses:", checklist)
        self.assertIn("    - GET `/healthz`: `200`", checklist)
        self.assertIn("    - POST `/api/v1/realtime-ticket?transport=ws`: `201`", checklist)
        self.assertIn("  - Expected non-status checks:", checklist)
        self.assertIn(
            "    - Signed proxy URL root: matches expected external base URL",
            checklist,
        )
        self.assertIn("- [ ] `backup-portable-smoke`: `missing evidence`", checklist)
        self.assertIn("bash scripts/run_portable_failure_smoke.sh", checklist)
        self.assertIn("docs/release/evidence/BACKUP_PORTABLE_SMOKE_TEMPLATE.md", checklist)
        self.assertIn("docs/release/evidence/backup-portable-smoke-<tag-or-sha>.md", checklist)
        self.assertIn(
            "python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all",
            checklist,
        )
        self.assertIn(
            "python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>",
            checklist,
        )

    def test_require_candidate_id_blocks_final_gate_without_candidate_id(self):
        stderr = io.StringIO()
        with (
            mock.patch.object(sys, "argv", [str(SCRIPT_PATH), "--strict", "--require-candidate-id"]),
            mock.patch.object(MODULE, "run_git_status") as run_git_status,
            contextlib.redirect_stderr(stderr),
        ):
            rc = MODULE.main()

        self.assertEqual(rc, 2)
        run_git_status.assert_not_called()
        self.assertIn("--require-candidate-id requires --candidate-id <tag-or-sha>", stderr.getvalue())

    def test_summary_includes_remediation_fields_for_json_consumers(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/api/handlers_bucket_policy.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/handlers_server_backup.go"),
            ],
            evidence_files={},
        )

        provider = self._requirement(summary, "provider-live-validation")
        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        backup_portable = self._requirement(summary, "backup-portable-smoke")
        self.assertEqual(
            provider["preflight_command"],
            "python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph",
        )
        self.assertEqual(
            provider["evidence_targets"]["aws"],
            "docs/release/evidence/provider-live-aws-<tag-or-sha>.md",
        )
        self.assertIn("Provider-native console or CLI confirmation on success", provider["required_metadata"])
        self.assertIn(
            "Provider-native console or CLI confirmation on success",
            provider["required_metadata_fields"],
        )
        self.assertIn("Actual outcome", provider["required_metadata_fields"])
        self.assertEqual(
            reverse_proxy["smoke_command"],
            "DEPLOY_BASE_URL=https://s3desk.example.com DEPLOY_API_TOKEN=... DEPLOY_PROFILE_ID=... DEPLOY_SMOKE_BUCKET=... DEPLOY_SMOKE_OBJECT_KEY=... DEPLOY_RELEASE_CANDIDATE=<tag-or-sha> DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md bash ./scripts/deploy_smoke.sh",
        )
        self.assertIn("Authenticated GET `/api/v1/meta`", reverse_proxy["required_metadata"])
        self.assertIn("Base URL", reverse_proxy["required_metadata_fields"])
        self.assertIn("Object key", reverse_proxy["required_metadata_fields"])
        self.assertIn("Authenticated GET `/api/v1/meta`", reverse_proxy["required_check_fields"])
        self.assertEqual(
            reverse_proxy["check_status_expectations"][
                "POST `/api/v1/realtime-ticket?transport=ws`"
            ],
            ["201"],
        )
        self.assertEqual(
            reverse_proxy["check_result_expectations"]["Signed proxy URL root"],
            "matches expected external base URL",
        )
        self.assertEqual(
            backup_portable["smoke_command"],
            "bash scripts/run_portable_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_smoke.sh && bash scripts/run_portable_sqlite_to_postgres_smoke.sh",
        )
        self.assertEqual(
            backup_portable["evidence_target"],
            "docs/release/evidence/backup-portable-smoke-<tag-or-sha>.md",
        )
        self.assertIn("Staged restore target", backup_portable["required_metadata_fields"])
        self.assertEqual(
            backup_portable["required_check_fields"],
            [
                "bash scripts/run_portable_failure_smoke.sh",
                "bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh",
                "bash scripts/run_portable_postgres_to_sqlite_smoke.sh",
                "bash scripts/run_portable_sqlite_to_postgres_smoke.sh",
            ],
        )
        self.assertEqual(
            summary["final_gate_commands"]["release_scope"],
            "python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all",
        )
        self.assertEqual(
            summary["final_gate_commands"]["release_evidence"],
            "python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>",
        )

    def test_summary_uses_candidate_id_in_final_gate_command(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go")],
            evidence_files={},
            candidate_id="rc1",
        )

        provider = self._requirement(summary, "provider-live-validation")
        reverse_proxy = self._requirement(summary, "reverse-proxy-smoke")
        backup_portable = self._requirement(summary, "backup-portable-smoke")
        self.assertEqual(
            provider["evidence_targets"]["gcs"],
            "docs/release/evidence/provider-live-gcs-rc1.md",
        )
        self.assertEqual(
            reverse_proxy["evidence_target"],
            "docs/release/evidence/reverse-proxy-smoke-rc1.md",
        )
        self.assertEqual(
            reverse_proxy["smoke_command"],
            "DEPLOY_BASE_URL=https://s3desk.example.com DEPLOY_API_TOKEN=... DEPLOY_PROFILE_ID=... DEPLOY_SMOKE_BUCKET=... DEPLOY_SMOKE_OBJECT_KEY=... DEPLOY_RELEASE_CANDIDATE=rc1 DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-rc1.md bash ./scripts/deploy_smoke.sh",
        )
        self.assertEqual(
            backup_portable["evidence_target"],
            "docs/release/evidence/backup-portable-smoke-rc1.md",
        )
        self.assertEqual(
            summary["final_gate_commands"]["release_evidence"],
            "python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id rc1",
        )

    def test_summary_preserves_diff_scope_in_final_gate_commands(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go")],
            evidence_files={},
            candidate_id="rc1",
            source={"mode": "git-diff", "base": "v1.0.0", "head": "HEAD"},
        )

        self.assertEqual(summary["source"]["mode"], "git-diff")
        self.assertEqual(
            summary["final_gate_commands"]["release_scope"],
            "python3 scripts/report_release_scope.py --base v1.0.0 --head HEAD --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit",
        )
        self.assertEqual(
            summary["final_gate_commands"]["release_evidence"],
            "python3 scripts/check_release_evidence.py --base v1.0.0 --head HEAD --strict --require-candidate-id --candidate-id rc1",
        )

    def test_markdown_output_includes_remediation_commands(self):
        summary = self._summarize_with_evidence(
            entries=[
                MODULE.StatusEntry(" M", "backend/internal/api/handlers_bucket_policy.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/download_proxy.go"),
                MODULE.StatusEntry(" M", "backend/internal/api/handlers_server_backup.go"),
            ],
            evidence_files={},
        )

        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            MODULE.print_markdown(summary)
        audit = output.getvalue()

        self.assertIn("### Remediation", audit)
        self.assertIn(
            "- Provider test: `cd backend && go test ./internal/api -run '^(TestLiveValidationAwsS3|TestLiveValidationGcpGcs|TestLiveValidationAzureBlob|TestLiveValidationOciObjectStorage|TestLiveValidationMinioS3Compatible|TestLiveValidationCephS3Compatible)$' -count=1`",
            audit,
        )
        self.assertIn("- Required metadata:", audit)
        self.assertIn("`Provider-native console or CLI confirmation on success`", audit)
        self.assertIn("  - `aws`: `docs/release/evidence/provider-live-aws-<tag-or-sha>.md`", audit)
        self.assertIn(
            "- Smoke command: `DEPLOY_BASE_URL=https://s3desk.example.com DEPLOY_API_TOKEN=... DEPLOY_PROFILE_ID=... DEPLOY_SMOKE_BUCKET=... DEPLOY_SMOKE_OBJECT_KEY=... DEPLOY_RELEASE_CANDIDATE=<tag-or-sha> DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md bash ./scripts/deploy_smoke.sh`",
            audit,
        )
        self.assertIn("Authenticated GET `/api/v1/meta`", audit)
        self.assertIn("expected HTTP 200/201 statuses", audit)
        self.assertIn("- Expected statuses:", audit)
        self.assertIn("  - Authenticated GET `/api/v1/meta`: `200`", audit)
        self.assertIn("  - POST `/api/v1/realtime-ticket?transport=ws`: `201`", audit)
        self.assertIn("- Expected non-status checks:", audit)
        self.assertIn(
            "  - Signed proxy URL root: matches expected external base URL",
            audit,
        )
        self.assertIn("- Smoke command: `bash scripts/run_portable_failure_smoke.sh", audit)
        self.assertIn("- Evidence template: `docs/release/evidence/BACKUP_PORTABLE_SMOKE_TEMPLATE.md`", audit)
        self.assertIn("- Evidence target: `docs/release/evidence/backup-portable-smoke-<tag-or-sha>.md`", audit)
        self.assertIn("- Required smoke results:", audit)
        self.assertIn("  - bash scripts/run_portable_failure_smoke.sh: pass/success", audit)
        self.assertIn("## Final Gate", audit)
        self.assertIn(
            "- `python3 scripts/report_release_scope.py --fail-on-root-artifacts --fail-on-dependency-scope-warning --fail-on-untracked-directories --fail-on-other-unit --untracked-files all` passes from the final candidate scope.",
            audit,
        )
        self.assertIn(
            "- `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>` passes after evidence files are recorded.",
            audit,
        )

    def test_markdown_output_includes_rejected_evidence_remediation(self):
        summary = self._summarize_with_evidence(
            entries=[MODULE.StatusEntry(" M", "backend/internal/gcsbucket/client.go")],
            evidence_files={
                "provider-live-gcs-2026-04-30.md": self._provider_evidence(
                    "GCS",
                    command='S3DESK_LIVE_GCS_SERVICE_ACCOUNT_JSON={"type":"service_account"} go test ./internal/api',
                ),
            },
        )

        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            MODULE.print_markdown(summary)
        audit = output.getvalue()

        self.assertIn("## Rejected Evidence Findings", audit)
        self.assertIn("`credential_assignment`", audit)
        self.assertIn("Replace provider credential assignment values with `<redacted>`", audit)

    @staticmethod
    def _provider_evidence(provider, candidate="abc123", outcome="pass", command=None, extra_lines=None):
        command = command or "go test ./internal/api -run TestLiveValidation"
        lines = [
            "# Provider Live Validation Evidence",
            "",
            f"- Provider name: {provider}",
            "- Bucket or container name: release-bucket",
            "- Profile identifier: release-profile",
            f"- S3Desk commit SHA or release tag: {candidate}",
            "- Exact feature tested: bucket governance controls",
            f"- Command or manual workflow used: {command}",
            "- Provider-native console or CLI confirmation on success: provider CLI showed release-bucket state",
            f"- Actual outcome: {outcome}",
        ]
        lines.extend(extra_lines or [])
        return "\n".join(lines) + "\n"

    @staticmethod
    def _reverse_proxy_evidence(candidate="abc123", outcome="pass", command=None, extra_lines=None):
        lines = [
            "# Reverse Proxy Smoke Evidence",
            "",
            f"- S3Desk commit SHA or release tag: {candidate}",
            "- Base URL: https://s3desk.example.com",
            "- Expected external base URL: https://s3desk.example.com",
            "- Profile identifier: release-profile",
            "- Bucket: release-bucket",
            "- Object key: smoke/object.txt",
        ]
        if command is not None:
            lines.append(f"- Command used: {command}")
        lines.extend(
            [
                "",
                "## Checks",
                "",
                "- GET `/healthz`: HTTP `200`",
                "- Authenticated GET `/api/v1/meta`: HTTP `200`",
                "- POST `/api/v1/realtime-ticket?transport=ws`: HTTP `201`",
                "- GET `/api/v1/buckets/{bucket}/objects/download-url?proxy=true`: HTTP `200`",
                "- Signed proxy URL root: https://s3desk.example.com",
                "- HEAD signed proxy URL: HTTP `200`",
                "",
                "## Result",
                "",
                f"- Reverse-proxy smoke: {outcome}",
            ]
        )
        lines.extend(extra_lines or [])
        return "\n".join(lines) + "\n"

    @staticmethod
    def _backup_portable_evidence(
        candidate="abc123",
        outcome="pass",
        extra_lines=None,
        include_smoke_results=True,
    ):
        lines = [
            "# Backup Portable Smoke Evidence",
            "",
            f"- S3Desk commit SHA or release tag: {candidate}",
            "- Source database: sqlite",
            "- Target database: postgres",
            "- Export workflow: server backup export from source fixture",
            "- Import workflow: portable apply into staged target",
            "- Verification workflow: scripts/portable/run-smoke.py compared source and target counts",
            "- Staged restore target: disposable portable-smoke compose project",
            f"- Backup portable smoke: {outcome}",
        ]
        if include_smoke_results:
            lines.extend(
                [
                    "",
                    "## Smoke Results",
                    "",
                    "- bash scripts/run_portable_failure_smoke.sh: pass",
                    "- bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh: pass",
                    "- bash scripts/run_portable_postgres_to_sqlite_smoke.sh: pass",
                    "- bash scripts/run_portable_sqlite_to_postgres_smoke.sh: pass",
                ]
            )
        lines.extend(extra_lines or [])
        return "\n".join(lines) + "\n"

    def _summarize_with_evidence(self, entries, evidence_files, candidate_id=None, source=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            evidence_dir = root / "docs" / "release" / "evidence"
            evidence_dir.mkdir(parents=True)
            for name, content in evidence_files.items():
                (evidence_dir / name).write_text(content, encoding="utf-8")
            with mock.patch.object(MODULE, "ROOT", root), mock.patch.object(MODULE, "EVIDENCE_DIR", evidence_dir):
                return MODULE.summarize(entries, candidate_id, source=source)

    @staticmethod
    def _requirement(summary, name):
        return next(item for item in summary["requirements"] if item["name"] == name)


if __name__ == "__main__":
    unittest.main()
