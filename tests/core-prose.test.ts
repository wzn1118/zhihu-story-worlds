import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { authoredWorlds, type AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { restoreSession, saveSession } from '../src/game.ts';
import { explore, replay } from './core-creative-support.ts';

const before: AuthoredWorld[] = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/core-pre-prose.json.gz', import.meta.url))).toString());
const canonical = (value: unknown) => JSON.parse(JSON.stringify(value));
const prose = (world: AuthoredWorld) => [
  world.summary, ...world.introduction, ...world.characters.map(c => c.description),
  ...Object.values(world.nodes).flatMap(n => [n.title, ...n.text, ...n.choices.flatMap(c => [c.text, c.hint, c.feedback?.text])]),
].filter(Boolean).join('\n');

test('core prose revision reduces contrast and emphasis while leaving source quotations intact', context => {
  for (const old of before) {
    const world = authoredWorlds.find(w => w.id === old.id)!;
    // Count only visible authored prose, excluding exact source quotes and save aliases.
    const count = (w: AuthoredWorld) => [...prose(w).matchAll(/不是|不只是|真正|并非|而是/g)].length;
    assert.ok(count(world) <= count(old) / 2, world.id);
    assert.deepEqual(world.source, old.source);
    assert.deepEqual(world.sourcePassages?.map(p => [p.id, p.quote, p.nodeIds]), old.sourcePassages?.map(p => [p.id, p.quote, p.nodeIds]));
    context.diagnostic(`${world.id}: ${count(old)} -> ${count(world)} target expressions`);
  }
});

for (const original of before) {
  test(`${original.id}: prose-only revision preserves graph, resources and every prior Ink save`, context => {
    const authored = authoredWorlds.find(w => w.id === original.id)!;
    assert.equal(authored.version, original.version);
    assert.equal(authored.startNodeId, original.startNodeId);
    const resourceRules = (world: AuthoredWorld) => world.resources?.map(({ description: _description, ...rules }) => rules);
    assert.deepEqual(canonical(resourceRules(authored)), resourceRules(original));
    assert.deepEqual(Object.keys(authored.nodes), Object.keys(original.nodes));
    for (const old of Object.values(original.nodes)) {
      const node = authored.nodes[old.id];
      const structure = (n: typeof node) => ({ ...n, title: undefined, location: undefined, text: undefined,
        ending: n.ending ? { tone: n.ending.tone } : undefined,
        choices: n.choices.map(c => ({ ...c, text: undefined, legacyTexts: undefined, feedback: undefined })),
      });
      assert.deepEqual(canonical(structure(node)), canonical(structure(old)), old.id);
      assert.equal(node.text.length, old.text.length, `${old.id}: preserve paragraph positions`);
      if (node.ending) {
        assert.equal(node.ending.title, node.title);
        assert.equal(node.ending.text, node.text.at(-1));
      }
      for (const choice of old.choices) {
        const current = node.choices.find(c => c.id === choice.id)!;
        assert.ok(current.text === choice.text || current.legacyTexts?.includes(choice.text), `${old.id}/${choice.id}`);
        for (const alias of choice.legacyTexts ?? []) assert.ok(current.legacyTexts?.includes(alias));
      }
    }
    const old = compileWorld(original), world = compileWorld(authored);
    const graph = explore(old);
    for (const path of [[], ...graph.edges.values()]) {
      const prior = replay(old, path);
      prior.paragraphIndex = prior.paragraphs.length - 1;
      const save = saveSession(prior);
      const expected = replay(world, path);
      for (const history of [save.history, save.history.map(({ choiceId: _id, ...entry }) => entry)]) {
        const restored = restoreSession(world, { ...save, history });
        assert.equal(restored.node.id, prior.node.id);
        assert.equal(restored.paragraphIndex, prior.paragraphIndex);
        assert.deepEqual(restored.resources, prior.resources);
        assert.deepEqual(restored.clues, prior.clues);
        assert.deepEqual(restored.history, expected.history);
        assert.deepEqual(restored.paragraphs, expected.paragraphs);
      }
    }
    context.diagnostic(`${graph.edges.size + 1} prior save points restored with both ID and text-only histories`);
  });
}
