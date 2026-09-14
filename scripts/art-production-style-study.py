"""Run the bounded style comparison through the existing one-invocation client."""

import concurrent.futures
import hashlib
import importlib.util
import json
import os
import html
from pathlib import Path
import shutil
import sys
from datetime import datetime, timezone

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "output/imagegen/scene-production/style-repair-20260907-1530"
PRIVATE = ROOT / "output/imagegen/scene-production/.private"
PLAN = json.loads((FOLDER / "plan.json").read_text(encoding="utf-8"))
spec = importlib.util.spec_from_file_location("art_client", ROOT / "scripts/art-production-client.py")
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def prepare():
    if len(PLAN["jobs"]) > PLAN["maximumPaidRequests"] or len({row["name"] for row in PLAN["jobs"]}) != len(PLAN["jobs"]):
        raise ValueError("STUDY_BUDGET_OR_IDENTITY_INVALID")
    result = []
    for row in PLAN["jobs"]:
        references = []
        for filename in row["references"]:
            source = Path(filename)
            with Image.open(source) as image:
                image.verify()
            references.append({"path": filename, "sha256": digest(source.read_bytes())})
        identity = json.dumps({"study": PLAN["id"], **row, "referenceHashes": references}, ensure_ascii=False, sort_keys=True)
        job_id = "scene_" + digest(identity.encode("utf-8"))[:28]
        directory = PRIVATE / "jobs" / job_id
        directory.mkdir(parents=True, exist_ok=True)
        request = {"prompt": row["prompt"], "references": row["references"],
                   "requested": {"aspectRatio": row["aspectRatio"], "resolution": "4K"}}
        request_path = directory / "request.json"
        if request_path.exists():
            if json.loads(request_path.read_text(encoding="utf-8")) != request:
                raise ValueError("STUDY_REQUEST_CHANGED")
        else:
            client.atomic_json(request_path, request)
            (directory / "prompt.txt").write_text(row["prompt"], encoding="utf-8")
        result.append({**row, "id": job_id, "referenceHashes": [ref["sha256"] for ref in references]})
    return result


def execute(row):
    directory = PRIVATE / "jobs" / row["id"]
    result_path = directory / "result.json"
    receipt_path = FOLDER / (row["name"] + ".json")
    if receipt_path.exists():
        prior = json.loads(receipt_path.read_text(encoding="utf-8"))
        if prior["id"] != row["id"]:
            raise ValueError("STUDY_RECEIPT_IDENTITY_CHANGED")
        if prior.get("asset"):
            target = ROOT / "public/generated-art" / (row["id"] + ".png")
            if digest(target.read_bytes()) != prior["asset"]["sha256"]:
                raise ValueError("STUDY_EXISTING_ASSET_CHANGED")
        return prior
    if (directory / "paid-attempt.lock").exists():
        result = json.loads(result_path.read_text(encoding="utf-8")) if result_path.exists() else {
            "state": "unknown_outcome", "errorCode": "STUDY_EXISTING_INVOCATION_UNSETTLED"}
    else:
        result = client.run("generate", directory)
        client.atomic_json(result_path, result)
    safe = {"id": row["id"], "name": row["name"], "worldId": row["worldId"], "nodeId": row["nodeId"],
            "prompt": row["prompt"], "referenceHashes": row["referenceHashes"], "at": now(),
            "state": result["state"], "errorCode": result.get("errorCode"), "review": "pending"}
    if result.get("file"):
        source = Path(result["file"]).resolve()
        if not source.is_relative_to(directory.resolve()):
            raise ValueError("STUDY_DELIVERY_OUTSIDE_JOB")
        binary = source.read_bytes()
        if digest(binary) != result["sha256"] or len(binary) != result["bytes"]:
            raise ValueError("STUDY_DELIVERY_HASH_MISMATCH")
        with Image.open(source) as image:
            image.load()
            width, height = image.size
            if image.format != "PNG" or (width, height) != (result["width"], result["height"]):
                raise ValueError("STUDY_DELIVERY_DIMENSION_MISMATCH")
        target = ROOT / "public/generated-art" / (row["id"] + ".png")
        shutil.copyfile(source, target)
        if digest(target.read_bytes()) != result["sha256"]:
            raise ValueError("STUDY_PUBLIC_COPY_MISMATCH")
        safe["asset"] = {"url": "/generated-art/" + target.name, "width": width, "height": height,
                         "sha256": result["sha256"], "bytes": len(binary), "resampled": False}
    client.atomic_json(FOLDER / (row["name"] + ".json"), safe)
    print(json.dumps(safe, ensure_ascii=True), flush=True)
    return safe


