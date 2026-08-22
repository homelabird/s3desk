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
    def test_license_audit_scopes_expensive_steps_without_hiding_required_check(self):
        workflow = MODULE.load_workflow(MODULE.WORKFLOWS_DIR / "license-audit.yml")
        job = workflow["jobs"]["license-audit"]
        steps = {step["name"]: step for step in job["steps"] if "name" in step}
        scope = MODULE.yaml.load(
            steps["Detect runtime license change scope"]["with"]["filters"],
            Loader=MODULE.WorkflowLoader,
        )["runtime_license"]

        self.assertIn("backend/**/*.go", scope)
        self.assertIn("backend/go.sum", scope)
        self.assertIn("frontend/package-lock.json", scope)
        self.assertIn("Containerfile*", scope)
        self.assertIn("third_party/**", scope)
        expensive_condition = (
            "github.event_name == 'workflow_dispatch' || "
            "steps.scope.outputs.runtime_license == 'true'"
        )
        for name in ("Setup Node.js", "Setup Go", "Run license audit (runtime-only)"):
            self.assertEqual(expensive_condition, steps[name]["if"])
        self.assertNotIn("if", job)

    def test_frontend_e2e_keeps_fast_paths_parallel(self):
        workflow = MODULE.load_workflow(MODULE.WORKFLOWS_DIR / "frontend-e2e.yml")
        jobs = workflow["jobs"]

        self.assertNotIn("mock-e2e-smoke", jobs["mock-e2e-shard"]["needs"])
        self.assertIn("mock-e2e-smoke", jobs["mock-e2e"]["needs"])
        self.assertEqual(
            [
                {"shard": "1/3", "artifact_suffix": "shard-1"},
                {"shard": "2/3", "artifact_suffix": "shard-2"},
                {"shard": "3/3", "artifact_suffix": "shard-3"},
            ],
            jobs["mock-e2e-shard"]["strategy"]["matrix"]["include"],
        )
        for job_name in ("mock-e2e-smoke", "visual-regression-e2e"):
            setup_node = next(
                step
                for step in jobs[job_name]["steps"]
                if step.get("name") == "Setup Node.js"
            )
            self.assertEqual(
                "needs.changes.outputs.browser_facing == 'true'",
                setup_node.get("if"),
            )
        self.assertEqual(
            [
                {"project": "mobile-iphone-13", "artifact_suffix": "iphone-13"},
                {"project": "mobile-pixel-7", "artifact_suffix": "pixel-7"},
            ],
            jobs["mobile-responsive-e2e-project"]["strategy"]["matrix"]["include"],
        )
        self.assertIn(
            "mobile-responsive-e2e-project",
            jobs["mobile-responsive-e2e"]["needs"],
        )
        self.assertEqual(
            "Mobile Responsive E2E (Required)",
            jobs["mobile-responsive-e2e"]["name"],
        )
        lint_steps = {
            step["name"]: step
            for step in jobs["workflow-lint"]["steps"]
            if "name" in step
        }
        for name in (
            "Checkout",
            "Setup Go",
            "Install repo-local actionlint",
            "Install workflow validator Python dependency",
            "Run workflow lint",
        ):
            self.assertEqual(
                "needs.changes.outputs.workflow_lint_scope == 'true'",
                lint_steps[name].get("if"),
            )
        self.assertEqual(
            "backend/go.sum\nscripts/install_actionlint.sh\n",
            lint_steps["Setup Go"]["with"]["cache-dependency-path"],
        )
        self.assertNotIn(".tools/go/bin", str(jobs["workflow-lint"]["steps"]))
        browser_installs = [
            step["run"]
            for job in jobs.values()
            for step in job.get("steps", [])
            if "playwright install" in step.get("run", "")
        ]
        self.assertEqual(
            ["npx playwright install --with-deps --only-shell chromium"] * 5,
            browser_installs,
        )
        live_steps = {
            step["name"]: step
            for step in jobs["live-e2e-critical"]["steps"]
            if "name" in step
        }
        self.assertEqual(
            "docker/setup-buildx-action@37fe631027851001ddb9b187196cc803df7f5f0e",
            live_steps["Setup Docker Buildx"]["uses"],
        )
        self.assertEqual(
            "docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a",
            live_steps["Build local S3Desk image"]["uses"],
        )
        self.assertEqual("true", live_steps["Build local S3Desk image"]["with"]["load"])
        self.assertEqual(
            "type=gha,mode=max,scope=live-e2e",
            live_steps["Build local S3Desk image"]["with"]["cache-to"],
        )

    def test_release_gate_reuses_prepared_ci_inputs(self):
        workflow = MODULE.load_workflow(MODULE.WORKFLOWS_DIR / "release-gate.yml")
        steps = {
            step["name"]: step
            for step in workflow["jobs"]["release-gate"]["steps"]
            if "name" in step
        }
        run_gate = next(
            step
            for step in workflow["jobs"]["release-gate"]["steps"]
            if step.get("name") == "Run repository CI gate"
        )

        self.assertEqual("1", run_gate["env"]["CHECK_FRONTEND_DEPS_READY"])
        self.assertEqual("${{ github.event_name != 'workflow_dispatch' && '1' || '0' }}", run_gate["env"]["CHECK_WORKFLOW_LINT_DELEGATED"])
        self.assertEqual("./scripts/check.sh ci", run_gate["run"])
        self.assertEqual(
            "github.event_name == 'workflow_dispatch'",
            steps["Install repo-local actionlint"]["if"],
        )
        self.assertNotIn(
            "Install Playwright Chromium for release-gate browser smoke",
            steps,
        )
        self.assertNotIn("test:e2e:smoke", str(steps))
        self.assertEqual(
            "backend/go.sum\nscripts/install_actionlint.sh\nscripts/install_backend_security_tools.sh\n",
            steps["Setup Go"]["with"]["cache-dependency-path"],
        )
        self.assertNotIn(".tools/go/bin", str(steps))

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

    def test_rejects_frontend_e2e_browser_scope_with_backend_paths(self):
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

        self.assertIn("must not include backend paths", stderr.getvalue())

    def test_allows_frontend_only_browser_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "frontend-e2e.yml"
            write_frontend_e2e_workflow(
                path,
                "\n".join(
                    [
                        "browser_facing:",
                        '  - "frontend/src/**"',
                        '  - "frontend/tests/**"',
                        '  - "openapi.yml"',
                    ]
                ),
            )

            MODULE.validate_workflow(path)


if __name__ == "__main__":
    unittest.main()
