import importlib.util
import contextlib
import io
import pathlib
import sys
import tempfile
import unittest


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
        self.assertEqual(MODULE.release_unit_for("backend/internal/api/handlers_objects.go"), "backend-api-provider-surface")
        self.assertEqual(MODULE.release_unit_for("frontend/src/lib/profileCapabilityContext.ts"), "frontend-lib")

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

    def test_stage_command_uses_file_level_pathspec_pipeline(self):
        self.assertEqual(
            MODULE.path_list_command("frontend-e2e"),
            "python3 scripts/report_release_scope.py --unit frontend-e2e --format paths --null --untracked-files all",
        )
        self.assertEqual(
            MODULE.stage_command("frontend-e2e"),
            "python3 scripts/report_release_scope.py --unit frontend-e2e --format paths --null --untracked-files all | git add --pathspec-from-file=- --pathspec-file-nul",
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
