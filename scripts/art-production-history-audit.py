"""Bounded local-only audit. No service/client imports, network or production writes."""
import hashlib
import io
import json
import re
import statistics
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path.cwd().resolve()
PROD = ROOT / 'output/imagegen/scene-production'
OUT = PROD / 'root-handoff-20260906/history'
MANIFEST = PROD / 'manifest.json'
UNKNOWN_ID = 'scene_b6d835c0e9972b9f4ed8c9fd9dba'
IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif'}
fingerprints = {}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_bytes(p):
    p = p.resolve()
    if not p.is_relative_to(ROOT) or p.suffix.lower() == '.env':
        raise RuntimeError('OUT_OF_SCOPE_INPUT')
    data = p.read_bytes()
    fingerprints[p] = digest(data)
    return data


def document(p):
    return json.loads(read_bytes(p).decode('utf-8-sig'))


def decode(data):
    with Image.open(io.BytesIO(data)) as probe:
        probe.verify()
    with Image.open(io.BytesIO(data)) as im:
        fmt, mode, size = im.format, im.mode, im.size
        frames = getattr(im, 'n_frames', 1)
        for frame in range(frames):
            im.seek(frame)
            im.load()
    return {'width': size[0], 'height': size[1], 'format': fmt, 'mode': mode,
            'decodedFrames': frames, 'fullyDecoded': True, 'bytes': len(data), 'sha256': digest(data)}


def native(im):
    return im['width'] >= 3840 and im['height'] >= 2160 and abs(im['width'] / im['height'] / (16 / 9) - 1) <= .005


def field_name(key):
    return key if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key) else 'nonidentifier_field'


def schema(value):
    names, counts = set(), Counter()
    def visit(item):
        if isinstance(item, dict):
            counts['objects'] += 1
            for key, val in item.items():
                names.add(field_name(str(key)))
                visit(val)
        elif isinstance(item, list):
            counts['arrays'] += 1
            counts['arrayItems'] += len(item)
            for val in item:
                visit(val)
        elif isinstance(item, str):
            counts['strings'] += 1
            counts['urlValues'] += int(bool(re.match(r'^https?://', item)))
            counts['inlineImageValues'] += int(item.startswith('data:image/'))
        elif item is None:
            counts['nulls'] += 1
        elif isinstance(item, bool):
            counts['booleans'] += 1
        else:
            counts['numbers'] += 1
    visit(value)
    return {'fieldNames': sorted(names), 'counts': dict(counts), 'stringValuesDisclosed': False}


def geometry(item):
    allowed = {'size': r'\d+x\d+', 'pixelSize': r'\d+x\d+', 'aspect_ratio': r'\d+:\d+',
               'aspectRatio': r'\d+:\d+', 'resolution': r'\d+K', 'quality': r'low|medium|high|auto'}
    result = {}
    for key, pattern in allowed.items():
        if key in item:
            val = item[key]
            result[key] = val if val is None or isinstance(val, str) and re.fullmatch(pattern, val) else 'unrecognized'
    return result


def enum(item, key):
    val = item.get(key)
    return val if isinstance(val, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,100}', val) else None


def iso(value):
    try:
        t = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return t.astimezone(timezone.utc) if t.tzinfo else None
    except (TypeError, ValueError, AttributeError):
        return None


def safe_output_candidate(value):
    if not isinstance(value, str) or re.match(r'^[A-Za-z]+://|^data:', value):
        return None
    p = Path(value)
    if not p.is_absolute():
        p = ROOT / p
    p = p.resolve()
    return p if p.is_relative_to(ROOT) and p.suffix.lower() in IMAGE_EXTS else None


manifest = document(MANIFEST)
all_jobs = [job for batch in manifest['batches'] for job in batch['jobs']]
delivered = [job for job in all_jobs if job.get('asset')]
assert len(delivered) == 19, 'DELIVERED_COUNT_CHANGED'
unknown = [job for job in all_jobs if job['state'] == 'unknown_outcome']
assert [job['id'] for job in unknown] == [UNKNOWN_ID], 'UNKNOWN_IDENTITY_CHANGED'
counts = {'paidAttempts': sum(j['paidAttempts'] for j in all_jobs), 'historicDelivered': len(delivered),
          'historicReviewed': sum(bool(j.get('review')) for j in all_jobs),
          'approved': sum(j.get('review', {}).get('decision') == 'approved' for j in all_jobs),
          'unknown': len(unknown), 'generating': sum(j['state'] == 'generating' for j in all_jobs)}
