"""Remove a connected neutral sprite backdrop without repainting the character."""

import argparse
import hashlib
import json
from pathlib import Path
from statistics import median

from PIL import Image, ImageChops, ImageDraw, ImageFilter


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--tolerance", type=int, default=22)
    parser.add_argument("--seed", action="append", default=[], help="Extra background seed as normalized x,y")
    args = parser.parse_args()
    if not args.name.replace("-", "").isalnum():
        parser.error("name must contain letters, numbers or hyphens")
    source = Path(args.source).resolve(strict=True)
    destination = Path(args.out_dir).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        original.load()
        rgb = original.convert("RGB")
    width, height = rgb.size
    samples = [rgb.getpixel((x, y)) for x in (0, width - 1) for y in (0, height - 1)]
    background = tuple(int(median(pixel[channel] for pixel in samples)) for channel in range(3))
    if min(background) < 200 or max(background) - min(background) > 25:
        raise ValueError("Expected a light neutral backdrop; inspect this source manually")

    difference = ImageChops.difference(rgb, Image.new("RGB", rgb.size, background))
    channels = difference.split()
    distance = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
    connected = distance.point(lambda value: 255 if value <= args.tolerance else 0)
    seeds = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    for seed in args.seed:
        x, y = (float(value) for value in seed.split(","))
        if not 0 <= x < 1 or not 0 <= y < 1:
            raise ValueError("Seed coordinates must be in [0, 1)")
        seeds.append((int(x * width), int(y * height)))
    for seed in seeds:
        if connected.getpixel(seed) == 255:
            ImageDraw.floodfill(connected, seed, 128)
    alpha = connected.point(lambda value: 0 if value == 128 else 255)
    # Only the one-pixel silhouette boundary is softened; interior cel colors stay opaque.
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    softened = alpha.filter(ImageFilter.GaussianBlur(.45))
    alpha = ImageChops.darker(alpha, softened)
    sprite = rgb.convert("RGBA")
    sprite.putalpha(alpha)
    sprite_path = destination / f"{args.name}.png"
    sprite.save(sprite_path)

    preview = Image.new("RGB", (width * 2, height), "#f0f0f0")
    preview.paste(Image.new("RGB", rgb.size, "#393536"), (width, 0))
    preview.paste(rgb, (0, 0), alpha)
    preview.paste(rgb, (width, 0), alpha)
    preview_path = destination / f"{args.name}-edge-review.jpg"
    preview.thumbnail((1600, 1600))
    preview.save(preview_path, quality=94)
    histogram = alpha.histogram()
    report = {
        "source": str(source), "sprite": str(sprite_path), "edgeReview": str(preview_path),
        "width": width, "height": height, "backgroundRgb": background,
        "transparentPixels": histogram[0], "opaquePixels": histogram[255],
        "partialPixels": sum(histogram[1:255]), "extraSeeds": args.seed,
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "spriteSha256": hashlib.sha256(sprite_path.read_bytes()).hexdigest(),
        "processing": "Connected neutral backdrop removal; original RGB and dimensions retained; boundary alpha only",
    }
    (destination / f"{args.name}-cutout.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
