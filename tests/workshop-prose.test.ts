import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import type { GameWorld } from '../shared/types.ts';
import baseline from '../shared/generated-copy/seventh-second.baseline.json';
import { seventhSecondCopy } from '../shared/generated-copy/seventh-second.ts';
import { withReviewedWorkshopCopy } from '../shared/workshop-copy.ts';
import { visitWorkshopProse, workshopProseFields } from '../shared/workshop-prose-fields.ts';
import { outlinePrompt, routePrompt, wholeStoryStyle } from '../server/workshop-creative.ts';
import { originalSeed, type StoryOutline } from '../shared/workshop.ts';
import { encodeSaveFile, parseSaveFile, restoreSession, saveSession } from '../src/game.ts';
import { explore, replay } from './core-creative-support.ts';

const before = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/workshop-pre-copy.json.gz', import.meta.url))).toString()) as GameWorld;
const reviewed = withReviewedWorkshopCopy(before);
export const productionLeaks = /facts\.quote|\bneeds\b|本线|终局费用|进入(?:完整失败结局|Good End|Bad End)|目标转为|路线永久关闭|固定穿|锚点|实扣|已支付|叠加收益|同站封尾/;

function mechanics(world: GameWorld) {
  const copy = structuredClone(world);
  visitWorkshopProse(copy, () => '');
  for (const node of Object.values(copy.nodes)) for (const choice of node.choices) delete choice.legacyTexts;
  return JSON.parse(JSON.stringify(copy));
}

test('the full 40-scene sample is reviewed, including every hint, feedback and ending', context => {
  assert.deepEqual(workshopProseFields(before), baseline);
  const fields = workshopProseFields(reviewed);
  for (const [path, text] of Object.entries(seventhSecondCopy)) {
    assert.ok(Object.hasOwn(baseline, path), `Revision addresses an actual published field: ${path}`);
    assert.equal(fields[path], text, path);
  }
  assert.equal(Object.keys(before.nodes).length, 40);
  let choices = 0, endings = 0;
  for (const node of Object.values(before.nodes)) {
    const prefix = `nodes/${node.id}`;
    assert.ok(Object.keys(seventhSecondCopy).some(path => path.startsWith(`${prefix}/`)), node.id);
    for (const choice of node.choices) {
      choices++;
      assert.ok(Object.hasOwn(seventhSecondCopy, `${prefix}/choices/${choice.id}/hint`), `${choice.id}: hint reviewed`);
      if (choice.feedback) assert.ok(Object.hasOwn(seventhSecondCopy, `${prefix}/choices/${choice.id}/feedback`), `${choice.id}: feedback reviewed`);
    }
    if (node.ending) {
      endings++;
      assert.ok(Object.hasOwn(seventhSecondCopy, `${prefix}/ending/text`));
      assert.equal(reviewed.nodes[node.id].ending!.text, reviewed.nodes[node.id].text.at(-1));
    }
  }
  assert.equal(choices, 101); assert.equal(endings, 7);
  const remaining = Object.entries(fields).filter(([, text]) => productionLeaks.test(text));
  assert.deepEqual(remaining, []);
  context.diagnostic(`${Object.keys(fields).length} fields inspected; ${Object.entries(fields).filter(([path, text]) => text !== (baseline as Record<string, string>)[path]).length} changed; 101 choices; 7 endings`);
});

test('full-copy editing preserves original source references, game rules, Ink, artwork and paragraph counts', () => {
  assert.deepEqual(mechanics(reviewed), mechanics(before));
  assert.deepEqual(reviewed.source, before.source);
  assert.deepEqual(reviewed.sourcePassages, before.sourcePassages);
  assert.deepEqual(reviewed.ink, before.ink);
  assert.deepEqual(withReviewedWorkshopCopy(reviewed), reviewed);
  for (const node of Object.values(before.nodes)) assert.equal(reviewed.nodes[node.id].text.length, node.text.length);
});

test('new causal-editor wording survives, while unchanged fields still get the prose correction', () => {
  const later = structuredClone(before);
  later.version = 'r2'; later.generated!.revision = 2;
  later.nodes.bring_her_back_04_clock.text[1] = 'A newer causal revision owns this paragraph.';
  const patched = withReviewedWorkshopCopy(later);
  assert.equal(patched.nodes.bring_her_back_04_clock.text[1], later.nodes.bring_her_back_04_clock.text[1]);
  assert.equal(patched.nodes.bring_her_back_04_clock.text[2], reviewed.nodes.bring_her_back_04_clock.text[2]);
  assert.deepEqual(later.nodes.arrival, before.nodes.arrival);
});

test('all 101 Ink edges restore saves from before the full prose pass, including text-only history', context => {
  const legacy = { ...before, generated: { ...before.generated!, projectId: 'legacy-test-without-display-correction' } };
  const graph = explore(before);
  assert.equal(graph.nodes.size, 40); assert.equal(graph.edges.size, 101);
  for (const path of [[], ...graph.edges.values()]) {
    const old = replay(legacy, path);
    old.paragraphIndex = old.paragraphs.length - 1;
    const saved = parseSaveFile(encodeSaveFile(saveSession(old)));
    const expected = replay(reviewed, path);
    for (const history of [saved.history, saved.history.map(({ choiceId: _id, ...entry }) => entry)]) {
      const restored = restoreSession(before, { ...saved, history });
      assert.equal(restored.node.id, expected.node.id);
      assert.equal(restored.paragraphIndex, old.paragraphIndex);
      assert.deepEqual(restored.resources, expected.resources);
      assert.deepEqual(restored.clues, expected.clues);
      assert.deepEqual(restored.paragraphs, expected.paragraphs);
      assert.deepEqual(restored.history, expected.history);
    }
  }
  context.diagnostic(`${graph.states} reachable states checked, 102 save points x 2 history formats restored`);
});

test('generation guidance covers the entire manuscript and leaves original source as data', () => {
  const outline = { routes: [] } as unknown as StoryOutline;
  for (const prompt of [outlinePrompt(originalSeed), routePrompt(originalSeed, outline, { id: 'test' } as StoryOutline['routes'][number])]) {
    assert.ok(prompt.includes(wholeStoryStyle));
    assert.ok(prompt.includes(`USER_SOURCE_DATA=${JSON.stringify(originalSeed)}`));
  }
  for (const field of ['summary', 'introduction', 'player.role', 'characters', 'resources.description', 'opening', 'hint/feedback', 'ending/resolution']) assert.ok(wholeStoryStyle.includes(field));
});
