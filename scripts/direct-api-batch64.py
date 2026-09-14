import json, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'output/imagegen/scene-production/.private'
OUT = ROOT / 'output/coordination/art-remake-12h-20260912/full64-direct/direct-api-batch64.json'
CLIENT = ROOT / 'scripts/art-production-client.py'

state = json.loads((PRIVATE / 'state.json').read_text(encoding='utf-8'))
jobs = [j for b in state['batches'] for j in b.get('jobs', [])]
selected = []
for j in jobs:
    if j.get('stale') or j.get('asset') or j.get('paidAttempts', 0) != 0:
        continue
    if j.get('state') != 'queued' or j.get('errorCode') in {'UNKNOWN_OUTCOME', 'RECOVERABLE'}:
        continue
    d = PRIVATE / 'jobs' / j['id']
    if (d / 'paid-attempt.lock').exists() or not (d / 'request.json').is_file() or not (d / 'prompt.txt').is_file():
        continue
    selected.append(j)
selected = selected[:64]

def send(j):
    d = PRIVATE / 'jobs' / j['id']
    try:
        p = subprocess.run([sys.executable, str(CLIENT), 'generate', str(d)], cwd=ROOT,
                           capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
        result = json.loads(p.stdout.strip().splitlines()[-1]) if p.stdout.strip() else {}
        return {'jobId': j['id'], 'returncode': p.returncode, 'state': result.get('state'), 'errorCode': result.get('errorCode'), 'result': str(d / 'result.json')}
    except Exception as e:
        return {'jobId': j['id'], 'state': 'unknown_outcome', 'errorCode': type(e).__name__}

results = []
with ThreadPoolExecutor(max_workers=64) as pool:
    futures = [pool.submit(send, j) for j in selected]
    for f in as_completed(futures): results.append(f.result())
receipt = {'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'requested': 64,
           'selected': len(selected), 'results': results,
           'submitted': sum(1 for r in results if r.get('state') in {'generated','recoverable','unknown_outcome'}),
           'referenceSource': 'job request.json references', 'noSubstituteImages': True}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'selected': len(selected), 'receipt': str(OUT), 'results': results}, ensure_ascii=False))
