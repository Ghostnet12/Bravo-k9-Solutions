import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare", Path(__file__).with_name("prepare-server.py"))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class ServerPreparationTests(unittest.TestCase):
    def test_private_bundle_and_consistent_credentials(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = prepare.prepare(str(Path(temporary) / "server"), "10.20.0.5")
            config = json.loads((target / "livekit.yaml").read_text())
            key, secret = next(iter(config["keys"].items()))
            self.assertGreaterEqual(len(secret), 64)
            self.assertEqual(key, config["webhook"]["api_key"])
            env = dict(line.split("=", 1) for line in (target / "vercel.env").read_text().splitlines())
            self.assertEqual(env["LIVEKIT_API_SECRET"], secret)
            self.assertEqual(env["LIVEKIT_API_KEY"], key)
            self.assertEqual(env["BRAVO_LIVE_ENABLED"], "false")
            self.assertFalse(config["room"]["auto_create"])
            for path in [target, *target.iterdir()]:
                self.assertEqual(stat.S_IMODE(path.stat().st_mode) & 0o077, 0)
            compose = json.loads((target / "compose.yaml").read_text())
            for service in compose["services"].values():
                self.assertIn("@sha256:", service["image"])
                self.assertEqual(service["network_mode"], "host")
            original = (target / "livekit.yaml").read_bytes()
            with self.assertRaisesRegex(ValueError, "already exists"):
                prepare.prepare(str(target), "10.20.0.5")
            self.assertEqual((target / "livekit.yaml").read_bytes(), original)

    def test_refuses_unsafe_paths_and_loopback(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            for ip in ["127.0.0.1", "0.0.0.0", "::1", "224.0.0.1", "169.254.1.1"]:
                with self.assertRaises(ValueError):
                    prepare.prepare(str(parent / "server"), ip)
            (parent / "checkout").mkdir()
            (parent / "checkout" / ".git").touch()
            with self.assertRaisesRegex(ValueError, "Git checkout"):
                prepare.prepare(str(parent / "checkout" / "secrets"), "10.20.0.5")
            (parent / "alias").symlink_to(parent, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symlinks"):
                prepare.prepare(str(parent / "alias" / "secrets"), "10.20.0.5")
            with self.assertRaisesRegex(ValueError, "absolute path"):
                prepare.prepare("relative", "10.20.0.5")


if __name__ == "__main__":
    unittest.main()