assert counts == {'paidAttempts': 30, 'historicDelivered': 19, 'historicReviewed': 19,
                  'approved': 0, 'unknown': 1, 'generating': 0}, 'BASELINE_CHANGED'
rows = []

for job in delivered:
    jid = job['id']
    assert jid != UNKNOWN_ID
    base = PROD / '.private' / 'jobs' / jid
    files = sorted(p for p in base.rglob('*') if p.is_file())
    docs = [(p, document(p)) for p in files if p.suffix.lower() == '.json']
    by_path = dict(docs)
    request = by_path.get(base / 'request.json', {})
    delivery = by_path.get(base / 'delivery/manifest.json', {})
    adapter = by_path.get(base / 'result.json', {})
    recs = [(p, doc) for p, doc in docs if doc.get('kind') == 'openqi-image-recovery']
    normalized = delivery.get('jobs', [])
    roles = defaultdict(set)
    sources = defaultdict(set)
    outside_candidates = set()
    for _, doc in recs:
        for item in doc.get('images', []):
            for key, role in [('archive', 'archive'), ('requested_output', 'requested_output')]:
                p = safe_output_candidate(item.get(key))
                if p:
                    roles[p].add(role)
                    sources[p].add(key)
    for item in delivery.get('images', []):
        for key, role in [('archive', 'archive'), ('source_delivery', 'download_source'), ('path', 'delivery_output')]:
            p = safe_output_candidate(item.get(key))
            if p:
                roles[p].add(role)
                sources[p].add(key)
    roles[(base / 'native.png').resolve()].add('adapter_native')
    asset_location = job['asset'].get('url', '')
    if not isinstance(asset_location, str) or not asset_location.startswith('/generated-art/') or '..' in asset_location:
        raise RuntimeError('UNEXPECTED_PUBLIC_ASSET_LOCATION')
    public = (ROOT / 'public' / asset_location.lstrip('/')).resolve()
    roles[public].add('public')
    public_decoded = decode(read_bytes(public))
    candidates = {p.resolve() for p in files if p.suffix.lower() in IMAGE_EXTS}
    for p in roles:
        if not p.is_relative_to(base.resolve()) and p != public:
            outside_candidates.add(p)
        if p.is_file():
            candidates.add(p)
    candidates.add(public)
    image_records = []
    for number, p in enumerate(sorted(candidates), 1):
        decoded = decode(read_bytes(p))
        image_records.append({'artifactId': f'image-{number:02d}',
                              'roles': sorted(roles[p]) or ['unreferenced_local_image'],
                              'referencedByFieldNames': sorted(sources[p]), **decoded,
                              'shaMatchesPublic': decoded['sha256'] == public_decoded['sha256'],
                              'sizeMatchesPublic': (decoded['width'], decoded['height']) == (public_decoded['width'], public_decoded['height'])})
    archive_members = []
    zip_count = 0
    for p in files:
        if p.suffix.lower() != '.zip':
            continue
        zip_count += 1
        with zipfile.ZipFile(io.BytesIO(read_bytes(p))) as archive:
            for member in archive.infolist():
                if member.is_dir() or Path(member.filename).suffix.lower() not in IMAGE_EXTS:
                    continue
                if member.file_size > 100_000_000:
                    raise RuntimeError('ARCHIVE_MEMBER_LIMIT')
                decoded = decode(archive.read(member))
                archive_members.append({'artifactId': f'zip-image-{len(archive_members)+1:02d}', **decoded})
    response_records = []
    for _, rec in recs:
        response = rec.get('response')
        detail = schema(response)
        detail['topLevelFieldNames'] = sorted(map(field_name, response)) if isinstance(response, dict) else []
        data = response.get('data') if isinstance(response, dict) else None
        detail['dataItemCount'] = len(data) if isinstance(data, list) else None
        detail['dataItemFieldNames'] = [sorted(map(field_name, item)) for item in data if isinstance(item, dict)] if isinstance(data, list) else []
        detail['alternateResolutionFieldNames'] = [name for name in detail['fieldNames']
            if re.search(r'original|thumbnail|high.?res|variant|b64|base64', name, re.I)]
        response_records.append(detail)
    request_count = len(request['references']) if isinstance(request.get('references'), list) else None
    normalized_records = [dict(geometry(item), referenceCount=len(item['image']) if isinstance(item.get('image'), list) else None)
                          for item in normalized]
    ng = normalized_records[0] if len(normalized_records) == 1 else {}
    mode = 'explicit_size_4096x2304' if ng.get('size') == '4096x2304' else 'aspect_16_9_resolution_4K' if ng.get('aspect_ratio') == '16:9' and ng.get('resolution') == '4K' else 'missing_or_other'
    starts = [iso(rec.get('created_at')) for _, rec in recs]
    starts = [t for t in starts if t]
    saves = [iso(doc.get('saved_at')) for _, doc in docs]
    saves = [t for t in saves if t]
    start = min(starts) if starts else None
    saved = min(saves) if saves else None
    elapsed = round((saved - start).total_seconds(), 6) if start and saved and saved >= start else None
    higher = [im for im in image_records + archive_members
              if im['width'] * im['height'] > public_decoded['width'] * public_decoded['height']]
    row = {'jobId': jid, 'worldId': job['worldId'], 'nodeId': job['nodeId'], 'state': job['state'],
           'stale': job['stale'], 'reviewDecision': job.get('review', {}).get('decision'),
           'paidAttempts': job['paidAttempts'], 'recoveryAttempts': job['recoveryAttempts'],
           'requestedInDurableManifest': geometry(job['requested']), 'savedRequestGeometry': geometry(request.get('requested', {})),
           'savedRequestGeometryMissing': 'requested' not in request,
           'normalizedDeliveryJobs': normalized_records, 'observedRequestMode': mode,
           'explicitRequestQuality': ng.get('quality'), 'qualityOmittedNotAssumedHigh': ng.get('quality') is None,
           'deliveryDefaultQualityLabel': enum(delivery, 'default_quality'),
           'deliveryResultLabels': [{k:enum(item, k) if k == 'effective_quality' else item.get(k)
                for k in ['effective_quality', 'resolution_verified', 'aspect_ratio_verified']} for item in delivery.get('images', [])],
           'requestReferenceCount': request_count, 'normalizedReferenceCountsAgree': all(x.get('referenceCount') == request_count for x in normalized_records),
           'referenceHash': job['referenceHash'], 'sourceHash': job['sourceHash'], 'promptHash': job['promptHash'],
           'savedRequestPromptHashMatches': request.get('promptHash') == job['promptHash'],
           'publicOriginal': public_decoded, 'native4kDecoded': native(public_decoded),
           'publicAssetMetadataMatches': all(public_decoded[k] == job['asset'][k] for k in ['width','height','bytes','sha256']),
           'files': image_records, 'zipArchiveCount': zip_count, 'zipImageMembers': archive_members,
           'higherResolutionExistingImageCount': len(higher), 'outputReferencesOutsideJobCount': len(outside_candidates),
           'allCopiesByteIdentical': all(im['shaMatchesPublic'] for im in image_records),
           'allCopiesSameDimensions': all(im['sizeMatchesPublic'] for im in image_records),
           'savedResponseRecords': response_records,
           'savedDocumentSchemas': [{'artifactId':f'metadata-{i+1:02d}', **schema(doc)} for i, (_, doc) in enumerate(docs)],
           'savedAdapterResult': {k:adapter.get(k) for k in ['state','errorCode','width','height','bytes','sha256','native4k','recoveryAvailable','cleanupPending']},
           'timing': {'recoveryRecordCreatedUtc': start.isoformat() if start else None,
                      'firstSavedImageSidecarUtc': saved.isoformat() if saved else None,
                      'recordToSavedSeconds': elapsed,
                      'includesRecordedRecovery': job['recoveryAttempts'] > 0,
                      'eligibleForNoRecoveryComparison': elapsed is not None and job['recoveryAttempts'] == 0,
                      'exactPostSentAt': None, 'exactResponseReceivedAt': None,
                      'metricIsBackendGenerationLatency': False}}
    rows.append(row)


