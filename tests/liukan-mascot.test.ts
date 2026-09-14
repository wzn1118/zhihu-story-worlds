import assert from 'node:assert/strict';
import test from 'node:test';
import { avoidPetChoices, clampPetPosition, petPanelPosition, LIU_KAN_SHAN_OPEN_KEY, LIU_KAN_SHAN_POSITION_KEY } from '../src/liukan-shan.ts';

test('Liu Kan Shan position is clamped inside the viewport', () => {
  assert.deepEqual(clampPetPosition({ x: -99, y: 9999 }, { width: 390, height: 844 }, 74), { x: 8, y: 762 });
  assert.deepEqual(clampPetPosition({ x: 280, y: 100 }, { width: 390, height: 844 }, 74), { x: 280, y: 100 });
});

test('mascot storage namespaces are independent from game saves', () => {
  assert.equal(LIU_KAN_SHAN_POSITION_KEY, 'redleaf.liukanshan.position.v1');
  assert.equal(LIU_KAN_SHAN_OPEN_KEY, 'redleaf.liukanshan.open.v1');
  assert.notEqual(LIU_KAN_SHAN_POSITION_KEY, 'redleaf.saves.v1');
});

test('mobile choices remain clear of the full avatar after restoring or dragging into their area', () => {
  const viewport = { width: 390, height: 844 };
  const choices = { left: 18, top: 542, right: 372, bottom: 827 };
  for (const position of [{ x: 278, y: 704 }, { x: 35, y: 620 }, { x: 292, y: 745 }]) {
    const safe = avoidPetChoices(position, viewport, choices);
    assert.ok(safe.y + 100 <= choices.top);
    assert.deepEqual(avoidPetChoices(safe, viewport, choices), safe);
  }
  const freelyDragged = { x: 160, y: 230 };
  assert.deepEqual(avoidPetChoices(freelyDragged, viewport, choices), freelyDragged);
});

test('choice movement on scrolling can move the pet below the choices instead', () => {
  const viewport = { width: 390, height: 844 };
  const safe = avoidPetChoices({ x: 278, y: 40 }, viewport, { left: 18, top: -100, right: 372, bottom: 400 });
  assert.ok(safe.y - 26 >= 400);
});

test('panel stays within narrow and desktop viewports even after dragging to an edge', () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }, { width: 320, height: 480 }]) {
    for (const position of [{ x: 0, y: 0 }, { x: viewport.width, y: viewport.height }]) {
      const panel = petPanelPosition(position, viewport);
      assert.ok(panel.left >= 12);
      assert.ok(panel.left + panel.width <= viewport.width - 12);
      assert.ok(panel.top >= 12);
      assert.ok(panel.top + panel.maxHeight <= viewport.height - 12);
    }
  }
});
