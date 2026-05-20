import importlib.util
import io
import json
import pathlib
import sys
import tarfile
import tempfile
import unittest


SCRIPT_PATH = pathlib.Path(__file__).with_name("check_runtime_image_licenses.py")
SPEC = importlib.util.spec_from_file_location("check_runtime_image_licenses", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


ALLOWED = {"MIT", "BSD-3-Clause", "Apache-2.0", "GPL-2.0-only"}


def layer_with_entries(entries):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for name, body in entries.items():
            data = body.encode("utf-8")
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def layer_with_apk_db(installed_text):
    return layer_with_entries({"lib/apk/db/installed": installed_text})


def docker_archive_with_layers(path, layers):
    layer_names = [f"layer-{index}.tar" for index in range(len(layers))]
    manifest = [{"Config": "config.json", "RepoTags": ["test:latest"], "Layers": layer_names}]
    with tarfile.open(path, mode="w") as tar:
        manifest_bytes = json.dumps(manifest).encode("utf-8")
        manifest_info = tarfile.TarInfo("manifest.json")
        manifest_info.size = len(manifest_bytes)
        tar.addfile(manifest_info, io.BytesIO(manifest_bytes))

        config_bytes = b"{}"
        config_info = tarfile.TarInfo("config.json")
        config_info.size = len(config_bytes)
        tar.addfile(config_info, io.BytesIO(config_bytes))

        for layer_name, layer_bytes in zip(layer_names, layers):
            layer_info = tarfile.TarInfo(layer_name)
            layer_info.size = len(layer_bytes)
            tar.addfile(layer_info, io.BytesIO(layer_bytes))


def docker_archive(path, installed_text):
    docker_archive_with_layers(path, [layer_with_apk_db(installed_text)])


class CheckRuntimeImageLicensesTests(unittest.TestCase):
    def test_parses_apk_installed_packages(self):
        packages = MODULE.parse_apk_installed("P:busybox\nV:1.37.0-r0\nL:GPL-2.0-only\n", "image.tar")

        self.assertEqual(packages, [MODULE.ApkPackage("image.tar", "busybox", "1.37.0-r0", "GPL-2.0-only")])

    def test_allowed_expression_passes(self):
        packages = [MODULE.ApkPackage("image.tar", "ffmpeg", "6.1-r0", "GPL-2.0-only AND MIT")]

        blocked, unknown, disallowed = MODULE.evaluate_packages(packages, ALLOWED, "")

        self.assertEqual(blocked, [])
        self.assertEqual(unknown, [])
        self.assertEqual(disallowed, [])

    def test_unknown_license_fails(self):
        packages = [MODULE.ApkPackage("image.tar", "mystery", "1.0-r0", "Unknown")]

        blocked, unknown, disallowed = MODULE.evaluate_packages(packages, ALLOWED, "")

        self.assertEqual(blocked, [])
        self.assertEqual(unknown, ["image.tar:mystery@1.0-r0 :: Unknown"])
        self.assertEqual(disallowed, [])

    def test_disallowed_license_fails(self):
        packages = [MODULE.ApkPackage("image.tar", "pkg", "1.0-r0", "Artistic-2.0")]

        blocked, unknown, disallowed = MODULE.evaluate_packages(packages, ALLOWED, "")

        self.assertEqual(blocked, [])
        self.assertEqual(unknown, [])
        self.assertEqual(disallowed, ["image.tar:pkg@1.0-r0 :: Artistic-2.0"])

    def test_reads_docker_archive_apk_db(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "image.tar"
            docker_archive(path, "P:busybox\nV:1.37.0-r0\nL:GPL-2.0-only\n")

            packages = MODULE.packages_from_archives([path])

        self.assertEqual(packages, [MODULE.ApkPackage("image.tar", "busybox", "1.37.0-r0", "GPL-2.0-only")])

    def test_docker_archive_layers_apply_apk_db_whiteout(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "image.tar"
            docker_archive_with_layers(
                path,
                [
                    layer_with_apk_db("P:busybox\nV:1.37.0-r0\nL:GPL-2.0-only\n"),
                    layer_with_entries({"lib/apk/db/.wh.installed": ""}),
                    layer_with_apk_db("P:ca-certificates\nV:20250619-r0\nL:MPL-2.0\n"),
                ],
            )

            packages = MODULE.packages_from_archives([path])

        self.assertEqual(
            packages,
            [MODULE.ApkPackage("image.tar", "ca-certificates", "20250619-r0", "MPL-2.0")],
        )

    def test_no_image_inputs_return_empty_package_list(self):
        self.assertEqual(MODULE.packages_from_archives([]), [])


if __name__ == "__main__":
    unittest.main()
