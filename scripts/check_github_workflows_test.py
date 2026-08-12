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


def write_frontend_e2e_workflow(path: pathlib.Path, filters: str) -> None:
    path.write_text(
        "\n".join(
            [
                "name: Frontend E2E",
                '"on": push',
                "concurrency:",
                "  group: frontend-e2e-${{ github.ref }}",
                "  cancel-in-progress: true",
                "jobs:",
                "  changes:",
                "    runs-on: ubuntu-latest",
                "    steps:",
                "      - id: filter",
                "        uses: dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d",
                "        with:",
                "          filters: |",
                *[f"            {line}" for line in filters.splitlines()],
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
        self.assertIn("actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803", stderr.getvalue())

    def test_rejects_mutable_action_refs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "workflow.yml"
            write_workflow(path, "actions/checkout@v6")

            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
                MODULE.validate_workflow(path)

        self.assertIn("must pin an external GitHub Action", stderr.getvalue())

    def test_allows_current_action_refs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "workflow.yml"
            write_workflow(path, "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803")

            MODULE.validate_workflow(path)

    def test_rejects_frontend_e2e_browser_scope_without_backend_internal(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "frontend-e2e.yml"
            write_frontend_e2e_workflow(
                path,
                "\n".join(
                    [
                        "browser_facing:",
                        '  - "frontend/src/**"',
                        '  - "backend/internal/api/**"',
                    ]
                ),
            )

            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
                MODULE.validate_workflow(path)

        self.assertIn("backend/internal/**", stderr.getvalue())

    def test_allows_frontend_e2e_browser_scope_with_backend_internal(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "frontend-e2e.yml"
            write_frontend_e2e_workflow(
                path,
                "\n".join(
                    [
                        "browser_facing:",
                        '  - "frontend/src/**"',
                        '  - "backend/go.mod"',
                        '  - "backend/go.sum"',
                        '  - "backend/internal/**"',
                    ]
                ),
            )

            MODULE.validate_workflow(path)


if __name__ == "__main__":
    unittest.main()
