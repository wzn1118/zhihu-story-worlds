import type { AuthoredWorld } from './worlds.ts';
import { templeExpansion } from './catalog-b-temple.ts';
import { tigerExpansion } from './catalog-b-tiger.ts';
import { sixExpansion } from './catalog-b-six.ts';
import { palaceExpansion } from './catalog-b-palace.ts';
import { redPlumExpansion } from './catalog-b-red-plum.ts';
import { hollowExpansion } from './catalog-b-hollow.ts';
import { islandExpansion } from './catalog-b-island.ts';
import { realmExpansion } from './catalog-b-realm.ts';
import { pick, type BExpansion } from './catalog-b-kit.ts';
import { reviseLegacyB } from './catalog-b-legacy-prose.ts';

export const catalogBExpansions: Record<string, BExpansion> = {
  'temple-heart': templeExpansion, 'tiger-shelter': tigerExpansion,
  'six-roots': sixExpansion, 'palace-ledger': palaceExpansion,
  'red-plum': redPlumExpansion, 'hollow-immortals': hollowExpansion,
  'island-broadcast': islandExpansion, 'wrong-realm': realmExpansion,
};

export function expandCatalogB(original: AuthoredWorld): AuthoredWorld {
  const world = reviseLegacyB(structuredClone(original));
  const expansion = catalogBExpansions[world.id];
  if (!expansion) throw new Error(`Missing catalog B expansion: ${world.id}`);
  const start = world.nodes[world.startNodeId];
  start.text = expansion.opening;
  start.chapter = '原文分岔 · 游戏改编';
  // Old decisions still replay to their original nodes with identical effects.
  // New games see the two sustained routes first, the earlier chronology after.
  start.choices = [
    ...expansion.routes.map(r => pick(`b_enter_${r.id}`, r.label, r.entry, undefined, [`B路线:${r.id}`])),
    ...start.choices.map(c => ({ ...c, text: `重走此前经过：${c.text}`, legacyTexts: [...new Set([...(c.legacyTexts ?? []), c.text])] })),
  ];
  for (const route of expansion.routes) for (const scene of route.nodes) {
    if (world.nodes[scene.id]) throw new Error(`Duplicate B scene: ${world.id}/${scene.id}`);
    world.nodes[scene.id] = { ...scene, background: world.background, chapter: scene.ending ? '游戏原创结局' : `原创续写 · ${route.label}`, time: scene.ending ? scene.time : '时限内' };
  }
  world.version = '2.0.0';
  world.compatibleSaveVersions = [...new Set([...(world.compatibleSaveVersions ?? []), original.version])];
  world.resources = [...(world.resources ?? []), { id: 'b_time', label: '余刻', initial: 6, min: 0, max: 6, description: expansion.urgency }];
  world.summary = expansion.summary;
  world.objective = expansion.summary;
  world.subtitle = '两条独立长线 · 限时与资源 · 游戏原创结局';
  world.introduction = expansion.opening;
  world.mechanics = { title: '选定一条路，把后果走完', description: expansion.urgency, beginnerTip: '新路线有独占地点与结局；有代价的选项会显示实际消耗。用尽资源仍可选择本线的退让收场。旧线入口保留此前的节点和决定。' };
  world.sourcePassages = expansion.passages.map(p => ({ ...p, nodeIds: [world.startNodeId, ...expansion.routes.map(r => r.entry)] }));
  world.adaptation.note += ' 本次新增两条彼此独占的原创续写。新角色、设施、时限与全部结局均为游戏改编；完整接口节选仍由原文阅读器展示，原缓存未改写。';
  return world;
}
