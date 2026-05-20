import contextlib
import importlib.util
import io
import pathlib
import sys
import unittest
from unittest import mock


SCRIPT_PATH = pathlib.Path(__file__).with_name("check_release_readiness.py")
SPEC = importlib.util.spec_from_file_location("check_release_readiness_script", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def passed_check(name: str, command: list[str]) -> dict:
    return {
        "name": name,
        "command": MODULE.display_command(command),
        "passed": True,
        "returncode": 0,
        "stdout_tail": "",
        "stderr_tail": "",
    }


def failed_check(name: str, command: list[str]) -> dict:
    return {
        "name": name,
        "command": MODULE.display_command(command),
        "passed": False,
        "returncode": 1,
        "stdout_tail": "blocked output",
        "stderr_tail": "blocked error",
    }


def evidence_summary(*, ready: bool = False) -> dict:
    return {
        "ready": ready,
        "requirements": [
            {
                "name": "provider-live-validation",
                "required": True,
                "satisfied": ready,
                "missing_provider_scopes": [] if ready else ["aws", "gcs"],
                "provider_scopes": ["aws", "gcs"],
                "evidence_targets": {
                    "aws": "docs/release/evidence/provider-live-aws-rc1.md",
                    "gcs": "docs/release/evidence/provider-live-gcs-rc1.md",
                },
            },
            {
                "name": "reverse-proxy-smoke",
                "required": True,
                "satisfied": ready,
                "evidence_target": "docs/release/evidence/reverse-proxy-smoke-rc1.md",
            },
            {
                "name": "backup-portable-smoke",
                "required": True,
                "satisfied": ready,
                "evidence_target": "docs/release/evidence/backup-portable-smoke-rc1.md",
            },
        ],
        "rejected_evidence_files": [],
    }


class ReleaseReadinessPreflightTests(unittest.TestCase):
    def test_resolve_candidate_id_preserves_explicit_candidate(self):
        self.assertEqual(MODULE.resolve_candidate_id("0.21v-rc2"), "0.21v-rc2")

    def test_resolve_candidate_id_defaults_to_latest_changelog_candidate(self):
        with mock.patch.object(MODULE, "default_candidate_id", return_value="0.21v-rc3"):
            self.assertEqual(MODULE.resolve_candidate_id(""), "0.21v-rc3")

    def test_required_env_scopes_follow_unsatisfied_evidence(self):
        scopes = MODULE.required_env_scopes(evidence_summary())

        self.assertEqual(scopes, ["aws", "gcs", "reverse-proxy"])

    def test_evidence_blockers_list_missing_targets(self):
        blockers = MODULE.evidence_blockers(evidence_summary())

        self.assertIn("Missing provider live evidence: aws, gcs", blockers)
        self.assertIn("aws target: docs/release/evidence/provider-live-aws-rc1.md", blockers)
        self.assertIn("Missing reverse-proxy smoke evidence: docs/release/evidence/reverse-proxy-smoke-rc1.md", blockers)
        self.assertIn("Missing backup-portable smoke evidence: docs/release/evidence/backup-portable-smoke-rc1.md", blockers)

    def test_build_report_is_ready_when_checks_and_evidence_pass(self):
        report = MODULE.build_report(
            "rc1",
            include_release_gate=True,
            command_runner=passed_check,
            evidence_loader=lambda _candidate, _base, _head: evidence_summary(ready=True),
            candidate_checker=lambda _candidate, _head: [],
        )

        self.assertTrue(report["ready"])
        self.assertEqual(report["failed_checks"], [])
        self.assertEqual(report["evidence_blockers"], [])

    def test_build_report_blocks_on_evidence_and_env_preflight(self):
        def runner(name: str, command: list[str]) -> dict:
            if name == "live evidence env preflight":
                return failed_check(name, command)
            return passed_check(name, command)

        report = MODULE.build_report(
            "rc1",
            include_release_gate=False,
            command_runner=runner,
            evidence_loader=lambda _candidate, _base, _head: evidence_summary(),
            candidate_checker=lambda _candidate, _head: [],
        )

        self.assertFalse(report["ready"])
        self.assertEqual(report["failed_checks"], ["live evidence env preflight"])
        self.assertEqual(report["env_scopes"], ["aws", "gcs", "reverse-proxy"])

    def test_build_report_passes_base_head_to_scope_and_evidence_checks(self):
        seen: list[tuple[str, list[str]]] = []

        def runner(name: str, command: list[str]) -> dict:
            seen.append((name, command))
            return passed_check(name, command)

        def loader(candidate: str, base: str, head: str) -> dict:
            self.assertEqual(candidate, "rc1")
            self.assertEqual(base, "v1.0.0")
            self.assertEqual(head, "HEAD")
            return evidence_summary(ready=True)

        report = MODULE.build_report(
            "rc1",
            include_release_gate=False,
            base="v1.0.0",
            head="HEAD",
            command_runner=runner,
            evidence_loader=loader,
            candidate_checker=lambda _candidate, _head: [],
        )

        self.assertTrue(report["ready"])
        commands = {name: command for name, command in seen}
        self.assertEqual(
            commands["strict release scope"],
            [
                "python3",
                "scripts/report_release_scope.py",
                "--base",
                "v1.0.0",
                "--head",
                "HEAD",
                "--fail-on-root-artifacts",
                "--fail-on-dependency-scope-warning",
                "--fail-on-untracked-directories",
                "--fail-on-other-unit",
            ],
        )
        self.assertEqual(
            commands["strict release evidence"],
            [
                "python3",
                "scripts/check_release_evidence.py",
                "--base",
                "v1.0.0",
                "--head",
                "HEAD",
                "--strict",
                "--require-candidate-id",
                "--candidate-id",
                "rc1",
            ],
        )
        self.assertEqual(report["scope_source"], {"mode": "git-diff", "base": "v1.0.0", "head": "HEAD"})

    def test_print_markdown_includes_failed_check_tails(self):
        report = {
            "candidate_id": "rc1",
            "ready": False,
            "evidence_ready": False,
            "env_scopes": ["aws"],
            "checks": [failed_check("strict release evidence", ["python3", "scripts/check_release_evidence.py"])],
            "evidence_blockers": ["Missing provider live evidence: aws"],
            "candidate_blockers": [],
        }
        output = io.StringIO()

        with contextlib.redirect_stdout(output):
            MODULE.print_markdown(report)

        text = output.getvalue()
        self.assertIn("# Release Readiness Preflight", text)
        self.assertIn("| strict release evidence | `fail (1)` |", text)
        self.assertIn("Missing provider live evidence: aws", text)
        self.assertIn("blocked error", text)

    def test_candidate_identity_blockers_report_existing_tag_mismatch(self):
        with mock.patch.object(
            MODULE,
            "resolve_git_commit",
            side_effect=lambda ref: {
                "0.21v-rc3": "a" * 40,
                "HEAD": "b" * 40,
            }.get(ref, ""),
        ):
            blockers = MODULE.candidate_identity_blockers("0.21v-rc3", "HEAD")

        self.assertEqual(len(blockers), 1)
        self.assertIn("Candidate identity mismatch", blockers[0])
        self.assertIn("Use a new RC tag or validate an exact HEAD commit SHA.", blockers[0])

    def test_candidate_identity_blockers_allow_head_commit_candidate(self):
        with mock.patch.object(MODULE, "resolve_git_commit", return_value="a" * 40):
            self.assertEqual(MODULE.candidate_identity_blockers("HEAD", "HEAD"), [])

    def test_build_report_blocks_on_candidate_identity_mismatch(self):
        report = MODULE.build_report(
            "0.21v-rc3",
            include_release_gate=False,
            command_runner=passed_check,
            evidence_loader=lambda _candidate, _base, _head: evidence_summary(ready=True),
            candidate_checker=lambda _candidate, _head: ["Candidate identity mismatch"],
        )

        self.assertFalse(report["ready"])
        self.assertEqual(report["candidate_blockers"], ["Candidate identity mismatch"])

    def test_main_returns_nonzero_when_report_is_blocked(self):
        output = io.StringIO()
        with mock.patch.object(
            MODULE,
            "build_report",
            return_value={
                "candidate_id": "rc1",
                "ready": False,
                "evidence_ready": False,
                "env_scopes": [],
                "checks": [],
                "failed_checks": [],
                "evidence_blockers": ["blocked"],
            },
        ), mock.patch.object(sys, "argv", [str(SCRIPT_PATH), "--candidate-id", "rc1"]), contextlib.redirect_stdout(output):
            status = MODULE.main()

        self.assertEqual(status, 1)


if __name__ == "__main__":
    unittest.main()
