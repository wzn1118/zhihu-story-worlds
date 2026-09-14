"""Surface only this art team's genuine CLI conversations using existing bridges."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys

root = Path(__file__).resolve().parents[1]
team = root / 'output/imagegen/scene-production/art-team'
home = Path('E:/CodexHome')

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, filename)
    result = importlib.util.module_from_spec(spec)
    sys.modules[name] = result
    spec.loader.exec_module(result)
    return result

bridge = module('art_codex_bridge', 'E:/OpenClaw/bots/feishu-e2/scripts/clone_codex_thread.py')
surface = module('art_codex_surface', home / 'skills/refresh-codex-renderer/scripts/refresh_codex_renderer.py')
records = []
with sqlite3.connect(home / 'state_5.sqlite') as connection:
    connection.row_factory = sqlite3.Row
    for task in ('cel-drawing', 'painted-background', 'scene-composition'):
        directory = team / task
        state = json.loads((directory / 'conversation.json').read_text(encoding='utf-8'))
        thread_id = None
        for line in (directory / 'events.jsonl').read_text(encoding='utf-8-sig').splitlines():
            try:
                event = json.loads(line)
                if event.get('type') == 'thread.started':
                    thread_id = event['thread_id']
                    break
            except json.JSONDecodeError:
                continue
        if not thread_id:
            raise ValueError(f'CONVERSATION_NOT_STARTED:{task}')
        paths = list((home / 'sessions').glob(f'**/rollout-*-{thread_id}.jsonl'))
        if len(paths) != 1:
            raise ValueError(f'ROLLOUT_NOT_UNIQUE:{task}')
        rollout = paths[0]
        events = []
        for line in rollout.read_text(encoding='utf-8-sig').splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        metadata = events[0]['payload']
        if metadata['id'] != thread_id or Path(metadata['cwd']).resolve() != root:
            raise ValueError(f'CONVERSATION_IDENTITY_MISMATCH:{task}')
        row = connection.execute('SELECT id, title, cwd, archived FROM threads WHERE id = ?', (thread_id,)).fetchone()
        if not row:
            prompt = (team / f'{task}.prompt.txt').read_text(encoding='utf-8')
            created = int(dt.datetime.fromisoformat(metadata['timestamp'].replace('Z', '+00:00')).timestamp())
            source = {'source': metadata.get('source', 'exec'), 'model_provider': metadata['model_provider'],
                'cwd': metadata['cwd'], 'sandbox_policy': json.dumps({'type': 'danger-full-access'}),
                'approval_mode': 'never', 'tokens_used': 0, 'has_user_event': 1,
                'git_sha': None, 'git_branch': None, 'git_origin_url': None,
                'cli_version': metadata['cli_version'], 'first_user_message': prompt,
                'agent_nickname': None, 'agent_role': None, 'memory_mode': 'enabled',
                'model': state['model'], 'reasoning_effort': state['effort'], 'agent_path': None}
            bridge.clone_thread_row(connection, source, thread_id, rollout, state['title'], created,
                int(dt.datetime.now(dt.timezone.utc).timestamp()))
            connection.commit()
        state.update(threadId=thread_id, rolloutPath=str(rollout), url=f'codex://threads/{thread_id}')
        (directory / 'conversation.json').write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
        records.append(state)
iso, unix = surface.utc_now()
surface.promote_threads(home, [record['threadId'] for record in records], iso, unix)
indexed = set()
for line in (home / 'session_index.jsonl').read_text(encoding='utf-8-sig').splitlines():
    try:
        indexed.add(json.loads(line).get('id'))
    except json.JSONDecodeError:
        continue
for record in records:
    record['indexed'] = record['threadId'] in indexed
    if not record['indexed']:
        raise ValueError('CONVERSATION_NOT_INDEXED')
result = {'checkedAt': iso, 'rendererRestarted': False, 'conversations': records}
(team / 'visible-conversations.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
