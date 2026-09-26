import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("deploy", Path(__file__).parents[1] / "scripts/deploy-truenas.py")
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentTest(unittest.TestCase):
    def test_only_image_changes_and_digest_is_required(self):
        config = {"services": {"ouicheur": {"image": "old", "environment": {"APP_ORIGIN": "https://example.com"}, "volumes": ["/data:/app/data"]}}}
        image = deploy.IMAGE_PREFIX + "a" * 64
        updated = deploy.deployment_config(config, image)
        self.assertEqual(config["services"]["ouicheur"]["image"], "old")
        self.assertEqual(updated["services"]["ouicheur"]["image"], image)
        self.assertEqual(updated["services"]["ouicheur"]["volumes"], config["services"]["ouicheur"]["volumes"])
        self.assertEqual(updated["services"]["ouicheur"]["environment"], config["services"]["ouicheur"]["environment"])
        for invalid in ["ghcr.io/hloiseau/ouicheur:main", image + ";reboot", "ghcr.io/other/app@sha256:" + "a" * 64]:
            with self.assertRaises(ValueError):
                deploy.deployment_config(config, invalid)
        with self.assertRaises(ValueError):
            deploy.deployment_config({"services": {"caddy": {}}}, image)

    def test_backup_failure_prevents_update(self):
        import json
        config = {"services": {"ouicheur": {"image": "old"}}}
        with patch.object(deploy, "run", side_effect=[json.dumps(config), "pulled", "container", RuntimeError("backup failed")]) as run:
            with self.assertRaisesRegex(RuntimeError, "backup failed"):
                deploy.main(deploy.IMAGE_PREFIX + "a" * 64)
            self.assertEqual(run.call_count, 4)
            self.assertFalse(any("app.update" in call.args for call in run.call_args_list))


if __name__ == "__main__":
    unittest.main()
