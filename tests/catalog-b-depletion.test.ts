import assert from 'node:assert/strict';
import test from 'node:test';
import { Story } from 'inkjs';
import { catalogWorldsB } from '../content/catalog-b.ts';
import { compileWorld } from '../server/worlds.ts';
import { choiceBlockers, resourceVariable } from '../shared/choice-rules.ts';

for (const authored of catalogWorldsB) test(`${authored.id}: real Ink offers a legal exit at every dialogue with every resource depleted`, () => {
  const world = compileWorld(authored);
  const depleted = { clues: [], resolve: 0, trust: 0, resources: Object.fromEntries(world.resources!.map(r => [r.id, r.min])) };
  for (const n of Object.values(world.nodes).filter(n => !n.ending)) {
    const engine = new Story(world.ink);
    for (const r of world.resources!) engine.variablesState.$(resourceVariable(r.id), r.min);
    engine.variablesState.$('resolve', 0);
    engine.variablesState.$('trust', 0);
    engine.ChoosePathString(n.id);
    while (engine.canContinue) engine.Continue();
    const actual = engine.currentChoices.map(c => c.tags!.find(t => t.startsWith('choice:'))!.slice(7));
    const expected = n.choices.filter(c => !choiceBlockers(c, depleted, world.resources).length).map(c => c.id);
    assert.deepEqual(actual, expected, `${world.id}/${n.id}: compiler and visible rules differ`);
    assert.ok(actual.length, `${world.id}/${n.id}: empty dialogue`);
    if (n.id.startsWith('b_')) {
      assert.ok(actual.includes('b_withdraw'));
      const index = actual.indexOf('b_withdraw');
      engine.ChooseChoiceIndex(index);
      while (engine.canContinue) engine.Continue();
      assert.equal(engine.currentChoices.length, 0, `${n.id}: depletion exit did not resolve`);
    }
  }
});

test('hollow: a successful interrupted pill supply requires actually closing that supply', () => {
  const w = catalogWorldsB.find(w => w.id === 'hollow-immortals')!;
  const c = w.nodes.b_copper_bridge.choices.find(c => c.id === 'divert')!;
  const state = { clues: ['杂役带人撤离'], resources: Object.fromEntries(w.resources!.map(r => [r.id, r.max])), resolve: 50, trust: 30 };
  assert.ok(choiceBlockers(c, state, w.resources).length);
  assert.deepEqual(choiceBlockers(c, { ...state, clues: [...state.clues, '本层供液关闭'] }, w.resources), []);
});
