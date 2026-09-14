import json, shutil, subprocess, sys, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'output/imagegen/scene-production/.private'
OUT = ROOT / 'output/coordination/art-remake-12h-20260912/full64-direct/direct-new-openqi-batch-60.json'
state = json.loads((PRIVATE / 'state.json').read_text(encoding='utf-8'))
jobs = [j for b in state['batches'] for j in b.get('jobs', [])]
previous = ROOT / 'output/coordination/art-remake-12h-20260912/full64-direct/direct-new-openqi-batch.json'
sent_sources = set()
if previous.is_file():
    try: sent_sources = {r.get('sourceJobId') for r in json.loads(previous.read_text(encoding='utf-8')).get('results', [])}
    except Exception: pass
source = [j for j in jobs if j.get('state') == 'queued' and j.get('asset') is None and not j.get('stale')
          and j.get('paidAttempts', 0) == 0 and j.get('id') not in sent_sources]
source = [j for j in source if not (PRIVATE / 'jobs' / j['id'] / 'paid-attempt.lock').exists()][:60]
prepared = []
for n, job in enumerate(source, 1):
    src = PRIVATE / 'jobs' / job['id']
    dst = PRIVATE / 'jobs' / f"direct_new_{int(time.time())}_{n}_{job['id']}"
    if not (src / 'prompt.txt').is_file() or not (src / 'request.json').is_file():
        continue
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns('paid-attempt.lock', 'result.json', 'delivery', 'archive', '*.tmp'))
    prepared.append({'sourceJobId': job['id'], 'newJobId': dst.name, 'dir': str(dst)})

def run(row):
    p = subprocess.run([sys.executable, str(ROOT / 'scripts/art-production-client.py'), 'generate', row['dir']], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
    line = p.stdout.strip().splitlines()[-1] if p.stdout.strip() else '{}'
    try: result = json.loads(line)
    except Exception: result = {'state': 'unknown_outcome', 'rawTail': (p.stdout + p.stderr)[-500:]}
    return {**row, 'returncode': p.returncode, 'result': result}

results = []
with ThreadPoolExecutor(max_workers=len(prepared) or 1) as pool:
    futures = [pool.submit(run, row) for row in prepared]
    for f in as_completed(futures): results.append(f.result())
receipt = {'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'requested': 60, 'prepared': len(prepared), 'results': results, 'directNewJobIds': [r['newJobId'] for r in prepared], 'excludedPreviousSources': sorted(sent_sources), 'noRollback': True}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(receipt, ensure_ascii=False))
