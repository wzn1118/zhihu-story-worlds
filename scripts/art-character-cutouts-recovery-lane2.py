"""Lane 2 recovery evidence and truthful per-image review records."""
from pathlib import Path
from datetime import datetime, timezone
import json, hashlib, sys, importlib.util, shutil
from PIL import Image, ImageDraw
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'output/imagegen/character-cutouts-20260910'
LANE=WORK/'five-threads'
EVID=LANE/'recovery-lane-2-evidence'
ROWS=json.loads((LANE/'lane-2.json').read_text('utf-8'))['entries']
def utc(): return datetime.now(timezone.utc).isoformat()
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def paths(i):
 e=ROWS[i]; key=e['jobId']+'-'+e['asset']['sha256'][:12]
 rp=WORK/'results'/f'{key}.json'; r=json.loads(rp.read_text('utf-8'))
 return e,key,rp,r,ROOT/'public'/r['url'].lstrip('/')
def save(p,v):
 p.parent.mkdir(parents=True,exist_ok=True)
 q=p.with_suffix(p.suffix+'.tmp');q.write_text(json.dumps(v,ensure_ascii=False,indent=2),'utf-8');q.replace(p)
def prepare(indices):
 EVID.mkdir(parents=True,exist_ok=True)
 for i in indices:
  e,key,rp,r,target=paths(i)
  source=ROOT/'public'/e['asset']['url'].lstrip('/')
  original=np.asarray(Image.open(source).convert('RGB'))
  with Image.open(target) as im:
   assert im.mode=='RGBA'; rgba=np.asarray(im)
  assert rgba.shape[:2]==original.shape[:2]==(e['asset']['height'],e['asset']['width'])
  assert np.array_equal(rgba[:,:,:3],original)
  assert sha(source)==e['asset']['sha256']
  assert sha(target)==r['sha256']
  assert np.any(rgba[:,:,3]==0) and np.any(rgba[:,:,3]==255)
  for kind,src in [('full',WORK/'previews'/f'{key}.jpg'),('native',WORK/'edges'/f'{key}.png')]:
   dst=EVID/f'{i:02d}-{kind}.jpg'
   im=Image.open(src).convert('RGB'); im.save(dst,quality=85,optimize=True)
   assert dst.stat().st_size<250000,(i,kind,dst.stat().st_size)
  save(EVID/f'{i:02d}-verification.json',dict(jobId=e['jobId'],sourceSha256=e['asset']['sha256'],sha256=r['sha256'],width=rgba.shape[1],height=rgba.shape[0],rgbUnchanged=True,nativeDetailResized=False,at=utc()))
  print(i,e['nodeId'],flush=True)
def review(items):
 for item in items:
  i=item['index']; e,key,rp,r,target=paths(i)
  verification=json.loads((EVID/f'{i:02d}-verification.json').read_text('utf-8'))
  assert sha(target)==r['sha256']==verification['sha256']
  path=WORK/'reviews'/f'{e["jobId"]}.json'
  if path.exists():
   old=json.loads(path.read_text('utf-8-sig'))
   save(LANE/'lane-2-history'/f'{key}-{old.get("sha256","unknown")[:16]}-pre-recovery-review.json',dict(archivedAt=utc(),value=old))
  save(path,dict(jobId=e['jobId'],sourceSha256=e['asset']['sha256'],sha256=r['sha256'],decision=item['decision'],fullImageViewed=True,nativeDetailViewed=True,reviewer='cutout-recovery-lane2',notes=item['notes'],at=utc(),evidence=dict(fullImage=str((EVID/f'{i:02d}-full.jpg').relative_to(ROOT)),nativeDetail=str((EVID/f'{i:02d}-native.jpg').relative_to(ROOT))),verification=verification))
  print(i,item['decision'],flush=True)
def repair(items):
 spec=importlib.util.spec_from_file_location('lane2',ROOT/'scripts/art-character-cutouts-lane-2.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
 for item in items:
  i=item['index']; e,key,rp,r,target=paths(i)
  hist=LANE/'lane-2-history';hist.mkdir(exist_ok=True)
  stamp=r['sha256'][:16]
  for src in [target,rp,WORK/'reviews'/f'{e["jobId"]}.json']:
   if src.exists():
    dst=hist/f'{key}-{stamp}-recovery-before-{src.parent.name}{src.suffix}'
    if not dst.exists():shutil.copy2(src,dst)
  rvpath=WORK/'reviews'/f'{e["jobId"]}.json'
  save(rvpath,dict(jobId=e['jobId'],sourceSha256=e['asset']['sha256'],sha256=r['sha256'],decision='pending',fullImageViewed=False,nativeDetailViewed=False,reviewer='cutout-recovery-lane2',notes='Alpha repair in progress',at=utc()))
  rgb=Image.open(ROOT/'public'/e['asset']['url'].lstrip('/')).convert('RGB'); alpha=Image.open(target).getchannel('A')
  for restore in item.get('restoreAlpha',[]):
   old=Image.open(ROOT/restore['path']).getchannel('A');box=tuple(restore['box']);alpha.paste(old.crop(box),box)
  alpha=mod.correct_alpha(rgb,alpha,item['fix'])
  out=rgb.convert('RGBA');out.putalpha(alpha);out.save(target)
  h=alpha.histogram();r.update(sha256=sha(target),review='pending',generatedAt=utc(),method=r.get('method','')+'-recovery-local-alpha',alpha=dict(transparent=h[0],opaque=h[255],partial=sum(h[1:255])))
  r.setdefault('recoveryCorrections',[]).append(dict(at=utc(),reason=item['reason'],fix=item['fix']))
  r['preview']=mod.make_preview(rgb,alpha,key);save(rp,r)
  prepare([i])
def summary():
 counts={'approved':0,'rejected':0,'pending':0,'missing':0,'stale':0}; remaining=[]; decisions=[]
 for i in range(len(ROWS)):
  e,key,rp,r,target=paths(i);p=WORK/'reviews'/f'{e["jobId"]}.json'
  rv=json.loads(p.read_text('utf-8-sig')) if p.exists() else {}
  status=rv.get('decision','missing')
  if rv and (rv.get('sha256')!=sha(target) or rv.get('sourceSha256')!=e['asset']['sha256']):status='stale'
  counts[status]=counts.get(status,0)+1
  info=dict(index=i,jobId=e['jobId'],status=status,notes=rv.get('notes',''))
  decisions.append(info)
  if status!='approved':remaining.append(info)
 result=dict(lane=2,total=len(ROWS),reviewer='cutout-recovery-lane2',at=utc(),counts=counts,remaining=remaining,decisions=decisions)
 save(LANE/'recovery-lane-2-summary.json',result)
 print(json.dumps(dict(total=len(ROWS),counts=counts,remaining=remaining),ensure_ascii=False))
if __name__=='__main__':
 if sys.argv[1]=='prepare':prepare([int(v) for v in sys.argv[2:]] or range(len(ROWS)))
 elif sys.argv[1]=='review':review(json.loads(Path(sys.argv[2]).read_text('utf-8-sig')))
 elif sys.argv[1]=='repair':repair(json.loads(Path(sys.argv[2]).read_text('utf-8-sig')))
 elif sys.argv[1]=='summary':summary()
