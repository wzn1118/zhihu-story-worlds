"""Freeze a safe, fully decoded production audit. Never reads credentials or recovery URLs."""
import datetime
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
production = root / 'output/imagegen/scene-production'
manifest = json.loads((production / 'manifest.json').read_text(encoding='utf-8'))
batches = manifest['batches']
files = []
for batch in batches:
    for job in batch['jobs']:
        asset = job.get('asset')
        if not asset:
            continue
        if not asset['url'].startswith('/generated-art/') or Path(asset['url']).name != job['id'] + '.png':
            raise ValueError('UNSAFE_ASSET_URL')
        filename = root / 'public/generated-art' / (job['id'] + '.png')
        binary = filename.read_bytes()
        with Image.open(filename) as image:
            image.load()
            width, height = image.size
        assert (width, height) == (asset['width'], asset['height'])
        assert len(binary) == asset['bytes']
        assert hashlib.sha256(binary).hexdigest() == asset['sha256']
        native = width >= 3840 and height >= 2160 and abs(width / height / (16 / 9) - 1) <= .005
        assert native == asset['native4k']
        files.append({'jobId': job['id'], 'worldId': job['worldId'], 'nodeId': job['nodeId'],
                      'stale': job['stale'], **asset, 'fullDecodeVerified': True,
                      'review': job.get('review')})

def total(field):
    return sum(batch['progress'].get(field, 0) for batch in batches)

audit = {
    'schemaVersion': 1, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'manifestSnapshotAt': manifest['updatedAt'],
    'totals': {'worlds': len(batches), 'currentSceneJobs': total('current'), 'queued': total('queued'),
               'requiredSceneImages': total('required'), 'sceneShortfall': total('sceneShortfall'),
               'paidAttempts': total('paidAttemptsTotal'), 'deliveredFiles': len(files),
               'deliveredSceneIdentities': len({(file['worldId'], file['nodeId']) for file in files}),
               'native4kFilesIncludingStale': sum(file['native4k'] for file in files),
               'visuallyReviewedFiles': sum(bool(file['review']) for file in files),
               'native4kCurrent': total('native4k'), 'approvedCurrentCoverage': total('covered'),
               'unknownOutcomesIncludingStale': total('unknownOutcomeTotal')},
    'files': files,
    'submittedJobs': [{'batchId': batch['id'], **{key: job.get(key) for key in (
        'id', 'nodeId', 'state', 'sourceHash', 'promptHash', 'referenceHash', 'stale', 'requested',
        'paidAttempts', 'recoveryAttempts', 'recoveryAvailable', 'errorCode', 'failureHistory')}}
        for batch in batches for job in batch['jobs'] if job['paidAttempts']],
    'worlds': [{'id': batch['worldId'], 'batchId': batch['id'], 'worldVersion': batch['worldVersion'],
                'state': batch['state'], 'progress': batch['progress']} for batch in batches],
    'limitations': [
        'First-set completion requires 30 distinct current approved native-4K scene identities; file variants are not extra scenes.',
        'Source synchronization continues without paid requests; queued jobs are not images.',
        'Only explicit manual review records count as inspected; no crop/upscale/collage counts as independent scene delivery.',
    ],
}
for job in audit['submittedJobs']:
    directory = production / '.private/jobs' / job['id']
    job['singleAttemptMarkerPresent'] = (directory / 'paid-attempt.lock').is_file()
    saved = []
    for recovery in (directory / 'archive').glob('**/*.recovery.json'):
        data = json.loads(recovery.read_text(encoding='utf-8'))
        saved.append({'savedResponse': bool(data.get('response')), 'status': data.get('status'),
                      'archivedImageCount': len(data.get('images', []))})
    job['recoveryEvidence'] = saved  # Only booleans/counts/state, never URLs or private paths.
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
target = production / f'run-{stamp}-art-audit.json'
target.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'audit': str(target), **audit['totals']}, ensure_ascii=False, indent=2))
