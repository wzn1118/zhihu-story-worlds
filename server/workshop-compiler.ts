import { Compiler } from 'inkjs/full';
import { choiceBlockers, resourceVariable, type ChoiceState } from '../shared/choice-rules.ts';
import type { GameWorld, SceneNode } from '../shared/types.ts';
import type { GeneratedDraft, ImportedSource, WorkshopProject } from '../shared/workshop.ts';
import { outlineSchema, routeSchema, validateSchema } from './workshop-schema.ts';
import { playerIntroduction, workshopRuntimeGuidance } from '../shared/workshop-guidance.ts';
import { isWorkshopPredicate, parseWorkshopNeeds } from '../shared/workshop-conditions.ts';

export function buildGeneratedWorld(id: string, revision: number, source: ImportedSource, draft: GeneratedDraft): { world: GameWorld; validation: NonNullable<WorkshopProject['validation']> } {
  validateSchema(outlineSchema, draft.outline);
  const outline = draft.outline;
  const introduction = playerIntroduction(outline.introduction);
  if (introduction.length < 2) throw new Error('序章缺少两段故事内情境；请重新生成事实稿，不以制作说明代替序章。');
  for (const fact of outline.facts) if (!source.text.includes(fact.quote)) throw new Error(`原文引用不一致：${fact.quote.slice(0, 40)}`);
  if (new Set(outline.resources.map(r => r.id)).size !== outline.resources.length || outline.resources.some(r => r.initial > r.max)) throw new Error('资源定义重复或越界');
  if (new Set(outline.routes.map(r => r.id)).size !== 3 || draft.routes.length !== 3) throw new Error('需要三条独立路线');
  const nodes: Record<string, SceneNode> = Object.create(null);
  nodes.arrival = { id: 'arrival', chapter: '序章 · 不可逆的选择', ...outline.opening, background: '', choices: [] };
  for (const route of outline.routes) {
    const part = draft.routes.find(item => item.routeId === route.id);
    if (!part) throw new Error(`缺少路线 ${route.id}`);
    validateSchema(routeSchema, part);
    const local = new Set(part.scenes.map(scene => scene.id));
    if (local.size !== part.scenes.length || !local.has(part.entry)) throw new Error(`路线 ${route.id} 场景编号重复或入口缺失`);
    if (part.scenes.filter(s => !s.ending).length < 10 || part.scenes.filter(s => s.ending).length < 2 || !part.scenes.some(s => s.ending?.kind === 'bad')) throw new Error(`路线 ${route.id} 至少十个决策、两个结局及一个 Bad End`);
    if (new Set(part.scenes.map(s => s.purpose)).size !== part.scenes.length) throw new Error('场景目的重复');
    nodes.arrival.choices.push({ id: `enter_${route.id}`, text: route.title, hint: route.commitment, nextNodeId: part.entry });
    for (const scene of part.scenes) {
      if (nodes[scene.id]) throw new Error(`跨路线场景编号重复 ${scene.id}`);
      if ((scene.ending && scene.choices.length) || (!scene.ending && (scene.choices.length < 2 || new Set(scene.choices.map(c => c.next)).size < 2))) throw new Error(`${scene.id} 缺少实际分支或结局仍有出口`);
      if (new Set(scene.choices.map(c => c.id)).size !== scene.choices.length) throw new Error(`${scene.id} 选项重复`);
      for (const choice of scene.choices) {
        if (!local.has(choice.next)) throw new Error(`${scene.id} 越出不可逆路线：${choice.next}`);
        if (new Set(choice.costs.map(c => c.resource)).size !== choice.costs.length || choice.costs.some(c => !outline.resources.some(r => r.id === c.resource))) throw new Error(`${scene.id} 未定义或重复资源`);
        if (choice.gains.some(isWorkshopPredicate)) throw new Error(`${scene.id} 线索名称不能使用条件表达式`);
      }
      // A no-cost, no-clue action at every decision prevents lockout for ALL depleted states.
      if (!scene.ending && !scene.choices.some(c => !c.needs.length && c.costs.every(cost => cost.delta >= 0))) throw new Error(`${scene.id} 耗尽资源时缺少有叙事后果的免费出口`);
      nodes[scene.id] = {
        id: scene.id, chapter: route.title, title: scene.title, location: scene.location, time: scene.time, background: '', speaker: scene.speaker, artBrief: scene.artBrief,
        text: scene.ending ? [...scene.text, scene.ending.resolution] : scene.text,
        choices: scene.choices.map(c => ({ id: c.id, text: c.text, hint: c.hint, nextNodeId: c.next,
          requires: parseWorkshopNeeds(c.needs, outline.resources), effects: { clues: c.gains, resources: Object.fromEntries(c.costs.map(cost => [cost.resource, cost.delta])) },
          feedback: { tone: 'neutral', text: c.feedback } })),
        ...(scene.ending ? { ending: { title: scene.ending.title, text: scene.ending.resolution, tone: scene.ending.kind === 'bad' ? 'dark' as const : 'hopeful' as const } } : {}),
      };
    }
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const depths = new Map<string, number>();
  function visit(id: string): number {
    if (visiting.has(id)) throw new Error(`路线存在未收束循环 ${id}`);
    if (visited.has(id)) return depths.get(id)!;
    visiting.add(id);
    const n = nodes[id];
    const depth = n.ending ? 0 : 1 + Math.max(...n.choices.map(c => visit(c.nextNodeId)));
    visiting.delete(id); visited.add(id); depths.set(id, depth); return depth;
  }
  visit('arrival');
  if (visited.size !== Object.keys(nodes).length) throw new Error('有从入口到不了的填充节点');
  for (const route of draft.routes) if (depths.get(route.entry)! < 7) throw new Error(`${route.routeId} 路线持续长度不足`);
  const allClues = [...new Set(Object.values(nodes).flatMap(n => n.choices.flatMap(c => c.effects?.clues ?? [])))].sort();
  for (const route of draft.routes) {
    if (!route.scenes.some(s => s.choices.some(c => c.needs.length)) || !route.scenes.some(s => s.choices.some(c => c.costs.some(r => r.delta < 0)))) throw new Error(`${route.routeId} 缺少线索门槛或资源压力`);
  }
  for (const n of Object.values(nodes)) for (const c of n.choices) for (const clue of [...c.requires?.allClues ?? [], ...c.requires?.noneClues ?? []]) if (!allClues.includes(clue)) throw new Error(`${n.id}：线索没有取得途径 ${clue}`);
  const initial: ChoiceState = { resolve: 50, trust: 30, clues: [], resources: Object.fromEntries(outline.resources.map(r => [r.id, r.initial])) };
  const queue = [{ id: 'arrival', state: initial }], stateKeys = new Set<string>(), reachable = new Set<string>(), enabled = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const { id, state } = queue[index];
    const key = JSON.stringify([id, state.clues, outline.resources.map(r => state.resources[r.id])]);
    if (stateKeys.has(key)) continue;
    stateKeys.add(key); reachable.add(id);
    if (stateKeys.size > 150000) throw new Error('状态数量超出完整检查预算，需要精简分支状态');
    const node = nodes[id];
    if (node.ending) continue;
    const available = node.choices.filter(c => !choiceBlockers(c, state, outline.resources).length);
    if (!available.length) throw new Error(`可达状态在 ${id} 卡死`);
    for (const c of available) {
      enabled.add(`${id}/${c.id}`);
      queue.push({ id: c.nextNodeId, state: { ...state,
        clues: [...new Set([...state.clues, ...(c.effects?.clues ?? [])])].sort(),
        resources: Object.fromEntries(outline.resources.map(r => [r.id, Math.min(r.max, Math.max(r.min, state.resources[r.id] + (c.effects?.resources?.[r.id] ?? 0)))])),
      } });
    }
  }
  if (reachable.size !== Object.keys(nodes).length) throw new Error(`资源/线索条件导致场景不可达：${Object.keys(nodes).filter(id => !reachable.has(id)).join(', ')}`);
  for (const n of Object.values(nodes)) for (const c of n.choices) if (!enabled.has(`${n.id}/${c.id}`)) throw new Error(`选项永远锁住 ${n.id}/${c.id}`);
  const world: GameWorld = {
    id: `workshop-${id.slice(7)}-r${revision}`, storyId: id, title: outline.title, subtitle: outline.subtitle, summary: outline.summary,
    introduction, player: outline.player, objective: outline.objective, startNodeId: 'arrival', nodes,
    characters: outline.characters.map(c => ({ id: c.id, name: c.name, role: c.role, description: c.description })), resources: outline.resources,
    mechanics: { title: '线索、余量与不可逆路线 · 实际游戏规则', description: outline.resources.map(r => `${r.label}：${r.description}`).join('\n'), beginnerTip: workshopRuntimeGuidance },
    source: { title: source.title, author: source.author, url: `/api/workshop/projects/${id}/source`, ...(source.origin ? { origin: source.origin } : {}) },
    version: `r${revision}`, cover: '', background: '', ink: {}, clueVariables: Object.fromEntries(allClues.map((clue, i) => [clue, `clue_${i}`])),
    adaptation: { scope: source.origin?.contentScope === 'favorite-summary' ? 'based-on-favorite-summary' : source.scope === 'original-seed' ? 'original-seed' : source.scope === 'zhihu-excerpt' ? 'based-on-api-excerpt' : 'based-on-imported-source', adultCast: true,
      note: source.origin?.contentScope === 'favorite-summary' ? '根据 OAuth 授权后读取的知乎收藏接口摘要改编，并非完整原文。原作者、来源链接与返回摘要逐字保留；新增情节和结局为 AI 创作，不代表原作者的经历或后续内容。' : source.origin?.contentScope === 'search-excerpt' ? '根据知乎官方搜索返回的节选进行独立改编，并非完整原作。原作者、来源链接与返回文字逐字保留；新增情节和结局不代表原作者后续内容。' : source.origin?.contentScope === 'webpage-selection' ? '根据你在知乎网页选取的可见正文改编，保存的文字可能只是原作的一部分。原作者、来源链接与选取文字逐字保留；新增情节与结局不代表原作后续内容。' : source.scope === 'zhihu-excerpt' ? '根据知乎故事接口提供的原作节选改编。原作者署名和节选逐字保留，新增情节与结局不代表原作后续内容。' : '根据独立保存的导入文本进行 AI 互动改编。新增情节、对白、路线和结局均为改编创作，不属于提供的原文。' },
    generated: { projectId: id, revision, artReady: false },
  };
  compileGenerated(world);
  const scenes = Object.values(nodes), endings = scenes.filter(n => n.ending);
  return { world, validation: { scenes: scenes.length, decisions: scenes.length - endings.length, endings: endings.length, badEnds: endings.filter(n => n.ending?.tone === 'dark').length, routes: 3, states: stateKeys.size } };
}

