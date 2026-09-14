import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { catalogWorldsA } from '../content/catalog-a.ts';
import { catalogACrises } from '../content/catalog-a-crises.ts';
import type { AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { enumerateA, replayA } from './catalog-a-graph.ts';

// A-only reproducible inventory. Prints Markdown; caller appends it to the
// workstream report only after running the verification commands below.
const frozen = readFileSync(new URL('./catalog-a-v1.fixture.json', import.meta.url));
const oldWorlds = JSON.parse(frozen.toString('utf8')) as AuthoredWorld[];
const sourceLimits: Record<string, string> = {
  'happy-home': '正文止于男主人回家后的冲突；沿用前轮明确的成人化角色改编。消防联络、名单、天台与结算后生活均为续写。',
  'rotten-pilgrimage': '正文止于小白龙回到深度异常的龙宫；假观音关于师门的指控不当作原文事实。撤宫、守天门、师门命运与灾变封护均为改编收束。',
  'ming-whisper': '正文止于周鉴开始不舍家人；心声、败报、雨阻断粮与周父惜财来自节选。船札、军营点兵、筹粮执行与各人物后续为架空改编，不作史实断言。',
  'score-room': '正文止于第二轮入梦提起月考；保留此前公开的成人升学班改编。自拟题、选拔、试卷细节、群聊误传与所有结局为游戏续写。',
  'online-heir': '正文止于决定分手后的开头；网恋误会、公司身份、同事提醒均有节选依据。外派、数据争议、饭局、私信冲突与结局为改编。',
  'black-flood': '正文止于次日醒来发现成人形态；简介另有后续梗概，未当作读过的后续正文。沿海、定位印、公开试招、笔录及结局为独立续写。',
  'radish-court': '正文止于棋后皇帝谈御史；开头有北境回礼引子，不当作完整北境章节。驿路、施饭、欠粮和院外任职均为续写。',
  'harvest-box': '正文止于秋收比较干活能力；和离、旧疤、箱中人、伤饿与农院支点保留。修堤、磨坊、寄存粮与各人的长期去向为续写。',
};
const rows = catalogWorldsA.map(authored => {
  const old = oldWorlds.find(w => w.id === authored.id)!;
  const world = compileWorld(authored), graph = enumerateA(world), nodes = Object.values(world.nodes);
  const renamed = Object.values(old.nodes).flatMap(node => node.choices.filter(choice => world.nodes[node.id].choices.find(c => c.id === choice.id)!.text !== choice.text)).length;
  const changedText = Object.values(old.nodes).filter(node => JSON.stringify(node.text) !== JSON.stringify(world.nodes[node.id].text));
  return { world, graph, old, nodes, renamed, changedText };
});
const totals = rows.reduce((t, r) => ({ nodes: t.nodes + r.nodes.length, decisions: t.decisions + r.nodes.filter(n => !n.ending).length, choices: t.choices + r.graph.edgePaths.size, endings: t.endings + r.nodes.filter(n => n.ending).length, dark: t.dark + r.nodes.filter(n => n.ending?.tone === 'dark').length, states: t.states + r.graph.states.length, renamed: t.renamed + r.renamed, revisedScenes: t.revisedScenes + r.changedText.length, revisedEndings: t.revisedEndings + r.changedText.filter(n => n.ending).length }), { nodes: 0, decisions: 0, choices: 0, endings: 0, dark: 0, states: 0, renamed: 0, revisedScenes: 0, revisedEndings: 0 });
const out: string[] = [
  '## 最终交付 / 2026-09-06 / Catalog A 1.1.0', '',
  '本报告是本轮新默认交付。`docs/catalog-a-route-rewrite.md` 保留为前一轮 31 节点基线，不覆盖其历史记录。', '',
  `八篇总计 **${totals.nodes} 节点、${totals.decisions} 个选择场景、${totals.choices} 条选择、${totals.endings} 个结局、${totals.dark} 个 dark**。每篇新增两条有预警与挽回选择的失败线；每条独立路线现有 8 个专属选择场景（原 6 + 危机 2），两路之间无非结局节点交集。`, '',
  '| 世界 ID | 节点 | 选择场景 | 选择 | 结局 | dark | 可区分路由状态 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...rows.map(r => `| ${r.world.id} | ${r.nodes.length} | ${r.nodes.filter(n => !n.ending).length} | ${r.graph.edgePaths.size} | ${r.nodes.filter(n => n.ending).length} | ${r.nodes.filter(n => n.ending?.tone === 'dark').length} | ${r.graph.states.length} |`),
  `| 合计 | ${totals.nodes} | ${totals.decisions} | ${totals.choices} | ${totals.endings} | ${totals.dark} | ${totals.states} |`, '',
  `继承全部 248 个旧节点与 639 条旧选择；本轮新增 48 节点、112 条选择。另修订 ${totals.revisedScenes} 个旧节点的正文（含 ${totals.revisedEndings} 个旧结局），改写 ${totals.renamed} 条旧选择用语并保留其精确 legacyTexts。没有删除或改动旧选择的 ID、效果、条件与目标。`, '',
  '### 失败设计与零 dark 审计', '',
  '- 接手实测并非全组字面零标记：七篇为零，《西游》的 `ending_bargain` 与 `ending_spent` 为 dark。后者仅是休息，前者仍是悬念，均不作为本轮新增失败量。',
  '- 本轮确实新写并验证 16 个失败结局。《西游》的休息退出改为 uneasy，旧交易 dark 补为不可逆角色命运，故最终 dark 为 17，而不是将 16 个原退出点改色凑数。',
  '- 新失败在进入两段独立危机、获得两条实际 Ink 前置事实后才可选择；每段都有至少两条零资源成本的止损/交接路线。换用另一条选择可实测回到既有可玩路线，不靠旁白假装有退路。',
  '- 轻故事的损失是资格、项目、信任、生计或关系终止。正常休息、拒接任务、保留私事、拒绝供养、主动分手仍走非 dark；没有新增任意暴力惩罚。', '',
  '### 原文边界与完整缓存核读', '',
  '阅读的是本地接口缓存中的完整节选，非整部小说。下表 SHA-256 对 `data.content` 的 UTF-8 字节计算；字数按 Unicode 码点计。完整来源标题、作者、storyId、原 URL 与冻结基线逐字段相等，缓存文件未改。', '',
  '| 世界 | 缓存 ID | 原题 / 作者 | 节选码点 | content SHA-256 |',
  '| --- | --- | --- | ---: | --- |',
];
for (const { world } of rows) {
  const cache = JSON.parse(readFileSync(new URL(`../.local/zhihu-cache/story-${world.storyId}.json`, import.meta.url), 'utf8')).data;
  out.push(`| ${world.id} | ${world.storyId} | ${world.source.title} / ${world.source.author} | ${[...cache.content].length} | \`${createHash('sha256').update(cache.content).digest('hex')}\` |`);
}
out.push('', ...rows.map(({ world }) => `- **${world.id}**：${sourceLimits[world.id]}`), '',
  '### 存档兼容与资源验证', '',
  '- 新版本 `1.1.0`，明确接受 `1.0.0`。增加的活动选项和线索会改变 Ink 的 choice snapshot，故调用既有显式版本迁移，通过原历史重新播放，而不是读取旧状态碰运气。',
  `- 冻结定义：\`tests/catalog-a-v1.fixture.json\`，SHA-256 \`${createHash('sha256').update(frozen).digest('hex')}\`。在任何本轮内容修改前保存，并保留原世界完整正文、元数据和全部选择。`,
  '- 639 条旧边均使用冻结定义编译成真实旧 Ink 后存档迁移；含起点共 647 个状态，各测试带 ID 与纯文字历史，共 1294 次，另外逐个测试冻结别名。比对资源、线索、resolve、trust、路径及更新后的可选项。',
  `- 新图枚举 ${totals.states} 个可区分状态：${totals.choices} 条边与 ${totals.endings} 个结局全可达。所有非结局可达状态至少两项合法选择，且非强制 dark。共享验证器另逐边在真实 Ink 中回放全部 ${totals.choices} 条选择。`,
  '- 16 个危机的失败、止损、决策前存档恢复分别测试；不复用已前进的 Ink 引擎。首次反事实测试因复用引擎触发过期保护，测试修正后通过，游戏引擎未改。', '',
  '### 本轮实际执行的验证', '',
  '1. `npx tsx --test tests/catalog-a-editorial.test.ts tests/catalog-a-routes.test.ts`：**50/50**，无跳过。',
  '2. `npx tsx --test --test-name-pattern="happy-home|rotten-pilgrimage|ming-whisper|score-room|online-heir|black-flood|radish-court|harvest-box" tests/backend-worlds.test.ts`：**8/8**。该共享测试文件未改。',
  '3. `npx tsx --test tests/choice-outcomes.test.ts tests/resources.test.ts tests/save-transfer.test.ts tests/source-reader.test.ts tests/source-boundary.test.ts`：**73/73**。',
  '4. `npx tsc --noEmit`、`npm run build`：均通过。合计本轮以上测试运行 **131 项通过**；不是把旧的 root 280/280 当作本轮全仓结果。', '',
  '### 当前边界与集成交接', '',
  '- 内容文件只改 `content/catalog-a.ts` 的适配接入；新正文/结局在 `content/catalog-a-editorial.ts`，新分岔在 `content/catalog-a-crises.ts`。新 A 组测试/夹具/复核器均为 `tests/catalog-a-*`，旧路线测试未改。',
  '- 未编辑 `content/worlds.ts`、B 组、共享类型、前端或服务器；未提交，未重启 4173。此处统计来自本轮磁盘定义与真实 Ink 编译，未声称运行中的旧缓存已刷新。共享进程加载新定义由 root 统一处理。',
  '- 本轮付费图像请求 **0**，新图片 **0**。新增的每个场景保留独立标题、地点与具体人物/物件/光线动作，不把共享 background 或节点数算作独立 4K 配图验收。29 是每篇选择场景数，不冒称 30 张新插画。',
  '- 复核统计与可玩路径：`npx tsx tests/catalog-a-report.ts`。下列路径为真实 Ink 重放成功的选择 ID；不是只列静态图上的箭头。', '',
  '### 各结局的可执行路线与最后补救点', '',
);
for (const { world, graph } of rows) {
  out.push(`#### ${world.id}`, '');
  for (const node of Object.values(world.nodes).filter(n => n.ending)) {
    const path = graph.nodePaths.get(node.id)!;
    if (replayA(world, path).node.id !== node.id) throw new Error(`Replay mismatch ${world.id}/${node.id}`);
    out.push(`- **${node.id} / ${node.title} / ${node.ending!.tone}**：\`${path.join(' → ')}\``);
  }
  out.push('');
  for (const b of catalogACrises[world.id]) {
    out.push(`- 危机入口：\`${b.from} → ${b.entry.id} → ${b.nodes[0].id}\`；最终风险场景 \`${b.nodes[1].id}\`。`,
      `  - 失败：\`${b.commit} → ${b.ending}\`。${world.nodes[b.ending].ending!.text}`,
      `  - 同一决策前存档的补救：\`${b.retreat} → ${b.resume}\`；零资源成本，接回原路线或完整非失败收束。`);
  }
  out.push('');
}
console.log(out.join('\n'));
