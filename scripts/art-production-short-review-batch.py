"""Prepare or record one bounded current-art visual-review batch."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FORMAL = ROOT / 'output/imagegen/scene-production/formal-production-20260907'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def complete(sidecar, job):
    return sidecar and sidecar.get('jobId') == job['id'] and sidecar.get('sha256') == job['asset']['sha256'] \
        and sidecar.get('decision') in ('approved', 'rejected') \
        and all(sidecar.get(key) is True for key in ('fullImageViewed', 'nativeDetailViewed', 'styleReviewed'))

def load_sidecar(job):
    path = FORMAL / 'reviews' / f"{job['id']}.json"
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'))
    except FileNotFoundError:
        return None

def candidates():
    state = json.loads((FORMAL / 'state.json').read_text(encoding='utf-8'))
    seen = set()
    rows = []
    for row in state['jobs']:
        job = row.get('job')
        if not job or job.get('stale') or not job.get('asset') or job['id'] in seen:
            continue
        seen.add(job['id'])
        if complete(load_sidecar(job), job):
            continue
        asset = job['asset']
        original = ROOT / 'public' / asset['url'].lstrip('/')
        if not original.exists() or digest(original) != asset['sha256']:
            continue
        rows.append({'jobId': job['id'], 'worldId': row['worldId'], 'nodeId': row['nodeId'],
                     'kind': row.get('kind', 'scene'), 'prompt': row.get('prompt', ''),
                     'asset': asset, 'originalPath': str(original)})
    # Diverse worlds avoid spending the small batch on variants of one illustration.
    selected, worlds = [], set()
    for row in sorted(rows, key=lambda entry: (entry['kind'] != 'scene', entry['worldId'], entry['nodeId'])):
        if row['worldId'] in worlds:
            continue
        selected.append(row); worlds.add(row['worldId'])
        if len(selected) == 4:
            break
    return selected

def prepare(folder):
    folder.mkdir(parents=True, exist_ok=False)
    selected = candidates()
    if len(selected) != 4:
        raise RuntimeError(f'EXPECTED_FOUR_CURRENT_CANDIDATES:{len(selected)}')
    for row in selected:
        with Image.open(row['originalPath']) as image:
            image.load()
            if list(image.size) != [row['asset']['width'], row['asset']['height']]:
                raise RuntimeError('DIMENSION_MISMATCH')
            full = image.convert('RGB'); full.thumbnail((1600, 1200))
            full.save(folder / f"{row['jobId']}.full.jpg", quality=92)
            w, h = image.size; cw, ch = min(896, w), min(896, h)
            x, y = (w-cw)//2, max(0, min(h-ch, h//3-ch//2))
            image.crop((x, y, x+cw, y+ch)).save(folder / f"{row['jobId']}.detail.png")
            row['nativeCropBox'] = [x, y, x+cw, y+ch]
    (folder / 'selection.json').write_text(json.dumps(selected, ensure_ascii=False, indent=2), encoding='utf-8')
    return selected

def record(folder, decisions):
    selected = json.loads((folder / 'selection.json').read_text(encoding='utf-8'))
    by_id = {entry['jobId']: entry for entry in decisions}
    if set(by_id) != {row['jobId'] for row in selected}:
        raise RuntimeError('DECISIONS_DO_NOT_MATCH_SELECTION')
    reports = []
    for row in selected:
        decision = by_id[row['jobId']]
        if decision.get('decision') not in ('approved', 'rejected') or len(decision.get('notes', '')) < 30:
            raise RuntimeError('CONCRETE_VISUAL_DECISION_REQUIRED')
        original = Path(row['originalPath'])
        if digest(original) != row['asset']['sha256']:
            raise RuntimeError('ORIGINAL_CHANGED')
        target = FORMAL / 'reviews' / f"{row['jobId']}.json"
        prior = load_sidecar({'id': row['jobId'], 'asset': row['asset']})
        if complete(prior, {'id': row['jobId'], 'asset': row['asset']}):
            reports.append({'jobId': row['jobId'], 'decision': prior['decision'], 'preservedConcurrentReview': True})
            continue
        value = {'jobId': row['jobId'], 'sha256': row['asset']['sha256'], 'decision': decision['decision'],
                 'reviewer': 'root-short-batch-20260911', 'notes': decision['notes'],
                 'fullImageViewed': True, 'nativeDetailViewed': True, 'styleReviewed': True,
                 'styleBaseline': 'film-frames-20260907', 'at': datetime.now(timezone.utc).isoformat()}
        target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        reports.append(value)
    (folder / 'report.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
    return reports

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['prepare', 'record'])
parser.add_argument('--folder', required=True)
parser.add_argument('--decisions')
args = parser.parse_args()
folder = ROOT / args.folder
result = prepare(folder) if args.mode == 'prepare' else record(folder, json.loads((ROOT / args.decisions).read_text(encoding='utf-8')))
print(json.dumps({'count': len(result), 'folder': str(folder)}))
