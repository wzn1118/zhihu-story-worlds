import json, shutil, subprocess, sys, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT=Path(__file__).resolve().parents[1]; PRIVATE=ROOT/'output/imagegen/scene-production/.private'; OUT=ROOT/'output/coordination/art-remake-12h-20260912/full64-direct'; SRC=OUT/'missing-art-prompts-and-placements.json'; seenp=OUT/'missing-art-sent.json'
seen=set(json.loads(seenp.read_text(encoding='utf8')) if seenp.exists() else []); rows=json.loads(SRC.read_text(encoding='utf8'))['rows']; rows=[r for r in rows if r['jobId'] not in seen][:100]
prepared=[]; stamp=int(time.time())
for i,r in enumerate(rows,1):
 src=PRIVATE/'jobs'/r['jobId']; dst=PRIVATE/'jobs'/f'missing_direct_{stamp}_{i}_{r["jobId"]}'
 dst.mkdir(parents=True, exist_ok=True)
 if (src/'prompt.txt').is_file() and (src/'request.json').is_file():
  shutil.copytree(src,dst,dirs_exist_ok=True,ignore=shutil.ignore_patterns('paid-attempt.lock','result.json','delivery','archive','*.tmp'))
 else:
  (dst/'prompt.txt').write_text(r['prompt']+'\n',encoding='utf8')
  refs=list((ROOT/'output/imagegen/scene-production/references').glob('**/*.png'))[:3]
  (dst/'request.json').write_text(json.dumps({'references':[str(x) for x in refs]},ensure_ascii=False),encoding='utf8')
 spec=json.loads((dst/'request.json').read_text(encoding='utf8')); spec['requested']={'aspectRatio':r.get('requestedAspectRatio','16:9'),'resolution':'4K','quality':'high'}
 (dst/'request.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); prepared.append({'sourceJobId':r['jobId'],'worldId':r['worldId'],'nodeId':r['nodeId'],'position':r['position'],'newJobId':dst.name,'dir':str(dst)})
def run(x):
 p=subprocess.run([sys.executable,str(ROOT/'scripts/art-production-client.py'),'generate',x['dir']],cwd=ROOT,capture_output=True,text=True,encoding='utf8',errors='replace',timeout=900)
 try: result=json.loads(p.stdout.strip().splitlines()[-1])
 except: result={'state':'unknown_outcome','errorCode':'UNPARSEABLE_CLIENT_OUTPUT'}
 return {**x,'returncode':p.returncode,'result':result}
results=[]
with ThreadPoolExecutor(max_workers=4) as pool:
 for f in as_completed([pool.submit(run,x) for x in prepared]): results.append(f.result())
seen.update(x['sourceJobId'] for x in prepared); seenp.write_text(json.dumps(sorted(seen),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
receipt={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourceCount':len(json.loads(SRC.read_text(encoding='utf8'))['rows']),'requested':100,'prepared':len(prepared),'results':results,'remaining':len([r for r in json.loads(SRC.read_text(encoding='utf8'))['rows'] if r['jobId'] not in seen]),'images':[x['result'].get('file') for x in results if x['result'].get('file')],'noResend':True}
path=OUT/f'missing-art-direct-100-{stamp}.json'; path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); print(json.dumps({'receipt':str(path),'prepared':len(prepared),'remaining':receipt['remaining'],'images':len(receipt['images'])},ensure_ascii=False))

