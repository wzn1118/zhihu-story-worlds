import assert from 'node:assert/strict';
import test from 'node:test';
import { blueBlood, velvetAlibi } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { choose, restoreSession, saveSession, startSession } from '../src/game.ts';

const world = compileWorld(velvetAlibi);

function follow(ids: string[], session = startSession(world)) {
  const frames: Record<string, string> = { [session.node.id]: session.timeLabel };
  for (const id of ids) {
    const choice = session.choices.find(entry => entry.id === id);
    assert.ok(choice, `${id} must be available at ${session.node.id}`);
    session = choose(session, choice);
    frames[session.node.id] = session.timeLabel;
  }
  return { session, frames };
}

const beginning = ['plan_truth', 'return_early'];

test('an immediate confession reaches the weekend family response without going backward', () => {
  const { frames } = follow([...beginning, 'open_conversation', 'mutual_truth', 'consent_rule', 'begin_new_date']);
  assert.match(frames.dinner, /周四.*20:40/);
  assert.match(frames.club, /周五.*21:12/);
  assert.match(frames.confession, /周五.*22:30/);
  assert.match(frames.agreement, /周五.*23:15/);
  assert.match(frames.boundary, /周六.*18:10/);
  assert.match(frames.rebuild, /周六.*19:30/);
});

test('waiting until breakfast moves the late conversation and following response one day later', () => {
  const { frames } = follow([...beginning, 'notice_breakfast', 'drop_competition', 'mutual_truth', 'consent_rule']);
  assert.match(frames.breakfast, /周六.*08:10/);
  assert.match(frames.confession, /周六.*22:30/);
  assert.match(frames.agreement, /周六.*23:15/);
  assert.match(frames.boundary, /周日.*18:10/);
});

test('the direct family route stays on Saturday while a detour home moves the return to Sunday', () => {
  const familyRoute = [...beginning, 'notice_breakfast', 'keep_labels', 'say_no'];
  const direct = follow([...familyRoute, 'speak_private', 'leave_family']);
  assert.match(direct.frames.call, /周六.*10:35/);
  assert.match(direct.frames.invitation, /周六.*16:20/);
  assert.match(direct.frames.family, /周六.*17:00/);
  assert.match(direct.frames.boundary, /周六.*18:10/);
  const detour = follow([...familyRoute, 'ask_wanglu', 'consent_rule']);
  assert.match(detour.frames.agreement, /周六.*23:15/);
  assert.match(detour.frames.boundary, /周日.*18:10/);
});

test('the solitary morning follows its actual previous night on both routes', () => {
  const early = follow([...beginning, 'open_conversation', 'time_apart', 'return_honest']);
  assert.match(early.frames.distance, /周六.*07:50/);
  assert.match(early.frames.rebuild, /周六.*19:30/);
  const late = follow([...beginning, 'notice_breakfast', 'drop_competition', 'time_apart', 'return_honest']);
  assert.match(late.frames.distance, /周日.*07:50/);
  assert.match(late.frames.rebuild, /周日.*19:30/);
});

test('old saves reconstruct their calendar from recorded choices without changing gameplay state', () => {
  const old = structuredClone(velvetAlibi);
  delete old.calendar;
  for (const node of Object.values(old.nodes)) delete node.clock;
  const oldSession = follow([...beginning, 'notice_breakfast', 'drop_competition', 'mutual_truth'], startSession(compileWorld(old))).session;
  oldSession.paragraphIndex = 1;
  const saved = saveSession(oldSession);
  const restored = restoreSession(world, saved);
  assert.match(restored.timeLabel, /周六.*23:15/);
  assert.equal(restored.paragraphIndex, 1);
  assert.equal(restored.resolve, oldSession.resolve);
  assert.equal(restored.trust, oldSession.trust);
  assert.deepEqual(restored.clues, oldSession.clues);
  assert.deepEqual(restored.choices, oldSession.choices);
  const after = follow(['consent_rule'], restored).session;
  assert.match(after.timeLabel, /周日.*18:10/);
});

test('worlds without a calendar and epilogues retain their authored time labels', () => {
  const blue = startSession(compileWorld(blueBlood));
  assert.equal(blue.timeLabel, blue.node.time);
  const { session } = follow([...beginning, 'open_conversation', 'time_apart', 'choose_independence']);
  assert.equal(session.timeLabel, '之后');
});
