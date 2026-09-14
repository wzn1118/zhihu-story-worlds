import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSceneBrief } from '../server/art-production-prompts.ts';
import type { ArtWorldInput } from '../shared/production.ts';
import { VHD_REFERENCE_FILES, vhdReferences } from '../server/art-production-references.ts';

async function promptFixture(worldId: string, nodeId: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-prompt-test-'));
  const files = [
    ...VHD_REFERENCE_FILES,
    'docs/art-direction.md',
    'docs/references/user-character-face.png',
    'output/imagegen/scene-production/references/user-living-light-20260906.png',
    'output/imagegen/scene-production/references/user-kitchen-light-20260906.png',
    'output/imagegen/scene-production/references/gate1-B01/d01-portrait-main.png',
    'output/imagegen/fang-nuo-main-integrated-v3/fang-nuo-main.png',
    'output/imagegen/blue-training-room/blue-training-room-01.png',
  ];
  // Test-only bytes exercise reference hashing, never image delivery or paid clients.
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), `test-only:${file}`);
  }
  const world: ArtWorldInput = {
    id: worldId, storyId: worldId, title: 'Test story', version: '1', characters: [],
    source: { title: 'Test source', author: 'Test', url: '' },
    nodes: { [nodeId]: { id: nodeId, chapter: 'one', title: nodeId, location: 'room',
      time: 'morning', text: ['Source scene text.'], background: '', choices: [] } },
  };
  return { root, world, node: world.nodes[nodeId] };
}

test('latest character direction precedes broader cel and environment directions', async () => {
  const { root, world, node } = await promptFixture('blue-blood', 'training');
  const { prompt, references } = await buildSceneBrief(root, world, node);
  assert.ok(prompt.startsWith('LATEST CHARACTER DRAWING: Vampire Hunter D'));
  assert.ok(prompt.indexOf('LATEST CHARACTER DRAWING:') < prompt.indexOf('BINDING MEDIUM:'));
  for (const text of ['douga cleanup', 'LARGE OPAQUE LOCAL-COLOR FILLS',
    'TWO shadow levels maximum', 'ONLY to background painting', 'native 4096 x 2304']) {
    assert.ok(prompt.includes(text), text);
  }
  assert.match(references[0], /character-silhouette\.jpg$/);
  assert.match(references[1], /character-closeup\.jpg$/);
  assert.match(references[2], /painted-valley\.jpg$/);
  assert.match(references[3], /fang-nuo-main\.png$/);
  assert.ok(prompt.includes('bright saturated green terrain'));
  assert.ok(prompt.includes('Exactly two arms and two hands per person'));
  assert.ok(prompt.includes('NO diagonal zip and NO red lapel'));
});

test('changing actual reference pixels invalidates a prepared scene', async () => {
  const { root, world, node } = await promptFixture('other-original-story', 'arrival');
  const before = await buildSceneBrief(root, world, node);
  await writeFile(path.join(root, VHD_REFERENCE_FILES[1]), 'changed-test-reference');
  const after = await buildSceneBrief(root, world, node);
  assert.notEqual(before.referenceHash, after.referenceHash);
  assert.equal(before.sourceHash, after.sourceHash);
  assert.equal(after.quality, 'high');
  assert.equal(after.pixelSize, undefined);
});

test('actual reference helper deduplicates and enforces six-input limit', () => {
  assert.equal(vhdReferences('E:/test', [VHD_REFERENCE_FILES[0]]).length, 3);
  assert.throws(() => vhdReferences('E:/test', ['a.png', 'b.png', 'c.png', 'd.png']), /MAX_SIX/);
});

test('other story nodes also receive the current character direction', async () => {
  const { root, world, node } = await promptFixture('other-original-story', 'arrival');
  const { prompt } = await buildSceneBrief(root, world, node);
  assert.ok(prompt.startsWith('LATEST CHARACTER DRAWING: Vampire Hunter D'));
  assert.ok(prompt.includes('Preserve this story\'s original cast, period and costumes'));
  assert.ok(prompt.includes('Source scene text.'));
});

test('contrasting supper uses its own cast and coherent scene, not old correction history', async () => {
  const { root, world, node } = await promptFixture('velvet-alibi', 'dinner');
  const { prompt, references } = await buildSceneBrief(root, world, node);
  assert.ok(prompt.includes('Du Mansheng'));
  assert.ok(prompt.includes('Lin Wanglu'));
  assert.ok(prompt.includes('An ordinary supper conversation'));
  assert.ok(prompt.includes('RIGHT TO LEFT'));
  assert.ok(prompt.includes('Exactly TWO noodle bowls and TWO egg halves'));
  assert.ok(!prompt.includes('ART-DIRECTOR CORRECTION v2'));
  assert.ok(!references.some(ref => ref.includes('fang-nuo')));
});

test('text-only artist direction is passed verbatim without loading or injecting older reference images', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-text-only-test-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, 'server/art-production-studies'), { recursive: true });
  await writeFile(path.join(root, 'docs/art-direction.md'), 'Current direction evidence');
  const prompt = 'Original character and current scene. Named animation style.';
  await writeFile(path.join(root, 'server/art-production-studies/cel-drawing.ts'),
    `export const buildArtDirection = async () => ({ prompt: ${JSON.stringify(prompt)}, references: [] });`);
  const world = { id: 'blue-blood', storyId: 'blue-blood', title: 'Story', version: '1',
    characters: [], source: { title: 'Source', author: 'Test', url: '' }, nodes: {
      fresh: { id: 'fresh', title: 'Fresh', location: 'One room', time: 'Day', text: ['Actual action'], choices: [], background: '' },
    } } as unknown as ArtWorldInput;
  const before = await buildSceneBrief(root, world, world.nodes.fresh);
  assert.equal(before.prompt, prompt);
  assert.deepEqual(before.references, []);
  assert.equal(before.quality, undefined);
  assert.equal(before.pixelSize, undefined);
  world.nodes.fresh.text = ['Revised actual action'];
  const after = await buildSceneBrief(root, world, world.nodes.fresh);
  assert.notEqual(after.sourceHash, before.sourceHash);
  assert.equal(after.referenceHash, before.referenceHash);
});
