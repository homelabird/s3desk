import pathlib
import shutil
import subprocess
import tempfile
import unittest


SCRIPTS = (
    pathlib.Path(__file__).with_name("deploy_compose_release.sh"),
    pathlib.Path(__file__).with_name("deploy_helm_release.sh"),
)
BASH = shutil.which("bash")


class DeployReleaseCLITests(unittest.TestCase):
    def run_cli(self, script, *args):
        with tempfile.TemporaryDirectory() as tmp:
            return subprocess.run(
                [BASH, str(script), *args],
                env={"PATH": tmp, "HOME": tmp},
                cwd=tmp,
                text=True,
                capture_output=True,
                timeout=5,
            )

    def test_help_works_without_tools_or_release_environment(self):
        for script in SCRIPTS:
            for flag in ("--help", "-h"):
                with self.subTest(script=script.name, flag=flag):
                    result = self.run_cli(script, flag)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(result.stderr, "")
                    for text in (
                        "Usage:",
                        "CI/release automation",
                        "./scripts/compose.sh setup",
                        "./scripts/compose.sh up",
                        "DEPLOY_API_TOKEN",
                        "DEPLOY_PROFILE_ID",
                        "DEPLOY_SMOKE_BUCKET",
                        "DEPLOY_SMOKE_OBJECT_KEY",
                    ):
                        self.assertIn(text, result.stdout)

    def test_invalid_arguments_fail_before_tools_or_network(self):
        for script in SCRIPTS:
            for args in (("--unknown",), ("0.21v-rc5", "extra"), ("--help", "extra")):
                with self.subTest(script=script.name, args=args):
                    result = self.run_cli(script, *args)
                    self.assertEqual(result.returncode, 2, result.stderr)
                    self.assertEqual(result.stdout, "")
                    self.assertIn("--help", result.stderr)
                    self.assertNotIn("command not found", result.stderr)

    def test_missing_tag_explains_the_next_step(self):
        for script in SCRIPTS:
            with self.subTest(script=script.name):
                result = self.run_cli(script)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertEqual(result.stdout, "")
                self.assertIn("Missing release tag", result.stderr)
                self.assertIn("CI_COMMIT_TAG", result.stderr)
                self.assertIn("--help", result.stderr)
                self.assertNotIn("command not found", result.stderr)

    def test_ci_tag_fallback_and_positional_tag_keep_readiness_gate(self):
        for script in SCRIPTS:
            for args, expected_tag in (((), "0.21v-rc5"), (("0.21v-rc4",), "0.21v-rc4")):
                with self.subTest(script=script.name, args=args):
                    with tempfile.TemporaryDirectory() as tmp:
                        scripts = pathlib.Path(tmp) / "scripts"
                        scripts.mkdir()
                        deployed_script = scripts / script.name
                        shutil.copy2(script, deployed_script)
                        shutil.copy2(script.with_name("validate_release_tag.sh"), scripts)
                        (scripts / "verify_release_readiness.sh").write_text(
                            'printf "readiness gate: %s\\n" "$1" >&2\nexit 23\n',
                            encoding="utf-8",
                        )
                        result = subprocess.run(
                            [BASH, str(deployed_script), *args],
                            env={"PATH": "/usr/bin:/bin", "CI_COMMIT_TAG": "0.21v-rc5"},
                            cwd=tmp,
                            text=True,
                            capture_output=True,
                            timeout=5,
                        )
                        self.assertEqual(result.returncode, 23, result.stderr)
                        self.assertEqual(result.stderr, f"readiness gate: {expected_tag}\n")
                        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
