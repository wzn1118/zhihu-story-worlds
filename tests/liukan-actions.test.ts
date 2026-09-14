import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { LIUKAN_ACTIONS, LIUKAN_ACTION_GROUPS, LIUKAN_ACTION_EVENT, getLiukanAction, isLiukanActionId, liukanPoseTransform, parseLiukanActionCue, performLiukanAction } from '../src/liukan-actions.ts';

test('at least 50 actions have distinct, nonempty choreography and useful labels', () => {
  assert.ok(LIUKAN_ACTIONS.length >= 50);
  assert.equal(new Set(LIUKAN_ACTIONS.map(action => action.id)).size, LIUKAN_ACTIONS.length);
  assert.equal(new Set(LIUKAN_ACTIONS.map(action => action.label)).size, LIUKAN_ACTIONS.length);
  assert.equal(new Set(LIUKAN_ACTIONS.map(action => JSON.stringify(action.frames))).size, LIUKAN_ACTIONS.length);
  for (const group of LIUKAN_ACTION_GROUPS) assert.ok(LIUKAN_ACTIONS.filter(action => action.group === group).length >= 8, group);
  for (const action of LIUKAN_ACTIONS) {
    assert.ok(action.description.trim().length > 0, action.id);
    assert.equal(getLiukanAction(action.id), action);
    assert.ok(action.frames.some(frame => frame.x || frame.y || frame.rotate || frame.scaleX !== 1 || frame.scaleY !== 1), action.id);
  }
});

test('motion stays bounded, finite, and always returns the pet to its resting position', () => {
  for (const action of LIUKAN_ACTIONS) {
    assert.ok(action.duration >= 1000 && action.duration <= 5000, action.id);
    assert.equal(action.frames[0].offset, 0);
    assert.equal(action.frames.at(-1)?.offset, 1);
    assert.equal(liukanPoseTransform(action.frames[0]), 'translate(0%, 0%) rotate(0deg) scale(1, 1)');
    assert.equal(liukanPoseTransform(action.frames.at(-1)!), 'translate(0%, 0%) rotate(0deg) scale(1, 1)');
    action.frames.forEach((frame, index) => {
      for (const value of Object.values(frame)) assert.ok(Number.isFinite(value), action.id);
      assert.ok(Math.abs(frame.x) <= 20 && Math.abs(frame.y) <= 20 && Math.abs(frame.rotate) <= 15, action.id);
      assert.ok(frame.scaleX >= .85 && frame.scaleX <= 1.12 && frame.scaleY >= .85 && frame.scaleY <= 1.12, action.id);
      if (index) assert.ok(frame.offset > action.frames[index - 1].offset, action.id);
    });
  }
});

test('all six original GIFs match the supplied manifest and every action has a static PNG', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/assets/liukan/manifest.json', import.meta.url), 'utf8')) as { assets: Array<{ name: string; sha256: string }> };
  const used = new Set(LIUKAN_ACTIONS.map(action => action.asset));
  assert.equal(used.size, 6);
  for (const asset of used) {
    const source = manifest.assets.find(item => item.name === asset);
    assert.ok(source, asset);
    const gif = readFileSync(new URL(`../public/assets/liukan/${asset}.gif`, import.meta.url));
    assert.equal(createHash('sha256').update(gif).digest('hex'), source.sha256, asset);
    const png = readFileSync(new URL(`../public/assets/liukan/${asset}.png`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', asset);
    assert.equal(png.readUInt32BE(16), 320, asset);
    assert.equal(png.readUInt32BE(20), 320, asset);
  }
});

test('motion cues accept only known actions and a bounded named destination', () => {
  assert.deepEqual(parseLiukanActionCue({ action: 'receive-answer', target: 'pet' }), { action: 'receive-answer', target: 'pet' });
  for (const invalid of [null, 'hello', [], { action: 'run arbitrary code', target: 'pet' }, { action: 'hello' }, { action: 'hello', target: '' }, { action: 'hello', target: 'x'.repeat(65) }]) assert.equal(parseLiukanActionCue(invalid), null);
  assert.equal(isLiukanActionId('__proto__'), false);
  assert.equal(isLiukanActionId(50), false);
  assert.equal(performLiukanAction('hello'), false, 'Node/server render has no browser dispatcher');
});

test('controller delivers the chosen action to the named pet without navigating', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const bus = new EventTarget();
  let delivered: unknown;
  bus.addEventListener(LIUKAN_ACTION_EVENT, event => { delivered = (event as CustomEvent).detail; });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: bus });
  try {
    assert.equal(performLiukanAction('make-game', 'pet'), true);
    assert.deepEqual(delivered, { action: 'make-game', target: 'pet' });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
