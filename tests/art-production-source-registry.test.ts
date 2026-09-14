import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import type { ArtWorldInput } from '../shared/production.ts';
import { ART_WORLD_OWNERS } from '../server/art-production-delegates.ts';
import { anchorNodeId, buildShortPlans, sourceSnapshotHash, type ShortAssetPlan } from '../server/art-production-short.ts';
import { buildArtSourceMetadata, sourceBookArtMetadata, type SourceBookWorld } from '../server/art-production-source-registry.ts';

function fixture() {
  const world: ArtWorldInput = { id: 'blue-blood', storyId: 'fixture-source', title: 'Fixture', version: 'r1',
    source: { title: '', author: '', url: '' }, characters: [{ id: 'lead', name: 'Authored lead', role: 'lead', description: '' }],
    nodes: Object.fromEntries(['station', 'b_burn'].map(id => [id, { id, chapter: '', title: id, location: '', time: '',
      background: '/assets/fixture.webp', text: ['Unchanged source scene'], choices: [] }])) };
  const direction = (name: string) => ({ prompt: `吸血鬼猎人D画风，${name}，灰底半身像。`, sourceFacts: [`${name}的既有设定。`] });
  const book: SourceBookWorld = { characters: { lead: direction('Source lead'), staff: direction('工作人员'),
    manager: direction('王经理'), mother: direction('方诺母亲') },
    nodes: Object.fromEntries(Object.entries(world.nodes).map(([id, node]) => [id,
      { characterIds: ['lead', 'staff'], sourceSnapshotHash: sourceSnapshotHash(world, node) }])) };
  const make = (nodeId: string, kind: ShortAssetPlan['kind'], dependencies: string[] = []): ShortAssetPlan =>
    ({ worldId: world.id, owner: 'cel-drawing', nodeId, kind, dependencies, sourceHash: 'a'.repeat(64), prompt: '', sourceFacts: [] });
  const plans = [...Object.keys(book.characters).flatMap(id => [make(anchorNodeId(id), 'character-anchor'),
    make(`__art_reaction_${id}`, 'character-reaction', [anchorNodeId(id)])]),
    ...Object.keys(world.nodes).map(id => make(id, 'scene', ['__art_character_lead', '__art_character_staff']))];
  return { world, book, plans };
}

test('all exact book identities are registered independently of mother/reaction readiness without changing authored characters', () => {
  const { world, book, plans } = fixture(), original = structuredClone(world);
  const result = sourceBookArtMetadata(world, book, plans);
  assert.deepEqual(result.supportingCharacters.map(character => character.id), ['staff', 'manager', 'mother']);
  assert.deepEqual(result.supportingCharacters.find(character => character.id === 'manager'),
    { id: 'manager', name: '王经理', role: '故事人物', description: '王经理的既有设定。' });
  assert.equal(result.supportingCharacters.some(character => 'portrait' in character || 'portraits' in character || 'stagePortraits' in character), false);
  assert.deepEqual(world, original);
  assert.equal(world.characters[0].name, 'Authored lead');
  // A reaction-only delivery still has a source identity; publishing metadata
  // does not assert that an approved transparent mother is available for staging.
  assert.ok(result.supportingCharacters.find(character => character.id === 'manager'));
});

test('current source membership retains order and restricts the station worker to the station', () => {
  const { world, book, plans } = fixture();
  const result = sourceBookArtMetadata(world, book, plans);
  assert.deepEqual(result.sceneCharacters.station, ['lead', 'staff']);
  assert.deepEqual(result.sceneCharacters.b_burn, ['lead']);
  assert.equal(result.sceneCharacters.__art_character_staff, undefined);
});

test('changed text, blocked directions and book/plan revision conflicts cannot publish a scene cast', () => {
  const { world, book, plans } = fixture();
  const changed = structuredClone(world); changed.nodes.station.text.push('New source action.');
  assert.equal(sourceBookArtMetadata(changed, book, plans).sceneCharacters.station, undefined);
  const blocked = plans.map(plan => plan.nodeId === 'station' ? { ...plan, blocked: 'SOURCE_CHANGED_REQUIRES_OWNER_REFRESH' } : plan);
  assert.equal(sourceBookArtMetadata(world, book, blocked).sceneCharacters.station, undefined);
  const mixed = structuredClone(book); mixed.nodes.station.characterIds = ['staff', 'lead'];
  assert.equal(sourceBookArtMetadata(world, mixed, plans).sceneCharacters.station, undefined);
  assert.deepEqual(sourceBookArtMetadata(world, mixed, plans).sceneCharacters.b_burn, ['lead']);
});

