import contextlib
import importlib.util
import io
import pathlib
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT_PATH = pathlib.Path(__file__).with_name("check_release_evidence_checklist.py")
SPEC = importlib.util.spec_from_file_location("check_release_evidence_checklist_script", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ReleaseEvidenceChecklistSyncTests(unittest.TestCase):
    def test_extracts_current_checklist_from_readme_link(self):
        path = MODULE.checklist_from_readme(
            "Use [LIVE_EVIDENCE_CHECKLIST_2026-05-02.md](LIVE_EVIDENCE_CHECKLIST_2026-05-02.md)."
        )

        self.assertIsNotNone(path)
        self.assertEqual(path.name, "LIVE_EVIDENCE_CHECKLIST_2026-05-02.md")

    def test_resolve_checklist_prefers_explicit_relative_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            with mock.patch.object(MODULE, "ROOT", root):
                path = MODULE.resolve_checklist_path(
                    "docs/release/evidence/custom.md",
                    "Use LIVE_EVIDENCE_CHECKLIST_2026-05-02.md",
                )

        self.assertEqual(path, root / "docs/release/evidence/custom.md")

    def test_latest_checklist_uses_newest_iso_date_when_readme_has_no_link(self):
        with tempfile.TemporaryDirectory() as tmp:
            evidence_dir = pathlib.Path(tmp)
            (evidence_dir / "LIVE_EVIDENCE_CHECKLIST_2026-04-30.md").write_text("", encoding="utf-8")
            (evidence_dir / "LIVE_EVIDENCE_CHECKLIST_2026-05-02.md").write_text("", encoding="utf-8")
            with mock.patch.object(MODULE, "EVIDENCE_DIR", evidence_dir):
                path = MODULE.resolve_checklist_path("", "No current checklist link here.")

        self.assertIsNotNone(path)
        self.assertEqual(path.name, "LIVE_EVIDENCE_CHECKLIST_2026-05-02.md")

    def test_provider_targets_accept_combined_env_template_and_template_filename(self):
        errors: list[str] = []
        provider = {
            "required": True,
            "preflight_command": "python3 scripts/check_live_evidence_env.py --scope aws",
            "env_template_command": "python3 scripts/check_live_evidence_env.py --scope aws --format env-template",
            "provider_test_command": "cd backend && go test ./internal/api -run '^TestLiveValidationAwsS3$' -count=1",
            "evidence_template": "docs/release/evidence/PROVIDER_LIVE_VALIDATION_TEMPLATE.md",
            "evidence_targets": {"aws": "docs/release/evidence/provider-live-aws-rc1.md"},
        }
        checklist = "\n".join(
            [
                "python3 scripts/check_live_evidence_env.py --scope aws",
                "python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --scope reverse-proxy --format env-template",
                "cd backend && go test ./internal/api -run '^TestLiveValidationAwsS3$' -count=1",
                "PROVIDER_LIVE_VALIDATION_TEMPLATE.md",
                "docs/release/evidence/provider-live-aws-rc1.md",
            ]
        )

        MODULE.check_provider_targets(checklist, provider, errors)

        self.assertEqual(errors, [])

    def test_reverse_proxy_targets_require_status_and_result_expectations(self):
        errors: list[str] = []
        reverse_proxy = {
            "required": True,
            "preflight_command": "python3 scripts/check_live_evidence_env.py --scope reverse-proxy",
            "env_template_command": "python3 scripts/check_live_evidence_env.py --scope reverse-proxy --format env-template",
            "smoke_command": "DEPLOY_RELEASE_CANDIDATE=rc1 DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-rc1.md bash ./scripts/deploy_smoke.sh",
            "evidence_target": "docs/release/evidence/reverse-proxy-smoke-rc1.md",
            "check_status_expectations": {"GET `/healthz`": ["200"]},
            "check_result_expectations": {"Signed proxy URL root": "matches expected external base URL"},
        }
        checklist = "\n".join(
            [
                "python3 scripts/check_live_evidence_env.py --scope reverse-proxy",
                "python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --scope reverse-proxy --format env-template",
                "DEPLOY_RELEASE_CANDIDATE=rc1 DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-rc1.md bash ./scripts/deploy_smoke.sh",
                "docs/release/evidence/reverse-proxy-smoke-rc1.md",
                "GET `/healthz`: `200`",
                "Signed proxy URL root matches expected external base URL",
            ]
        )

        MODULE.check_reverse_proxy_targets(checklist, reverse_proxy, errors)

        self.assertEqual(errors, [])

    def test_main_skips_outside_git_worktree(self):
        output = io.StringIO()
        with mock.patch.object(MODULE, "is_git_worktree", return_value=False), mock.patch.object(
            sys, "argv", [str(SCRIPT_PATH), "--candidate-id", "rc1"]
        ), contextlib.redirect_stdout(output):
            status = MODULE.main()

        self.assertEqual(status, 0)
        self.assertIn("skipping checklist sync outside a git worktree", output.getvalue())


if __name__ == "__main__":
    unittest.main()
