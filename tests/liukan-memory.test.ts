import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Compiler } from 'inkjs/full';
import type { GameWorld } from '../shared/types.ts';
import type { LiukanMemoryRecord, LiukanProgressRequest } from '../shared/liukan.ts';
import { LiukanMemoryStore } from '../server/liukan/memory.ts';
import { LiukanZhidaService } from '../server/liukan/zhida.ts';

function world(): GameWorld {
  const nodes: GameWorld['nodes'] = {
    start: { id: 'start', chapter: '第一章', title: '入口', location: '走廊', time: '夜', background: '', text: ['门后传来一声轻响。'], choices: [
      { id: 'open', text: '推门进去', nextNodeId: 'end' },
      { id: 'wait', text: '等同伴开门', nextNodeId: 'end' },
    ] },
    end: { id: 'end', chapter: '第一章', title: '回声', location: '门后', time: '夜', background: '', text: ['灯还亮着。', '失踪的同伴就在灯下。', '我们带上证据，一起走出了大门。'], choices: [], ending: { title: '一起回家', text: '结束', tone: 'hopeful' } },
  };
  const ink = JSON.parse(new Compiler([
    'VAR resolve = 50', 'VAR trust = 30', '-> start',
    '=== start ===', '# node:start', ...nodes.start.text,
    '* [推门进去 # choice:open]', ' -> end', '* [等同伴开门 # choice:wait]', ' -> end',
    '=== end ===', '# node:end', ...nodes.end.text, '# ending:end', '-> END',
  ].join('\n')).Compile().ToJson() as string);
  return { id: 'memory-world', storyId: '123456789', title: '回家的路', subtitle: '', introduction: [], player: { name: '我', role: '调查者' }, objective: '', startNodeId: 'start', nodes, characters: [], source: { title: '测试原作', author: '本地', url: '' }, version: '1', cover: '', background: '', summary: '', ink, clueVariables: {}, adaptation: { scope: 'original-seed', adultCast: true, note: '' } };
}

const progress = (paragraph: number, choiceId = 'open'): LiukanProgressRequest => ({ playerId: 'player', storyId: '123456789', worldId: 'memory-world', worldVersion: '1', history: [{ nodeId: 'start', choiceId }], currentParagraphIndex: paragraph });

async function setup(t: { after: (callback: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'liukan-memory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const memory = new LiukanMemoryStore(root);
  const service = new LiukanZhidaService(world, memory, async () => { throw new Error('Memory tests must not call a creative provider.'); });
  return { root, memory, service };
}

test('verified ending memory grows with reading position and survives reload without duplicate or downgrade', async t => {
  const { root, service } = await setup(t);
  const first = await service.remember(progress(0));
  assert.equal(first.length, 1);
  assert.equal(first[0].scenes.at(-1)?.text, '灯还亮着。');
  const second = await service.remember(progress(1));
  assert.equal(second.length, 1);
  assert.equal(second[0].scenes.at(-1)?.text, '灯还亮着。\n\n失踪的同伴就在灯下。');
  assert.equal(second[0].completedAt, first[0].completedAt);
  assert.doesNotMatch(second[0].scenes.at(-1)!.text, /走出了大门/);
  const finished = await service.remember(progress(2));
  assert.match(finished[0].scenes.at(-1)!.text, /一起走出了大门/);
  assert.deepEqual(await service.remember(progress(0)), finished);
  assert.deepEqual(await new LiukanMemoryStore(root).list('player'), finished);
});

test('a different verified choice leading to the same ending does not overwrite the first route', async t => {
  const { service } = await setup(t);
  const original = await service.remember(progress(0));
  const alternative = await service.remember(progress(2, 'wait'));
  assert.deepEqual(alternative, original);
  assert.equal(alternative[0].scenes[0].selectedChoice, '推门进去');
  const expanded = await service.remember(progress(2));
  assert.match(expanded[0].scenes.at(-1)!.text, /一起走出了大门/);
});

test('changed prior scenes or rewritten ending text never get merged into an earlier memory', async t => {
  const { memory, service } = await setup(t);
  const [original] = await service.remember(progress(0));
  const changedHistory = structuredClone(original);
  changedHistory.scenes[0].text = '走廊里站着另一位同伴。';
  changedHistory.scenes.at(-1)!.text += '\n\n新的结局段落。';
  assert.deepEqual(await memory.remember('player', changedHistory), [original]);
  const changedEnding = structuredClone(original);
  changedEnding.scenes.at(-1)!.text = '灯已经熄灭。\n\n新的结局段落。';
  assert.deepEqual(await memory.remember('player', changedEnding), [original]);
});

test('out-of-order concurrent reading snapshots keep the longest verified ending', async t => {
  const { service, memory } = await setup(t);
  await service.remember(progress(0));
  await Promise.all([service.remember(progress(2)), service.remember(progress(0)), service.remember(progress(1))]);
  const result = await memory.list('player');
  assert.equal(result.length, 1);
  assert.match(result[0].scenes.at(-1)!.text, /一起走出了大门/);
});

test('completion memory keeps its 50-ending bound and separates world revisions', async t => {
  const { memory, service } = await setup(t);
  const [base] = await service.remember(progress(0));
  for (let index = 1; index <= 50; index++) await memory.remember('player', { ...base, endingTitle: `结局 ${index}` });
  const capped = await memory.list('player');
  assert.equal(capped.length, 50);
  assert.equal(capped[0].endingTitle, '结局 1');
  const newest = capped.at(-1)!;
  const extended = structuredClone(newest);
  extended.scenes.at(-1)!.text += '\n\n后来读到的结局。';
  const expanded = await memory.remember('player', extended);
  assert.equal(expanded.length, 50);
  assert.equal(expanded[0].endingTitle, '结局 1');
  const revision: LiukanMemoryRecord = { ...extended, worldVersion: '2' };
  const revised = await memory.remember('player', revision);
  assert.equal(revised.length, 50);
  assert.equal(revised.filter(item => item.endingTitle === newest.endingTitle).length, 2);
  assert.equal(revised.at(-1)?.worldVersion, '2');
});

test('invalid game histories and unread positions leave persisted memory untouched', async t => {
  const { service, memory } = await setup(t);
  const original = await service.remember(progress(0));
  await assert.rejects(service.remember({ ...progress(2), history: [{ nodeId: 'end', choiceId: 'open' }] }), { code: 'INVALID_PATH' });
  await assert.rejects(service.remember(progress(2, 'missing')), { code: 'INVALID_CHOICE' });
  await assert.rejects(service.remember(progress(3)), { code: 'INVALID_PARAGRAPH' });
  assert.deepEqual(await memory.list('player'), original);
});
