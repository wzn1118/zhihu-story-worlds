"""Generate a small controlled prompt-weight comparison with the private client."""

import concurrent.futures
import hashlib
import importlib.util
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "output/imagegen/scene-production/style-repeat-20260907-1642"
PRIVATE = ROOT / "output/imagegen/scene-production/.private"
PLAN = json.loads((FOLDER / "plan.json").read_text(encoding="utf-8"))
spec = importlib.util.spec_from_file_location("art_client_repeat", ROOT / "scripts/art-production-client.py")
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def prepare():
    if len(PLAN["jobs"]) != PLAN["maximumPaidRequests"]:
        raise ValueError("REPEAT_PLAN_COUNT_INVALID")
    rows = []
    for item in PLAN["jobs"]:
        prompt = "，".join(["吸血鬼猎人D画风"] * item["styleRepeats"]) + "，" + PLAN["basePrompt"]
        references = []
        for filename in PLAN["references"]:
            source = Path(filename)
            with Image.open(source) as image:
                image.verify()
            references.append({"path": filename, "sha256": digest(source.read_bytes())})
        identity = json.dumps({"study": PLAN["id"], "name": item["name"], "prompt": prompt,
                               "referenceHashes": references}, ensure_ascii=False, sort_keys=True)
        job_id = "scene_" + digest(identity.encode("utf-8"))[:28]
        directory = PRIVATE / "jobs" / job_id
        directory.mkdir(parents=True, exist_ok=True)
        request = {"prompt": prompt, "references": PLAN["references"],
                   "requested": {"aspectRatio": item["aspectRatio"], "resolution": "4K"}}
        request_path = directory / "request.json"
        if request_path.exists() and json.loads(request_path.read_text(encoding="utf-8")) != request:
            raise ValueError("REPEAT_REQUEST_CHANGED")
        if not request_path.exists():
            client.atomic_json(request_path, request)
            (directory / "prompt.txt").write_text(prompt, encoding="utf-8")
        rows.append({**item, "id": job_id, "prompt": prompt,
                     "referenceHashes": [ref["sha256"] for ref in references]})
    return rows


def execute(row):
    directory = PRIVATE / "jobs" / row["id"]
    receipt_path = FOLDER / (row["name"] + ".json")
    if receipt_path.exists():
        return json.loads(receipt_path.read_text(encoding="utf-8"))
    result_path = directory / "result.json"
    if (directory / "paid-attempt.lock").exists():
        result = json.loads(result_path.read_text(encoding="utf-8")) if result_path.exists() else {
            "state": "unknown_outcome", "errorCode": "REPEAT_EXISTING_INVOCATION_UNSETTLED"}
    else:
        result = client.run("generate", directory)
        client.atomic_json(result_path, result)
    safe = {"id": row["id"], "name": row["name"], "styleRepeats": row["styleRepeats"],
            "prompt": row["prompt"], "referenceHashes": row["referenceHashes"], "at": now(),
            "state": result["state"], "errorCode": result.get("errorCode"), "review": "pending"}
    if result.get("file"):
        source = Path(result["file"]).resolve()
        if not source.is_relative_to(directory.resolve()):
            raise ValueError("REPEAT_DELIVERY_OUTSIDE_JOB")
        binary = source.read_bytes()
        if digest(binary) != result["sha256"] or len(binary) != result["bytes"]:
            raise ValueError("REPEAT_DELIVERY_HASH_MISMATCH")
        with Image.open(source) as image:
            image.load()
            width, height = image.size
            if image.format != "PNG" or (width, height) != (result["width"], result["height"]):
                raise ValueError("REPEAT_DELIVERY_DIMENSION_MISMATCH")
        target = ROOT / "public/generated-art" / (row["id"] + ".png")
        shutil.copyfile(source, target)
        if digest(target.read_bytes()) != result["sha256"]:
            raise ValueError("REPEAT_PUBLIC_COPY_MISMATCH")
        safe["asset"] = {"url": "/generated-art/" + target.name, "width": width, "height": height,
                         "bytes": len(binary), "sha256": result["sha256"], "resampled": False}
    client.atomic_json(receipt_path, safe)
    print(json.dumps(safe, ensure_ascii=True), flush=True)
    return safe


def main():
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
    results = []
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=PLAN["maximumConcurrency"]) as pool:
            for index in range(0, len(rows), PLAN["maximumConcurrency"]):
                wave = list(pool.map(execute, rows[index:index + PLAN["maximumConcurrency"]]))
                results.extend(wave)
                if any(row.get("errorCode") for row in wave):
                    break
        client.atomic_json(FOLDER / "results.json", {"at": now(), "study": PLAN["id"], "jobs": results,
            "delivered": sum("asset" in row for row in results), "reviewed": 0,
            "paidResubmissions": 0})
    finally:
        lock.unlink()


if __name__ == "__main__":
    main()
