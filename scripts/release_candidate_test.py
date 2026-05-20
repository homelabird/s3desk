import importlib.util
import pathlib
import sys
import tempfile
import unittest


SCRIPT_PATH = pathlib.Path(__file__).with_name("release_candidate.py")
SPEC = importlib.util.spec_from_file_location("release_candidate_script", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ReleaseCandidateTests(unittest.TestCase):
    def test_latest_versioned_changelog_candidate_skips_unreleased(self):
        changelog = "\n".join(
            [
                "# Changelog",
                "",
                "## Unreleased",
                "",
                "## `0.21v-rc3` - 2026-03-24",
                "",
                "## `0.21v-rc2` - 2026-03-12",
            ]
        )

        self.assertEqual(MODULE.latest_versioned_changelog_candidate(changelog), "0.21v-rc3")

    def test_latest_versioned_changelog_candidate_accepts_unbackticked_heading(self):
        changelog = "\n".join(["# Changelog", "", "## Unreleased", "", "## 1.2.3 - 2026-05-18"])

        self.assertEqual(MODULE.latest_versioned_changelog_candidate(changelog), "1.2.3")

    def test_latest_versioned_changelog_candidate_requires_versioned_section(self):
        with self.assertRaises(ValueError):
            MODULE.latest_versioned_changelog_candidate("# Changelog\n\n## Unreleased\n")

    def test_default_candidate_id_reads_changelog_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            changelog = pathlib.Path(tmp) / "CHANGELOG.md"
            changelog.write_text("# Changelog\n\n## `v2.0.0-rc1` - 2026-05-18\n", encoding="utf-8")

            self.assertEqual(MODULE.default_candidate_id(changelog), "v2.0.0-rc1")


if __name__ == "__main__":
    unittest.main()
