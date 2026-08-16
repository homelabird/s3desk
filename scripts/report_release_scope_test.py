import importlib.util
import contextlib
import io
import pathlib
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT_PATH = pathlib.Path(__file__).with_name("report_release_scope.py")
SPEC = importlib.util.spec_from_file_location("report_release_scope_script", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ReleaseScopeReportTests(unittest.TestCase):
    def test_release_unit_mapping_keeps_related_changes_together(self):
        self.assertEqual(MODULE.release_unit_for("backend/go.mod"), "dependency-notices")
        self.assertEqual(MODULE.release_unit_for("third_party/licenses/npm/yaml@2.8.3-LICENSE"), "dependency-notices")
        self.assertEqual(MODULE.release_unit_for("scripts/report_release_scope.py"), "release-scope-tooling")
        self.assertEqual(MODULE.release_unit_for("scripts/check_release_evidence_test.py"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for(".golangci.yml"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for("Containerfile.local"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for("Containerfile.deploy"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for("ansible/portable-migration-smoke.yml"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for("deploy/caddy/Caddyfile"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for("k8s/s3desk-caddy.yaml"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for("scripts/Caddyfile"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for("scripts/deploy_helm_release.sh"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for("scripts/install_backend_security_tools.sh"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for("e2e/runner/Dockerfile"), "release-gate-ci-deploy")
        self.assertEqual(MODULE.release_unit_for("lighthouserc.js"), "frontend-e2e")
        self.assertEqual(MODULE.release_unit_for("backend/internal/api/handlers_objects.go"), "backend-api-provider-surface")
        self.assertEqual(MODULE.release_unit_for("openapi.yml"), "frontend-api-contracts")
        self.assertEqual(MODULE.release_unit_for("frontend/src/lib/profileCapabilityContext.ts"), "frontend-lib")
        self.assertEqual(MODULE.release_unit_for("CHANGELOG.md"), "docs")
        self.assertEqual(MODULE.release_unit_for("notes/FRONTEND_DESIGN_REPORT_OBJECTS_2026-05-17.md"), "docs")

    def test_run_git_diff_parses_name_status_entries(self):
        raw = "M\0README.md\0A\0new.txt\0D\0old.txt\0R100\0old/name.txt\0new/name.txt\0"

        with mock.patch.object(MODULE.subprocess, "check_output", return_value=raw.encode("utf-8")) as check_output:
            entries = MODULE.run_git_diff(pathlib.Path("/repo"), "v1.0.0", "HEAD")

        check_output.assert_called_once_with(
            ["git", "diff", "--name-status", "-z", "--find-renames", "v1.0.0", "HEAD"],
            cwd=pathlib.Path("/repo"),
        )
        self.assertEqual(
            [(entry.code, entry.path) for entry in entries],
            [
                (" M", "README.md"),
                (" A", "new.txt"),
                (" D", "old.txt"),
                (" R", "old/name.txt"),
                (" R", "new/name.txt"),
            ],
        )

    def test_summarize_counts_dependency_unit_and_release_units(self):
        entries = [
            MODULE.StatusEntry(" M", "backend/go.mod"),
            MODULE.StatusEntry(" M", "backend/go.sum"),
            MODULE.StatusEntry(" M", "frontend/package.json"),
            MODULE.StatusEntry(" M", "frontend/package-lock.json"),
            MODULE.StatusEntry(" M", "THIRD_PARTY_NOTICES.md"),
            MODULE.StatusEntry(" D", "third_party/licenses/npm/yaml@2.4.2-LICENSE"),
            MODULE.StatusEntry("??", "third_party/licenses/npm/yaml@2.8.3-LICENSE"),
            MODULE.StatusEntry(" M", "frontend/src/lib/profileCapabilityContext.ts"),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            summary = MODULE.summarize(entries, pathlib.Path(tmp))

        self.assertEqual(
            summary["counts"],
            {
                "tracked_changes_including_deleted": 7,
                "deleted": 1,
                "untracked": 1,
                "total_status_entries": 8,
            },
        )
        self.assertTrue(summary["dependency_notice_unit_complete"])
        self.assertEqual(summary["dependency_scope_warnings"], [])
        dependency_unit = MODULE.find_release_unit(summary, "dependency-notices")
        self.assertIsNotNone(dependency_unit)
        self.assertEqual(dependency_unit["count"], 7)
        self.assertEqual(dependency_unit["deleted"], 1)

    def test_dependency_scope_warnings_flag_split_metadata_and_licenses(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            metadata_only = MODULE.summarize(
                [MODULE.StatusEntry(" M", "backend/go.mod")],
                root,
            )
            license_only = MODULE.summarize(
                [MODULE.StatusEntry("??", "third_party/licenses/npm/yaml@2.8.3-LICENSE")],
                root,
            )

        self.assertFalse(metadata_only["dependency_notice_unit_complete"])
        self.assertIn("Dependency metadata changed without a license snapshot change.", metadata_only["dependency_scope_warnings"])
        self.assertFalse(license_only["dependency_notice_unit_complete"])
        self.assertIn("License snapshots changed without dependency metadata in the same status set.", license_only["dependency_scope_warnings"])

    def test_empty_dependency_scope_does_not_report_missing_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            summary = MODULE.summarize(
                [MODULE.StatusEntry(" M", "README.md")],
                pathlib.Path(tmp),
            )

        self.assertEqual(summary["dependency_scope"], [])
        self.assertTrue(summary["dependency_notice_unit_complete"])
        self.assertEqual(summary["dependency_notice_unit_missing_metadata"], [])

    def test_toolchain_only_go_mod_change_does_not_require_license_snapshot(self):
        diff = "\n".join(
            [
                "diff --git a/backend/go.mod b/backend/go.mod",
                "@@ -3 +3 @@",
                "-toolchain go1.25.9",
                "+toolchain go1.25.10",
            ]
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            with mock.patch.object(MODULE.subprocess, "check_output", return_value=diff.encode("utf-8")):
                summary = MODULE.summarize(
                    [MODULE.StatusEntry(" M", "backend/go.mod")],
                    root,
                    source={"mode": "git-diff", "base": "v1.0.0", "head": "HEAD"},
                )

        self.assertEqual(summary["dependency_scope"], [])
        self.assertTrue(summary["dependency_notice_unit_complete"])
        self.assertEqual(summary["dependency_scope_warnings"], [])

    def test_notice_timestamp_only_change_does_not_require_dependency_metadata(self):
        diff = "\n".join(
            [
                "diff --git a/THIRD_PARTY_NOTICES.md b/THIRD_PARTY_NOTICES.md",
                "@@ -4 +4 @@",
                "-Generated at 2026-04-19 13:34:58Z.",
                "+Generated at 2026-05-02 06:08:18Z.",
            ]
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            with mock.patch.object(MODULE.subprocess, "check_output", return_value=diff.encode("utf-8")):
                summary = MODULE.summarize(
                    [MODULE.StatusEntry(" M", "THIRD_PARTY_NOTICES.md")],
                    root,
                    source={"mode": "git-diff", "base": "v1.0.0", "head": "HEAD"},
                )

        self.assertEqual(summary["dependency_scope"], [])
        self.assertTrue(summary["dependency_notice_unit_complete"])
        self.assertEqual(summary["dependency_scope_warnings"], [])

    def test_toolchain_and_notice_timestamp_only_changes_do_not_false_block_scope(self):
        diffs = {
            ("git", "diff", "--unified=0", "--", "backend/go.mod"): "\n".join(
                [
                    "diff --git a/backend/go.mod b/backend/go.mod",
                    "@@ -5 +5 @@",
                    "-toolchain go1.25.9",
                    "+toolchain go1.25.10",
                ]
            ),
            ("git", "diff", "--cached", "--unified=0", "--", "backend/go.mod"): "",
            ("git", "diff", "--unified=0", "--", "THIRD_PARTY_NOTICES.md"): "\n".join(
                [
                    "diff --git a/THIRD_PARTY_NOTICES.md b/THIRD_PARTY_NOTICES.md",
                    "@@ -4 +4 @@",
                    "-Generated at 2026-04-19 13:34:58Z.",
                    "+Generated at 2026-05-02 06:08:18Z.",
                ]
            ),
            ("git", "diff", "--cached", "--unified=0", "--", "THIRD_PARTY_NOTICES.md"): "",
        }

        def fake_check_output(command, cwd=None, stderr=None):
            return diffs[tuple(command)].encode("utf-8")

        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            with mock.patch.object(MODULE.subprocess, "check_output", side_effect=fake_check_output):
                summary = MODULE.summarize(
                    [
                        MODULE.StatusEntry(" M", "backend/go.mod"),
                        MODULE.StatusEntry(" M", "THIRD_PARTY_NOTICES.md"),
                    ],
                    root,
                )

        self.assertEqual(summary["dependency_scope"], [])
        self.assertTrue(summary["dependency_notice_unit_complete"])
        self.assertEqual(summary["dependency_scope_warnings"], [])

    def test_root_artifact_candidates_are_root_untracked_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "objects-page.png").write_bytes(b"png")
            (root / "process").write_bytes(b"")
            (root / "docs").mkdir()
            (root / "docs" / "evidence.md").write_text("release evidence", encoding="utf-8")
            summary = MODULE.summarize(
                [
                    MODULE.StatusEntry("??", "objects-page.png"),
                    MODULE.StatusEntry("??", "process"),
                    MODULE.StatusEntry("??", "docs/evidence.md"),
                    MODULE.StatusEntry(" M", "README.md"),
                ],
                root,
            )

        artifacts = {item["path"]: item["size_human"] for item in summary["root_artifact_candidates"]}
        self.assertEqual(artifacts, {"objects-page.png": "3 B", "process": "0 B"})

    def test_root_artifact_candidates_include_added_root_files_from_diff(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "debug.png").write_bytes(b"png")
            (root / "README.md").write_text("docs", encoding="utf-8")
            summary = MODULE.summarize(
                [
                    MODULE.StatusEntry(" A", "debug.png"),
                    MODULE.StatusEntry(" M", "README.md"),
                ],
                root,
            )

        artifacts = {item["path"]: item["size_human"] for item in summary["root_artifact_candidates"]}
        self.assertEqual(artifacts, {"debug.png": "3 B"})

    def test_collect_failures_combines_enabled_strict_checks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "debug.md").write_text("debug", encoding="utf-8")
            summary = MODULE.summarize(
                [
                    MODULE.StatusEntry("??", "debug.md"),
                    MODULE.StatusEntry(" M", "backend/go.mod"),
                ],
                root,
            )

        failures = MODULE.collect_failures(
            summary,
            fail_on_root_artifacts=True,
            fail_on_dependency_scope_warning=True,
        )

        self.assertGreaterEqual(len(failures), 2)
        self.assertIn("1 root artifact candidate(s) are still untracked.", failures)
        self.assertIn("Dependency metadata changed without a license snapshot change.", failures)

    def test_checklist_output_includes_unit_review_commands(self):
        entries = [
            MODULE.StatusEntry(" M", "backend/go.mod"),
            MODULE.StatusEntry(" M", "backend/go.sum"),
            MODULE.StatusEntry(" M", "frontend/package.json"),
            MODULE.StatusEntry(" M", "frontend/package-lock.json"),
            MODULE.StatusEntry(" M", "THIRD_PARTY_NOTICES.md"),
            MODULE.StatusEntry("??", "third_party/licenses/npm/yaml@2.8.3-LICENSE"),
            MODULE.StatusEntry("??", "scripts/report_release_scope.py"),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            summary = MODULE.summarize(entries, pathlib.Path(tmp))

        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            MODULE.print_checklist(summary)
        checklist = output.getvalue()

        self.assertIn("# Release Scope Staging Checklist", checklist)
        self.assertIn("- [ ] `dependency-notices`: `6` paths", checklist)
        self.assertIn("python3 scripts/report_release_scope.py --unit dependency-notices", checklist)
        self.assertIn(
            "python3 scripts/report_release_scope.py --unit dependency-notices --format paths --null --untracked-files all",
            checklist,
        )
        self.assertIn(
            "python3 scripts/report_release_scope.py --unit dependency-notices --format paths --null --untracked-files all | git add --pathspec-from-file=- --pathspec-file-nul",
            checklist,
        )

    def test_diff_scope_checklist_commands_preserve_base_and_head(self):
        scope_args = ["--base", "v1.0.0", "--head", "HEAD"]
        entries = [
            MODULE.StatusEntry(" M", "frontend/src/pages/objects/useObjectsPageData.ts"),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            summary = MODULE.summarize(
                entries,
                pathlib.Path(tmp),
                source={"mode": "git-diff", "base": "v1.0.0", "head": "HEAD"},
                command_scope_args=scope_args,
            )

        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            MODULE.print_checklist(summary)
        checklist = output.getvalue()

        self.assertIn(
            "python3 scripts/report_release_scope.py --base v1.0.0 --head HEAD --unit frontend-objects",
            checklist,
        )
        self.assertIn(
            "python3 scripts/report_release_scope.py --base v1.0.0 --head HEAD --unit frontend-objects --format paths --null | git add --pathspec-from-file=- --pathspec-file-nul",
            checklist,
        )

    def test_stage_command_uses_file_level_pathspec_pipeline(self):
        self.assertEqual(
            MODULE.path_list_command("frontend-e2e"),
            "python3 scripts/report_release_scope.py --unit frontend-e2e --format paths --null --untracked-files all",
        )
        self.assertEqual(
            MODULE.stage_command("frontend-e2e"),
            "python3 scripts/report_release_scope.py --unit frontend-e2e --format paths --null --untracked-files all | git add --pathspec-from-file=- --pathspec-file-nul",
        )

    def test_diff_scope_commands_preserve_base_and_head(self):
        scope_args = ["--base", "v1.0.0", "--head", "HEAD"]
        entries = [
            MODULE.StatusEntry(" M", "frontend/src/pages/objects/useObjectsPageData.ts"),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            summary = MODULE.summarize(
                entries,
                pathlib.Path(tmp),
                source={"mode": "git-diff", "base": "v1.0.0", "head": "HEAD"},
                command_scope_args=scope_args,
            )

        unit = MODULE.find_release_unit(summary, "frontend-objects")
        self.assertIsNotNone(unit)
        self.assertEqual(
            unit["path_list_command"],
            "python3 scripts/report_release_scope.py --base v1.0.0 --head HEAD --unit frontend-objects --format paths --null",
        )
        self.assertEqual(
            unit["stage_command"],
            "python3 scripts/report_release_scope.py --base v1.0.0 --head HEAD --unit frontend-objects --format paths --null | git add --pathspec-from-file=- --pathspec-file-nul",
        )

    def test_release_unit_json_includes_review_commands(self):
        entries = [
            MODULE.StatusEntry(" M", "frontend/src/pages/objects/useObjectsPageData.ts"),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            summary = MODULE.summarize(entries, pathlib.Path(tmp))

        unit = MODULE.find_release_unit(summary, "frontend-objects")
        self.assertIsNotNone(unit)
        self.assertEqual(
            unit["path_list_command"],
            "python3 scripts/report_release_scope.py --unit frontend-objects --format paths --null --untracked-files all",
        )
        self.assertEqual(
            unit["stage_command"],
            "python3 scripts/report_release_scope.py --unit frontend-objects --format paths --null --untracked-files all | git add --pathspec-from-file=- --pathspec-file-nul",
        )

    def test_manifest_output_includes_full_unit_paths(self):
        entries = [
            MODULE.StatusEntry(" M", "frontend/src/pages/objects/useObjectsPageData.ts"),
            MODULE.StatusEntry("??", "frontend/tests/objects-visual-regression.spec.ts-snapshots/example.png"),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            summary = MODULE.summarize(entries, pathlib.Path(tmp))

        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            MODULE.print_manifest(summary)
        manifest = output.getvalue()

        self.assertIn("# Release Scope Review Manifest", manifest)
        self.assertIn("### frontend-objects", manifest)
        self.assertIn("- [ ] ` M` `frontend/src/pages/objects/useObjectsPageData.ts`", manifest)
        self.assertIn("### frontend-e2e", manifest)
        self.assertIn(
            "- [ ] `??` `frontend/tests/objects-visual-regression.spec.ts-snapshots/example.png`",
            manifest,
        )

    def test_untracked_directory_entries_prompt_file_level_manifest(self):
        entries = [
            MODULE.StatusEntry("??", "frontend/tests/workflows-visual-regression.spec.ts-snapshots/"),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            summary = MODULE.summarize(entries, pathlib.Path(tmp))

        unit = MODULE.find_release_unit(summary, "frontend-e2e")
        self.assertIsNotNone(unit)
        self.assertEqual(unit["untracked_directories"], 1)
        self.assertEqual(
            unit["untracked_directory_paths"],
            ["frontend/tests/workflows-visual-regression.spec.ts-snapshots/"],
        )

        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            MODULE.print_manifest({"counts": summary["counts"], "release_units": [unit]})
        manifest = output.getvalue()

        self.assertIn("- Untracked directory entries: `1`", manifest)
        self.assertIn(
            "python3 scripts/report_release_scope.py --unit frontend-e2e --format manifest --untracked-files all",
            manifest,
        )
        self.assertIn(
            "python3 scripts/report_release_scope.py --unit frontend-e2e --format paths --null --untracked-files all | git add --pathspec-from-file=- --pathspec-file-nul",
            manifest,
        )

    def test_strict_failure_can_require_file_level_untracked_directory_review(self):
        entries = [
            MODULE.StatusEntry("??", "frontend/tests/workflows-visual-regression.spec.ts-snapshots/"),
            MODULE.StatusEntry("??", "docs/release/evidence/"),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            summary = MODULE.summarize(entries, pathlib.Path(tmp))

        failures = MODULE.collect_failures(
            summary,
            fail_on_root_artifacts=False,
            fail_on_dependency_scope_warning=False,
            fail_on_untracked_directories=True,
        )

        self.assertEqual(len(failures), 1)
        self.assertIn("Untracked directory entries need file-level review", failures[0])
        self.assertIn("frontend-e2e (1)", failures[0])
        self.assertIn("docs (1)", failures[0])

    def test_strict_failure_can_require_categorized_release_units(self):
        with tempfile.TemporaryDirectory() as tmp:
            summary = MODULE.summarize(
                [MODULE.StatusEntry("??", "stray.config")],
                pathlib.Path(tmp),
            )

        failures = MODULE.collect_failures(
            summary,
            fail_on_root_artifacts=False,
            fail_on_dependency_scope_warning=False,
            fail_on_other_unit=True,
        )

        self.assertEqual(len(failures), 1)
        self.assertIn("uncategorized release scope path(s) remain in `other`", failures[0])
        self.assertIn("stray.config", failures[0])


if __name__ == "__main__":
    unittest.main()
