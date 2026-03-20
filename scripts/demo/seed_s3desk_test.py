import importlib.util
import pathlib
import unittest


SCRIPT_PATH = pathlib.Path(__file__).with_name("seed-s3desk.py")
SPEC = importlib.util.spec_from_file_location("seed_s3desk_script", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SeedS3DeskPublicEndpointTests(unittest.TestCase):
    def test_remote_mode_omits_loopback_public_endpoint(self):
        self.assertEqual(
            MODULE._effective_public_endpoint("http://127.0.0.1:9000", allow_remote=True),
            "",
        )

    def test_remote_mode_keeps_private_network_public_endpoint(self):
        self.assertEqual(
            MODULE._effective_public_endpoint("http://192.168.2.230:9000", allow_remote=True),
            "http://192.168.2.230:9000",
        )

    def test_local_mode_keeps_loopback_public_endpoint(self):
        self.assertEqual(
            MODULE._effective_public_endpoint("http://127.0.0.1:9000", allow_remote=False),
            "http://127.0.0.1:9000",
        )

    def test_build_profile_payload_omits_public_endpoint_when_empty(self):
        payload = MODULE._build_profile_payload("", clear_public_endpoint=False)
        self.assertNotIn("publicEndpoint", payload)

    def test_build_profile_payload_clears_public_endpoint_when_requested(self):
        payload = MODULE._build_profile_payload("", clear_public_endpoint=True)
        self.assertEqual(payload["publicEndpoint"], "")


if __name__ == "__main__":
    unittest.main()
