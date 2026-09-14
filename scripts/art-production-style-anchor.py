"""Generate a bounded style-anchor calibration using user references as style-only inputs."""

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
FOLDER = ROOT / "output/imagegen/scene-production/style-anchor-20260907-1718"
PRIVATE = ROOT / "output/imagegen/scene-production/.private"
PLAN = json.loads((FOLDER / "plan.json").read_text(encoding="utf-8"))
spec = importlib.util.spec_from_file_location("art_client_anchor", ROOT / "scripts/art-production-client.py")
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def now():
    return datetime.now(timezone.utc).isoformat()

def prepare():
    rows = []
    refs = PLAN["styleReferences"] + [PLAN["identityReference"]]
    ref_hashes = []
    for filename in refs:
        source = Path(filename)
        with Image.open(source) as image:
            image.verify()
        ref_hashes.append(sha(source.read_bytes()))
    for item in PLAN["jobs"]:
        identity = json.dumps({"study": PLAN["id"], **item, "refHashes": ref_hashes}, ensure_ascii=False, sort_keys=True)
        job_id = "scene_" + sha(identity.encode())[:28]
        directory = PRIVATE / "jobs" / job_id
        directory.mkdir(parents=True, exist_ok=True)
        request = {"prompt": item["prompt"], "references": refs,
                   "requested": {"aspectRatio": item["aspectRatio"], "resolution": "4K"}}
        request_path = directory / "request.json"
        if request_path.exists() and json.loads(request_path.read_text(encoding="utf-8")) != request:
            raise ValueError("ANCHOR_REQUEST_CHANGED")
        if not request_path.exists():
            client.atomic_json(request_path, request)
            (directory / "prompt.txt").write_text(item["prompt"], encoding="utf-8")
        rows.append({**item, "id": job_id, "referenceHashes": ref_hashes})
    return rows

def execute(row):
    directory = PRIVATE / "jobs" / row["id"]
    receipt = FOLDER / (row["name"] + ".json")
    if receipt.exists():
        return json.loads(receipt.read_text(encoding="utf-8"))
    result_path = directory / "result.json"
    if (directory / "paid-attempt.lock").exists():
        result = json.loads(result_path.read_text(encoding="utf-8")) if result_path.exists() else {"state": "unknown_outcome", "errorCode": "ANCHOR_EXISTING_INVOCATION_UNSETTLED"}
    else:
        result = client.run("generate", directory)
        client.atomic_json(result_path, result)
    safe = {"id": row["id"], "name": row["name"], "prompt": row["prompt"], "referenceHashes": row["referenceHashes"], "at": now(), "state": result["state"], "errorCode": result.get("errorCode"), "review": "pending"}
    if result.get("file"):
        source = Path(result["file"]).resolve()
        if not source.is_relative_to(directory.resolve()):
            raise ValueError("ANCHOR_DELIVERY_OUTSIDE_JOB")
        data = source.read_bytes()
        if sha(data) != result["sha256"] or len(data) != result["bytes"]:
            raise ValueError("ANCHOR_DELIVERY_HASH_MISMATCH")
        with Image.open(source) as image:
            image.load()
            width, height = image.size
        target = ROOT / "public/generated-art" / (row["id"] + ".png")
        shutil.copyfile(source, target)
        if sha(target.read_bytes()) != result["sha256"]:
            raise ValueError("ANCHOR_PUBLIC_COPY_MISMATCH")
        safe["asset"] = {"url": "/generated-art/" + target.name, "width": width, "height": height, "bytes": len(data), "sha256": result["sha256"], "resampled": False}
    client.atomic_json(receipt, safe)
    print(json.dumps(safe, ensure_ascii=True), flush=True)
    return safe

def main():
    rows = prepare()
    client.atomic_json(FOLDER / "queue.json", {"at": now(), "study": PLAN["id"], "jobs": rows})
    if "--run" not in sys.argv:
        print(json.dumps({"prepared": len(rows), "paidRequests": 0})); return
    lock = FOLDER / "run.lock"
    with lock.open("x", encoding="ascii") as handle:
        handle.write(str(os.getpid()))
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(execute, rows))
        client.atomic_json(FOLDER / "results.json", {"at": now(), "study": PLAN["id"], "jobs": results, "delivered": sum("asset" in row for row in results), "reviewed": 0, "paidResubmissions": 0})
    finally:
        lock.unlink()

if __name__ == "__main__":
    main()
