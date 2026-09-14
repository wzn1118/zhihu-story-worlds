import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / 'output' / 'liukan' / 'user-assets'
out.mkdir(parents=True, exist_ok=True)
archives = [Path('C:/Users/10847/Downloads/刘看山动态.zip'), Path('C:/Users/10847/Downloads/看山三视图.zip')]
manifest = []
for archive in archives:
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            if member.is_dir():
                continue
            local = out / archive.stem / member.filename
            if not local.resolve().is_relative_to(out.resolve()):
                raise ValueError('Archive member escaped destination')
            local.parent.mkdir(parents=True, exist_ok=True)
            data = bundle.read(member)
            local.write_bytes(data)
            manifest.append({'archive': archive.name, 'file': str(local.relative_to(root)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
(out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(manifest, ensure_ascii=True, indent=2))