test('identity metadata comes from the original book label and missing identity plans fail before publication', () => {
  const { world, book, plans } = fixture();
  plans.find(plan => plan.nodeId === '__art_character_manager')!.prompt = '吸血鬼猎人D画风，动画赛璐珞平涂，王经理。';
  assert.equal(sourceBookArtMetadata(world, book, plans).supportingCharacters.find(character => character.id === 'manager')?.name, '王经理');
  assert.throws(() => sourceBookArtMetadata(world, book, plans.filter(plan => plan.nodeId !== '__art_character_manager')),
    /ART_SOURCE_CHARACTER_PLAN_MISSING:blue-blood\/manager/);
  const invalid = structuredClone(book); invalid.characters.manager.prompt = 'Unlabeled production prompt';
  assert.throws(() => sourceBookArtMetadata(world, invalid, plans), /ART_SOURCE_CHARACTER_INVALID:manager/);
});

test('real owner books cover every authored-world identity and every current source scene', async () => {
  const before = structuredClone(authoredWorlds);
  const plans = await buildShortPlans(resolve(), authoredWorlds);
  const registry = await buildArtSourceMetadata(resolve(), authoredWorlds, plans);
  const books = new Map<string, { worlds: Record<string, SourceBookWorld> }>();
  for (const owner of new Set(Object.values(ART_WORLD_OWNERS))) books.set(owner, JSON.parse(await readFile(resolve(
    'output/imagegen/scene-production/art-team', owner, 'short-production-20260907/book.json'), 'utf8')));
  assert.equal(registry.size, authoredWorlds.length);
  for (const world of authoredWorlds) {
    const metadata = registry.get(world.id)!, book = books.get(ART_WORLD_OWNERS[world.id])!.worlds[world.id];
    const known = new Set([...world.characters, ...metadata.supportingCharacters].map(character => character.id));
    for (const id of Object.keys(book.characters)) assert.ok(known.has(id), `${world.id}/${id}`);
    assert.equal(new Set(metadata.supportingCharacters.map(character => character.id)).size, metadata.supportingCharacters.length);
    for (const plan of plans.filter(plan => plan.worldId === world.id && plan.kind === 'scene' && !plan.blocked)) {
      assert.ok(Object.hasOwn(metadata.sceneCharacters, plan.nodeId), `${world.id}/${plan.nodeId}`);
      assert.ok(metadata.sceneCharacters[plan.nodeId].every(id => known.has(id) && book.nodes[plan.nodeId].characterIds.includes(id)));
    }
  }
  assert.deepEqual(authoredWorlds, before);
  assert.ok(registry.get('blue-blood')!.sceneCharacters.station.includes('staff'));
  assert.ok(!registry.get('blue-blood')!.sceneCharacters.b_burn.includes('staff'));
});

test('human/animal, old-age and travel variants retain their exact book identities', async () => {
  const plans = await buildShortPlans(resolve(), authoredWorlds);
  const registry = await buildArtSourceMetadata(resolve(), authoredWorlds, plans);
  const tiger = registry.get('tiger-shelter')!.supportingCharacters;
  for (const id of ['junzhouH', 'junzhouT', 'junchaoH', 'junchaoT']) assert.ok(tiger.some(character => character.id === id));
  assert.equal(tiger.find(character => character.id === 'junzhouH')?.name, '君洲');
  assert.equal(tiger.find(character => character.id === 'junzhouT')?.name, '君洲');
  assert.equal(registry.get('future-island')!.supportingCharacters.find(character => character.id === 'xiwei_old')?.name, '暮年郗未');
  assert.equal(registry.get('ming-whisper')!.supportingCharacters.find(character => character.id === 'zhou_travel')?.name, '行旅周鉴');
  const water = registry.get('tiger-shelter')!.sceneCharacters.b_water;
  assert.ok(water.includes('pond_worker'));
  assert.ok(!water.includes('keeper'));
});
