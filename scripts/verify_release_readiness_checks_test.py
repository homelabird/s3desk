import contextlib
import importlib.util
import io
import pathlib
import sys
import unittest


SCRIPT_PATH = pathlib.Path(__file__).with_name("verify_release_readiness_checks.py")
SPEC = importlib.util.spec_from_file_location("verify_release_readiness_checks", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def run(name, state, *, created, run_id):
    payload = {
        "id": run_id,
        "name": name,
        "created_at": created,
        "started_at": created,
    }
    if state in {"queued", "in_progress", "waiting", "requested"}:
        payload["status"] = state
        payload["conclusion"] = None
    else:
        payload["status"] = "completed"
        payload["conclusion"] = state
        payload["completed_at"] = created
    return payload


class VerifyReleaseReadinessChecksTests(unittest.TestCase):
    def test_latest_success_wins_over_stale_failure(self):
        payload = {
            "check_runs": [
                run("release-gate", "failure", created="2026-05-19T00:00:00Z", run_id=1),
                run("release-gate", "success", created="2026-05-19T00:10:00Z", run_id=2),
            ]
        }

        missing, failed = MODULE.evaluate_required_checks(payload, ["release-gate"])

        self.assertEqual(missing, [])
        self.assertEqual(failed, [])

    def test_latest_failure_overrides_stale_success(self):
        payload = {
            "check_runs": [
                run("license-audit", "success", created="2026-05-19T00:00:00Z", run_id=1),
                run("license-audit", "failure", created="2026-05-19T00:10:00Z", run_id=2),
            ]
        }

        missing, failed = MODULE.evaluate_required_checks(payload, ["license-audit"])

        self.assertEqual(missing, [])
        self.assertEqual(failed, ["license-audit=failure"])

    def test_latest_pending_overrides_stale_success(self):
        payload = {
            "check_runs": [
                run("Core Mock E2E", "success", created="2026-05-19T00:00:00Z", run_id=1),
                run("Core Mock E2E", "in_progress", created="2026-05-19T00:10:00Z", run_id=2),
            ]
        }

        missing, failed = MODULE.evaluate_required_checks(payload, ["Core Mock E2E"])

        self.assertEqual(missing, [])
        self.assertEqual(failed, ["Core Mock E2E=in_progress"])

    def test_missing_required_check_is_reported(self):
        missing, failed = MODULE.evaluate_required_checks({"check_runs": []}, ["release-gate"])

        self.assertEqual(missing, ["release-gate"])
        self.assertEqual(failed, [])

    def test_main_prints_non_passing_checks(self):
        stdin = io.StringIO(
            '{"check_runs":[{"name":"release-gate","status":"completed","conclusion":"failure","created_at":"2026-05-19T00:00:00Z","id":1}]}'
        )
        stderr = io.StringIO()
        old_stdin = sys.stdin
        sys.stdin = stdin
        try:
            with contextlib.redirect_stderr(stderr):
                status = MODULE.main(["--required-checks", "release-gate"])
        finally:
            sys.stdin = old_stdin

        self.assertEqual(status, 1)
        self.assertIn("Non-passing required checks: release-gate=failure", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
