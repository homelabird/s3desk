import importlib.util
import contextlib
import io
import json
import os
import pathlib
import sys
import unittest
from unittest import mock


SCRIPT_PATH = pathlib.Path(__file__).with_name("check_live_evidence_env.py")
SPEC = importlib.util.spec_from_file_location("check_live_evidence_env_script", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class LiveEvidenceEnvironmentPreflightTests(unittest.TestCase):
    def test_defaults_to_reverse_proxy_scope(self):
        scopes = MODULE.expand_scopes([])
        self.assertEqual([scope.name for scope in scopes], ["reverse-proxy"])

    def test_all_scope_expands_once_in_declared_order(self):
        scopes = MODULE.expand_scopes(["aws", "all", "aws"])
        self.assertEqual([scope.name for scope in scopes], list(MODULE.SCOPES))

    def test_reverse_proxy_allows_base_or_healthcheck_url(self):
        env = {
            "DEPLOY_HEALTHCHECK_URL": "https://example.invalid/healthz",
            "DEPLOY_API_TOKEN": "secret-token",
            "DEPLOY_PROFILE_ID": "profile-1",
            "DEPLOY_SMOKE_BUCKET": "bucket-a",
            "DEPLOY_SMOKE_OBJECT_KEY": "path/object.txt",
            "DEPLOY_SMOKE_EVIDENCE_FILE": "docs/release/evidence/reverse-proxy.md",
            "DEPLOY_RELEASE_CANDIDATE": "v1.2.3-rc1",
        }

        with mock.patch.dict(os.environ, env, clear=True):
            result = MODULE.scope_result(MODULE.SCOPES["reverse-proxy"])

        self.assertTrue(result["ready"])
        self.assertEqual(result["required"][0]["label"], "DEPLOY_BASE_URL or DEPLOY_HEALTHCHECK_URL")
        self.assertTrue(result["required"][0]["satisfied"])
        self.assertIn(
            {"name": "DEPLOY_SMOKE_EVIDENCE_FILE", "status": "set"},
            result["optional"],
        )
        self.assertIn(
            {"name": "DEPLOY_RELEASE_CANDIDATE", "status": "set"},
            result["optional"],
        )

    def test_reports_missing_required_variables_without_secret_values(self):
        env = {
            "S3DESK_LIVE_AWS_BUCKET": "bucket-a",
            "S3DESK_LIVE_AWS_ACCESS_KEY_ID": "AKIAEXAMPLE",
            "S3DESK_LIVE_AWS_SECRET_ACCESS_KEY": "super-secret-value",
        }

        with mock.patch.dict(os.environ, env, clear=True):
            result = MODULE.scope_result(MODULE.SCOPES["aws"])

        self.assertFalse(result["ready"])
        variables = {
            variable["name"]: variable["status"]
            for requirement in result["required"]
            for variable in requirement["variables"]
        }
        self.assertEqual(variables["S3DESK_LIVE_AWS_REGION"], "missing")
        self.assertEqual(variables["S3DESK_LIVE_AWS_SECRET_ACCESS_KEY"], "set")
        self.assertNotIn("super-secret-value", json.dumps(result))
        self.assertNotIn("AKIAEXAMPLE", json.dumps(result))

    def test_requirement_statuses_only_expose_set_or_missing(self):
        requirement = MODULE.Requirement(("ONE", "TWO"), any_of=True)
        with mock.patch.dict(os.environ, {"TWO": "actual-secret"}, clear=True):
            self.assertTrue(requirement.is_satisfied())
            self.assertEqual(
                requirement.statuses(),
                [
                    {"name": "ONE", "status": "missing"},
                    {"name": "TWO", "status": "set"},
                ],
            )

    def test_blank_and_placeholder_values_are_missing(self):
        requirement = MODULE.Requirement(("ONE", "TWO", "THREE", "FOUR", "FIVE"))
        with mock.patch.dict(
            os.environ,
            {
                "ONE": "   ",
                "TWO": "...",
                "THREE": "<secret>",
                "FOUR": "${DEPLOY_API_TOKEN}",
                "FIVE": "replace-me",
            },
            clear=True,
        ):
            self.assertFalse(requirement.is_satisfied())
            self.assertEqual(
                requirement.statuses(),
                [
                    {"name": "ONE", "status": "missing"},
                    {"name": "TWO", "status": "missing"},
                    {"name": "THREE", "status": "missing"},
                    {"name": "FOUR", "status": "missing"},
                    {"name": "FIVE", "status": "missing"},
                ],
            )

    def test_env_template_outputs_blank_exports_without_reading_secret_values(self):
        output = io.StringIO()
        with mock.patch.dict(
            os.environ,
            {
                "DEPLOY_API_TOKEN": "actual-secret-token",
                "DEPLOY_BASE_URL": "https://example.invalid",
            },
            clear=True,
        ), contextlib.redirect_stdout(output):
            MODULE.print_env_template([MODULE.SCOPES["reverse-proxy"]])

        template = output.getvalue()
        self.assertIn("# Live Evidence Environment Template", template)
        self.assertIn("# Required: set at least one of DEPLOY_BASE_URL or DEPLOY_HEALTHCHECK_URL", template)
        self.assertIn("export DEPLOY_BASE_URL=", template)
        self.assertIn("export DEPLOY_API_TOKEN=", template)
        self.assertIn("export DEPLOY_SMOKE_EVIDENCE_FILE=", template)
        self.assertIn("export DEPLOY_RELEASE_CANDIDATE=", template)
        self.assertNotIn("actual-secret-token", template)
        self.assertNotIn("https://example.invalid", template)


if __name__ == "__main__":
    unittest.main()
