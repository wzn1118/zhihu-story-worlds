import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
formal = root / 'output/imagegen/scene-production/formal-production-20260907'
folder = formal / 'resume-20260910-1450'
folder.mkdir(exist_ok=True)
rows, reviewed = [], []
for name in ['wave41-review-b1.json', 'wave41-review-b2.json', 'wave41-review-c.json']:
    for row in json.loads((formal / name).read_text(encoding='utf-8'))['rows']:
        filename = root / 'public' / row['asset']['url'].lstrip('/')
        assert hashlib.sha256(filename.read_bytes()).hexdigest() == row['asset']['sha256']
        sidecar = formal / 'reviews' / (row['jobId'] + '.json')
        prior = json.loads(sidecar.read_text(encoding='utf-8-sig')) if sidecar.exists() else {}
        if prior.get('sha256') == row['asset']['sha256'] and all(prior.get(key) is True for key in
                ['fullImageViewed', 'nativeDetailViewed', 'styleReviewed']) and prior.get('decision') in ['approved', 'rejected']:
            reviewed.append({'jobId': row['jobId'], 'decision': prior['decision']})
            continue
        with Image.open(filename) as original:
            original.load()
            assert list(original.size) == [row['asset']['width'], row['asset']['height']]
            preview = original.convert('RGB')
            preview.thumbnail((1600, 1200))
            full = folder / (row['jobId'] + '.full.jpg')
            preview.save(full, quality=92)
            w, h = original.size
            # Pixel-exact center detail supplements full viewing; reviewers may
            # create additional crops for faces not covered by this region.
            cw, ch = min(896, w), min(896, h)
            x, y = (w-cw)//2, max(0, min(h-ch, h//3-ch//2))
            detail = folder / (row['jobId'] + '.detail.png')
            original.crop((x, y, x+cw, y+ch)).save(detail)
        rows.append({**row, 'originalPath': str(filename), 'fullView': str(full),
                     'nativeDetail': str(detail), 'nativeCropBox': [x, y, x+cw, y+ch]})
report = {'at': datetime.now(timezone.utc).isoformat(), 'alreadyReviewed': reviewed, 'pending': rows}
(folder / 'inventory.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
for lane in range(3):
    assigned = rows[lane::3]
    (folder / f'lane-{lane+1}.json').write_text(json.dumps(assigned, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'alreadyReviewed': len(reviewed), 'pending': len(rows), 'lanes': [len(rows[i::3]) for i in range(3)], 'folder': str(folder)}))
