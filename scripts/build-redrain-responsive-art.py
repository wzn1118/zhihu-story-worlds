#!/usr/bin/env python3
"""Build responsive WebP delivery copies from reviewed RedRain original artwork.

Original art and live JavaScript are read only. Only new content-hashed WebP files
are written under public/assets/optimized. Publishing the staged manifest is an
explicit, separate deployment step. Pillow with WebP support is required; AVIF is
benchmarked when available, but is never included in the delivery manifest.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
import json
import math
import os
from pathlib import Path
import re
import time

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat, features


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASSET_LITERAL = re.compile(r'''["'](\./public/assets/[^"']+\.(?:png|jpe?g|webp))["']''')
BENCHMARK_SOURCES = [
    f"./public/assets/v6/retro-anime/{chapter}/{kind}.png"
    for chapter in ("d08", "d01", "d42")
    for kind in ("portrait-main", "background")
]


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_bytes(data)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def json_write(path: Path, data: object) -> None:
    atomic_write(path, (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode())


def reviewed_sources(game_dir: Path) -> list[str]:
    sources: set[str] = set()
    for name in ("retro-assets.js", "bad-end-art.js"):
        sources.update(ASSET_LITERAL.findall((game_dir / "src" / name).read_text(encoding="utf-8")))
    if not sources:
        raise ValueError("No reviewed artwork was found")
    return sorted(sources)


def resolve_asset(game_dir: Path, url: str) -> Path:
    path = (game_dir / url.removeprefix("./")).resolve()
    if not path.is_relative_to((game_dir / "public/assets").resolve()):
        raise ValueError(f"Asset is outside the game asset directory: {url}")
    return path


def load_full_size_map(game_dir: Path) -> dict[str, str]:
    module = (game_dir / "src/optimized-assets.js").read_text(encoding="utf-8")
    marker = "export const OPTIMIZED_ASSETS = Object.freeze("
    if marker not in module:
        raise ValueError("Cannot find the previously verified full-size WebP manifest")
    mapping, _ = json.JSONDecoder().raw_decode(module.split(marker, 1)[1].lstrip())
    if not isinstance(mapping, dict):
        raise ValueError("Full-size WebP manifest is not an object")
    return mapping


def normalize(image: Image.Image) -> Image.Image:
    if image.mode in ("RGB", "RGBA"):
        return image.copy()
    return image.convert("RGBA" if image.has_transparency_data else "RGB")


def resized(image: Image.Image, width: int) -> Image.Image:
    if width >= image.width:
        return image.copy()
    height = max(1, round(image.height * width / image.width))
    # Pillow resizes RGBA through premultiplied RGBa internally. Filtering the
    # alpha with the color avoids dark/colored fringes on translucent hair.
    return image.resize((width, height), Image.Resampling.LANCZOS, reducing_gap=3.0)


def encode(image: Image.Image, fmt: str, quality: int, method: int = 6) -> tuple[bytes, float]:
    options = {"quality": quality}
    if fmt == "WEBP":
        options.update(method=method, exact=True)
    elif fmt == "AVIF":
        options.update(speed=6, subsampling="4:4:4", max_threads=2)
    else:
        raise ValueError(fmt)
    if image.info.get("icc_profile"):
        options["icc_profile"] = image.info["icc_profile"]
    buffer = BytesIO()
    start = time.perf_counter()
    image.save(buffer, fmt, **options)
    return buffer.getvalue(), round((time.perf_counter() - start) * 1000, 3)


def check_alpha(reference: Image.Image, decoded: Image.Image) -> dict:
    if "A" not in reference.getbands():
        opaque = "A" not in decoded.getbands() or decoded.getchannel("A").getextrema() == (255, 255)
        return {"hasAlpha": False, "alphaExact": opaque, "alphaMaximumError": 0 if opaque else None}
    a = reference.getchannel("A")
    b = decoded.convert("RGBA").getchannel("A")
    difference = ImageChops.difference(a, b)
    return {"hasAlpha": True, "alphaExact": not difference.getbbox(), "alphaMaximumError": difference.getextrema()[1]}


def composite(image: Image.Image, background: int) -> Image.Image:
    rgba = image.convert("RGBA")
    base = Image.new("RGBA", rgba.size, (background, background, background, 255))
    return Image.alpha_composite(base, rgba).convert("RGB")


def psnr(reference: Image.Image, candidate: Image.Image) -> float | None:
    difference = ImageChops.difference(reference, candidate)
    stats = ImageStat.Stat(difference)
    mse = sum(stats.sum2) / (reference.width * reference.height * len(reference.getbands()))
    return round(10 * math.log10(255 * 255 / mse), 4) if mse else None


def quality_metrics(reference: Image.Image, decoded: Image.Image) -> dict:
    return {
        "psnrDarkDb": psnr(composite(reference, 18), composite(decoded, 18)),
        "psnrLightDb": psnr(composite(reference, 238), composite(decoded, 238)),
        **check_alpha(reference, decoded),
    }


def benchmark_one(game_directory: str, output_directory: str, source_url: str) -> dict:
    game_dir = Path(game_directory)
    source = resolve_asset(game_dir, source_url)
    raw = source.read_bytes()
    original_sha = sha256(raw).hexdigest()
    with Image.open(BytesIO(raw)) as input_image:
        original = normalize(input_image)
    review_dir = Path(output_directory) / "codec-review" / f"{source.parent.name}-{source.stem}"
    variants = []
    tests = [("WEBP", 86, original.width), ("WEBP", 86, 768), ("WEBP", 86, 512)]
    if features.check("avif"):
        tests.extend([("AVIF", 85, original.width), ("AVIF", 85, 768)])
    review_images = []
    for fmt, quality, width in tests:
        reference = resized(original, width)
        encoded, elapsed_ms = encode(reference, fmt, quality)
        file = review_dir / f"{reference.width}-q{quality}.{fmt.lower()}"
        atomic_write(file, encoded)
        decode_start = time.perf_counter()
        with Image.open(BytesIO(encoded)) as decoded_image:
            decoded = normalize(decoded_image)
            decoded.load()
        decode_ms = round((time.perf_counter() - decode_start) * 1000, 3)
        metrics = quality_metrics(reference, decoded)
        # At 512 physical pixels every codec is compared with an original PNG
        # rendered at that same size. This avoids rewarding a smaller image just
        # because it has fewer pixels, while retaining separate native metrics.
        display_width = min(512, original.width)
        display_reference = resized(original, display_width)
        display_decoded = resized(decoded, display_width)
        display_metrics = quality_metrics(display_reference, display_decoded)
        variant = {
            "format": fmt.lower(), "quality": quality, "width": reference.width,
            "height": reference.height, "bytes": len(encoded), "encodeMs": elapsed_ms,
            "decodeMs": decode_ms, "method": 6 if fmt == "WEBP" else None,
            "subsampling": "4:4:4" if fmt == "AVIF" else "codec default",
            "nativeQuality": metrics,
            "rendered512Quality": display_metrics,
            "reviewFile": str(file),
        }
        variants.append(variant)
        review_images.append((variant, display_decoded))
    if sha256(source.read_bytes()).hexdigest() != original_sha:
        raise ValueError(f"Original changed during benchmark: {source_url}")
    make_review_sheet(original, review_images, review_dir / "comparison.png")
    return {"source": source_url, "originalBytes": len(raw), "width": original.width,
            "height": original.height, "originalSha256": original_sha, "variants": variants,
            "reviewSheet": str(review_dir / "comparison.png")}


def make_review_sheet(original: Image.Image, variants: list, output: Path) -> None:
    width = min(512, original.width)
    reference = resized(original, width)
    tile_width = width
    tile_height = reference.height + 74
    labels = [("Original PNG / display 512", reference)] + [
        (f"{v['format'].upper()} {v['width']} q{v['quality']} / {v['bytes']:,} B", im)
        for v, im in variants
    ]
    columns = 3
    sheet = Image.new("RGB", (columns * tile_width, math.ceil(len(labels) / columns) * tile_height), (18, 18, 18))
    draw = ImageDraw.Draw(sheet)
    font_file = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    font = ImageFont.truetype(str(font_file), 18) if font_file.exists() else ImageFont.load_default(size=18)
    for i, (label, img) in enumerate(labels):
        left = (i % columns) * tile_width
        top = (i // columns) * tile_height
        draw.text((left + 10, top + 10), label, fill=(240, 240, 240), font=font)
        draw.text((left + 10, top + 37), "Dark left / light right; same display size", fill=(170, 170, 170), font=font)
        dark = composite(img, 18)
        light = composite(img, 238)
        dark.paste(light.crop((width // 2, 0, width, img.height)), (width // 2, 0))
        sheet.paste(dark, (left, top + 74))
    buffer = BytesIO()
    sheet.save(buffer, "PNG")
    atomic_write(output, buffer.getvalue())


def build_one(game_directory: str, source_url: str, full_url: str, widths: tuple[int, ...], quality: int) -> dict:
    game_dir = Path(game_directory)
    source = resolve_asset(game_dir, source_url)
    raw = source.read_bytes()
    original_digest = sha256(raw).hexdigest()
    with Image.open(BytesIO(raw)) as input_image:
        original = normalize(input_image)
    full_path = resolve_asset(game_dir, full_url)
    full_raw = full_path.read_bytes()
    with Image.open(BytesIO(full_raw)) as full_image:
        full_image.load()
        if full_image.size != original.size or not check_alpha(original, full_image)["alphaExact"]:
            raise ValueError(f"Previously optimized full-size asset failed validation: {full_url}")
    variants = [{"url": full_url, "width": original.width, "height": original.height,
                 "bytes": len(full_raw), "format": "webp"}]
    generated = []
    for width in widths:
        if width >= original.width:
            continue
        resized_start = time.perf_counter()
        reference = resized(original, width)
        resize_ms = round((time.perf_counter() - resized_start) * 1000, 3)
        encoded, encode_ms = encode(reference, "WEBP", quality)
        with Image.open(BytesIO(encoded)) as decoded:
            decoded.load()
            if decoded.size != reference.size:
                raise ValueError(f"Variant dimensions changed: {source_url}/{width}")
            alpha = check_alpha(reference, decoded)
            if not alpha["alphaExact"]:
                raise ValueError(f"Resized alpha was modified by the WebP encoder: {source_url}/{width}")
        digest = sha256(encoded).hexdigest()
        filename = f"{source.stem}.w{width}.{digest[:16]}.webp"
        path = (game_dir / "public/assets/optimized" / filename).resolve()
        if path.exists():
            if path.read_bytes() != encoded:
                raise ValueError(f"Content hash collision: {filename}")
        else:
            atomic_write(path, encoded)
        entry = {"url": f"./public/assets/optimized/{filename}", "width": reference.width,
                 "height": reference.height, "bytes": len(encoded), "format": "webp"}
        variants.append(entry)
        generated.append({**entry, "sha256": digest, "resizeMs": resize_ms,
                          "encodeMs": encode_ms, **alpha})
    if sha256(source.read_bytes()).hexdigest() != original_digest:
        raise ValueError(f"Original changed during build: {source_url}")
    return {"source": source_url, "sourceSha256": original_digest, "originalBytes": len(raw),
            "fullSizeBytes": len(full_raw), "width": original.width, "height": original.height,
            "sourceMode": original.mode, "originalUnchanged": True,
            "variants": sorted(variants, key=lambda x: x["width"]), "generated": generated}


def module_source(files: list[dict]) -> str:
    mapping = {item["source"]: item["variants"] for item in files}
    return (
        "// Generated by scripts/build-redrain-responsive-art.py from reviewed original PNGs.\n"
        "// Delivery copies use alpha-aware Lanczos resizing and WebP q86; original art remains available.\n"
        "export const RESPONSIVE_ASSETS = Object.freeze("
        + json.dumps(mapping, ensure_ascii=False, separators=(",", ":"))
        + ");\n"
    )


def run_benchmark(args: argparse.Namespace) -> None:
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "pillowVersion": Image.__version__, "webpVersion": features.version("webp"),
        "avifVersion": features.version("avif") if features.check("avif") else None,
        "methodology": "WebP quality 86/method 6; AVIF quality 85/speed 6/4:4:4/two threads. Lanczos resize uses Pillow premultiplied-alpha filtering. Encodings are independent from the source PNG, not transcoded from earlier WebP. Timings are single cold encodes and decodes on this build host, not browser performance.",
        "qualityLimitations": "PSNR is a pixel error metric, not a guarantee of perceptual equivalence. Native metrics compare to the source resized to matching dimensions. Rendered512 metrics compare every encoding to the original PNG at the same 512 pixel display width. null PSNR denotes exact pixels. Alpha exactness for resized variants means exact against the resized alpha, not the original higher-resolution alpha. Dark/light composite review sheets require visual review.",
        "sources": ["https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html", "https://pillow.readthedocs.io/en/stable/handbook/concepts.html#filters"],
        "files": [],
    }
    for source in BENCHMARK_SOURCES:
        result = benchmark_one(str(args.game_dir), str(args.output_dir), source)
        report["files"].append(result)
        json_write(args.output_dir / "codec-benchmark.json", report)
        print(json.dumps({"benchmark": source, "variants": [{k: v[k] for k in ("format", "width", "bytes", "encodeMs")} for v in result["variants"]]}), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-dir", type=Path, default=PROJECT_ROOT / "public/games/redrain")
    parser.add_argument("--output-dir", type=Path, default=PROJECT_ROOT / "output/redrain-performance-v2")
    parser.add_argument("--widths", type=int, nargs="+", default=[512, 768])
    parser.add_argument("--quality", type=int, default=86, choices=range(1, 101), metavar="1..100")
    parser.add_argument("--workers", type=int, default=min(3, os.cpu_count() or 1))
    parser.add_argument("--benchmark-only", action="store_true")
    parser.add_argument("--skip-benchmark", action="store_true")
    args = parser.parse_args()
    if not features.check("webp"):
        parser.error("Pillow needs WebP support")
    if args.workers < 1 or any(width < 1 for width in args.widths):
        parser.error("workers and widths must be positive")
    if args.benchmark_only and args.skip_benchmark:
        parser.error("--benchmark-only and --skip-benchmark are mutually exclusive")
    args.game_dir = args.game_dir.resolve()
    args.output_dir = args.output_dir.resolve()
    if not args.skip_benchmark:
        run_benchmark(args)
    if args.benchmark_only:
        return
    sources = reviewed_sources(args.game_dir)
    full_size = load_full_size_map(args.game_dir)
    missing = set(sources) - full_size.keys()
    if missing:
        raise ValueError(f"Reviewed assets are missing from verified full-size mapping: {sorted(missing)}")
    files = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        tasks = [pool.submit(build_one, str(args.game_dir), source, full_size[source], tuple(sorted(set(args.widths))), args.quality) for source in sources]
        for task in as_completed(tasks):
            files.append(task.result())
            if len(files) % 10 == 0 or len(files) == len(sources):
                print(json.dumps({"built": len(files), "total": len(sources)}), flush=True)
    files.sort(key=lambda x: x["source"])
    tiers = {}
    for width in sorted(set(args.widths)):
        selected = [next((variant for variant in item["variants"] if variant["width"] >= width), item["variants"][-1]) for item in files]
        tiers[str(width)] = {"bytes": sum(v["bytes"] for v in selected), "decodedRgbaBytes": sum(v["width"] * v["height"] * 4 for v in selected)}
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(), "assets": len(files),
        "pillowVersion": Image.__version__, "widths": sorted(set(args.widths)),
        "quality": args.quality, "method": 6, "resampler": "premultiplied-alpha Lanczos",
        "originalBytes": sum(f["originalBytes"] for f in files),
        "fullSizeWebpBytes": sum(f["fullSizeBytes"] for f in files),
        "fullSizeDecodedRgbaBytes": sum(f["width"] * f["height"] * 4 for f in files),
        "tiers": tiers, "generatedVariants": sum(len(f["generated"]) for f in files),
        "alphaVariantsVerified": sum(v["hasAlpha"] for f in files for v in f["generated"]),
        "originalsUnchanged": all(f["originalUnchanged"] for f in files), "files": files,
    }
    json_write(args.output_dir / "responsive-assets-report.json", report)
    atomic_write(args.output_dir / "staging/src/responsive-assets.js", module_source(files).encode())
    print(json.dumps({k: v for k, v in report.items() if k != "files"}), flush=True)


if __name__ == "__main__":
    main()
