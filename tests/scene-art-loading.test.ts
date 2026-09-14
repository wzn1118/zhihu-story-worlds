import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds, type AuthoredWorld } from '../content/worlds.ts';
import { compileWorld, getWorld } from '../server/worlds.ts';
import { bindCharacterCutouts, type CharacterCutout, type CutoutSource } from '../src/character-cutouts.ts';
import { startSession } from '../src/game.ts';
import { sceneCharacterPresentation } from '../src/scene-character-art.ts';
import { hasSceneArtHold } from '../src/scene-art-holds.ts';
import { sceneArtSources, upcomingSceneArt } from '../src/scene-art-loading.ts';

const heldSources = new Set([
  '/generated-art/scene_086b9e5b34a5b16237dac27aaaf8.png',
  '/generated-art/scene_77a0a48958feec2683d35c5faa67.png',
]);

for (const authored of authoredWorlds) {
  test(`${authored.id}: every scene schedules only its selected art without advancing the live Ink state`, () => {
    const world = structuredClone(getWorld(authored.storyId));
    const original = JSON.stringify(world);
    const session = startSession(world), inkState = session.engine.state.ToJson();
    const progress = JSON.stringify({ resources: session.resources, clues: session.clues, history: session.history, choices: session.choices });
    for (const node of Object.values(world.nodes)) {
      for (let index = 0; index < node.text.length; index++) {
        const label = `${world.id}/${node.id}/paragraph ${index}`;
        const current = sceneArtSources(world, node, node.text[index]);
        assert.ok(current.length <= 2, `${label}: at most the background and one portrait`);
        assert.equal(current.length, new Set(current).size, `${label}: current art is deduplicated`);
        const background = node.background || world.background;
        if (hasSceneArtHold(world.id, node.id, background)) assert.deepEqual(current, [], label);
        else {
          if (background) assert.equal(current[0], background, `${label}: selected background is first`);
          const actor = sceneCharacterPresentation(world, node, node.text[index]);
          for (const source of current.filter(source => source !== background)) {
            const url = source.split('?')[0];
            assert.equal(url, actor?.sources[0], `${label}: only the actual actor's first available portrait`);
            assert.ok(!heldSources.has(url), `${label}: held artwork is not downloaded`);
          }
          if (node.ending || node.backgroundArtKind === 'scene') assert.equal(current.length, background ? 1 : 0, label);
        }
        for (const intended of [undefined, ...node.choices.map(choice => choice.nextNodeId)]) {
          const next = upcomingSceneArt(world, node, node.text, index, intended);
          assert.ok(next.length <= 3, `${label}: speculative work stays bounded`);
          assert.equal(next.length, new Set(next).size, `${label}: speculative art is deduplicated`);
          assert.ok(next.every(source => !current.includes(source)), `${label}: current requests are not repeated`);
          const permitted = new Set(node.text.slice(index + 1).flatMap(text => sceneArtSources(world, node, text)));
          if (intended) sceneArtSources(world, world.nodes[intended]).forEach(source => permitted.add(source));
          assert.ok(next.every(source => permitted.has(source)), `${label}: unselected branches cannot contribute art`);
          assert.ok(next.every(source => !heldSources.has(source)), `${label}: held destinations cannot be warmed`);
        }
      }
    }
    assert.equal(JSON.stringify(world), original, 'Computing lookahead must not alter the world or publication proof');
    assert.equal(session.engine.state.ToJson(), inkState, 'Lookahead must not execute or choose Ink branches');
    assert.equal(JSON.stringify({ resources: session.resources, clues: session.clues, history: session.history, choices: session.choices }), progress);
  });
}

function actorProof(id: string, digit: string, reaction = false) {
  const jobId = `scene_${digit.repeat(28)}`, sha256 = digit.repeat(64);
  const source: CutoutSource = { nodeId: `${reaction ? '__art_reaction_' : '__art_character_'}${id}`, jobId,
    sourceHash: 'a'.repeat(64), assetKind: reaction ? 'character-reaction' : 'character-anchor',
    review: 'approved', bindingReady: true, gameReady: false,
    asset: { url: `/generated-art/${jobId}.png`, sha256, width: 1024, height: 1536 } };
  const portrait: CharacterCutout = { worldId: 'loading-fixture', nodeId: source.nodeId, jobId, sourceHash: source.sourceHash!,
    sourceUrl: source.asset.url, sourceSha256: sha256, url: `/generated-art/cutouts/${jobId}-${sha256.slice(0, 12)}.png`,
    sha256, width: 1024, height: 1536, review: 'approved' };
  return { source, portrait, url: `${portrait.url}?sha256=${sha256}` };
}

