"""Read-only public-asset inventory for a coordination handoff; no provider calls."""
import hashlib
import io
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path.cwd().resolve()
PRODUCTION = ROOT / 'output/imagegen/scene-production'
OUT = PRODUCTION / 'root-handoff-20260906'
manifest_bytes = (PRODUCTION / 'manifest.json').read_bytes()
manifest = json.loads(manifest_bytes)
def inventory_signature(document):
    all_jobs = [job for batch in document['batches'] for job in batch['jobs']]
    keys = ('id', 'worldId', 'nodeId', 'state', 'stale', 'paidAttempts', 'recoveryAttempts',
            'recoveryAvailable', 'errorCode', 'asset', 'review', 'sourceHash', 'promptHash', 'referenceHash')
    return {
        'batches': len(document['batches']), 'currentRequirements': sum(not job['stale'] for job in all_jobs),
        'attemptedOrDelivered': [{key: job.get(key) for key in keys} for job in all_jobs
                                if job.get('paidAttempts', 0) or job.get('asset')],
    }
batches = manifest['batches']
jobs = [job for batch in batches for job in batch['jobs']]
assets = []
for job in jobs:
    asset = job.get('asset')
    if not asset:
        continue
    assert re.fullmatch(r'scene_[0-9a-f]+', job['id'])
    url = f"/generated-art/{job['id']}.png"
    assert asset['url'] == url
    file = ROOT / 'public' / url.lstrip('/')
    data = file.read_bytes()
    with Image.open(io.BytesIO(data)) as probe:
        probe.verify()
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        width, height = image.size
        assert image.format == 'PNG'
    sha = hashlib.sha256(data).hexdigest()
    assert (sha, len(data), width, height) == (asset['sha256'], asset['bytes'], asset['width'], asset['height'])
    review = job.get('review') or {}
    assets.append({
        'jobId': job['id'], 'worldId': job['worldId'], 'nodeId': job['nodeId'],
        'stale': job['stale'], 'width': width, 'height': height, 'bytes': len(data),
        'sha256': sha, 'fullyDecoded': True,
        'native4k': width >= 3840 and height >= 2160 and abs(width / height / (16 / 9) - 1) <= .005,
        'publicUrl': url, 'absoluteFile': file.as_posix(),
        'reviewDecision': review.get('decision'), 'reviewedAt': review.get('reviewedAt'),
        'sourceHash': job['sourceHash'], 'promptHash': job['promptHash'], 'referenceHash': job['referenceHash'],
    })
unknown = [{key: job.get(key) for key in ('id', 'worldId', 'nodeId', 'state', 'stale', 'paidAttempts',
           'recoveryAttempts', 'recoveryAvailable', 'errorCode')} for job in jobs if job['state'] == 'unknown_outcome']
no_image_paid = [{key: job.get(key) for key in ('id', 'worldId', 'nodeId', 'state', 'paidAttempts', 'errorCode')}
                for job in jobs if job.get('paidAttempts', 0) and not job.get('asset')]
project_id = 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10'
project_dir = ROOT / '.local/story-workshop/projects' / project_id
project = json.loads((project_dir / 'project.json').read_bytes())
publication = {key: project.get(key) for key in ('id', 'publishedVersion', 'revision', 'status', 'stage', 'updatedAt')}
publication['unpublishedR2WorldExists'] = (project_dir / 'r2/world.json').is_file()
latest_manifest_bytes = (PRODUCTION / 'manifest.json').read_bytes()
latest_manifest = json.loads(latest_manifest_bytes)
assert inventory_signature(latest_manifest) == inventory_signature(manifest), 'INVENTORY_CHANGED_REAUDIT'
counts = {
    'paidAttempts': sum(job.get('paidAttempts', 0) for job in jobs),
    'historicalDelivered': len(assets),
    'reviewed': sum(asset['reviewDecision'] is not None for asset in assets),
    'rejectedImages': sum(asset['reviewDecision'] == 'rejected' for asset in assets),
    'approvedImages': sum(asset['reviewDecision'] == 'approved' for asset in assets),
    'currentApprovedImages': sum(asset['reviewDecision'] == 'approved' and not asset['stale'] for asset in assets),
    'native4kHistorical': sum(asset['native4k'] for asset in assets),
    'sub4kHistorical': sum(not asset['native4k'] for asset in assets),
    'unknownOutcomes': len(unknown), 'generating': sum(job['state'] == 'generating' for job in jobs),
    'paidNoImageStates': dict(Counter(job['state'] for job in no_image_paid)),
    'worldBatches': len(batches), 'currentSceneRequirementsNotImages': sum(not job['stale'] for job in jobs),
}
record = {
    'at': datetime.now(timezone.utc).isoformat(), 'manifestUpdatedAt': manifest['updatedAt'],
    'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(), 'counts': counts,
    'manifestUpdatedAtAfterDecode': latest_manifest['updatedAt'],
    'manifestSha256AfterDecode': hashlib.sha256(latest_manifest_bytes).hexdigest(),
    'attemptedJobsAssetsReviewsAndRequirementCountsUnchangedDuringDecode': True,
    'thisContinuation': {'newPaidRequests': 0, 'newGeneratedImages': 0, 'additionalHistoricalReviews': 2},
    'historicalAssets': sorted(assets, key=lambda asset: (asset['worldId'], asset['nodeId'], asset['jobId'])),
    'unknownQuarantine': unknown, 'paidNoImageJobs': no_image_paid, 'workshopPublicationAtRead': publication,
    'method': 'Original public PNGs fully decoded and hashed; no source, request, recovery or manifest mutation.',
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'current-inventory.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
lines = ['# Current verified historical image inventory', '', f"Read at {record['at']}", '',
         'These are historical rejected files, NOT new or accepted illustrations from this continuation.', '',
         '| World/node | Job | Pixels | Review | SHA256 | Original file |',
         '| --- | --- | --- | --- | --- | --- |']
for asset in record['historicalAssets']:
    lines.append(f"| {asset['worldId']}/{asset['nodeId']} | {asset['jobId']} | {asset['width']}x{asset['height']} | "
                 f"{asset['reviewDecision']} | `{asset['sha256']}` | [PNG]({asset['absoluteFile']}) |")
(OUT / 'current-inventory.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps({'at': record['at'], 'counts': counts, 'workshopPublicationAtRead': publication}, ensure_ascii=False))
