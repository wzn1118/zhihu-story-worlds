import json
from pathlib import Path
root=Path.cwd(); m=root/'output/imagegen/scene-production/manifest.json'; d=json.loads(m.read_text(encoding='utf-8'))
out=[]
for b in d.get('batches',[]):
 for j in b.get('jobs',[]):
  a=j.get('asset') or {}; st=str(j.get('state','')).lower()
  if st=='pending' and a.get('native4k') is True:
   out.append({k:j.get(k) for k in ['id','worldId','nodeId','sourceHash','promptHash','referenceHash','state','stale'] }|{'asset':a,'batchId':b.get('id')})
print(json.dumps({'manifestUpdatedAt':d.get('updatedAt'),'count':len(out),'jobs':out},ensure_ascii=False,indent=2))
