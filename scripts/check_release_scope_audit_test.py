import contextlib
import importlib.util
import io
import pathlib
import sys
import unittest
from unittest import mock


SCRIPT_PATH = pathlib.Path(__file__).with_name("check_release_scope_audit.py")
SPEC = importlib.util.spec_from_file_location("check_release_scope_audit_script", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def sample_summary() -> dict:
    return {
        "counts": {
            "tracked_changes_including_deleted": 2,
            "deleted": 1,
            "untracked": 3,
            "total_status_entries": 5,
        },
        "untracked_by_group": {"(root)": 1, "frontend": 2},
        "release_units": [
            {
                "unit": "dependency-notices",
                "count": 2,
                "tracked": 2,
                "untracked": 0,
                "deleted": 1,
                "guidance": "Keep dependency metadata, generated notices, and license snapshots together.",
            },
            {
                "unit": "frontend-objects",
                "count": 3,
                "tracked": 0,
                "untracked": 3,
                "deleted": 0,
                "guidance": "Review Objects page source, hooks, and tests together.",
            },
        ],
    }


def sample_audit() -> str:
    return """# Release Scope Audit - 2026-04-30

## Summary

- Status snapshot: strict file-level scope 기준 `tracked changes=2` including `deleted=1`, `untracked=3`, `total status entries=5`.

## 2026-05-02 Live Evidence Recheck

- Status snapshot after adding the 2026-05-02 checklist sync gate tests: strict file-level scope 기준 `tracked changes=2` including `deleted=1`, `untracked=3`, `total status entries=5`.

## Source/Test/Docs Candidate Sets

| Group | Untracked Count | Release Scope Guidance |
|---|---:|---|
| `frontend/` | 2 | Review as source, tests, scripts, and screenshot baselines. |
| `(root)` | 1 | Include with release gate/tooling if intentional. |

## Release Unit Candidate Summary

| Unit | Paths | Tracked | Untracked | Deleted | Guidance |
|---|---:|---:|---:|---:|---|
| `dependency-notices` | 2 | 2 | 0 | 1 | Keep dependency metadata, generated notices, and license snapshots together. |
| `frontend-objects` | 3 | 0 | 3 | 0 | Review Objects page source, hooks, and tests together. |
"""


class ReleaseScopeAuditSyncTests(unittest.TestCase):
    def test_audit_text_matches_scope_summary(self):
        self.assertEqual(MODULE.check_audit_text(sample_audit(), sample_summary()), [])

    def test_detects_status_count_drift(self):
        audit = sample_audit().replace("`untracked=3`", "`untracked=4`", 1)

        errors = MODULE.check_audit_text(audit, sample_summary())

        self.assertTrue(any("Summary status counts" in error for error in errors))

    def test_detects_group_count_drift(self):
        audit = sample_audit().replace("| `frontend/` | 2 |", "| `frontend/` | 1 |")

        errors = MODULE.check_audit_text(audit, sample_summary())

        self.assertIn("untracked group table entry frontend is 1 but expected 2", errors)

    def test_detects_release_unit_drift(self):
        audit = sample_audit().replace(
            "| `frontend-objects` | 3 | 0 | 3 | 0 |",
            "| `frontend-objects` | 2 | 0 | 2 | 0 |",
        )

        errors = MODULE.check_audit_text(audit, sample_summary())

        self.assertTrue(any("release unit table entry frontend-objects" in error for error in errors))

    def test_main_skips_outside_git_worktree(self):
        output = io.StringIO()
        with mock.patch.object(MODULE, "is_git_worktree", return_value=False), mock.patch.object(
            sys, "argv", [str(SCRIPT_PATH)]
        ), contextlib.redirect_stdout(output):
            status = MODULE.main()

        self.assertEqual(status, 0)
        self.assertIn("skipping audit sync outside a git worktree", output.getvalue())

    def test_main_skips_clean_worktree(self):
        output = io.StringIO()
        summary = sample_summary()
        summary["counts"]["total_status_entries"] = 0
        with mock.patch.object(MODULE, "is_git_worktree", return_value=True), mock.patch.object(
            MODULE, "load_scope_summary", return_value=summary
        ), mock.patch.object(pathlib.Path, "is_file", return_value=True), mock.patch.object(
            sys, "argv", [str(SCRIPT_PATH), "--audit", "docs/audit.md"]
        ), contextlib.redirect_stdout(output):
            status = MODULE.main()

        self.assertEqual(status, 0)
        self.assertIn("skipping audit sync for a clean worktree", output.getvalue())


if __name__ == "__main__":
    unittest.main()
