import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds } from '../content/worlds.ts';
import { sceneBackdrop } from '../src/scene-backdrop.ts';

test('the current location takes precedence over the world default and scene title', () => {
  assert.equal(sceneBackdrop({ id: 'future-island' }, { location: '未来岛 · 地下分仓', title: '海岸线' }).kind, 'warehouse');
  assert.equal(sceneBackdrop({ id: 'future-island' }, { location: '未来岛 · 竣工办公室' }).kind, 'modern-room');
  assert.equal(sceneBackdrop({ id: 'future-island' }, { location: '未来岛 · 遮蔽船坞' }).kind, 'coast');
  assert.equal(sceneBackdrop({ id: 'future-island' }, { location: '船上 · 甲板' }).kind, 'ship');
  assert.equal(sceneBackdrop({ id: 'double-pursuit' }, { location: '公寓 · 检修过道' }).kind, 'corridor');
  assert.equal(sceneBackdrop({ id: 'blue-blood' }, { location: '旧街 · 便利店外' }).kind, 'street');
  assert.equal(sceneBackdrop({ id: 'blue-blood' }, { location: '旧街 · 便利店' }).kind, 'modern-room');
  assert.equal(sceneBackdrop({ id: 'radish-court' }, { location: '宫院小厨房' }).kind, 'traditional-hall');
});

test('historic and contemporary worlds do not share the same interiors', () => {
  const historic = sceneBackdrop({ id: 'ming-whisper' }, { location: '周家账房' });
  const contemporary = sceneBackdrop({ id: 'velvet-alibi' }, { location: '杜家 · 书房' });
  assert.equal(historic.period, 'traditional');
  assert.equal(historic.kind, 'traditional-hall');
  assert.equal(contemporary.period, 'modern');
  assert.equal(contemporary.kind, 'modern-room');
  assert.notEqual(historic.src, contemporary.src);
  assert.equal(sceneBackdrop({ id: 'palace-ledger' }, { location: '皇后宫门' }).kind, 'courtyard');
  assert.equal(sceneBackdrop({ id: 'black-flood' }, { location: '后山外岭' }).kind, 'forest');
  assert.equal(sceneBackdrop({ id: 'new-import', title: '修真游记' }, { location: '卧房' }).period, 'traditional');
});

test('military and sick camps use open camp scenery instead of palace halls', () => {
  const world = authoredWorlds.find(value => value.id === 'ming-whisper')!;
  for (const id of ['escort_muster', 'escort_sickcamp']) {
    assert.ok(world.nodes[id], id);
    const backdrop = sceneBackdrop(world, world.nodes[id]);
    assert.equal(backdrop.kind, 'camp', id);
    assert.equal(backdrop.period, 'traditional', id);
    assert.notEqual(backdrop.src, sceneBackdrop(world, { location: '朝会大殿' }).src);
  }
  for (const location of ['病棚外的点兵桌', '关外残军营', '军营', '营地', '营帐门外']) {
    assert.equal(sceneBackdrop(world, { location }).kind, 'camp', location);
  }
  assert.equal(sceneBackdrop({ id: 'island-broadcast' }, { location: '应急营地' }).kind, 'camp');
  assert.equal(sceneBackdrop(world, { location: '营地 · 物资库' }).kind, 'warehouse');
});

test('every authored scene has self-contained local scenery without story text or external images', () => {
  let checked = 0;
  const kinds = new Set<string>();
  for (const world of authoredWorlds) {
    for (const node of Object.values(world.nodes)) {
      const backdrop = sceneBackdrop(world, node);
      const svg = decodeURIComponent(backdrop.src.split(',')[1]);
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      assert.match(svg, /viewBox="0 0 1600 1000"/);
      assert.match(svg, /aria-hidden="true"/);
      assert.doesNotMatch(svg, /<image|<script|<text|href=|foreignObject|generated-art|审核|占位/);
      assert.match(backdrop.backgroundColor, /^#[a-f0-9]{6}$/);
      kinds.add(backdrop.kind);
      checked += 1;
    }
  }
  assert.ok(checked >= 800);
  assert.ok(kinds.size >= 8);
});

test('empty and untrusted location values remain a bounded local drawing', () => {
  const world = { id: 'unknown', title: '<script>alert(1)</script>' };
  const backdrop = sceneBackdrop(world, { location: '\"/><image href=\"https://example.invalid/image.png\" />' });
  const empty = sceneBackdrop({ id: 'unknown' });
  assert.equal(backdrop.src, empty.src);
  assert.equal(backdrop.kind, 'modern-room');
  assert.equal(sceneBackdrop({ id: 'ming-whisper' }, { location: '余页' }).kind, 'traditional-hall');
  assert.notEqual(sceneBackdrop({ id: 'tiger-shelter' }, { location: '山洞口' }).src,
    sceneBackdrop({ id: 'tiger-shelter' }, { location: '山道' }).src);
});
