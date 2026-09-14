"""Offline adapter tests. All media are synthetic test fixtures in temporary dirs."""
import hashlib
import io
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

spec = importlib.util.spec_from_file_location("art_client", Path(__file__).resolve().parents[1] / "scripts/art-production-client.py")
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="art-client-test-")
        self.root = Path(self.temporary.name)
        self.directory = self.root / "jobs/fixture"
        self.directory.mkdir(parents=True)

    def tearDown(self):
        self.temporary.cleanup()

    def image_record(self, size=(4096, 2304)):
        file = self.directory / "archive/native.png"
        file.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", size, (45, 57, 65)).save(file)
        binary = file.read_bytes()
        record = {"kind": "openqi-image-recovery", "response": {"data": [{"url": "https://example.invalid/signed?token=TEST_ONLY"}]},
                  "images": [{"archive": str(file), "requested_output": str(file), "sha256": hashlib.sha256(binary).hexdigest(),
                              "bytes": len(binary), "cleanup_status": "deleted"}]}
        (file.parent / "fixture.recovery.json").write_text(json.dumps(record), encoding="utf-8")
        return file, record

    def test_full_decode_native_hash_and_byte_preservation(self):
        file, _ = self.image_record()
        result = client.inspect(self.directory)
        self.assertTrue(result["native4k"])
        self.assertEqual(result["state"], "generated")
        self.assertEqual(Path(result["file"]).read_bytes(), file.read_bytes())
        self.assertNotIn("TEST_ONLY", json.dumps(result))

    def test_mismatch_remains_native_small_pixels_not_upscaled(self):
        file, _ = self.image_record((1672, 941))
        result = client.inspect(self.directory)
        self.assertFalse(result["native4k"])
        self.assertEqual(result["state"], "resolution_mismatch")
        with Image.open(result["file"]) as image:
            self.assertEqual(image.size, (1672, 941))

    def test_tampered_valid_png_rejected_against_receipt_hash(self):
        file, _ = self.image_record()
        Image.new("RGB", (4096, 2304), (255, 0, 0)).save(file)
        result = client.inspect(self.directory)
        self.assertNotIn("file", result)
        self.assertEqual(result["state"], "recoverable")

    def test_truncated_png_rejected_even_if_hash_and_header_match(self):
        file, record = self.image_record()
        binary = file.read_bytes()[:64]
        file.write_bytes(binary)
        record["images"][0].update(sha256=hashlib.sha256(binary).hexdigest(), bytes=len(binary))
        (file.parent / "fixture.recovery.json").write_text(json.dumps(record), encoding="utf-8")
        self.assertNotIn("file", client.inspect(self.directory))

    def test_no_response_recovery_makes_no_network_or_credential_read(self):
        with patch.object(client, "PRIVATE", self.root / "jobs"), patch.object(client.subprocess, "run") as run:
            result = client.run("recover", self.directory)
        run.assert_not_called()
        self.assertEqual(result["errorCode"], "NO_SAVED_RESPONSE_NO_RESUBMISSION")

    def test_recovery_invokes_only_saved_job_cli_no_paid_generation(self):
        self.image_record()
        with patch.object(client, "PRIVATE", self.root / "jobs"), patch.object(client.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "", "")) as run:
            result = client.run("recover", self.directory)
        command = run.call_args.args[0]
        self.assertIn("image-recover", command)
        self.assertNotIn("generate", command)
        self.assertEqual(result["state"], "generated")

    def test_one_paid_marker_prevents_second_post_and_redacts_error(self):
        reference = self.directory / "reference.png"
        Image.new("RGB", (32, 32)).save(reference)
        (self.directory / "request.json").write_text(json.dumps({"references": [str(reference)]}), encoding="utf-8")
        (self.directory / "prompt.txt").write_text("Synthetic fixture test only", encoding="utf-8")
        config = self.root / "empty-test-config.env"; config.touch()
        fake_output = subprocess.CompletedProcess([], 1, "HTTP 402 https://example.invalid/private?token=TEST_ONLY", "")
        with patch.object(client, "PRIVATE", self.root / "jobs"), patch.object(client, "CONFIG", config), patch.object(client.subprocess, "run", return_value=fake_output) as run:
            first = client.run("generate", self.directory)
            second = client.run("generate", self.directory)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(first["errorCode"], "HTTP_402")
        self.assertEqual(second["errorCode"], "PAID_ATTEMPT_ALREADY_RESERVED")
        self.assertNotIn("TEST_ONLY", json.dumps(first))

    def test_explicit_upstream_rejection_is_definitive_not_an_unknown_post(self):
        directory = self.directory / "delivery"
        directory.mkdir()
        (directory / "manifest.json").write_text(json.dumps({"images": [], "failures": [
            {"error": 'HTTP 502: provider custom: 400 {"code":"sensitive_words_detected"}'}]}), encoding="utf-8")
        result = client.inspect(self.directory, "NO_SAVED_RESPONSE_NO_RESUBMISSION")
        self.assertEqual(result["state"], "failed")
        self.assertEqual(result["errorCode"], "UPSTREAM_PROMPT_REJECTED")
        self.assertFalse(result["recoveryAvailable"])

    def test_502_without_structured_rejection_stays_unknown(self):
        directory = self.directory / "delivery"
        directory.mkdir()
        (directory / "manifest.json").write_text(json.dumps({"images": [], "failures": [
            {"error": 'HTTP 502 timeout; no response; log mentions sensitive_words_detected'}]}), encoding="utf-8")
        result = client.inspect(self.directory, "HTTP_502")
        self.assertEqual(result["state"], "unknown_outcome")
        self.assertEqual(result["errorCode"], "HTTP_502")
        self.assertFalse(result["recoveryAvailable"])

    def test_rejection_requires_actual_code_field_not_bare_marker(self):
        self.assertEqual(client.error_code('HTTP 502 sensitive_words_detected', ''), 'HTTP_502')
        self.assertEqual(client.error_code('request timed out; sensitive_words_detected mentioned', ''), 'CLIENT_FAILED_OR_UNKNOWN')
        self.assertEqual(client.error_code('HTTP 502: {"code":"sensitive_words_detected"}', ''), 'UPSTREAM_PROMPT_REJECTED')
        self.assertEqual(client.error_code('HTTP 502: {\\"error\\":{\\"code\\":\\"sensitive_words_detected\\"}}', ''), 'UPSTREAM_PROMPT_REJECTED')

    def test_explicit_native_pixels_never_mix_legacy_size_with_resolution_pair(self):
        reference = self.directory / "reference.png"
        Image.new("RGB", (32, 32)).save(reference)
        request = {"references": [str(reference)], "requested": {"pixelSize": "4096x2304"}}
        (self.directory / "request.json").write_text(json.dumps(request), encoding="utf-8")
        (self.directory / "prompt.txt").write_text("Synthetic fixture only", encoding="utf-8")
        config = self.root / "empty-test-config.env"
        config.touch()
        with patch.object(client, "PRIVATE", self.root / "jobs"), patch.object(client, "CONFIG", config), patch.object(client.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "HTTP 402", "")) as run:
            client.run("generate", self.directory)
        command = run.call_args.args[0]
        self.assertEqual(command[command.index("--size") + 1], "4096x2304")
        self.assertNotIn("--aspect-ratio", command)
        self.assertNotIn("--resolution", command)
        self.assertNotIn("--quality", command)

    def test_explicit_high_quality_uses_only_matching_4k_pair(self):
        reference = self.directory / "reference.png"
        Image.new("RGB", (32, 32)).save(reference)
        request = {"references": [str(reference)], "requested": {"quality": "high"}}
        (self.directory / "request.json").write_text(json.dumps(request), encoding="utf-8")
        config = self.root / "empty-test-config.env"
        config.touch()
        with patch.object(client, "PRIVATE", self.root / "jobs"), patch.object(client, "CONFIG", config), patch.object(client.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "HTTP 402", "")) as run:
            client.run("generate", self.directory)
        command = run.call_args.args[0]
        self.assertEqual(command[command.index("--quality") + 1], "high")
        self.assertEqual(command[command.index("--resolution") + 1], "4K")
        self.assertEqual(command[command.index("--aspect-ratio") + 1], "16:9")
        self.assertNotIn("--size", command)

    def test_quality_and_legacy_size_conflict_stops_before_paid_marker(self):
        request = {"references": [], "requested": {"quality": "high", "pixelSize": "4096x2304"}}
        (self.directory / "request.json").write_text(json.dumps(request), encoding="utf-8")
        with patch.object(client, "PRIVATE", self.root / "jobs"), patch.object(client.subprocess, "run") as run:
            result = client.run("generate", self.directory)
        run.assert_not_called()
        self.assertEqual(result["errorCode"], "ART_QUALITY_GEOMETRY_CONFLICT")
        self.assertFalse((self.directory / "paid-attempt.lock").exists())

    def test_missing_durable_dispatch_never_enters_paid_client(self):
        with patch.object(client.sys, "stdin", io.StringIO("")), patch.object(client, "run") as run:
            result = client.run_dispatched("generate", self.directory, True)
        run.assert_not_called()
        self.assertEqual(result["errorCode"], "DISPATCH_NOT_CONFIRMED_NO_POST")
        self.assertFalse((self.directory / "paid-attempt.lock").exists())

    def test_durable_dispatch_enters_client_exactly_once(self):
        with patch.object(client.sys, "stdin", io.StringIO("START\n")), patch.object(client, "run", return_value={"state": "failed"}) as run:
            client.run_dispatched("generate", self.directory, True)
        run.assert_called_once_with("generate", self.directory)


if __name__ == "__main__":
    unittest.main(verbosity=2)