// Only compiler-owned tokens enter Ink. Prose/choice labels stay JSON data, NEVER Ink code.
export function compileGenerated(world: GameWorld): void {
  const resources = world.resources ?? [];
  const lines = ['VAR resolve = 50', 'VAR trust = 30', ...resources.map(r => `VAR ${resourceVariable(r.id)} = ${r.initial}`), ...Object.values(world.clueVariables).map(v => `VAR ${v} = false`), `-> ${world.startNodeId}`];
  for (const n of Object.values(world.nodes)) {
    lines.push(`=== ${n.id} ===`, `# node:${n.id}`);
    if (n.ending) lines.push('-> END');
    n.choices.forEach((c, i) => {
      const conditions = (c.requires?.allClues ?? []).map(clue => world.clueVariables[clue]);
      conditions.push(...(c.requires?.noneClues ?? []).map(clue => `not ${world.clueVariables[clue]}`));
      for (const resource of resources) {
        const range = c.requires?.resources?.[resource.id];
        for (const key of ['min', 'max'] as const) if (range?.[key] !== undefined) {
          if (!Number.isSafeInteger(range[key])) throw new Error('Ink 资源条件必须为整数');
          conditions.push(`${resourceVariable(resource.id)} ${key === 'min' ? '>=' : '<='} ${range[key]}`);
        }
      }
      for (const r of resources) { const delta = c.effects?.resources?.[r.id] ?? 0; if (delta < 0) conditions.push(`${resourceVariable(r.id)} >= ${-delta}`); }
      lines.push(`* ${conditions.length ? `{${conditions.join(' && ')}} ` : ''}[choice ${i} # choice:${c.id}]`);
      for (const clue of c.effects?.clues ?? []) lines.push(`  ~ ${world.clueVariables[clue]} = true`);
      for (const r of resources) { const delta = c.effects?.resources?.[r.id] ?? 0; if (delta) lines.push(`  ~ ${resourceVariable(r.id)} = MIN(${r.max}, MAX(0, ${resourceVariable(r.id)} + ${delta}))`); }
      lines.push(`  -> ${c.nextNodeId}`);
    });
  }
  const compiler = new Compiler(lines.join('\n'));
  try { world.ink = JSON.parse(compiler.Compile().ToJson()!); }
  catch { throw new Error(`Ink 编译失败：${compiler.errors.join('; ')}`); }
}
