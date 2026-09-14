"""Join the reviewed facial edit to its original body at the lower native scale."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


parser = argparse.ArgumentParser()
parser.add_argument("--expression", choices=("main", "reaction"), default="main")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
body_path = root / "output/imagegen/fang-nuo-main-light-v2/fang-nuo-main-light-v2-01.png"
face_path = root / ("output/imagegen/fang-nuo-face-shadow-v3/fang-nuo-face-shadow-v3-01.png" if args.expression == "main"
                    else "output/imagegen/fang-nuo-reaction-face/fang-nuo-reaction-face-01.png")
out_dir = root / f"output/imagegen/fang-nuo-{args.expression}-integrated-v3"
out_dir.mkdir(parents=True, exist_ok=True)

with Image.open(body_path) as source:
    source.load()
    body = source.convert("RGB")
with Image.open(face_path) as source:
    source.load()
    face = source.convert("RGB")

crop = (720, 40, 2080, 1400)
if min(face.size) < 1254:
    raise ValueError("Facial edit is smaller than the established sprite framing")
scale = 1254 / 1360
size = tuple(round(value * scale) for value in body.size)
base = body.resize(size, Image.Resampling.LANCZOS)
x, y = round(crop[0] * scale), round(crop[1] * scale)
patch_size = (round((crop[2] - crop[0]) * scale), round((crop[3] - crop[1]) * scale))
if face.size != patch_size:
    face = face.resize(patch_size, Image.Resampling.LANCZOS)

# Blend only the outside of the rectangular crop, away from the face itself.
mask = Image.new("L", patch_size)
ImageDraw.Draw(mask).rectangle((18, 18, patch_size[0] - 19, patch_size[1] - 19), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(6))
bottom_blend = Image.new("L", (1, patch_size[1]), 255)
for row in range(patch_size[1] - 110, patch_size[1]):
    bottom_blend.putpixel((0, row), round(255 * (patch_size[1] - 1 - row) / 110))
mask = ImageChops.darker(mask, bottom_blend.resize(patch_size))
base.paste(face, (x, y), mask)
result = out_dir / f"fang-nuo-{args.expression}-integrated-v3.png"
base.save(result)
report = {
    "body": str(body_path), "facialEdit": str(face_path), "output": str(result),
    "width": base.width, "height": base.height, "bodyScale": scale,
    "originalFaceCrop": crop, "outputSha256": hashlib.sha256(result.read_bytes()).hexdigest(),
    "processing": "Native facial edit composited on downsampled original body; no image was upscaled; crop perimeter and lower clothing boundary blended away from face",
}
(out_dir / "assembly.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report))
