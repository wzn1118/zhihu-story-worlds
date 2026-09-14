"""Review-only full frames and 1:1 detail windows; source pixels stay untouched."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
folder = root / 'output/imagegen/scene-production/formal-production-20260907'
ids = sys.argv[1:]
out_name = next((value.split('=', 1)[1] for value in ids if value.startswith('--out=')), 'inspection-20260910')
ids = [value for value in ids if not value.startswith('--out=')]
assert Path(out_name).name == out_name
if not ids:
    ids = json.loads((folder / 'supervisor-state.json').read_text(encoding='utf-8'))['lastDispatchJobIds']
state = json.loads((folder / 'state.json').read_text(encoding='utf-8'))
by_id = {row['jobId']: row for row in state['jobs'] if row.get('jobId')}
out = folder / out_name
out.mkdir(exist_ok=True)
rows = []
for job_id in ids:
    row = by_id[job_id]
    asset = row['job']['asset']
    source = root / 'public' / asset['url'].lstrip('/')
    data = source.read_bytes()
    assert hashlib.sha256(data).hexdigest() == asset['sha256'] and len(data) == asset['bytes']
    with Image.open(source) as picture:
        picture.load()
        w, h = picture.size
        assert [w, h] == [asset['width'], asset['height']]
        full = out / f'{job_id}.full.jpg'
        view = picture.convert('RGB')
        view.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
        view.save(full, quality=92)
        detail_w, detail_h = min(w, 896), min(h, 896)
        x, y = max(0, (w-detail_w)//2), max(0, min(h-detail_h, int(h*.10)))
        box = (x, y, x+detail_w, y+detail_h)
        detail = out / f'{job_id}.detail.png'
        picture.crop(box).save(detail)
    rows.append({k: row[k] for k in ['jobId', 'worldId', 'nodeId', 'owner', 'kind', 'prompt', 'sourceFacts']} | {
        'sha256': asset['sha256'], 'dimensions': [w, h], 'original': str(source),
        'fullFrame': str(full), 'nativeDetail': str(detail), 'detailBox': list(box),
        'originalModified': False, 'nativeDetailResized': False, 'productionCount': 0})
(out / 'selection.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
for lane in range(3):
    (out / f'lane-{lane+1}.json').write_text(json.dumps(rows[lane::3], ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'inspectedFiles': len(rows), 'lanes': [len(rows[n::3]) for n in range(3)], 'pack': str(out)}))
