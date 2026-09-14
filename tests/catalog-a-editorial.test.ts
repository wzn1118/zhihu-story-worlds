import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { AuthoredWorld } from '../content/worlds.ts';
import { catalogWorldsA } from '../content/catalog-a.ts';
import { catalogACrises } from '../content/catalog-a-crises.ts';
import { compileWorld } from '../server/worlds.ts';
import { choiceBlockers } from '../shared/choice-rules.ts';
import { choose, restoreSession, saveSession, type SavedGame } from '../src/game.ts';
import { enumerateA, replayA } from './catalog-a-graph.ts';

const baseline = JSON.parse(readFileSync(new URL('./catalog-a-v1.fixture.json', import.meta.url), 'utf8')) as AuthoredWorld[];
const gameplay = (choice: AuthoredWorld['nodes'][string]['choices'][number]) => JSON.parse(JSON.stringify({
  id: choice.id, nextNodeId: choice.nextNodeId, effects: choice.effects, requires: choice.requires, requiresClue: choice.requiresClue, repeatable: choice.repeatable,
}));

test('Catalog A baseline audit distinguishes two old dark tags from seven zero-dark worlds', () => {
  assert.equal(baseline.length, 8);
  assert.equal(baseline.flatMap(w => Object.values(w.nodes)).length, 248);
  assert.equal(baseline.flatMap(w => Object.values(w.nodes).flatMap(n => n.choices)).length, 639);
  assert.deepEqual(baseline.map(w => Object.values(w.nodes).filter(n => n.ending?.tone === 'dark').length), [0, 2, 0, 0, 0, 0, 0, 0]);
  assert.equal(catalogWorldsA.find(w => w.id === 'rotten-pilgrimage')!.nodes.ending_spent.ending!.tone, 'uneasy');
});

