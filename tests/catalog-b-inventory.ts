import { catalogWorldsB } from '../content/catalog-b.ts';
import { catalogBExpansions } from '../content/catalog-b-expansions.ts';
import { auditBGraph } from './catalog-b-graph.ts';

const inventory = catalogWorldsB.map(world => {
  const nodes = Object.values(world.nodes);
  const audit = auditBGraph(world);
  return {
    worldId: world.id, storyId: world.storyId, version: world.version,
    scenes: nodes.length, dialogueScenes: nodes.filter(n => !n.ending).length,
    endings: nodes.filter(n => n.ending).length, badEnds: nodes.filter(n => n.ending?.tone === 'dark').length,
    states: audit.states, reachableNodes: audit.atNode.size, reachableChoices: audit.atEdge.size,
    routes: catalogBExpansions[world.id].routes.map(route => ({
      id: route.id, entry: route.entry,
      dialogueIds: route.nodes.filter(n => !n.ending).map(n => n.id),
      endings: route.nodes.filter(n => n.ending).map(n => n.id),
      endingWitnesses: route.nodes.filter(n => n.ending).map(n => ({ id: n.id, choices: audit.atNode.get(n.id)!.path })),
    })),
  };
});

if (process.argv.includes('--markdown')) {
  console.log('## 已接入场景清单（当前默认）\n');
  console.log('| world ID | 总节点 | 对话节点 | 结局 | Bad Ends | 状态 | 可达选项 |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const w of inventory) console.log(`| ${w.worldId} | ${w.scenes} | ${w.dialogueScenes} | ${w.endings} | ${w.badEnds} | ${w.states} | ${w.reachableChoices} |`);
  for (const w of inventory) {
    console.log(`\n### ${w.worldId} / ${w.storyId}`);
    for (const r of w.routes) {
      console.log(`\n- ${r.id} 入口：\`${r.entry}\``);
      console.log(`- 对话：${r.dialogueIds.map(id => `\`${id}\``).join('、')}`);
      console.log(`- 原创结局：${r.endings.map(id => `\`${id}\``).join('、')}`);
    }
  }
} else console.log(JSON.stringify(inventory, null, 2));
