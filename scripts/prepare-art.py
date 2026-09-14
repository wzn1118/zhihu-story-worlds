"""Create web delivery copies without changing the approved source artwork."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--out-dir", default="public/assets")
    args = parser.parse_args()
    if not args.name.replace("-", "").replace("_", "").isalnum():
        parser.error("name must contain only letters, numbers, hyphens, underscores")
    source = Path(args.source).resolve(strict=True)
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    destination = out_dir / f"{args.name}.webp"
    with Image.open(source) as image:
        image.load()
        size = image.size
        has_alpha = "A" in image.getbands() or "transparency" in image.info
        image.convert("RGBA" if has_alpha else "RGB").save(
            destination, "WEBP", quality=92, method=6, exact=has_alpha
        )
    with Image.open(destination) as delivered:
        delivered.load()
        if delivered.size != size:
            raise ValueError("Delivered artwork dimensions changed")
        if has_alpha and "A" not in delivered.getbands():
            raise ValueError("Delivered artwork lost its alpha channel")
    report = {
        "source": str(source),
        "destination": str(destination),
        "width": size[0],
        "height": size[1],
        "alphaPreserved": has_alpha,
        "bytes": destination.stat().st_size,
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "deliverySha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        "processing": "WebP encoding only; native dimensions and exposure preserved",
    }
    print(json.dumps(report, ensure_ascii=True))


if __name__ == "__main__":
    main()