def groups(keys):
    buckets = defaultdict(list)
    for row in rows:
        buckets[tuple(row[k] for k in keys)].append(row)
    return [{**dict(zip(keys, key)), 'delivered':len(items),
             'native':sum(r['native4kDecoded'] for r in items),
             'sub4k':sum(not r['native4kDecoded'] for r in items),
             'jobIds':[r['jobId'] for r in items]} for key, items in buckets.items()]


def timing_stats(items):
    vals = [r['timing']['recordToSavedSeconds'] for r in items if r['timing']['recordToSavedSeconds'] is not None]
    return {'n':len(vals), 'min':round(min(vals),3) if vals else None,
            'median':round(statistics.median(vals),3) if vals else None,
            'mean':round(statistics.mean(vals),3) if vals else None,
            'max':round(max(vals),3) if vals else None}


prior_root = document(ROOT/'output/coordination/art-response-shape-20260906/report.json')
prior_sizes = document(ROOT/'output/coordination/art-dimensions-20260906/report.json')
prior_two = document(PROD/'art-team/scene-composition/safe new-delivery-dimension-audit.json')
own_audits = [document(PROD/'art-team/painted-background/batch-vhd/ming-whisper/queen-native-audit.json'),
              document(PROD/'art-team/painted-background/batch-vhd/wrong-realm/herbalist-native-audit.json')]
