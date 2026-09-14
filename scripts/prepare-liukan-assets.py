import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
source = root / 'output' / 'liukan' / 'user-assets'
target = root / 'public' / 'assets' / 'liukan'
target.mkdir(parents=True, exist_ok=True)
names = {'瞌睡': 'sleep', '眨眼': 'blink', '晃悠': 'sway', '电脑': 'computer', '待机': 'idle', '运球': 'ball', '打招呼': 'greeting'}
manifest = []
previews = []
for file in source.rglob('*'):
    if not file.is_file() or '__MACOSX' in str(file) or file.name.startswith('.'):
        continue
    try:
        decoded = file.name.encode('cp437').decode('utf-8')
    except (UnicodeError, LookupError):
        decoded = file.name
    if file.suffix.lower() == '.gif':
        label = next((value for key, value in names.items() if decoded.startswith(key)), None)
        if not label:
            label = 'alternate'
        image = Image.open(file)
        shutil.copyfile(file, target / f'{label}.gif')
        image.seek(0)
        image.convert('RGBA').save(target / f'{label}.png')
        frames = image.n_frames
        preview = Image.new('RGB', (640, 320), '#211719')
        for i, frame in enumerate([0, frames // 2]):
            image.seek(frame)
            rgba = image.convert('RGBA')
            preview.paste(rgba, (i * 320, 0), rgba)
        previews.append((label, preview))
        manifest.append({'name': label, 'sourceFile': decoded, 'width': image.width, 'height': image.height, 'frames': frames, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'url': f'/assets/liukan/{label}.gif'})
    elif file.suffix.lower() in ('.jpg', '.jpeg'):
        image = Image.open(file)
        shutil.copyfile(file, target / file.name)
        previews.append((file.stem, image.copy().convert('RGB')))
(target / 'manifest.json').write_text(json.dumps({'provenance': 'User supplied Liu Kan Shan animations and three-view archives, 2026-09-12', 'assets': manifest}, ensure_ascii=False, indent=2), encoding='utf-8')
for name, image in previews:
    image.thumbnail((800, 600))
    image.save(source / f'preview-{name}.png')
print(json.dumps(manifest, ensure_ascii=True))
