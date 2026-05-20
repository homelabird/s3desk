import contextlib
import importlib.util
import io
import pathlib
import sys
import unittest


SCRIPT_PATH = pathlib.Path(__file__).with_name("verify_github_release_metadata.py")
SPEC = importlib.util.spec_from_file_location("verify_github_release_metadata", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def release_payload(**overrides):
    payload = {
        "tag_name": "0.21v-rc3",
        "name": "0.21v-rc3",
        "draft": False,
        "prerelease": True,
        "body": "## New Features\n\n- Example\n\n## Full Changelog\n\nhttps://github.com/homelabird/s3desk/compare/0.21v-rc2...0.21v-rc3\n",
    }
    payload.update(overrides)
    return payload


class VerifyGithubReleaseMetadataTests(unittest.TestCase):
    def test_valid_release_candidate_metadata_passes(self):
        errors = MODULE.evaluate_release_metadata(release_payload(), "0.21v-rc3", "0.21v-rc2")

        self.assertEqual(errors, [])

    def test_rejects_mismatched_tag_name_and_title(self):
        errors = MODULE.evaluate_release_metadata(
            release_payload(tag_name="0.21v-rc2", name="S3Desk 0.21v-rc3"),
            "0.21v-rc3",
            "0.21v-rc2",
        )

        self.assertIn("GitHub release tag_name is 0.21v-rc2, expected '0.21v-rc3'.", errors)
        self.assertIn("GitHub release title is S3Desk 0.21v-rc3, expected '0.21v-rc3'.", errors)

    def test_rejects_missing_body_structure_and_compare_link(self):
        errors = MODULE.evaluate_release_metadata(release_payload(body="Full Changelog"), "0.21v-rc3", "0.21v-rc2")

        self.assertIn("GitHub release for tag '0.21v-rc3' is missing expected compare link /compare/0.21v-rc2...0.21v-rc3.", errors)
        self.assertIn("GitHub release for tag '0.21v-rc3' is missing Markdown release sections.", errors)

    def test_release_candidate_must_be_prerelease(self):
        errors = MODULE.evaluate_release_metadata(release_payload(prerelease=False), "0.21v-rc3", "0.21v-rc2")

        self.assertIn("GitHub release for tag '0.21v-rc3' is not marked as a prerelease.", errors)

    def test_stable_release_must_not_be_prerelease(self):
        payload = release_payload(
            tag_name="0.21v",
            name="0.21v",
            prerelease=True,
            body="## New Features\n\n- Example\n\n## Full Changelog\n\nhttps://github.com/homelabird/s3desk/compare/0.20v...0.21v\n",
        )

        errors = MODULE.evaluate_release_metadata(payload, "0.21v", "0.20v")

        self.assertIn("GitHub release for tag '0.21v' is unexpectedly marked as a prerelease.", errors)

    def test_main_prints_metadata_errors(self):
        stdin = io.StringIO('{"tag_name":"rc2","name":"rc2","draft":false,"prerelease":false,"body":""}')
        stderr = io.StringIO()
        old_stdin = sys.stdin
        sys.stdin = stdin
        try:
            with contextlib.redirect_stderr(stderr):
                status = MODULE.main(["--tag", "rc3", "--base", "rc2"])
        finally:
            sys.stdin = old_stdin

        self.assertEqual(status, 1)
        self.assertIn("GitHub release tag_name is rc2, expected 'rc3'.", stderr.getvalue())
        self.assertIn("GitHub release for tag 'rc3' has an empty body.", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
