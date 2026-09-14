import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

SPEC = importlib.util.spec_from_file_location("calibration_status", Path(__file__).parents[1] / "scripts/art-calibration-status.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CalibrationEvidenceTests(unittest.TestCase):
    def fixture(self, root, size=(1672, 941)):
        delivery = root / "delivery"
        delivery.mkdir()
        file = delivery / "image.png"
        Image.new("RGB", size).save(file)
        binary = file.read_bytes()
        data = {"jobs": [{"prompt": "fixture prompt", "image": [], "resolution": "4K", "aspect_ratio": "16:9"}],
                "images": [{"path": str(file), "sha256": hashlib.sha256(binary).hexdigest(),
                            "bytes": len(binary), "width": size[0], "height": size[1],
                            "recovery": "PRIVATE_RECOVERY", "archive": "PRIVATE_ARCHIVE"}], "failures": [],
                "channel": {"config_path": "PRIVATE_CONFIG"}}
        manifest = delivery / "manifest.json"
        manifest.write_text(json.dumps(data), encoding="utf-8")
        return manifest, data

    def test_real_pixels_not_requested_tier_and_private_fields_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest, _ = self.fixture(root)
            result = MODULE.delivery_evidence(manifest, root)
            self.assertFalse(result["images"][0]["native4k"])
            self.assertNotIn("PRIVATE_", json.dumps(result))

    def test_native_dimensions_verified(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest, _ = self.fixture(root, (4096, 2304))
            self.assertTrue(MODULE.delivery_evidence(manifest, root)["images"][0]["native4k"])

    def test_hash_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest, data = self.fixture(root)
            data["images"][0]["sha256"] = "0" * 64
            manifest.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "METADATA_MISMATCH"):
                MODULE.delivery_evidence(manifest, root)

    def test_failure_code_without_private_error_contents(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            file = root / "manifest.json"
            file.write_text(json.dumps({"failures": [{"error": "PRIVATE_RECOVERY HTTP 503: provider temporary unavailable"}]}))
            result = MODULE.delivery_evidence(file, root)
            self.assertEqual(result["failures"][0]["httpCodes"], ["503"])
            self.assertFalse(result["failures"][0]["autoResubmit"])
            self.assertNotIn("PRIVATE_", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
