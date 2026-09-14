from pathlib import Path
import os,tarfile,subprocess,json,hashlib,time,sys
root=Path(__file__).resolve().parents[1]
release='/data/zhihu-project/releases/20260914-1300'
mode=sys.argv[1]
groups = (['src','server','shared','content','scripts','tests','docs','browser-extension','deployment-20260914','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','README.md'] if mode=='source' else ['public','.local/auth','.local/liukan','.local/liukan-inbox','.local/liukan-memory','.local/liukan-reading','.local/story-workshop','.local/zhihu-cache','.local/zhihu-discovery','output/pdf/redleaf-product-plan-20260913'])
if mode=='data':
    for state in ['output/imagegen/scene-production/.private/state.json','output/workshop-images/.private/state.json']:
        if (root/state).exists(): groups.append(state)
files=[]
for group in groups:
    p=root/group
    if p.is_file(): files.append(p); continue
    for current,dirs,names in os.walk(p,followlinks=False):
        dirs[:]=sorted(d for d in dirs if d not in ['node_modules','__pycache__','.git'] and not (Path(current)/d).is_symlink())
        for name in sorted(names):
            q=Path(current)/name
            if q.is_file() and not q.is_symlink() and q.suffix not in ['.pyc']: files.append(q)
total=sum(p.stat().st_size for p in files)
print(json.dumps({'mode':mode,'files':len(files),'bytes':total,'release':release}),flush=True)
command=f'mkdir -p {release} && tar --keep-old-files -xzf - -C {release}'
ssh=subprocess.Popen(['ssh','-o','ClearAllForwardings=yes','-o','BatchMode=yes','ocean-intelligence',command],stdin=subprocess.PIPE)
receipt=[]; done=0; last=time.monotonic()
try:
  with tarfile.open(fileobj=ssh.stdin,mode='w|gz',compresslevel=1) as archive:
    for p in files:
      rel=p.relative_to(root).as_posix()
      # Read once so the receipt hashes the exact bytes sent.
      import io
      data=p.read_bytes(); info=tarfile.TarInfo(rel); info.size=len(data); info.mode=0o600 if rel.startswith('.local/') or '/.private/' in rel else 0o644
      archive.addfile(info,io.BytesIO(data)); done+=len(data)
      receipt.append({'path':rel,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()})
      if time.monotonic()-last>20:
        print(json.dumps({'mode':mode,'sent':done,'total':total,'files_sent':len(receipt)}),flush=True); last=time.monotonic()
  ssh.stdin.close()
  code=ssh.wait()
  if code: raise RuntimeError(f'SSH transfer failed {code}')
  with (root/'deployment-20260914'/f'{mode}-manifest.json').open('x',encoding='utf8') as out: json.dump(receipt,out,ensure_ascii=False)
  print(json.dumps({'mode':mode,'complete':True,'files':len(receipt),'bytes':done}),flush=True)
except BaseException:
  ssh.terminate(); raise
