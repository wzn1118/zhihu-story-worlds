"""Compose the reviewed separate character and background into the story cover."""

import hashlib
import json
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[1]
background = root / "output/imagegen/blue-training-room/blue-training-room-01.png"
character = root / "output/imagegen/fang-nuo-main-integrated-v3/fang-nuo-main.png"
destination = root / "output/imagegen/blue-blood-cover-v3"
destination.mkdir(parents=True, exist_ok=True)
with Image.open(background) as image:
    canvas = image.convert("RGBA")
with Image.open(character) as image:
    sprite = image.convert("RGBA")
height = 2500
sprite = sprite.resize((round(sprite.width * height / sprite.height), height), Image.Resampling.LANCZOS)
canvas.alpha_composite(sprite, (2200, 45))
output = destination / "blue-blood-cover-v3.png"
canvas.convert("RGB").save(output)
report = {
    "background": str(background), "character": str(character), "output": str(output),
    "width": canvas.width, "height": canvas.height,
    "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "processing": "Separate reviewed background and downscaled character composited; no upscaling or color filters",
}
(destination / "composition.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report))
