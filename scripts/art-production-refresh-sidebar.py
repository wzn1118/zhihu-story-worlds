"""Explicit user-requested sidebar refresh; only existing renderer helper APIs."""
import importlib.util
import json
from pathlib import Path
import sys
import time

home = Path('E:/CodexHome')
spec = importlib.util.spec_from_file_location('art_sidebar_refresh', home / 'skills/refresh-codex-renderer/scripts/refresh_codex_renderer.py')
helper = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = helper
spec.loader.exec_module(helper)
ids = ['01a07499-86e6-75c1-bffd-eac72867faee', '01a07499-86c5-70d3-a750-1e517c8021e6', '01a07499-8729-7d70-8ada-6723d0ad86e1']
before = helper.find_renderer_pids()
iso, unix = helper.utc_now()
promoted = helper.promote_threads(home, ids, iso, unix)
# Active art turns are known and preserved. Do not scan unrelated historical
# rollouts: the user specifically requested these existing threads be visible now.
helper.kill_renderer_pids(before)
time.sleep(4)
after = helper.find_renderer_pids()
result = {'at': iso, 'promoted': promoted, 'rendererPidsBefore': before,
          'rendererPidsAfter': after, 'mainProcessOrAppServerStopped': False,
          'rendererChanged': bool(before and after and set(before) != set(after))}
target = Path(__file__).resolve().parents[1] / 'output/imagegen/scene-production/art-team/sidebar-refresh.json'
target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=True))
