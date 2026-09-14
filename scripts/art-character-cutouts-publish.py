"""Publish only current, visually approved alpha derivatives with unchanged RGB."""
import argparse
import hashlib
import html
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'output/imagegen/character-cutouts-20260910'
PUBLIC = ROOT / 'public/generated-art/character-cutouts.json'
CACHE = {}

def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def atomic(path, value):
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    temp.replace(path)

def publish():
    source_manifest=read(ROOT/'public/generated-art/production-manifest.json')
    sources={(w['worldId'],r['jobId']):r for w in source_manifest['worlds'] for r in w['assets']
        if r['review']=='approved' and r.get('bindingReady') and r['assetKind'] in ('character-anchor','character-reaction')}
    plan=read(WORK/'plan.json'); entries=[]; status=[]
    owners={row['jobId']:'cutout-thread-'+str(index%5+1) for index,row in enumerate(plan['entries'])}
    for row in plan['entries']:
        job=row['jobId']; name=job+'-'+row['asset']['sha256'][:12]
        result_file=WORK/'results'/(name+'.json'); review_file=WORK/'reviews'/(job+'.json')
        record=dict(jobId=job,worldId=row['worldId'],nodeId=row['nodeId'],status='pending')
        try:
            if not result_file.exists() or not review_file.exists(): status.append(record);continue
            result=read(result_file); review=read(review_file)
            source=sources.get((row['worldId'],job))
            if not source or source['asset']['sha256']!=result['sourceSha256'] or source['sourceHash']!=result['sourceHash']:
                record['status']='source-no-longer-current';status.append(record);continue
            if review.get('sha256')!=result['sha256'] or review.get('sourceSha256')!=result['sourceSha256']:
                record['status']='awaiting-current-mask-review';status.append(record);continue
            if review.get('decision')!='approved':
                record.update(status='rejected' if review.get('decision')=='rejected' else 'pending',notes=review.get('notes',''));status.append(record);continue
            recovery_owner=owners[job].replace('cutout-thread-', 'cutout-recovery-lane-')
            reviewer_valid=review.get('reviewer')==owners[job]
            if review.get('reviewer') in (recovery_owner,recovery_owner.replace('lane-','lane')):
                # Recovery reviewers retain the same exclusive assignment and
                # supply the actual full-image and native-detail evidence files.
                evidence=[]
                for field in ('fullEvidence','nativeEvidence'):
                    value=review.get(field) or review.get('evidence',{}).get('fullImage' if field=='fullEvidence' else 'nativeDetail')
                    path=(ROOT/value).resolve() if isinstance(value,str) and value else None
                    lane=owners[job].rsplit('-',1)[1]
                    allowed=[(WORK/'recovery').resolve(),(WORK/'five-threads'/('recovery-lane-'+lane+'-evidence')).resolve()]
                    evidence.append(bool(path and any(path.is_relative_to(base) for base in allowed) and path.is_file()))
                reviewer_valid=all(evidence)
            if not review.get('fullImageViewed') or not review.get('nativeDetailViewed') or not reviewer_valid or not review.get('notes'):
                record['status']='incomplete-review';status.append(record);continue
            # Current source-art rejection always revokes a previous derived approval.
            original_review=ROOT/'output/imagegen/scene-production/formal-production-20260907/reviews'/(job+'.json')
            if original_review.exists():
                original=read(original_review)
                if original.get('decision')!='approved' or original.get('sha256')!=result['sourceSha256']:
                    record['status']='source-review-revoked';status.append(record);continue
            expected='/generated-art/cutouts/'+name+'.png'
            if result['url']!=expected: raise ValueError('DERIVATIVE_URL_MISMATCH')
            path=ROOT/'public'/expected.lstrip('/'); original_path=ROOT/'public'/source['asset']['url'].lstrip('/')
            marker=(str(path),path.stat().st_mtime_ns,original_path.stat().st_mtime_ns,result['sha256'],result['sourceSha256'])
            if marker not in CACHE:
                if sha(path)!=result['sha256'] or sha(original_path)!=result['sourceSha256']:raise ValueError('SHA_MISMATCH')
                with Image.open(path) as image, Image.open(original_path) as original:
                    if image.mode!='RGBA' or image.size!=original.size or image.size!=(result['width'],result['height']):raise ValueError('DIMENSION_OR_ALPHA_MISMATCH')
                    if not np.array_equal(np.asarray(image)[:,:,:3],np.asarray(original.convert('RGB'))):raise ValueError('RGB_CHANGED')
                    hist=image.getchannel('A').histogram()
                    if hist[0]<image.width*image.height*.03 or hist[255]<image.width*image.height*.03:raise ValueError('NO_MEANINGFUL_TRANSPARENCY_OR_SUBJECT')
                CACHE[marker]=True
            entry={k:result[k] for k in ('worldId','nodeId','jobId','sourceHash','sourceUrl','sourceSha256','url','sha256','width','height')}
            entry['review']='approved';entries.append(entry);record['status']='approved'
        except Exception as error: record.update(status='verification-error',error=str(error))
        status.append(record)
    counts={key:sum(r['status']==key for r in status) for key in sorted(set(r['status'] for r in status))}
    manifest=dict(schemaVersion=1,generatedAt=datetime.now(timezone.utc).isoformat(),sourceManifestAt=source_manifest['generatedAt'],
        counts=dict(required=len(status),**counts),entries=entries)
    atomic(PUBLIC,manifest);atomic(WORK/'publication-status.json',dict(**manifest,status=status))
    cards=''.join('<article><div class="preview"><img loading="lazy" src="'+html.escape(e['url'])+'" alt="'+html.escape(e['worldId']+' / '+e['nodeId'].replace('__art_character_','').replace('__art_reaction_','') )+'"></div><p>'+html.escape(e['worldId']+' / '+e['nodeId'].replace('__art_character_','').replace('__art_reaction_',''))+'</p><p>'+str(e['width'])+' × '+str(e['height'])+'</p><a href="'+e['url']+'">透明 PNG</a> · <a href="'+e['sourceUrl']+'">原图</a></article>' for e in entries)
    gallery='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>赤页 · 透明人物图</title><style>body{margin:0;padding:28px;background:#161216;color:#eee;font:15px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}article{border:1px solid #544047;padding:12px}.preview{background:repeating-conic-gradient(#383338 0 25%,#28242a 0 50%) 0 / 24px 24px}img{width:100%;height:340px;object-fit:contain}a{color:#f3c0c8}p{line-height:1.6}</style><h1>赤页 · 透明人物图</h1><p>逐张检查后保留的透明版本；原尺寸与人物色彩保持一致。</p><p>已通过 '''+str(len(entries))+' / '+str(len(status))+' 张；其余 '+str(len(status)-len(entries))+' 张尚未通过透明图审核。</p><main>'+cards+'</main></html>'
    target=ROOT/'public/generated-art/cutouts/index.html';target.write_text(gallery,encoding='utf-8')
    print(json.dumps(dict(at=manifest['generatedAt'],required=len(status),published=len(entries),counts=counts)),flush=True)
    return status

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--watch',action='store_true');args=parser.parse_args()
    # Hold one OS lock for the lifetime of this publisher. Old lane summaries
    # describe earlier masks and must never terminate a new recovery watcher.
    lock=(WORK/'publisher.lock').open('a+b')
    if lock.tell()==0:lock.write(b'0');lock.flush()
    lock.seek(0)
    if os.name=='nt':
        import msvcrt
        try:msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        except OSError:raise SystemExit('CUTOUT_PUBLISHER_ALREADY_RUNNING')
    else:
        import fcntl
        try:fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:raise SystemExit('CUTOUT_PUBLISHER_ALREADY_RUNNING')
    runtime=dict(pid=os.getpid(),startedAt=datetime.now(timezone.utc).isoformat(),watch=args.watch,status='running')
    try:
        while True:
            atomic(WORK/'publisher-runtime.json',dict(runtime,heartbeatAt=datetime.now(timezone.utc).isoformat()))
            publish()
            if not args.watch:break
            time.sleep(30)
    finally:
        atomic(WORK/'publisher-runtime.json',dict(runtime,status='stopped',stoppedAt=datetime.now(timezone.utc).isoformat()))
        lock.close()

if __name__=='__main__':main()
