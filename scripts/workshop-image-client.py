"""Independent workshop image adapter. Never accesses the legacy art queue.

Only whitelisted local delivery metadata is emitted. Upstream outputs are captured,
never forwarded. The archive/recovery files are kept under private job directories.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / "output/workshop-images/.private/jobs"
CONFIG = Path("E:/CodexHome/openqi-imagegen.env")
GENERATE = Path("E:/CodexHome/skills/generate-image2/scripts/generate_image2.py")
RECOVER = Path("E:/CodexHome/skills/openqi-imagegen/scripts/openqi_imagegen.py")


def atomic_json(path, data):
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, indent=2)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def records(directory):
    found = []
    for path in sorted((directory / "archive").glob("**/*.recovery.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("kind") == "openqi-image-recovery":
                found.append((path, data))
        except (OSError, ValueError):
            pass
    return found


def explicit_upstream_rejection(message):
    # A quoted provider error code is evidence; a bare word in a log or prompt
    # is not. Preserve ambiguous 502/timeout outcomes rather than infer refusal.
    text = str(message).replace('\\"', '"')
    return bool(re.search(r'["\']code["\']\s*:\s*["\']sensitive_words_detected["\']', text))


def inspect(directory, error_code=None):
    from PIL import Image
    try:
        aspect_ratio = json.loads((directory / "request.json").read_text(encoding="utf-8")).get("requested", {}).get("aspectRatio", "16:9")
    except (OSError, ValueError):
        aspect_ratio = "16:9"
    recs = records(directory)
    recoverable = any(bool(record.get("response")) for _, record in recs)
    paths = []
    try:
        manifest = json.loads((directory / "delivery/manifest.json").read_text(encoding="utf-8"))
        previous_errors = "\n".join(str(entry.get("error", "")) for entry in manifest.get("failures", []))
        if explicit_upstream_rejection(previous_errors):
            error_code = "UPSTREAM_PROMPT_REJECTED"
        for entry in manifest.get("images", []):
            candidate = Path(entry["path"]).resolve()
            if candidate.is_relative_to(directory.resolve()) and candidate.is_file():
                paths.append((candidate, entry.get("sha256"), entry.get("bytes")))
    except (OSError, ValueError, KeyError):
        pass
    # Recovery restores the sibling client's delivery/archive, not wrapper manifest.
    for _, record in recs:
        for entry in record.get("images", []):
            for key in ("requested_output", "archive"):
                if entry.get(key):
                    candidate = Path(entry[key]).resolve()
                    if candidate.is_relative_to(directory.resolve()) and candidate.is_file():
                        paths.append((candidate, entry.get("sha256"), entry.get("bytes")))
    for path, expected_hash, expected_bytes in paths:
        try:
            source_bytes = path.read_bytes()
            if not expected_hash or hashlib.sha256(source_bytes).hexdigest() != expected_hash or len(source_bytes) != expected_bytes:
                continue
            with Image.open(path) as source:
                source.load()  # Full native decoding, never a header-only acceptance.
                width, height = source.size
                if source.format not in {"PNG", "JPEG", "WEBP"}:
                    continue
                delivery = directory / "native.png"
                if source.format == "PNG":
                    binary = source_bytes
                else:
                    import io
                    buffer = io.BytesIO()
                    source.save(buffer, format="PNG")  # No resize, crop or pixel synthesis.
                    binary = buffer.getvalue()
                delivery.write_bytes(binary)
            with Image.open(delivery) as check:
                check.load()
                assert check.size == (width, height)
            return {
                "state": "generated" if native_4k(width, height, aspect_ratio) else "resolution_mismatch",
                "file": str(delivery), "width": width, "height": height,
                "bytes": len(binary), "sha256": hashlib.sha256(binary).hexdigest(),
                "native4k": native_4k(width, height, aspect_ratio), "recoveryAvailable": recoverable,
                "cleanupPending": any(e.get("cleanup_status") == "pending" for _, r in recs for e in r.get("images", [])),
            }
        except (OSError, ValueError, AssertionError):
            continue
    blocked = error_code in {"HTTP_401", "HTTP_402", "HTTP_403", "HTTP_429"}
    return {
        "state": "recoverable" if recoverable else "blocked" if blocked else "failed" if error_code == "UPSTREAM_PROMPT_REJECTED" else "unknown_outcome",
        "errorCode": error_code or "NO_SAVED_DELIVERY", "recoveryAvailable": recoverable,
    }


def native_4k(width, height, aspect_ratio="16:9"):
    if aspect_ratio == "2:3":
        return width >= 2160 and height >= 3840 and abs(width / height / (2 / 3) - 1) <= 0.005
    return width >= 3840 and height >= 2160 and abs(width / height / (16 / 9) - 1) <= 0.005


def error_code(stdout, stderr):
    if explicit_upstream_rejection(stdout + stderr):
        return "UPSTREAM_PROMPT_REJECTED"
    match = re.search(r"(?:HTTP(?:Error)?[ :]+|status(?:_code)?[ '\":=]+)([45]\d\d)", stdout + stderr, re.I)
    if match:
        return "HTTP_" + match.group(1)
    return "CLIENT_FAILED_OR_UNKNOWN"


def run(action, directory):
    directory = directory.resolve()
    if not directory.is_relative_to(PRIVATE.resolve()):
        raise ValueError("INVALID_JOB_DIRECTORY")
    directory.mkdir(parents=True, exist_ok=True)
    if action == "inspect":
        return inspect(directory)
    if action == "generate":
        spec = json.loads((directory / "request.json").read_text(encoding="utf-8"))
        requested = spec.get("requested", {})
        ratio = requested.get("aspectRatio", "16:9")
        if ratio not in {"16:9", "2:3"} or (ratio == "2:3" and requested.get("pixelSize")):
            return {"state": "failed", "errorCode": "ART_INVALID_ASSET_GEOMETRY", "recoveryAvailable": False}
        quality = requested.get("quality")
        if quality and (quality != "high" or requested.get("pixelSize")):
            return {"state": "failed", "errorCode": "ART_QUALITY_GEOMETRY_CONFLICT", "recoveryAvailable": False}
        # Preflight before the irreversible marker; client itself validates all refs too.
        from PIL import Image
        for filename in spec["references"]:
            with Image.open(filename) as reference:
                reference.verify()
        if not CONFIG.is_file() or not GENERATE.is_file():
            return {"state": "failed", "errorCode": "CLIENT_CONFIGURATION_MISSING", "recoveryAvailable": False}
        try:
            with (directory / "paid-attempt.lock").open("x") as marker:
                marker.write("One paid invocation reserved. Never remove to retry.\n")
                marker.flush()
                os.fsync(marker.fileno())
        except FileExistsError:
            return inspect(directory, "PAID_ATTEMPT_ALREADY_RESERVED")
        geometry = ["--size", "4096x2304"] if spec.get("requested", {}).get("pixelSize") == "4096x2304" else ["--aspect-ratio", ratio, "--resolution", "4K"]
        if quality:
            geometry.extend(["--quality", quality])
        command = [sys.executable, str(GENERATE), "--openqi-config", str(CONFIG),
                   "--prompt-file", str(directory / "prompt.txt"), *geometry, "--name", "scene", "--count", "1",
                   "--out-dir", str(directory / "delivery"), "--archive-dir", str(directory / "archive"), "--fail-fast"]
        for filename in spec["references"]:
            command.extend(["--image", filename])
    elif action == "recover":
        recs = [(path, record) for path, record in records(directory) if record.get("response")]
        if not recs:
            return inspect(directory, "NO_SAVED_RESPONSE_NO_RESUBMISSION")
        command = [sys.executable, str(RECOVER), "--config", str(CONFIG), "image-recover", str(recs[-1][0])]
    else:
        raise ValueError("INVALID_ACTION")
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
                                timeout=900, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        code = error_code(result.stdout, result.stderr) if result.returncode else None
        return inspect(directory, code)
    except subprocess.TimeoutExpired:
        return inspect(directory, "TRANSPORT_TIMEOUT_UNKNOWN")


def run_dispatched(action, directory, wait_for_dispatch=False):
    if wait_for_dispatch and sys.stdin.readline().strip() != "START":
        return {"state": "failed", "errorCode": "DISPATCH_NOT_CONFIRMED_NO_POST", "recoveryAvailable": False}
    return run(action, directory)


if __name__ == "__main__":
    directory = Path(sys.argv[2]).resolve()
    try:
        result = run_dispatched(sys.argv[1], directory, "--await-dispatch" in sys.argv[3:])
    except Exception:
        # Never publish arbitrary exception strings (could contain upstream secrets).
        result = {"state": "unknown_outcome", "errorCode": "ADAPTER_FAILED_INSPECT_BEFORE_RETRY", "recoveryAvailable": False}
    if directory.is_relative_to(PRIVATE.resolve()):
        atomic_json(directory / "result.json", result)
    print(json.dumps({k: v for k, v in result.items() if k != "file"}))