indexed = {r['jobId']:r for r in rows}
root_disagreements = []
for old in prior_root['responses']:
    now = indexed.get(old['jobId'])
    if not now or any(any(copy[k] != now['publicOriginal'][k] for k in ['width','height','sha256']) for copy in old['copies']):
        root_disagreements.append(old['jobId'])
two_disagreements = [old['jobId'] for old in prior_two['jobs']
    if any(old['publicImage'][k] != indexed[old['jobId']]['publicOriginal'][k] for k in ['width','height','sha256'])]
own_disagreements = [old['jobId'] for old in own_audits
    if old['sha256'] != indexed[old['jobId']]['publicOriginal']['sha256']
    or any(old['nativeDimensions'][k] != indexed[old['jobId']]['publicOriginal'][k] for k in ['width','height'])]
snapshot_unchanged = digest(MANIFEST.read_bytes()) == fingerprints[MANIFEST.resolve()]
unchanged = all(digest(p.read_bytes()) == before for p, before in fingerprints.items())
counts.update({'decodedNative4k':sum(r['native4kDecoded'] for r in rows),
               'decodedSub4k':sum(not r['native4kDecoded'] for r in rows),
               'decodedPhysicalImageFiles':sum(len(r['files']) for r in rows),
               'savedResponses':sum(len(r['savedResponseRecords']) for r in rows),
               'existingHigherResolutionAlternates':sum(r['higherResolutionExistingImageCount'] for r in rows)})
stats = {'allObservedIntervals':{'native':timing_stats([r for r in rows if r['native4kDecoded']]),
                                'sub4k':timing_stats([r for r in rows if not r['native4kDecoded']])},
         'excludingAnyRecordedRecovery':{'native':timing_stats([r for r in rows if r['native4kDecoded'] and r['timing']['eligibleForNoRecoveryComparison']]),
                                         'sub4k':timing_stats([r for r in rows if not r['native4kDecoded'] and r['timing']['eligibleForNoRecoveryComparison']])},
         'missingRecordToSave':sum(r['timing']['recordToSavedSeconds'] is None for r in rows),
         'recoveryConfoundedIntervals':[r['jobId'] for r in rows if r['timing']['includesRecordedRecovery']],
         'exactNetworkStartEndMissing':len(rows),
         'interpretation':'Descriptive correlation only, not causal. Local record creation to image save includes preprocessing, service time, transfer and possible recovery; it is not isolated backend latency. No duration threshold guarantees native delivery.'}