def main():
    if "--report" in sys.argv:
        report()
        return
    rows = prepare()
    client.atomic_json(FOLDER / "queue.json", {"at": now(), "study": PLAN["id"], "jobs": rows})
    if "--run" not in sys.argv:
        print(json.dumps({"prepared": len(rows), "paidRequests": 0}))
        return
    manifest = json.loads((PRIVATE.parent / "manifest.json").read_text(encoding="utf-8"))
    if any(batch["state"] == "running" or any(job["state"] == "generating" for job in batch["jobs"])
           for batch in manifest["batches"]):
        raise ValueError("WAIT_FOR_TRANSMITTED_PRODUCTION_REQUESTS")
    lock = FOLDER / "run.lock"
    with lock.open("x", encoding="ascii") as handle:
        handle.write(str(os.getpid()))
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = []
            for index in range(0, len(rows), 2):
                wave = list(pool.map(execute, rows[index:index + 2]))
                results.extend(wave)
                if any(row.get("errorCode") for row in wave):
                    break
        client.atomic_json(FOLDER / "results.json", {"at": now(), "study": PLAN["id"], "jobs": results,
            "delivered": sum("asset" in row for row in results), "reviewed": 0,
            "paidResubmissions": 0, "productionAcceptance": False})
    finally:
        lock.unlink()


def report():
    results = json.loads((FOLDER / "results.json").read_text(encoding="utf-8"))
    review = json.loads((FOLDER / "review.json").read_text(encoding="utf-8"))
    before = FOLDER / "before-modern.png"
    source = Path("E:/UserData/Temp/codex-clipboard-be8c1200-c513-4f74-a560-e7ecb83f4627.png")
    if not before.exists():
        shutil.copyfile(source, before)
    if digest(before.read_bytes()) != "8d33b4a96cce189aa77900fee10296bf12f200075a39dddd21c76d6c2f6e2968":
        raise ValueError("STUDY_COMPARISON_SOURCE_CHANGED")
    cards = []
    order = review["recommended"] + [row["name"] for row in results["jobs"] if row["name"] not in review["recommended"]]
    labels = {"modern-dialogue-hardshape": "现代对话：连片硬影版", "empress-film-reference": "皇后：电影原帧分色版",
              "cave-style-and-content": "虎穴：画法与构图分开参考", "cave-film-reference": "虎穴：单参考试验",
              "cave-text": "虎穴：纯文字试验", "empress-approved-style": "皇后：旧样图参考试验",
              "modern-dialogue-film-reference": "现代对话：第一轮分色"}
    for name in order:
        row = next(row for row in results["jobs"] if row["name"] == name)
        asset = row["asset"]
        target = ROOT / "public/generated-art" / (row["id"] + ".png")
        if digest(target.read_bytes()) != asset["sha256"]:
            raise ValueError("STUDY_REPORT_ASSET_CHANGED")
        src = Path(os.path.relpath(target, FOLDER)).as_posix()
        evidence = review["jobs"][name]
        comparison = ""
        if name in review["recommended"]:
            original = "before-modern.png" if name.startswith("modern") else "../../../../public/generated-art/scene_90bc349d626a61953db282b1a1c0.png"
            comparison = f'<figure><img src="{original}" alt="重绘前"><figcaption>重绘前</figcaption></figure>'
        cards.append(f'<section><h2>{labels[name]}</h2><div class="images">{comparison}<figure><a href="{src}"><img src="{src}" alt="{labels[name]}"></a><figcaption>{asset["width"]} × {asset["height"]}</figcaption></figure></div><p>{html.escape(evidence["notes"])}</p><details><summary>Prompt</summary><p>{html.escape(row["prompt"])}</p><code>{asset["sha256"]}</code></details></section>')
    page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>赤页 · 风格重绘对照</title><style>body{margin:0;background:#18181a;color:#e9e9e9;font:14px system-ui;letter-spacing:0}header,section{padding:22px;max-width:1440px;margin:auto}section{border-top:1px solid #49494b}h1{font-size:24px}h2{font-size:18px}p{line-height:1.7;overflow-wrap:anywhere}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:16px}figure{margin:0;min-width:0}img{display:block;width:100%;height:560px;max-height:75vh;object-fit:contain;background:#222225}figcaption{padding:8px 0;color:#bbb}summary{cursor:pointer;color:#eab1bc}code{overflow-wrap:anywhere;font-size:11px}</style><header><h1>赤页 · 风格重绘对照</h1><p>7 张实图 · 7 张已看 · 2 张本轮建议对照 · 尚未标记用户确认</p></header>' + ''.join(cards) + '</html>'
    (FOLDER / "comparison.html").write_text(page, encoding="utf-8")
    client.atomic_json(FOLDER / "reviewed-results.json", {**results, "reviewed": review["reviewed"], "review": review})
    print(json.dumps({"verifiedFiles": len(results["jobs"]), "reviewed": review["reviewed"], "recommended": review["recommended"]}))


if __name__ == "__main__":
    main()