for (const authored of catalogWorldsA) {
  const old = baseline.find(w => w.id === authored.id)!;
  const world = compileWorld(authored), graph = enumerateA(world);
  const oldWorld = compileWorld(old), oldGraph = enumerateA(oldWorld);
  const crises = catalogACrises[world.id];

  test(`${world.id}: all 1.0 node/choice/resource/source contracts survive exactly`, () => {
    assert.equal(world.version, '1.1.0');
    assert.deepEqual(world.compatibleSaveVersions, ['1.0.0']);
    for (const key of ['id', 'storyId', 'startNodeId', 'source', 'resources', 'characters', 'player'] as const) assert.deepEqual(authored[key], old[key], key);
    for (const node of Object.values(old.nodes)) {
      const updated = world.nodes[node.id];
      assert.ok(updated, node.id);
      assert.deepEqual(updated.choices.slice(0, node.choices.length).map(c => c.id), node.choices.map(c => c.id), 'old order retained');
      for (const choice of node.choices) {
        const current = updated.choices.find(c => c.id === choice.id)!;
        assert.deepEqual(gameplay(current), gameplay(choice), `${node.id}/${choice.id}`);
        for (const text of [choice.text, ...(choice.legacyTexts ?? [])]) assert.ok(current.text === text || current.legacyTexts?.includes(text), `lost exact old text ${text}`);
      }
    }
    assert.match(world.adaptation.note, /缓存节选之后的原作正文/);
  });

  test(`${world.id}: real frozen 1.0 Ink saves migrate at every old edge, with IDs and text-only histories`, context => {
    const paths = [[], ...oldGraph.edgePaths.values()];
    for (const path of paths) {
      const previous = replayA(oldWorld, path);
      const saved = JSON.parse(JSON.stringify(saveSession(previous))) as SavedGame;
      for (const textOnly of [false, true]) {
        const imported = structuredClone(saved);
        if (textOnly) for (const entry of imported.history) delete entry.choiceId;
        const restored = restoreSession(world, imported);
        assert.equal(restored.node.id, previous.node.id, path.join(' > '));
        assert.deepEqual(restored.resources, previous.resources);
        assert.deepEqual(restored.clues, previous.clues);
        assert.equal(restored.resolve, previous.resolve);
        assert.equal(restored.trust, previous.trust);
        assert.equal(restored.choiceCount, previous.choiceCount);
        assert.deepEqual(restored.choices.map(c => c.id), replayA(world, path).choices.map(c => c.id));
      }
    }
    // A still older text-only history may contain any of the frozen aliases.
    for (const node of Object.values(old.nodes)) for (const choice of node.choices) for (const text of choice.legacyTexts ?? []) {
      const path = oldGraph.edgePaths.get(`${node.id}:${choice.id}`)!;
      const saved = saveSession(replayA(oldWorld, path));
      for (const entry of saved.history) delete entry.choiceId;
      saved.history[saved.history.length - 2].choice = text;
      assert.equal(restoreSession(world, saved).node.id, choice.nextNodeId);
    }
    context.diagnostic(JSON.stringify({ frozenEdges: oldGraph.edgePaths.size, migratedSaves: paths.length * 2 }));
  });

  test(`${world.id}: two deliberate failures have two-stage warnings and playable zero-cost remedies`, () => {
    assert.equal(crises.length, 2);
    assert.equal(Object.values(world.nodes).length, 37);
    assert.equal(Object.values(world.nodes).filter(n => !n.ending).length, 29);
    assert.equal(Object.values(world.nodes).filter(n => n.ending).length, 8);
    assert.ok(Object.values(world.nodes).filter(n => n.ending?.tone === 'dark').length >= 2);
    for (const branch of crises) {
      const [first, second] = branch.nodes;
      const path = graph.nodePaths.get(second.id)!;
      const session = replayA(world, path);
      assert.ok(path.includes(branch.entry.id));
      assert.ok(session.clues.includes(branch.warning));
      assert.ok(session.clues.includes(branch.mistake));
      // Each new node offers different future scenes, not button-only variants.
      for (const id of [first.id, second.id]) {
        const node = world.nodes[id];
        assert.equal(new Set(node.choices.map(c => c.nextNodeId)).size, node.choices.length);
        assert.equal(node.text.length, 3);
        assert.ok(node.text.every(p => p.length >= 28));
        const exhausted = { ...session, resources: Object.fromEntries(world.resources!.map(r => [r.id, r.min])) };
        const available = node.choices.filter(c => !choiceBlockers(c, exhausted, world.resources).length);
        assert.ok(available.filter(c => world.nodes[c.nextNodeId].ending?.tone !== 'dark').length >= 2);
      }
      const failChoice = session.choices.find(c => c.id === branch.commit)!;
      const noWarning = { ...session, clues: session.clues.filter(c => c !== branch.warning) };
      const noMistake = { ...session, clues: session.clues.filter(c => c !== branch.mistake) };
      assert.ok(choiceBlockers(failChoice, noWarning, world.resources).length);
      assert.ok(choiceBlockers(failChoice, noMistake, world.resources).length);
      // Ink engines are stateful: branch from a frozen pre-decision save, not
      // from a Session whose engine was already advanced down the failure.
      const saved = saveSession(session);
      const fail = choose(session, failChoice);
      assert.equal(fail.node.id, branch.ending);
      assert.equal(fail.node.ending?.tone, 'dark');
      assert.equal(restoreSession(world, saveSession(fail)).node.id, branch.ending);
      const retreatStart = restoreSession(world, saved);
      const retreat = choose(retreatStart, retreatStart.choices.find(c => c.id === branch.retreat)!);
      assert.equal(retreat.node.id, branch.resume);
      assert.notEqual(retreat.node.ending?.tone, 'dark');
      assert.equal(restoreSession(world, saveSession(retreat)).node.id, branch.resume);
      // A counterfactual retry from the very same pre-failure save is supported.
      const retry = restoreSession(world, saved);
      assert.equal(choose(retry, retry.choices.find(c => c.id === branch.retreat)!).node.id, branch.resume);
    }
  });

  test(`${world.id}: existing exclusive routes stay disjoint and reach their own endings after five decisions`, context => {
    const entrances = world.nodes[world.startNodeId].choices.filter(c => c.id.startsWith('route_'));
    const sets = entrances.map(entrance => {
      const visited = new Set<string>(), stack = [entrance.nextNodeId];
      while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id) || world.nodes[id].ending) continue;
        visited.add(id); stack.push(...world.nodes[id].choices.map(c => c.nextNodeId));
      }
      assert.ok(visited.size >= 8);
      return visited;
    });
    assert.equal(entrances.length, 2);
    assert.deepEqual([...sets[0]].filter(id => sets[1].has(id)), []);
    for (let i = 0; i < crises.length; i++) {
      const branch = crises[i];
      assert.ok(sets[i].has(branch.from));
      const path = graph.nodePaths.get(branch.ending)!;
      const played = replayA(world, path);
      const exclusiveDecisions = played.history.filter(h => sets[i].has(h.nodeId) && h.choiceId);
      assert.ok(exclusiveDecisions.length >= 7, `${branch.ending}: failure comes before five original + two crisis decisions`);
    }
    for (const state of graph.states) {
      const node = world.nodes[state.nodeId];
      if (node.ending) continue;
      const available = node.choices.filter(c => !choiceBlockers(c, state, world.resources).length);
      assert.ok(available.some(c => world.nodes[c.nextNodeId].ending?.tone !== 'dark'), `forced dark at ${node.id}`);
    }
    for (const ending of Object.values(world.nodes).filter(n => n.ending)) {
      assert.deepEqual(ending.choices, []);
      assert.equal(ending.ending!.text, ending.text[2]);
      assert.doesNotMatch(ending.text[2], /[？?]$|下一次是否|只能等下一次|明日出发前|回头时，西行路又长/);
      const session = replayA(world, graph.nodePaths.get(ending.id)!);
      assert.equal(restoreSession(world, saveSession(session)).node.id, ending.id);
    }
    context.diagnostic(JSON.stringify({ states: graph.states.length, edges: graph.edgePaths.size, exclusive: sets.map(s => s.size) }));
  });

  const cachePath = new URL(`../.local/zhihu-cache/story-${world.storyId}.json`, import.meta.url);
  test(`${world.id}: unchanged exact attribution is backed by the real cached excerpt`, { skip: !existsSync(cachePath) }, context => {
    const data = JSON.parse(readFileSync(cachePath, 'utf8')).data;
    assert.equal(world.source.title, data.chapter_name);
    assert.equal(world.source.author, data.author_name);
    assert.equal(world.storyId, data.work_id);
    assert.equal(world.source.url, old.source.url);
    assert.ok(data.content.length > 2000);
    context.diagnostic(JSON.stringify({ id: data.work_id, codepoints: [...data.content].length, contentSha256: createHash('sha256').update(data.content).digest('hex') }));
  });
}

test('Catalog A crisis prose is individually authored, not duplicate transitions or illustration placeholders', () => {
  const newNodes = Object.values(catalogACrises).flatMap(branches => branches.flatMap(b => b.nodes));
  assert.equal(newNodes.length, 48);
  for (const branch of Object.values(catalogACrises).flat()) {
    assert.doesNotMatch(branch.warning + branch.mistake, /[a-z_:]|风险已明示|后果已出现/);
  }
  const paragraphs = newNodes.flatMap(n => n.text);
  assert.equal(new Set(paragraphs).size, paragraphs.length);
  assert.ok(newNodes.every(n => n.location.trim() && n.title.trim()));
  assert.ok(newNodes.every(n => !n.text.some(p => /待生成|此处填写|插入场景|PLACEHOLDER/.test(p))));
});
