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
    def test_resolve_candidate_id_preserves_explicit_candidate(self):
        self.assertEqual(MODULE.resolve_candidate_id("0.21v-rc2"), "0.21v-rc2")

    def test_resolve_candidate_id_defaults_to_latest_changelog_candidate(self):
        with mock.patch.object(MODULE, "default_candidate_id", return_value="0.21v-rc3"):
            self.assertEqual(MODULE.resolve_candidate_id(""), "0.21v-rc3")

    def test_check_output_preserves_diff_scope(self):
        with mock.patch.object(
            MODULE.subprocess,
            "check_output",
            return_value='{"requirements":[],"final_gate_commands":{}}',
        ) as check_output:
            summary = MODULE.check_output("rc1", base="v1.0.0", head="HEAD")

        self.assertEqual(summary["requirements"], [])
        command = check_output.call_args.args[0]
        self.assertIn("--base", command)
        self.assertIn("v1.0.0", command)
        self.assertIn("--head", command)
        self.assertIn("HEAD", command)

    def test_checklist_diff_scope_extracts_base_and_head_from_final_gate(self):
        checklist = "\n".join(
            [
                "```bash",
                "python3 scripts/check_release_evidence.py --base 0.21v-rc3 --head HEAD --strict --require-candidate-id --candidate-id 0.21v-rc3",
                "```",
            ]
        )

        self.assertEqual(MODULE.checklist_diff_scope(checklist), ("0.21v-rc3", "HEAD"))

    def test_checklist_diff_scope_defaults_to_worktree_mode(self):
        self.assertEqual(MODULE.checklist_diff_scope("python3 scripts/check_release_evidence.py --strict"), ("", "HEAD"))

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

    def test_provider_targets_reject_candidate_mismatched_target_paths(self):
        errors: list[str] = []
        provider = {
            "required": True,
            "preflight_command": "python3 scripts/check_live_evidence_env.py --scope aws",
            "env_template_command": "python3 scripts/check_live_evidence_env.py --scope aws --format env-template",
            "provider_test_command": "cd backend && go test ./internal/api -run '^TestLiveValidationAwsS3$' -count=1",
            "evidence_template": "docs/release/evidence/PROVIDER_LIVE_VALIDATION_TEMPLATE.md",
            "evidence_targets": {"aws": "docs/release/evidence/provider-live-aws-rc2.md"},
        }
        checklist = "\n".join(
            [
                "python3 scripts/check_live_evidence_env.py --scope aws",
                "python3 scripts/check_live_evidence_env.py --scope aws --format env-template",
                "cd backend && go test ./internal/api -run '^TestLiveValidationAwsS3$' -count=1",
                "PROVIDER_LIVE_VALIDATION_TEMPLATE.md",
                "docs/release/evidence/provider-live-aws-rc2.md",
            ]
        )

        MODULE.check_provider_targets(checklist, provider, errors, candidate_id="rc1")

        self.assertEqual(
            errors,
            [
                "aws provider evidence target must use candidate `rc1` in filename: docs/release/evidence/provider-live-aws-rc2.md"
            ],
        )

    def test_reverse_proxy_targets_require_status_and_result_expectations(self):
        errors: list[str] = []
        reverse_proxy = {
            "required": True,
            "preflight_command": "python3 scripts/check_live_evidence_env.py --scope reverse-proxy",
            "env_template_command": "python3 scripts/check_live_evidence_env.py --scope reverse-proxy --format env-template",
            "smoke_command": "DEPLOY_BASE_URL=https://s3desk.example.com DEPLOY_API_TOKEN=... DEPLOY_PROFILE_ID=... DEPLOY_SMOKE_BUCKET=... DEPLOY_SMOKE_OBJECT_KEY=... DEPLOY_RELEASE_CANDIDATE=rc1 DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-rc1.md bash ./scripts/deploy_smoke.sh",
            "evidence_target": "docs/release/evidence/reverse-proxy-smoke-rc1.md",
            "check_status_expectations": {"GET `/healthz`": ["200"]},
            "check_result_expectations": {"Signed proxy URL root": "matches expected external base URL"},
        }
        checklist = "\n".join(
            [
                "python3 scripts/check_live_evidence_env.py --scope reverse-proxy",
                "python3 scripts/check_live_evidence_env.py --scope aws --scope gcs --scope azure --scope oci --scope minio --scope ceph --scope reverse-proxy --format env-template",
                "DEPLOY_BASE_URL=https://s3desk.example.com DEPLOY_API_TOKEN=... DEPLOY_PROFILE_ID=... DEPLOY_SMOKE_BUCKET=... DEPLOY_SMOKE_OBJECT_KEY=... DEPLOY_RELEASE_CANDIDATE=rc1 DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-rc1.md bash ./scripts/deploy_smoke.sh",
                "docs/release/evidence/reverse-proxy-smoke-rc1.md",
                "GET `/healthz`: `200`",
                "Signed proxy URL root matches expected external base URL",
            ]
        )

        MODULE.check_reverse_proxy_targets(checklist, reverse_proxy, errors, candidate_id="rc1")

        self.assertEqual(errors, [])

    def test_reverse_proxy_targets_reject_candidate_mismatched_target_paths(self):
        errors: list[str] = []
        reverse_proxy = {
            "required": True,
            "preflight_command": "python3 scripts/check_live_evidence_env.py --scope reverse-proxy",
            "env_template_command": "python3 scripts/check_live_evidence_env.py --scope reverse-proxy --format env-template",
            "smoke_command": "DEPLOY_BASE_URL=https://s3desk.example.com DEPLOY_API_TOKEN=... DEPLOY_PROFILE_ID=... DEPLOY_SMOKE_BUCKET=... DEPLOY_SMOKE_OBJECT_KEY=... DEPLOY_RELEASE_CANDIDATE=rc2 DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-rc2.md bash ./scripts/deploy_smoke.sh",
            "evidence_target": "docs/release/evidence/reverse-proxy-smoke-rc2.md",
            "check_status_expectations": {"GET `/healthz`": ["200"]},
            "check_result_expectations": {},
        }
        checklist = "\n".join(
            [
                "python3 scripts/check_live_evidence_env.py --scope reverse-proxy",
                "python3 scripts/check_live_evidence_env.py --scope reverse-proxy --format env-template",
                "DEPLOY_BASE_URL=https://s3desk.example.com DEPLOY_API_TOKEN=... DEPLOY_PROFILE_ID=... DEPLOY_SMOKE_BUCKET=... DEPLOY_SMOKE_OBJECT_KEY=... DEPLOY_RELEASE_CANDIDATE=rc2 DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-rc2.md bash ./scripts/deploy_smoke.sh",
                "docs/release/evidence/reverse-proxy-smoke-rc2.md",
                "GET `/healthz`: `200`",
            ]
        )

        MODULE.check_reverse_proxy_targets(checklist, reverse_proxy, errors, candidate_id="rc1")

        self.assertEqual(
            errors,
            [
                "reverse-proxy evidence target must use candidate `rc1` in filename: docs/release/evidence/reverse-proxy-smoke-rc2.md"
            ],
        )

    def test_backup_portable_targets_require_command_template_and_target(self):
        errors: list[str] = []
        backup_portable = {
            "required": True,
            "smoke_command": "bash scripts/run_portable_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_smoke.sh && bash scripts/run_portable_sqlite_to_postgres_smoke.sh",
            "evidence_template": "docs/release/evidence/BACKUP_PORTABLE_SMOKE_TEMPLATE.md",
            "evidence_target": "docs/release/evidence/backup-portable-smoke-rc1.md",
            "required_check_fields": [
                "bash scripts/run_portable_failure_smoke.sh",
                "bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh",
                "bash scripts/run_portable_postgres_to_sqlite_smoke.sh",
                "bash scripts/run_portable_sqlite_to_postgres_smoke.sh",
            ],
        }
        checklist = "\n".join(
            [
                "bash scripts/run_portable_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh && bash scripts/run_portable_postgres_to_sqlite_smoke.sh && bash scripts/run_portable_sqlite_to_postgres_smoke.sh",
                "BACKUP_PORTABLE_SMOKE_TEMPLATE.md",
                "docs/release/evidence/backup-portable-smoke-rc1.md",
                "bash scripts/run_portable_failure_smoke.sh: pass/success",
                "bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh: pass/success",
                "bash scripts/run_portable_postgres_to_sqlite_smoke.sh: pass/success",
                "bash scripts/run_portable_sqlite_to_postgres_smoke.sh: pass/success",
            ]
        )

        MODULE.check_backup_portable_targets(checklist, backup_portable, errors, candidate_id="rc1")

        self.assertEqual(errors, [])

    def test_backup_portable_targets_reject_candidate_mismatched_target_paths(self):
        errors: list[str] = []
        backup_portable = {
            "required": True,
            "smoke_command": "bash scripts/run_portable_failure_smoke.sh",
            "evidence_template": "docs/release/evidence/BACKUP_PORTABLE_SMOKE_TEMPLATE.md",
            "evidence_target": "docs/release/evidence/backup-portable-smoke-rc2.md",
        }
        checklist = "\n".join(
            [
                "bash scripts/run_portable_failure_smoke.sh",
                "BACKUP_PORTABLE_SMOKE_TEMPLATE.md",
                "docs/release/evidence/backup-portable-smoke-rc2.md",
            ]
        )

        MODULE.check_backup_portable_targets(checklist, backup_portable, errors, candidate_id="rc1")

        self.assertEqual(
            errors,
            [
                "backup/portable evidence target must use candidate `rc1` in filename: docs/release/evidence/backup-portable-smoke-rc2.md"
            ],
        )

    def test_checklist_rejects_candidate_mismatched_filenames_in_text(self):
        errors: list[str] = []
        checklist = "\n".join(
            [
                "docs/release/evidence/provider-live-aws-rc1.md",
                "docs/release/evidence/provider-live-gcs-rc2.md",
                "docs/release/evidence/provider-live-ceph-<tag-or-sha>.md",
                "docs/release/evidence/reverse-proxy-smoke-rc2.md",
                "docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md",
                "docs/release/evidence/backup-portable-smoke-rc2.md",
                "docs/release/evidence/backup-portable-smoke-<tag-or-sha>.md",
            ]
        )

        MODULE.check_candidate_filenames(checklist, "rc1", errors)

        self.assertEqual(
            errors,
            [
                "provider evidence filename `provider-live-gcs-rc2.md` must use candidate `rc1`",
                "reverse-proxy smoke evidence filename `reverse-proxy-smoke-rc2.md` must use candidate `rc1`",
                "backup portable smoke evidence filename `backup-portable-smoke-rc2.md` must use candidate `rc1`",
            ],
        )

    def test_main_skips_outside_git_worktree(self):
        output = io.StringIO()
        with mock.patch.object(MODULE, "is_git_worktree", return_value=False), mock.patch.object(
            sys, "argv", [str(SCRIPT_PATH), "--candidate-id", "rc1"]
        ), contextlib.redirect_stdout(output):
            status = MODULE.main()

        self.assertEqual(status, 0)
        self.assertIn("skipping checklist sync outside a git worktree", output.getvalue())

    def test_main_rejects_head_without_base(self):
        with mock.patch.object(
            sys, "argv", [str(SCRIPT_PATH), "--candidate-id", "rc1", "--head", "HEAD~1"]
        ), contextlib.redirect_stderr(io.StringIO()) as stderr:
            status = MODULE.main()

        self.assertEqual(status, 2)
        self.assertIn("--head requires --base", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
