import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameWorld } from '../shared/types.ts';
import { withReviewedWorkshopCopy } from '../shared/workshop-copy.ts';
import { compileGenerated } from '../server/workshop-compiler.ts';
import { outlinePrompt, playerChoiceStyle, routePrompt } from '../server/workshop-creative.ts';
import { originalSeed, type StoryOutline } from '../shared/workshop.ts';
import { choose, encodeSaveFile, parseSaveFile, restoreSession, rewindSession, saveSession, startSession } from '../src/game.ts';

const projectId = 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10';
const routeIds = ['bring_her_back', 'let_the_record_speak', 'close_the_station'];
const oldLabels = ['第一线：让第七个人走出来', '第二线：让她的证词上岸', '第三线：把第七秒留在海底'];
const newLabels = ['接上电池，先把韩穗救出来', '接通录音台，让韩穗把话说完', '把白轴送进井里，彻底毁掉'];

function fixture(): GameWorld {
  const world: GameWorld = {
    id: `workshop-${projectId.slice(7)}-r1`, storyId: projectId, title: '文案回归夹具',
    subtitle: '', summary: '', introduction: ['仅供回归，不作为生成内容。'], player: { name: '测试', role: '测试' }, objective: '',
    startNodeId: 'arrival', version: 'r1', generated: { projectId, revision: 1, artReady: false },
    characters: [], source: { title: '测试', author: '测试', url: '' }, cover: '', background: '',
    adaptation: { scope: 'original-seed', adultCast: true, note: '测试' }, ink: {}, clueVariables: {},
    resources: [{ id: 'battery', label: '电量', min: 0, max: 12, initial: 12, description: '回归资源' }],
    nodes: {
      arrival: { id: 'arrival', chapter: '测试', title: '测试', location: '测试', time: '测试', background: '', text: ['开场回归文本'],
        choices: routeIds.map((id, i) => ({ id: `enter_${id}`, text: oldLabels[i], hint: `内部规划${i}`, nextNodeId: id,
          effects: { resources: { battery: -(i + 1) } } })),
      },
      ...Object.fromEntries(routeIds.map(id => [id, { id, chapter: '测试', title: '结局', location: '测试', time: '测试', background: '',
        text: ['结局回归文本'], choices: [], ending: { title: '测试', text: '测试', tone: 'hopeful' as const } }])),
    },
  };
  compileGenerated(world);
  return world;
}

test('reviewed copy changes only the three sample opening labels and hints', () => {
  const original = fixture(), before = structuredClone(original);
  const reviewed = withReviewedWorkshopCopy(original);
  assert.deepEqual(original, before);
  assert.notEqual(reviewed, original);
  assert.equal(reviewed.ink, original.ink);
  assert.equal(reviewed.source, original.source);
  assert.deepEqual(reviewed.nodes.arrival.choices.map(choice => choice.text), newLabels);
  reviewed.nodes.arrival.choices.forEach((choice, i) => {
    assert.deepEqual(choice.legacyTexts, [oldLabels[i]]);
    assert.equal(choice.id, original.nodes.arrival.choices[i].id);
    assert.equal(choice.nextNodeId, original.nodes.arrival.choices[i].nextNodeId);
    assert.deepEqual(choice.effects, original.nodes.arrival.choices[i].effects);
    assert.ok(choice.hint!.length < 80);
  });
  assert.equal(withReviewedWorkshopCopy(reviewed), reviewed);
});

test('copy correction leaves authored works, other projects and newer wording alone', () => {
  for (const changes of [{ generated: undefined }, { storyId: '123456789' }]) {
    const world = { ...fixture(), ...changes };
    assert.equal(withReviewedWorkshopCopy(world), world);
  }
  const world = { ...fixture(), version: 'r2' };
  world.nodes.arrival.choices.forEach(choice => { choice.text = '另一次已审校的动作'; });
  assert.equal(withReviewedWorkshopCopy(world), world);
});

test('all three corrected choices retain Ink outcomes and replay both old and new saves', () => {
  for (let i = 0; i < routeIds.length; i++) {
    const world = fixture();
    let session = startSession(world);
    assert.equal(session.choices[i].text, newLabels[i]);
    session = choose(session, session.choices[i]);
    assert.equal(session.node.id, routeIds[i]);
    assert.equal(session.resources.battery, 11 - i);
    const currentSave = parseSaveFile(encodeSaveFile(saveSession(session)));
    const legacySave = structuredClone(currentSave);
    legacySave.history[0].choice = oldLabels[i];
    for (const saved of [currentSave, legacySave]) {
      const restored = restoreSession(world, saved);
      assert.equal(restored.node.id, routeIds[i]);
      assert.equal(restored.resources.battery, 11 - i);
      assert.equal(restored.history[0].choice, newLabels[i]);
      assert.deepEqual(rewindSession(restored, 0).choices.map(choice => choice.text), newLabels);
    }
  }
});

test('both creative stages explain that button copy is player-facing, not an internal plan', () => {
  const outline = { routes: [] } as unknown as StoryOutline;
  assert.ok(outlinePrompt(originalSeed).includes(playerChoiceStyle));
  assert.ok(routePrompt(originalSeed, outline, { id: 'test' } as StoryOutline['routes'][number]).includes(playerChoiceStyle));
  assert.match(playerChoiceStyle, /routes\[\]\.title/);
  assert.match(playerChoiceStyle, /choices\[\]\.text/);
});
