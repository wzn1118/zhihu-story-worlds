"""Native-pixel review windows for the delivered waterwheel scene; not new assets."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path(__file__).resolve().parents[1]
job_id = "scene_1e8a6a0c597378e1dce1e094cc44"
source = root / "public/generated-art" / f"{job_id}.png"
target = root / "output/imagegen/scene-production/batch-vhd-20260906/harvest-box/review"
target.mkdir(parents=True, exist_ok=True)
windows = {
    "chen-face": (880, 275, 1430, 775),
    "shen-face": (1800, 0, 2370, 550),
    "shen-grips": (1470, 570, 2510, 1420),
    "chen-hands": (490, 920, 1730, 1410),
    "hook-contact": (2550, 1510, 3380, 2110),
    "cloth-planes": (1380, 500, 2060, 1000),
}
with Image.open(source) as picture:
    picture.load()
    dimensions = picture.size
    for name, box in windows.items():
        picture.crop(box).save(target / f"{name}.png")
receipt = {
    "jobId": job_id, "width": dimensions[0], "height": dimensions[1],
    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "fullDecode": True, "originalModified": False,
    "reviewWindows": windows, "resized": False, "sceneCoverageFromCrops": 0,
}
(target / "native-detail-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
print(json.dumps(receipt))
