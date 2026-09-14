import assert from 'node:assert/strict';
import test from 'node:test';
import { artStatusLabel, memoryMarkdown, memoryMatches, preferredPreflightProject, projectPreflight, projectStatusLabel } from '../src/liukan-activity-view.ts';
import type { LiukanMemoryRecord } from '../shared/liukan.ts';
import type { WorkshopProject } from '../shared/workshop.ts';
import { LiukanMemoryStore } from '../server/liukan/memory.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const project = { status: 'running', stage: 'scenes', art: { status: 'pending', approved: 0, total: 30 } } as const;
const memory: LiukanMemoryRecord = { storyId: 's', worldId: 'w', worldVersion: 'r1', title: '海底回声', endingTitle: '守住闸门', completedAt: '2026-09-13T00:00:00.000Z', scenes: [{ title: '值班室', text: '录音台亮着红灯。', selectedChoice: '先听录音' }] };

test('activity labels stay honest about separate text and art progress', () => {
  assert.equal(projectStatusLabel(project), '正在写场景与选择');
  assert.equal(artStatusLabel(project), '插图待制作 0/30');
});

test('memory search only matches stored scenes and choices', () => {
  assert.equal(memoryMatches(memory, '录音台'), true);
  assert.equal(memoryMatches(memory, '没走过的场景'), false);
});

test('memory markdown preserves each actual scene and choice', () => {
  const output = memoryMarkdown(memory);
  assert.match(output, /值班室/);
  assert.match(output, /选择：先听录音/);
});

test('memory profile counts distinct stories and keeps the latest ending', async () => {
  const root = await mkdtemp(join(tmpdir(), 'liukan-memory-profile-'));
  try {
    const store = new LiukanMemoryStore(root);
    const base = { storyId: 'story-a', worldId: 'world-a', worldVersion: 'r1', title: '故事 A', scenes: [{ title: '开场', text: '真实场景' }] };
    await store.remember('player', { ...base, endingTitle: '结局甲', completedAt: '2026-09-12T00:00:00Z' });
    await store.remember('player', { ...base, endingTitle: '结局乙', completedAt: '2026-09-13T00:00:00Z' });
    await store.remember('player', { ...base, storyId: 'story-b', worldId: 'world-b', title: '故事 B', endingTitle: '结局丙', completedAt: '2026-09-11T00:00:00Z' });
    assert.deepEqual(await store.profile('player'), { playerId: 'player', storyCount: 2, endingCount: 3, sceneCount: 3, recent: { title: '故事 A', endingTitle: '结局乙', completedAt: '2026-09-13T00:00:00Z' } });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('preflight keeps text, graph, art and real journey progress separate', () => {
  const ready = {
    id: 'import-ready', title: '深海值班室', author: '作者', scope: 'user-import', sourceHash: 'source', createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:00.000Z', revision: 1,
    status: 'ready', stage: 'ready', completedRoutes: 3, playable: true, attempts: 1,
    validation: { scenes: 30, decisions: 30, endings: 6, badEnds: 3, routes: 3, states: 30 },
    art: { status: 'queued', approved: 0, total: 30 }, events: [],
  } as unknown as WorkshopProject;
  const result = projectPreflight(ready, [{ ...memory, storyId: 'import-ready' }]);
  assert.equal(result.confirmed, 4);
  assert.equal(result.items.find(item => item.id === 'art')?.state, 'waiting');
  assert.equal(result.items.find(item => item.id === 'journey')?.state, 'ready');
  assert.equal(result.nextStep.canOpenProject, true);
});

test('preflight reports missing graph records and never invents a player memory', () => {
  const stalled = {
    id: 'import-stalled', title: '空白剧本', author: '作者', scope: 'original-seed', sourceHash: 'seed', createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:00.000Z', revision: 1,
    status: 'interrupted', stage: 'validation', completedRoutes: 0, playable: false, attempts: 1,
    art: { status: 'pending', approved: 0, total: 0 }, events: [],
  } as unknown as WorkshopProject;
  const result = projectPreflight(stalled, [memory]);
  assert.equal(result.items.find(item => item.id === 'structure')?.title, '还没有图谱统计');
  assert.equal(result.items.find(item => item.id === 'journey')?.state, 'waiting');
  assert.match(result.items.find(item => item.id === 'journey')?.detail ?? '', /真实游玩过程/);
});

test('preflight defaults to a playable project before a running or stalled project', () => {
  const running = { ...project, id: 'running', playable: false } as unknown as WorkshopProject;
  const ready = { ...running, id: 'ready', status: 'ready', stage: 'ready', playable: true } as WorkshopProject;
  assert.equal(preferredPreflightProject([running, ready])?.id, 'ready');
});
