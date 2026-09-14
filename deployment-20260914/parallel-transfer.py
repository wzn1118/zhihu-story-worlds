from pathlib import Path
import os,tarfile,subprocess,json,hashlib,time,io,concurrent.futures,threading
root=Path(__file__).resolve().parents[1]
destination='/data/zhihu-project/shared/snapshot-20260914-1300'
groups=['public','.local/auth','.local/liukan','.local/liukan-inbox','.local/liukan-memory','.local/liukan-reading','.local/story-workshop','.local/zhihu-cache','.local/zhihu-discovery','output/pdf/redleaf-product-plan-20260913']
for state in ['output/imagegen/scene-production/.private/state.json','output/workshop-images/.private/state.json']:
 if (root/state).exists(): groups.append(state)
files=[]
for group in groups:
 p=root/group
 if p.is_file(): files.append(p); continue
 for current,dirs,names in os.walk(p,followlinks=False):
  dirs[:]=[d for d in dirs if d not in ['node_modules','__pycache__','.git'] and not (Path(current)/d).is_symlink()]
  files.extend(Path(current)/name for name in names if (Path(current)/name).is_file() and not (Path(current)/name).is_symlink())
# Put business state and small public files at the front of each stream.
files.sort(key=lambda p:(p.relative_to(root).parts[0]=='public',p.stat().st_size))
workers=12; buckets=[[] for _ in range(workers)]; sizes=[0]*workers
for p in files:
 i=min(range(workers),key=lambda j:sizes[j]); buckets[i].append(p); sizes[i]+=p.stat().st_size
totals=[0]*workers; counts=[0]*workers; manifests=[]; started=time.monotonic()
print(json.dumps({'destination':destination,'files':len(files),'bytes':sum(sizes),'connections':workers}),flush=True)
def transfer(i):
 proc=subprocess.Popen(['ssh','-o','ClearAllForwardings=yes','-o','BatchMode=yes','ocean-intelligence',f'umask 077; mkdir -p {destination}; tar --keep-old-files -xzf - -C {destination}'],stdin=subprocess.PIPE)
 entries=[]
 try:
  with tarfile.open(fileobj=proc.stdin,mode='w|gz',compresslevel=1) as archive:
   for p in buckets[i]:
    data=p.read_bytes(); rel=p.relative_to(root).as_posix(); info=tarfile.TarInfo(rel); info.size=len(data); info.mode=0o600 if rel.startswith('.local/') or '/.private/' in rel else 0o644
    archive.addfile(info,io.BytesIO(data)); totals[i]+=len(data); counts[i]+=1
    entries.append({'path':rel,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()})
  proc.stdin.close(); code=proc.wait()
  if code: raise RuntimeError(f'worker {i} failed {code}')
  return entries
 except BaseException: proc.terminate(); raise
with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
 futures=[pool.submit(transfer,i) for i in range(workers)]
 while not all(f.done() for f in futures):
  concurrent.futures.wait(futures,timeout=20)
  elapsed=time.monotonic()-started
  print(json.dumps({'sent':sum(totals),'total':sum(sizes),'files_sent':sum(counts),'elapsed':round(elapsed),'MBps':round(sum(totals)/elapsed/1e6,2)}),flush=True)
 for f in futures: manifests.extend(f.result())
with (root/'deployment-20260914'/'data-parallel-manifest.json').open('x',encoding='utf8') as out: json.dump(manifests,out,ensure_ascii=False)
print(json.dumps({'complete':True,'files':len(manifests),'bytes':sum(totals)}),flush=True)
