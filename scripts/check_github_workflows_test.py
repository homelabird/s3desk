import contextlib
import importlib.util
import io
import pathlib
import tempfile
import unittest


SCRIPT_PATH = pathlib.Path(__file__).with_name("check_github_workflows.py")
SPEC = importlib.util.spec_from_file_location("check_github_workflows_script", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def write_workflow(path: pathlib.Path, uses: str) -> None:
    path.write_text(
        "\n".join(
            [
                "name: Test",
                '"on": push',
                "jobs:",
                "  test:",
                "    runs-on: ubuntu-latest",
                "    steps:",
                f"      - uses: {uses}",
                "",
            ]
        ),
        encoding="utf-8",
    )


class GithubWorkflowValidatorTests(unittest.TestCase):
    def test_rejects_deprecated_action_refs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "workflow.yml"
            write_workflow(path, "actions/checkout@v4")

            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
                MODULE.validate_workflow(path)

        self.assertIn("deprecated action ref", stderr.getvalue())
        self.assertIn("actions/checkout@v6", stderr.getvalue())

    def test_allows_current_action_refs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "workflow.yml"
            write_workflow(path, "actions/checkout@v6")

            MODULE.validate_workflow(path)


if __name__ == "__main__":
    unittest.main()
