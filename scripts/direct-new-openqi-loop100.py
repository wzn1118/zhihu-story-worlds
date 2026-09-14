import json, shutil, subprocess, sys, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'output/imagegen/scene-production/.private'
OUT = ROOT / 'output/coordination/art-remake-12h-20260912/full64-direct'
seen_file = OUT / 'direct-new-openqi-seen.json'
seen = set(json.loads(seen_file.read_text(encoding='utf-8')) if seen_file.exists() else [])
state = json.loads((PRIVATE / 'state.json').read_text(encoding='utf-8'))
jobs = [j for b in state['batches'] for j in b.get('jobs', [])]
eligible = [j for j in jobs if j.get('state') in {'resolution_mismatch', 'queued', 'failed', 'unknown_outcome', 'recoverable'} and not j.get('stale') and j['id'] not in seen and (j.get('state') == 'resolution_mismatch' or not j.get('asset'))]
selected = eligible[:100]
prepared = []
stamp = int(time.time())
for n, job in enumerate(selected, 1):
    src = PRIVATE / 'jobs' / job['id']
    dst = PRIVATE / 'jobs' / f'direct_loop100_{stamp}_{n}_{job["id"]}'
    if not (src / 'prompt.txt').is_file() or not (src / 'request.json').is_file():
        seen.add(job['id']); continue
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns('paid-attempt.lock', 'result.json', 'delivery', 'archive', '*.tmp'))
    spec = json.loads((dst / 'request.json').read_text(encoding='utf-8'))
    spec['requested'] = {'aspectRatio': '16:9', 'resolution': '4K', 'quality': 'high'}
    (dst / 'request.json').write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    prepared.append({'sourceJobId': job['id'], 'newJobId': dst.name, 'dir': str(dst)})

def run(row):
    p = subprocess.run([sys.executable, str(ROOT / 'scripts/art-production-client.py'), 'generate', row['dir']], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
    try: result = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception: result = {'state': 'unknown_outcome', 'errorCode': 'UNPARSEABLE_CLIENT_OUTPUT'}
    return {**row, 'returncode': p.returncode, 'result': result}

results = []
with ThreadPoolExecutor(max_workers=min(4, max(1, len(prepared)))) as pool:
    for f in as_completed([pool.submit(run, row) for row in prepared]): results.append(f.result())
seen.update(r['sourceJobId'] for r in prepared)
seen_file.parent.mkdir(parents=True, exist_ok=True)
seen_file.write_text(json.dumps(sorted(seen), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
receipt = {'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'requested': 100, 'eligibleBeforeLocks': len(eligible), 'prepared': len(prepared), 'results': results, 'remainingEligibleEstimate': max(0, len(eligible)-len(selected)), 'noResend': True}
path = OUT / f'direct-loop100-{stamp}.json'; path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'receipt': str(path), 'prepared': len(prepared), 'remainingEligibleEstimate': receipt['remainingEligibleEstimate'], 'states': {s: sum(1 for r in results if r['result'].get('state') == s) for s in sorted({r['result'].get('state') for r in results})}}, ensure_ascii=False))