function fixture() {
  const actors = [actorProof('alice', '1'), actorProof('bob', '2'), actorProof('carol', '3'), actorProof('dana', '4'), actorProof('alice', '5', true)];
  const node = (id: string, background: string, text: string[]) => ({ id, chapter: '', title: id, location: '', time: '', background,
    backgroundArtKind: 'environment' as const, text, choices: [] });
  const authored: AuthoredWorld = { id: 'loading-fixture', storyId: '9999999999900001', version: '1', title: 'Loading fixture', subtitle: '',
    introduction: [], player: { name: 'Reader', role: '' }, objective: '', startNodeId: 'entry', summary: '',
    source: { title: '', author: '', url: '' }, cover: '/assets/unneeded-cover.png', background: '/assets/world-default.png',
    adaptation: { scope: 'original-seed', adultCast: true, note: '' },
    characters: ['alice', 'bob', 'carol', 'dana'].map(id => ({ id, name: id, role: '', description: '', portrait: `/assets/unneeded-${id}.png` })),
    nodes: {
      entry: { ...node('entry', '/assets/current-room.png', ['alice enters.', 'Still alice.', 'bob answers.', 'carol leaves.']),
        choices: [{ id: 'hallway', text: 'Hallway', nextNodeId: 'hallway' }, { id: 'vault', text: 'Vault', nextNodeId: 'vault' }] },
      hallway: { ...node('hallway', '/assets/intended-hallway.png', ['dana waits.']), character: { id: 'dana' },
        ending: undefined },
      vault: { ...node('vault', '/assets/unselected-vault.png', ['carol waits.']), character: { id: 'carol' } },
    } };
  // Terminal fixtures require explicit endings for Ink compilation; remove them
  // from the display snapshot so actor selection remains testable.
  authored.nodes.hallway.ending = { title: 'Hallway', text: '', tone: 'hopeful' };
  authored.nodes.vault.ending = { title: 'Vault', text: '', tone: 'hopeful' };
  const world = compileWorld(authored);
  delete world.nodes.hallway.ending;
  delete world.nodes.vault.ending;
  bindCharacterCutouts(world, actors.map(actor => actor.source), { schemaVersion: 1, entries: actors.map(actor => actor.portrait) },
    { entry: ['alice', 'bob', 'carol'], hallway: ['dana'], vault: ['carol'] });
  return { world, actors };
}

test('current frame requests its primary approved portrait without reference images, fallback poses or alternate backgrounds', () => {
  const { world, actors } = fixture();
  world.nodes.entry.artSceneVariants = [{ url: '/assets/unselected-room.png', sha256: 'a'.repeat(64), kind: 'environment' }];
  assert.deepEqual(sceneArtSources(world, world.nodes.entry), ['/assets/current-room.png', actors[0].url]);
  assert.equal(world.characters[0].stagePortraits?.reaction?.url, actors[4].portrait.url, 'A real fallback exists but is not warmed');
  assert.deepEqual(sceneArtSources(world, undefined), []);
});

test('lookahead warms only the next actor change and an explicitly intended branch, never every later actor or branch', () => {
  const { world, actors } = fixture(), node = world.nodes.entry;
  assert.deepEqual(upcomingSceneArt(world, node, node.text, 0), [actors[1].url]);
  assert.deepEqual(upcomingSceneArt(world, node, node.text, 0, 'hallway'),
    [actors[1].url, '/assets/intended-hallway.png', actors[3].url]);
  assert.deepEqual(upcomingSceneArt(world, node, node.text, 2), [actors[2].url]);
  assert.deepEqual(upcomingSceneArt(world, node, node.text, 3), []);
  assert.deepEqual(upcomingSceneArt(world, node, node.text, 3, 'missing'), []);
});

test('shared destination images deduplicate against the current frame and the next paragraph', () => {
  const { world, actors } = fixture(), node = world.nodes.entry;
  world.nodes.hallway.background = node.background;
  world.nodes.hallway.character = { id: 'bob' };
  assert.deepEqual(upcomingSceneArt(world, node, node.text, 0, 'hallway'), [actors[1].url]);
  world.nodes.hallway.character = { id: 'alice' };
  assert.deepEqual(upcomingSceneArt(world, node, node.text, 3, 'hallway'), [actors[0].url]);
});

test('held scene and held destination art remain closed, while a replacement URL becomes loadable', () => {
  const { world } = fixture();
  world.id = 'ming-whisper';
  const held = { ...world.nodes.hallway, id: 'escort_muster', background: [...heldSources][0] };
  world.nodes.escort_muster = held;
  assert.deepEqual(sceneArtSources(world, held), []);
  assert.deepEqual(upcomingSceneArt(world, world.nodes.entry, world.nodes.entry.text, 3, 'escort_muster'), []);
  held.background = '/generated-art/scene_replacement.png';
  held.backgroundArtKind = 'scene';
  assert.deepEqual(sceneArtSources(world, held), [held.background]);
});

test('imported private scenes use the same bounded lookahead and never warm every generated page', () => {
  const { world } = fixture();
  world.storyId = 'import-fixture';
  world.id = 'workshop-fixture-r1';
  world.nodes.entry.background = '/generated-art/workshop/wscene_aaa.png';
  world.nodes.hallway.background = '/generated-art/workshop/wscene_bbb.png';
  world.nodes.vault.background = '/generated-art/workshop/wscene_ccc.png';
  for (const node of Object.values(world.nodes)) node.backgroundArtKind = 'scene';
  const original = JSON.stringify(world);
  assert.deepEqual(sceneArtSources(world, world.nodes.entry), ['/generated-art/workshop/wscene_aaa.png']);
  assert.deepEqual(upcomingSceneArt(world, world.nodes.entry, world.nodes.entry.text, 0), []);
  assert.deepEqual(upcomingSceneArt(world, world.nodes.entry, world.nodes.entry.text, 0, 'hallway'), ['/generated-art/workshop/wscene_bbb.png']);
  assert.equal(JSON.stringify(world), original);
});
