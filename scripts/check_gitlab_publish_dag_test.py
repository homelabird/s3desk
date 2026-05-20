import importlib.util
import pathlib
import sys
import unittest


SCRIPT_PATH = pathlib.Path(__file__).with_name("check_gitlab_publish_dag.py")
SPEC = importlib.util.spec_from_file_location("check_gitlab_publish_dag", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


VALID_GITLAB_CI = """\
stages:
  - release-validate
  - build
  - smoke
  - test
  - audit
  - publish
  - post-publish
  - chart-publish
  - deploy

publish_dockerhub:
  stage: publish
  script:
    - echo publish

release_image_smoke:
  stage: post-publish
  needs:
    - publish_dockerhub
  script:
    - echo smoke

publish_helm_chart:
  stage: chart-publish
  needs:
    - publish_dockerhub
    - release_image_smoke
  script:
    - echo chart

deploy_release_helm:
  stage: deploy
  needs:
    - publish_helm_chart
    - release_image_smoke
  script:
    - echo deploy
"""


class CheckGitlabPublishDagTests(unittest.TestCase):
    def test_valid_publish_dag_passes(self):
        self.assertEqual(MODULE.validate_publish_dag(VALID_GITLAB_CI), [])

    def test_helm_chart_publish_cannot_share_publish_stage(self):
        text = VALID_GITLAB_CI.replace("  stage: chart-publish", "  stage: publish", 1)

        errors = MODULE.validate_publish_dag(text)

        self.assertIn("expected publish_helm_chart stage 'chart-publish', got 'publish'", errors)

    def test_helm_chart_publish_requires_published_image_smoke(self):
        text = VALID_GITLAB_CI.replace("    - release_image_smoke\n  script:\n    - echo chart", "  script:\n    - echo chart")

        errors = MODULE.validate_publish_dag(text)

        self.assertIn("expected publish_helm_chart needs to include: release_image_smoke", errors)

    def test_chart_publish_stage_must_follow_post_publish(self):
        text = VALID_GITLAB_CI.replace(
            "  - post-publish\n  - chart-publish\n",
            "  - chart-publish\n  - post-publish\n",
        )

        errors = MODULE.validate_publish_dag(text)

        self.assertIn("expected GitLab stage 'post-publish' before 'chart-publish'", errors)


if __name__ == "__main__":
    unittest.main()
