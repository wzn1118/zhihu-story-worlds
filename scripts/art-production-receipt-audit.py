"""Read-only failure evidence audit; no client/config/network/credential access."""
import datetime
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION = ROOT / 'output/imagegen/scene-production'


def evidence_codes(message):
    """A bare mention is not proof: require a serialized provider code field."""
    text = str(message).replace('\\"', '"')
    codes = re.findall(r'["\']code["\']\s*:\s*["\']([A-Za-z0-9_]+)["\']', text)
    return sorted(set(code for code in codes if code == 'sensitive_words_detected'))


def audit():
    manifest = json.loads((PRODUCTION / 'manifest.json').read_text(encoding='utf-8'))
    jobs = [job for batch in manifest['batches'] for job in batch['jobs']]
    selected = [job for job in jobs if job['paidAttempts'] and not job.get('asset')]
    audited = []
    for job in selected:
        directory = PRODUCTION / '.private/jobs' / job['id']
        files = [directory / 'result.json', directory / 'delivery/manifest.json',
                 *sorted((directory / 'archive').glob('**/*.recovery.json'))]
        rows = []
        conclusive = False
        saved_response = False
        saved_images = 0
        for index, file in enumerate(files):
            if not file.is_file():
                continue
            binary = file.read_bytes()
            data = json.loads(binary)
            row = {'evidenceId': index, 'bytes': len(binary), 'sha256': hashlib.sha256(binary).hexdigest()}
            if file.name == 'result.json':
                row.update(kind='adapter-result', state=data.get('state'), errorCode=data.get('errorCode'),
                           recoveryAvailable=data.get('recoveryAvailable'))
            elif file.name == 'manifest.json':
                failures = []
                for failure in data.get('failures', []):
                    message = str(failure.get('error', ''))
                    codes = evidence_codes(message)
                    conclusive = conclusive or bool(codes)
                    failures.append({'messageSha256': hashlib.sha256(message.encode()).hexdigest(),
                        'characters': len(message), 'explicitProviderCodes': codes,
                        'bareMarkerPresent': 'sensitive_words_detected' in message,
                        'httpCodes': sorted(set(re.findall(r'HTTP(?:Error)?[ :]+([45]\d\d)', message))),
                        'timeoutMentioned': 'timed out' in message.lower() or 'timeout' in message.lower()})
                row.update(kind='saved-wrapper-failure', failures=failures)
            else:
                has_response = bool(data.get('response'))
                count = len(data.get('images', []))
                saved_response = saved_response or has_response
                saved_images += count
                row.update(kind='saved-recovery-record', status=data.get('status'), savedResponse=has_response,
                           savedImageCount=count)
            rows.append(row)
        classification = 'explicit_provider_rejection' if conclusive else 'unknown_without_conclusive_response'
        audited.append({'jobId': job['id'], 'worldId': job['worldId'], 'nodeId': job['nodeId'],
            'state': job['state'], 'errorCode': job.get('errorCode'), 'paidAttempts': job['paidAttempts'],
            'recoveryAttempts': job['recoveryAttempts'], 'classification': classification,
            'savedResponse': saved_response, 'savedImageEntries': saved_images, 'evidence': rows,
            'noResubmit': True, 'noRefusalEvasion': True})
    report = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'manifestAt': manifest['updatedAt'], 'paidCalls': 0, 'networkCalls': 0, 'recoveryCalls': 0,
        'credentialsRead': False, 'rawResponseValuesDisclosed': False, 'privatePathsDisclosed': False,
        'checked': len(audited), 'explicitRejections': sum(row['classification'] == 'explicit_provider_rejection' for row in audited),
        'inconclusive': sum(row['classification'] != 'explicit_provider_rejection' for row in audited), 'jobs': audited}
    target = PRODUCTION / 'root-handoff-20260906/failure-evidence.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key != 'jobs'}))


if __name__ == '__main__':
    audit()