result = {'auditedAt':datetime.now(timezone.utc).isoformat(), 'owner':'art-production',
          'methodOrigin':'Artist B audit draft retained unchanged; parent completed this copy after two legitimate parallel manual reviews advanced the baseline from17 to19.',
          'baselineManifestUpdatedAt':manifest['updatedAt'], 'counts':counts,
          'constraints':{'networkRequests':0,'paidRequests':0,'clientInvocations':0,'recoveryInvocations':0,
                         'productionWrites':0,'credentialFilesRead':0,'promptEdits':0,
                         'reportContainsUrlValues':False,'reportContainsPrivatePaths':False},
          'protectedUnknown':{'jobId':UNKNOWN_ID,'paidAttempts':unknown[0]['paidAttempts'],
                              'recoveryAttempts':unknown[0]['recoveryAttempts'],'state':unknown[0]['state'],
                              'assetPresent':bool(unknown[0].get('asset')),'privateArtifactsInspected':False},
          'jobs':rows, 'correlations':{'noncausal':True,'amongDeliveredOnly':True,
                    'byRequestMode':groups(['observedRequestMode']),
                    'byExplicitQuality':groups(['explicitRequestQuality']),
                    'byReferenceCount':groups(['requestReferenceCount']),
                    'sameModeQualityReferenceSet':groups(['observedRequestMode','explicitRequestQuality','referenceHash']),
                    'deliveryIntervalSeconds':stats},
          'priorEvidence':{'rootAll14Compared':len(prior_root['responses']), 'rootAll14Disagreements':root_disagreements,
                    'rootGeometryAuditAttemptsRead':len(prior_sizes['attempts']),
                    'latestTwoFileAuditCompared':len(prior_two['jobs']), 'latestTwoFileDisagreements':two_disagreements,
                    'ownTwoNativeAuditsCompared':len(own_audits),'ownTwoDisagreements':own_disagreements,
                    'newDeliveredBeyondRootAll14':len(rows)-len(prior_root['responses']),
                    'copyScopeNote':'This audit includes both extant delivery copies plus archive, adapter native and public: five physical images per job. The root audit used four pipeline copies; this is added coverage, not conflicting bytes.'},
          'missingData':['Exact outbound wire payload not saved; normalized delivery parameters are the closest local request evidence.',
                         'Explicit quality omitted in earlier requests is not inferred as high. default_quality/effective_quality are resolution/result labels, not proof of a quality setting.',
                         'Reference hashes are historical durable-job values; unchanged input bytes at old submission times are not reconstructed from current reference files.',
                         'Exact POST/response timestamps, remote routing/model revision, remote image-resize steps, queue load and alternate remote assets are unavailable.',
                         'Different prompts/worlds/times and delivered-only selection confound all observed associations. No identical-prompt controlled repeat was performed.'],
          'inputIntegrity':{'filesFingerprinted':len(fingerprints),'allReadFilesUnchanged':unchanged,'manifestUnchanged':snapshot_unchanged},
          'conclusion':'Provider native-delivery nondeterminism is established at the observable request-mode/quality/reference-set level; remote backend cause remains unknown. No existing larger alternate or observed local downsize supports another equivalent-size parameter probe.',
          'nextAction':'Keep paid probing stopped; preserve the unknown dinner and all originals. Escalate the safe per-job metadata/size/hash evidence to the provider for a verifiable native-output contract or backend trace before reconsidering any experiment. No outbound escalation occurs in this audit.'}
serialized = json.dumps(result,ensure_ascii=False,indent=2)+'\n'
assert not re.search(r'https?://|[A-Za-z]:[\\/]|\.private[\\/]',serialized), 'UNSAFE_REPORT_VALUE'
assert unchanged and snapshot_unchanged, 'INPUT_CHANGED_DURING_AUDIT'
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'audit.json').write_text(serialized,encoding='utf-8')
summary = {'counts':counts,'byMode':result['correlations']['byRequestMode'],'byQuality':result['correlations']['byExplicitQuality'],
           'byReferenceCount':result['correlations']['byReferenceCount'],'timing':stats,'priorEvidence':result['priorEvidence'],
           'inputIntegrity':result['inputIntegrity']}
print(json.dumps(summary,ensure_ascii=False,indent=2))
