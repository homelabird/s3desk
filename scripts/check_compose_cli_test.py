#!/usr/bin/env python3
"""Offline deployment CLI checks; the fake provider never starts containers."""

import base64
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ComposeCLITests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="s3desk compose cli ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "repo with spaces"
        (self.root / "scripts").mkdir(parents=True)
        self.script = self.root / "scripts/compose.sh"
        shutil.copyfile(ROOT / "scripts/compose.sh", self.script)
        shutil.copyfile(ROOT / ".env.example", self.root / ".env.example")
        (self.root / ".env").write_text(
            "S3DESK_IMAGE=unused/default\nS3DESK_TAG=unused-default\n"
            "ALLOWED_HOSTS=s3desk.example.com\n"
        )
        self.config = self.root / ".env.local"
        self.log = Path(self.temporary.name) / "docker.jsonl"
        binary_dir = Path(self.temporary.name) / "fake bin"
        binary_dir.mkdir()
        docker = binary_dir / "docker"
        docker.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "args = sys.argv[1:]\n"
            "rest = args[1:] if args[:1] == ['compose'] else args\n"
            "while rest and rest[0].startswith('-'):\n"
            "    rest = rest[2:] if rest[0] in ('-f', '--env-file', '-p', '--project-name', '--project-directory', '--profile') else rest[1:]\n"
            "command = rest[0] if rest else ''\n"
            "with open(os.environ['FAKE_DOCKER_LOG'], 'a') as output:\n"
            "    output.write(json.dumps({'args': args, 'command': command, 'cwd': os.getcwd(), 'tag': os.environ.get('S3DESK_TAG')}) + '\\n')\n"
            "if command == os.environ.get('FAKE_FAIL_COMMAND'):\n"
            "    sys.exit(int(os.environ.get('FAKE_EXIT_CODE', '17')))\n"
        )
        docker.chmod(0o755)
        self.environment = {
            key: value
            for key, value in os.environ.items()
            if not key.startswith(("S3DESK_", "DEMO_", "FAKE_"))
            and key not in {
                "API_TOKEN", "ENCRYPTION_KEY", "POSTGRES_PASSWORD", "ALLOWED_HOSTS",
                "ALLOWED_LOCAL_DIRS", "EXTERNAL_BASE_URL", "SYSLOG_ADDRESS",
                "BASH_ENV", "ENV", "COMPOSE_FILE", "COMPOSE_ENV_FILES",
            }
        }
        self.environment.update({
            "PATH": str(binary_dir) + os.pathsep + os.environ.get("PATH", ""),
            "S3DESK_COMPOSE_PROVIDER": "docker",
            "FAKE_DOCKER_LOG": str(self.log),
        })

    def run_cli(self, *arguments, answers="", **environment):
        return subprocess.run(
            ["bash", str(self.script), *arguments],
            input=answers,
            text=True,
            capture_output=True,
            cwd=self.temporary.name,
            env={**self.environment, **environment},
            timeout=10,
        )

    def settings(self):
        return {
            key: value.strip('"\'')
            for line in self.config.read_text().splitlines()
            if line and not line.startswith("#") and "=" in line
            for key, value in [line.split("=", 1)]
        }

    def calls(self):
        if not self.log.exists():
            return []
        return [
            call for line in self.log.read_text().splitlines()
            if (call := json.loads(line))["command"] != "version"
        ]

    def saved_config(self, stack="remote", **overrides):
        settings = {
            "S3DESK_DEPLOY_STACK": stack,
            "S3DESK_IMAGE": "registry.internal/s3desk",
            "S3DESK_TAG": "test-tag",
            "API_TOKEN": "a" * 64,
            "ENCRYPTION_KEY": base64.b64encode(b"b" * 32).decode(),
            "POSTGRES_PASSWORD": "c" * 64,
            "ALLOWED_LOCAL_DIRS": "/data",
            "ALLOWED_HOSTS": "files.test.internal",
            "EXTERNAL_BASE_URL": "https://files.test.internal",
            "S3DESK_DOMAIN": "files.test.internal",
        }
        settings.update(overrides)
        self.config.write_text("".join(f"{key}={value}\n" for key, value in settings.items()))

    def assert_native_config(self, call, stack):
        arguments = call["args"]
        self.assertIn("--env-file", arguments)
        self.assertIn(str(self.config), arguments)
        self.assertIn(str(self.root / f"compose/remote/{stack}.yml"), arguments)
        self.assertEqual(call["cwd"], str(self.root))

    def test_help_explains_setup_and_daily_commands_without_provider(self):
        result = self.run_cli("--help")
        self.assertEqual(result.returncode, 0, result.stderr)
        for command in ("setup", "up", "status", "logs", "stop"):
            self.assertIn(command, result.stdout)
        self.assertFalse(self.config.exists())
        self.assertFalse(self.log.exists())

    def test_default_setup_is_private_and_generates_secrets_without_starting(self):
        before = set(self.root.rglob("*"))
        result = self.run_cli("setup", answers="\n\n\n\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        settings = self.settings()
        template = dict(
            line.split("=", 1) for line in (self.root / ".env.example").read_text().splitlines()
            if line.startswith(("S3DESK_IMAGE=", "S3DESK_TAG="))
        )
        self.assertEqual(settings["S3DESK_DEPLOY_STACK"], "remote")
        self.assertEqual(settings["S3DESK_BIND_ADDRESS"], "127.0.0.1")
        self.assertEqual(settings["S3DESK_PORT"], "8080")
        self.assertEqual(settings["S3DESK_IMAGE"], template["S3DESK_IMAGE"])
        self.assertEqual(settings["S3DESK_TAG"], template["S3DESK_TAG"])
        self.assertEqual(settings["ALLOWED_LOCAL_DIRS"], "/data")
        self.assertIn("127.0.0.1", settings["ALLOWED_HOSTS"].split(","))
        self.assertIn("localhost", settings["ALLOWED_HOSTS"].split(","))
        self.assertEqual(settings["EXTERNAL_BASE_URL"], "http://127.0.0.1:8080")
        for key in ("API_TOKEN", "POSTGRES_PASSWORD"):
            self.assertRegex(settings[key], r"^[0-9a-fA-F]{64}$")
        self.assertEqual(len(base64.b64decode(settings["ENCRYPTION_KEY"], validate=True)), 32)
        self.assertEqual(stat.S_IMODE(self.config.stat().st_mode), 0o600)
        for key in ("API_TOKEN", "POSTGRES_PASSWORD", "ENCRYPTION_KEY"):
            self.assertNotIn(settings[key], result.stdout + result.stderr)
        self.assertEqual(set(self.root.rglob("*")) - before, {self.config})
        self.assertFalse(self.log.exists())

    def test_lan_setup_uses_host_port_and_image_answers(self):
        result = self.run_cli(
            "setup", answers="2\n192.168.1.20\n18080\nregistry.internal/s3desk\nv1.2.3\n"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        settings = self.settings()
        self.assertEqual(settings["S3DESK_DEPLOY_STACK"], "remote")
        self.assertEqual(settings["S3DESK_BIND_ADDRESS"], "0.0.0.0")
        self.assertEqual(settings["S3DESK_PORT"], "18080")
        self.assertIn("192.168.1.20", settings["ALLOWED_HOSTS"].split(","))
        self.assertEqual(settings["EXTERNAL_BASE_URL"], "http://192.168.1.20:18080")
        self.assertEqual(settings["S3DESK_IMAGE"], "registry.internal/s3desk")
        self.assertEqual(settings["S3DESK_TAG"], "v1.2.3")
        self.assertFalse(self.log.exists())

    def test_https_setup_selects_caddy_without_asking_for_http_port(self):
        result = self.run_cli("setup", answers="3\nfiles.test.internal\n\n\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        settings = self.settings()
        self.assertEqual(settings["S3DESK_DEPLOY_STACK"], "caddy")
        self.assertIn("files.test.internal", settings["ALLOWED_HOSTS"].split(","))
        self.assertEqual(settings["S3DESK_DOMAIN"], "files.test.internal")
        self.assertEqual(settings["EXTERNAL_BASE_URL"], "https://files.test.internal")
        self.assertFalse(self.log.exists())

    def test_setup_rejects_invalid_answers_without_creating_config(self):
        for answers in (
            "9\n", "2\nhttps://192.168.1.20\n", "3\nfiles.test.internal:443\n",
            "2\nbad..hostname\n", "3\nfiles.-bad.internal\n",
            "1\n0\n", "1\n65536\n", "1\nnot-a-port\n",
            "1\n8080\nimage with space\ntag\n", "1\n8080\n\ntag with space\n",
            "1\n8080\nregistry.internal/s3desk:tag\ntag\n",
        ):
            with self.subTest(answers=answers):
                result = self.run_cli("setup", answers=answers)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.config.exists())
                self.assertFalse(self.log.exists())

    def test_setup_accepts_registry_ports_and_normalizes_decimal_web_port(self):
        result = self.run_cli(
            "setup", answers="1\n08080\nregistry.internal:5000/team/s3desk\nv1.2.3\n"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.settings()["S3DESK_IMAGE"], "registry.internal:5000/team/s3desk")
        self.assertEqual(self.settings()["S3DESK_PORT"], "8080")

    def test_setup_eof_explains_how_to_retry_and_leaves_no_file(self):
        result = self.run_cli("setup")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("setup", result.stdout + result.stderr)
        self.assertFalse(self.config.exists())
        self.assertFalse(self.log.exists())

    def test_setup_preserves_existing_configuration(self):
        self.saved_config()
        self.config.chmod(0o640)
        before = self.config.read_bytes()
        result = self.run_cli("setup", answers="\n\n\n\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(".env.local", result.stdout + result.stderr)
        self.assertEqual(self.config.read_bytes(), before)
        self.assertEqual(stat.S_IMODE(self.config.stat().st_mode), 0o640)
        self.assertFalse(self.log.exists())

    def test_daily_aliases_require_saved_setup(self):
        for command in ("up", "status", "logs", "stop"):
            with self.subTest(command=command):
                result = self.run_cli(command)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("setup", result.stdout + result.stderr)
                self.assertFalse(self.log.exists())

    def test_up_checks_config_and_pulls_before_starting_then_shows_status(self):
        self.saved_config()
        result = self.run_cli("up")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual([call["command"] for call in calls], ["config", "pull", "up", "ps"])
        self.assertEqual(calls[0]["args"][-2:], ["config", "--quiet"])
        self.assertEqual(calls[2]["args"][-2:], ["up", "-d"])
        for call in calls:
            self.assert_native_config(call, "compose")

    def test_up_preserves_failures_and_stops_the_sequence(self):
        self.saved_config()
        commands = ["config", "pull", "up", "ps"]
        for index, command in enumerate(commands):
            with self.subTest(command=command):
                self.log.unlink(missing_ok=True)
                result = self.run_cli("up", FAKE_FAIL_COMMAND=command, FAKE_EXIT_CODE="23")
                self.assertEqual(result.returncode, 23, result.stderr)
                self.assertEqual([call["command"] for call in self.calls()], commands[:index + 1])

    def test_status_logs_and_stop_forward_safe_commands(self):
        self.saved_config(stack="caddy")
        for command, expected in (("status", ["ps"]), ("logs", ["logs", "-f"]), ("stop", ["stop"])):
            with self.subTest(command=command):
                self.log.unlink(missing_ok=True)
                result = self.run_cli(command)
                self.assertEqual(result.returncode, 0, result.stderr)
                calls = self.calls()
                self.assertEqual(len(calls), 1)
                self.assertEqual(calls[0]["args"][-len(expected):], expected)
                self.assert_native_config(calls[0], "caddy")

    def test_environment_takes_precedence_over_saved_values(self):
        self.saved_config(API_TOKEN="change-me", ALLOWED_HOSTS="s3desk.example.com")
        result = self.run_cli(
            "status", S3DESK_DEPLOY_STACK="caddy", API_TOKEN="d" * 64,
            ALLOWED_HOSTS="override.test.internal", S3DESK_TAG="override-tag",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        call = self.calls()[0]
        self.assert_native_config(call, "caddy")
        self.assertEqual(call["tag"], "override-tag")

    def test_empty_exported_secret_is_rejected_instead_of_using_file_value(self):
        self.saved_config()
        result = self.run_cli("up", API_TOKEN="")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("API_TOKEN", result.stderr)
        self.assertFalse(self.log.exists())

    def test_legacy_remote_and_caddy_read_native_env_file_without_shell_sourcing(self):
        self.saved_config()
        marker = self.root / "must not execute"
        with self.config.open("a") as config:
            config.write(f"COMPOSE_TEST_UNUSED=$(touch '{marker}')\n")
        for command, compose_file in (("remote", "compose"), ("caddy", "caddy")):
            with self.subTest(command=command):
                self.log.unlink(missing_ok=True)
                result = self.run_cli(command, "logs", "--tail", "20", "s3desk")
                self.assertEqual(result.returncode, 0, result.stderr)
                call = self.calls()[0]
                self.assert_native_config(call, compose_file)
                self.assertEqual(call["args"][-4:], ["logs", "--tail", "20", "s3desk"])
                self.assertFalse(marker.exists())

    def test_demo_does_not_load_saved_deployment_settings(self):
        self.saved_config(stack="caddy")
        result = self.run_cli("demo", "up", "--build", "-d", DEMO_PUBLIC_HOST="127.0.0.1")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual(len(calls), 1)
        self.assertIn(str(self.root / "compose/demo/compose.yml"), calls[0]["args"])
        self.assertNotIn(str(self.config), calls[0]["args"])
        self.assertEqual(calls[0]["args"][-3:], ["up", "--build", "-d"])

    def test_invalid_command_and_alias_arguments_exit_two_without_provider(self):
        self.saved_config()
        for arguments in (("unknown-command",), ("setup", "--force"), ("up", "-d"),
                          ("status", "s3desk"), ("logs", "--tail", "20"), ("stop", "--volumes")):
            with self.subTest(arguments=arguments):
                result = self.run_cli(*arguments)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main()
