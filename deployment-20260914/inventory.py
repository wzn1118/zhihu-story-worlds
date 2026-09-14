from pathlib import Path
import os, json
root = Path(__file__).resolve().parents[1]
groups = ['src','server','shared','content','scripts','tests','docs','browser-extension','public','.local','output']
summary = {}
for group in groups:
    sizes = {}
    for current, dirs, files in os.walk(root/group, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(current)/d).is_symlink() and d not in ['node_modules','__pycache__']]
        for name in files:
            p=Path(current)/name
            try:
                rel=p.relative_to(root/group); bucket=rel.parts[0] if len(rel.parts)>1 else '(files)'
                stat=p.stat(); row=sizes.setdefault(bucket,{'files':0,'bytes':0}); row['files']+=1; row['bytes']+=stat.st_size
            except (OSError, ValueError): pass
    summary[group]=sizes
print(json.dumps(summary,ensure_ascii=False,indent=2))
