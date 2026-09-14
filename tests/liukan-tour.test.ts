import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { getLiukanAction, isLiukanActionId } from '../src/liukan-actions';
import {
  clipTourTarget, LIUKAN_TOUR_STORAGE_KEY, liukanTourSteps, placeTourCard,
  rememberLiukanTour, shouldShowLiukanTour, type TourRect,
} from '../src/liukan-tour';

test('first visit appears once; later and completed both preserve manual replay eligibility', () => {
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  assert.equal(shouldShowLiukanTour(storage), true);
  rememberLiukanTour('later', storage);
  assert.equal(shouldShowLiukanTour(storage), false);
  assert.equal(JSON.parse(entries.get(LIUKAN_TOUR_STORAGE_KEY)!).reason, 'later');
  rememberLiukanTour('complete', storage);
  assert.equal(JSON.parse(entries.get(LIUKAN_TOUR_STORAGE_KEY)!).reason, 'complete');
});

test('restricted browser storage does not break the application', () => {
  const denied = { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } };
  assert.equal(shouldShowLiukanTour(denied), false);
  assert.doesNotThrow(() => rememberLiukanTour('later', denied));
});

test('tour card remains inside desktop, mobile and short landscape viewports', () => {
  const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }];
  for (const viewport of viewports) {
    const targets: Array<TourRect | null> = [null,
      { left: 0, top: 0, width: 200, height: 45 },
      { left: viewport.width - 70, top: viewport.height - 90, width: 60, height: 60 },
      { left: 20, top: 300, width: viewport.width - 40, height: 220 }];
    for (const target of targets) {
      const card = placeTourCard(target, viewport, { width: 384, height: 420 });
      assert.ok(card.left >= 0 && card.top >= 0);
      assert.ok(card.left + card.width <= viewport.width);
      assert.ok(card.top + card.height <= viewport.height);
    }
  }
});

test('card avoids a visible target when the viewport has room', () => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const target = { left: 30, top: 35, width: 200, height: 80 };
    const card = placeTourCard(target, viewport, { width: 384, height: 420 });
    assert.ok(card.left >= target.left + target.width || card.top >= target.top + target.height
      || card.left + card.width <= target.left || card.top + card.height <= target.top);
  }
});

test('offscreen and oversized modules produce bounded spotlight regions', () => {
  const viewport = { width: 390, height: 844 };
  assert.equal(clipTourTarget({ left: 500, top: 20, width: 200, height: 80 }, viewport), null);
  assert.equal(clipTourTarget({ left: 20, top: -300, width: 200, height: 40 }, viewport), null);
  const region = clipTourTarget({ left: -30, top: -30, width: 1000, height: 2000 }, viewport)!;
  assert.ok(region.left >= 8 && region.top >= 8);
  assert.ok(region.left + region.width <= viewport.width - 8);
  assert.ok(region.height <= viewport.height * .42);
});

test('guide uses supplied real animation files and static reduced-motion counterparts', () => {
  const actions = new Set(liukanTourSteps.map(step => step.action));
  assert.equal(actions.size, liukanTourSteps.length, 'each guided module has its own meaningful action');
  for (const action of actions) {
    assert.ok(isLiukanActionId(action), `guide action ${action} belongs to the pet catalogue`);
    const { asset } = getLiukanAction(action);
    for (const format of ['gif', 'png']) assert.ok(existsSync(new URL(`../public/assets/liukan/${asset}.${format}`, import.meta.url)), `${asset}.${format} must exist`);
  }
});

test('subpage steps use unique content anchors instead of parent navigation shortcuts', () => {
  const steps = new Map(liukanTourSteps.map(step => [step.id, step]));
  assert.equal(steps.get('play')?.view, 'story-intro');
  assert.equal(steps.get('source')?.view, 'source');
  assert.equal(steps.get('zhihu')?.view, 'zhihu');
  assert.equal(steps.get('saves')?.target, 'save-manager');
  assert.equal(steps.get('endings')?.target, 'ending-archive');
  assert.equal(steps.get('art')?.target, 'workshop-art');
  assert.equal(new Set(liukanTourSteps.map(step => step.target)).size, liukanTourSteps.length);
  assert.ok(liukanTourSteps.every(step => !('fallbacks' in step)));
});
