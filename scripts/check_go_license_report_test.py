import importlib.util
import pathlib
import sys
import unittest


SCRIPT_PATH = pathlib.Path(__file__).with_name("check_go_license_report.py")
SPEC = importlib.util.spec_from_file_location("check_go_license_report", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


ALLOWED = {"0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MIT"}
BLOCKED_RE = r"(AGPL|GPL|LGPL|MPL-2\.0|SSPL|CDDL|EPL|CC-BY-SA|CPAL|OSL|CPL)"


class CheckGoLicenseReportTests(unittest.TestCase):
    def test_allowed_license_passes(self):
        blocked, unknown, disallowed = MODULE.evaluate_report(
            "github.com/example/pkg,https://example.test/LICENSE,MIT\n",
            ALLOWED,
            BLOCKED_RE,
            {},
        )

        self.assertEqual(blocked, [])
        self.assertEqual(unknown, [])
        self.assertEqual(disallowed, [])

    def test_unknown_is_case_insensitive(self):
        blocked, unknown, disallowed = MODULE.evaluate_report(
            "github.com/example/pkg,Unknown,Unknown\n",
            ALLOWED,
            BLOCKED_RE,
            {},
        )

        self.assertEqual(blocked, [])
        self.assertEqual(unknown, ["github.com/example/pkg :: Unknown"])
        self.assertEqual(disallowed, [])

    def test_disallowed_license_fails_allow_list(self):
        blocked, unknown, disallowed = MODULE.evaluate_report(
            "github.com/example/pkg,https://example.test/LICENSE,Artistic-2.0\n",
            ALLOWED,
            BLOCKED_RE,
            {},
        )

        self.assertEqual(blocked, [])
        self.assertEqual(unknown, [])
        self.assertEqual(disallowed, ["github.com/example/pkg :: Artistic-2.0"])

    def test_blocked_license_is_reported_before_disallowed(self):
        blocked, unknown, disallowed = MODULE.evaluate_report(
            "github.com/example/pkg,https://example.test/LICENSE,GPL-3.0\n",
            ALLOWED,
            BLOCKED_RE,
            {},
        )

        self.assertEqual(blocked, ["github.com/example/pkg :: GPL-3.0"])
        self.assertEqual(unknown, [])
        self.assertEqual(disallowed, [])

    def test_package_override_replaces_unknown_license(self):
        blocked, unknown, disallowed = MODULE.evaluate_report(
            "modernc.org/mathutil,Unknown,Unknown\n",
            ALLOWED,
            BLOCKED_RE,
            {"modernc.org/mathutil": "BSD-3-Clause"},
        )

        self.assertEqual(blocked, [])
        self.assertEqual(unknown, [])
        self.assertEqual(disallowed, [])


if __name__ == "__main__":
    unittest.main()
