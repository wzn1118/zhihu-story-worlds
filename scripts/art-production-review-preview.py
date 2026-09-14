"""Small full-frame QA previews. These never replace or count as production art."""
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image


def preview(root, job):
    job_id = job["id"]
    if not re.fullmatch(r"scene_[a-f0-9]+", job_id):
        raise ValueError("INVALID_PREVIEW_JOB")
    source = root / "public/generated-art" / f"{job_id}.png"
    original = source.read_bytes()
    asset = job["asset"]
    if hashlib.sha256(original).hexdigest() != asset["sha256"] or len(original) != asset["bytes"]:
        raise ValueError("PREVIEW_SOURCE_HASH_MISMATCH")
    folder = root / "output/imagegen/scene-production/formal-production-20260907/review-previews"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{job_id}.jpg"
    with Image.open(source) as image:
        image.load()
        actual = list(image.size)
        if actual != [asset["width"], asset["height"]]:
            raise ValueError("PREVIEW_SOURCE_DIMENSIONS_MISMATCH")
        view = image.convert("RGB")
        view.thumbnail((768, 768), Image.Resampling.LANCZOS)
        view.save(target, quality=88, optimize=True)
    return {"jobId": job_id, "purpose": "review-preview-only", "fullFrame": True,
            "sourceSha256": asset["sha256"], "sourceDimensions": actual,
            "previewDimensions": list(view.size), "preview": str(target),
            "productionAssetCount": 0}


if __name__ == "__main__":
    root = Path.cwd()
    ids = sys.argv[1:]
    if not ids or len(ids) > 12 or len(set(ids)) != len(ids):
        raise ValueError("PREVIEW_BATCH_REQUIRES_1_TO_12_IDS")
    manifest = json.loads((root / "output/imagegen/scene-production/manifest.json").read_text(encoding="utf-8"))
    jobs = {job["id"]: job for batch in manifest["batches"] for job in batch["jobs"]}
    print(json.dumps([preview(root, jobs[job_id]) for job_id in ids], ensure_ascii=True))
