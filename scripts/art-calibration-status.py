"""Verify selected calibration deliveries locally; no network or credential access."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION = ROOT / "output/imagegen/scene-production"
FOLDER = PRODUCTION / "film-frame-calibration-20260907"


def delivery_evidence(manifest_path: Path, allowed_root: Path) -> dict:
    document = json.loads(manifest_path.read_text(encoding="utf-8"))
    images = []
    for entry in document.get("images", []):
        file = Path(entry["path"]).resolve()
        if not file.is_relative_to(manifest_path.parent.resolve()) or not file.is_relative_to(allowed_root.resolve()):
            raise ValueError("DELIVERY_OUTSIDE_EXPECTED_DIRECTORY")
        binary = file.read_bytes()
        digest = hashlib.sha256(binary).hexdigest()
        with Image.open(file) as decoded:
            decoded.load()
            width, height = decoded.size
            image_format = decoded.format
        if (digest, len(binary), width, height) != (entry["sha256"], entry["bytes"], entry["width"], entry["height"]):
            raise ValueError("DELIVERY_METADATA_MISMATCH")
        if image_format != "PNG":
            raise ValueError("EXPECTED_DELIVERED_PNG")
        images.append({"file": file.as_posix(), "sha256": digest, "bytes": len(binary),
                       "width": width, "height": height, "fullyDecoded": True,
                       "native4k": width >= 3840 and height >= 2160
                       and abs(width / height / (16 / 9) - 1) <= .005})
    failures = [{"httpCodes": sorted(set(re.findall(r"HTTP(?:Error)?[ :]+([45]\d\d)", str(row.get("error", ""))))),
                 "outcome": "failed_or_unknown", "autoResubmit": False}
                for row in document.get("failures", [])]
    requests = [{"prompt": row["prompt"], "promptSha256": hashlib.sha256(row["prompt"].encode("utf-8")).hexdigest(),
                 "referenceCount": len(row.get("image") or []), "quality": row.get("quality"),
                 "aspectRatio": row.get("aspect_ratio"), "resolution": row.get("resolution"),
                 "requirements": row.get("requirements", ""), "negative": row.get("negative", "")}
                for row in document.get("jobs", [])]
    return {"requests": requests, "images": images, "failures": failures}


def main() -> None:
    cases = json.loads((FOLDER / "cases.json").read_text(encoding="utf-8"))
    rows = []
    for case in cases:
        manifest = PRODUCTION / case["deliveryManifest"]
        evidence = delivery_evidence(manifest, PRODUCTION) if manifest.is_file() else {"images": [], "failures": []}
        rows.append({**case, **evidence, "deliveryState": "delivered" if evidence["images"] else
                     "failed_or_unknown" if evidence["failures"] else "pending"})
    images = [image for row in rows for image in row["images"]]
    unique = {image["sha256"] for image in images}
    approved = [row for row in rows if row.get("review", {}).get("decision") == "approved"
                and row["images"] and all(image["native4k"] for image in row["images"])]
    counts = {"submittedRequests": sum(row["paidAttempts"] for row in rows), "generated": len(images),
              "uniqueImages": len(unique), "reviewed": sum(bool(row.get("review")) and bool(row["images"]) for row in rows),
              "native4k": sum(image["native4k"] for image in images), "approved": len(approved),
              "inFlight": sum(row["deliveryState"] == "pending" for row in rows),
              "failedOrUnknown": sum(row["deliveryState"] == "failed_or_unknown" for row in rows)}
    report = {"at": datetime.now(timezone.utc).isoformat(), "unreviewedBulkDispatchHeld": True,
              "productionGate": "film-frame-20260907/gate.json", "mode": "reviewed-pairs",
              "newNetworkCalls": 0, "privateRecoveryPathsIncluded": False, "counts": counts, "cases": rows}
    target = FOLDER / "status.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(target)
    print(json.dumps({"at": report["at"], "counts": counts, "report": target.as_posix()}))


if __name__ == "__main__":
    main()
