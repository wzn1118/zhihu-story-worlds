import { choiceBlockers, type ChoiceState } from '../shared/choice-rules.ts';
import { isWorkshopPredicate, parseWorkshopNeeds, workshopReferencedClues } from '../shared/workshop-conditions.ts';
import type { Choice } from '../shared/types.ts';
import type { ImportedSource, PlotRoute, StoryOutline } from '../shared/workshop.ts';
import { routeGraphSchema, routeSceneCatalog, type RouteGraph } from './workshop-route-generation.ts';
import { outlineSchema, validateSchema, type Schema } from './workshop-schema.ts';

/** Author knowledge. These facts are never treated as the player's inventory. */
export interface StoryCanon {
  cast: { id: string; name: string; count: number }[];
  rules: string[];
  truth: string;
  reveals: { routeId: string; endingId: string; evidence: string }[];
}
export interface AgentPlot { outline: StoryOutline; canon: StoryCanon }
export interface CharacterNotes { characters: { id: string; desire: string; relationship: string; voice: string; taboo: string }[] }
export interface SceneContract { id: string; castIds: string[]; requires: string[]; change: string }
export interface GameplayPlan { routeId: string; graph: RouteGraph; scenes: SceneContract[] }

const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = (minLength = 1, maxLength = 500): Schema => ({ type: 'string', minLength, maxLength });
const id: Schema = { ...string(1, 48), pattern: '^[a-z][a-z0-9_]*$' };
const array = (items: Schema, minItems = 0, maxItems = 20): Schema => ({ type: 'array', items, minItems, maxItems });
const outlineRouteSchema = outlineSchema.properties!.routes.items!;
export const agentPlotSchema: Schema = object({
  outline: { ...outlineSchema, properties: { ...outlineSchema.properties,
    routes: { ...outlineSchema.properties!.routes, items: { ...outlineRouteSchema, properties: { ...outlineRouteSchema.properties,
      beats: { ...outlineRouteSchema.properties!.beats, maxItems: 12 },
      endings: { ...outlineRouteSchema.properties!.endings, maxItems: 3 },
    } } },
  } },
  canon: object({
    cast: array(object({ id, name: string(1, 40), count: { type: 'integer', minimum: 1, maximum: 1000 } }), 2, 20),
    rules: array(string(8, 600), 1, 12), truth: string(40, 1800),
    reveals: array(object({ routeId: id, endingId: id, evidence: string(30, 1000) }), 3, 9),
  }),
});
export const characterNotesSchema: Schema = object({ characters: array(object({
  id, desire: string(10, 350), relationship: string(10, 350), voice: string(10, 350), taboo: string(10, 350),
}), 2, 8) });
export const gameplayPlanSchema: Schema = object({ routeId: id, graph: routeGraphSchema, scenes: array(object({
  id, castIds: array(id, 1, 20), requires: array(string(2, 80), 0, 12), change: string(20, 500),
}), 12, 15) });

const unique = (values: string[], message: string) => { if (new Set(values).size !== values.length) throw new Error(message); };
const nameKey = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase();

export function validateAgentPlot(source: ImportedSource, plot: AgentPlot): void {
  validateSchema(agentPlotSchema, plot);
  const { outline, canon } = plot;
  unique(outline.characters.map(character => character.id), '人物 ID 重复。');
  unique(outline.characters.map(character => nameKey(character.name)), '人物姓名重复，请合并同一个人。');
  unique(canon.cast.map(character => character.id), '事实表人物 ID 重复。');
  unique(canon.cast.map(character => nameKey(character.name)), '事实表重复计算同一人物或群体。');
  unique(outline.resources.map(resource => resource.id), '资源 ID 重复。');
  if (outline.resources.some(resource => resource.initial > resource.max)) throw new Error('资源初始值越界。');
  unique(outline.routes.map(route => route.id), '路线 ID 重复。');
  for (const fact of outline.facts) if (!source.text.includes(fact.quote)) throw new Error(`原文引用不一致：${fact.quote.slice(0, 40)}`);
  for (const character of outline.characters) {
    const entry = canon.cast.find(item => item.id === character.id);
    if (!entry || entry.name !== character.name || entry.count !== 1) throw new Error(`事实表必须准确登记命名人物 ${character.id}，人数为 1。`);
  }
  const player = canon.cast.find(item => nameKey(item.name) === nameKey(outline.player.name));
  if (!player || player.count !== 1) throw new Error('事实表必须包含玩家本人且只计 1 人。');
  // Anonymous groups have their own IDs and explicit counts; there is deliberately
  // no second editable "total" field that can disagree with the cast entries.
  for (const route of outline.routes) {
    unique(route.endings.map(ending => ending.id), `${route.id}: 结局 ID 重复。`);
    if (!route.endings.some(ending => ending.kind === 'good') || !route.endings.some(ending => ending.kind === 'bad')) throw new Error(`${route.id}: 大纲必须同时包含好结局与坏结局。`);
    for (const ending of route.endings.filter(item => item.kind === 'good')) {
      if (!canon.reveals.some(reveal => reveal.routeId === route.id && reveal.endingId === ending.id)) throw new Error(`${route.id}/${ending.id}: 好结局缺少具体解谜证据。`);
    }
  }
  unique(canon.reveals.map(reveal => JSON.stringify([reveal.routeId, reveal.endingId])), '同一结局的解谜说明重复。');
  for (const reveal of canon.reveals) {
    const route = outline.routes.find(item => item.id === reveal.routeId);
    if (!route?.endings.some(ending => ending.id === reveal.endingId)) throw new Error('解谜说明引用了不存在的路线或结局。');
  }
}

export function validateCharacterNotes(plot: AgentPlot, notes: CharacterNotes): void {
  validateSchema(characterNotesSchema, notes);
  const ids = new Set(plot.outline.characters.map(character => character.id));
  unique(notes.characters.map(character => character.id), '人物笔记 ID 重复。');
  if (notes.characters.length !== ids.size || notes.characters.some(character => !ids.has(character.id))) throw new Error('人物笔记必须精确覆盖大纲人物，不能增删或替换身份。');
}

type GraphScene = RouteGraph['scenes'][number];
type GraphChoice = GraphScene['choices'][number];
interface ArrivalSummary {
  states: number;
  sharedClues: Set<string>;
  possibleClues: Set<string>;
  resourceRanges: Record<string, { min: number; max: number }>;
}
interface EdgeSummary { fromSceneId: string; fromTitle: string; choice: GraphChoice; arrival: ArrivalSummary }
interface StateAnalysis {
  arrivals: Map<string, ArrivalSummary>;
  edges: Map<string, Map<string, EdgeSummary>>;
  allClues: string[];
  states: number;
}
const analysisCache = new WeakMap<GameplayPlan, { fingerprint: string; analysis: StateAnalysis }>();
const STATE_LIMIT = 150000;
function includeArrival(summary: ArrivalSummary | undefined, state: ChoiceState): ArrivalSummary {
  if (!summary) return {
    states: 1, sharedClues: new Set(state.clues), possibleClues: new Set(state.clues),
    resourceRanges: Object.fromEntries(Object.entries(state.resources).map(([key, value]) => [key, { min: value, max: value }])),
  };
  summary.states++;
  const held = new Set(state.clues);
  for (const clue of summary.sharedClues) if (!held.has(clue)) summary.sharedClues.delete(clue);
  for (const clue of held) summary.possibleClues.add(clue);
  for (const [key, value] of Object.entries(state.resources)) {
    summary.resourceRanges[key].min = Math.min(summary.resourceRanges[key].min, value);
    summary.resourceRanges[key].max = Math.max(summary.resourceRanges[key].max, value);
  }
  return summary;
}
function runtimeChoice(choice: GraphChoice, outline: StoryOutline): Choice {
  return { id: choice.id, text: choice.text, nextNodeId: choice.next,
    requires: parseWorkshopNeeds(choice.needs, outline.resources),
    effects: { clues: choice.gains, resources: Object.fromEntries(choice.costs.map(cost => [cost.resource, cost.delta])) },
  };
}
/** Enumerate the same clue/resource transitions as the compiler, before prose calls. */
function analyzeStates(plot: AgentPlot, plan: GameplayPlan): StateAnalysis {
  const fingerprint = JSON.stringify([plot.outline.resources, plan.graph, plan.scenes]);
  const cached = analysisCache.get(plan);
  if (cached?.fingerprint === fingerprint) return cached.analysis;
  const outline = plot.outline, graph = plan.graph;
  const byId = new Map(graph.scenes.map(scene => [scene.id, scene]));
  const contracts = new Map(plan.scenes.map(scene => [scene.id, scene]));
  const choices = new Map(graph.scenes.map(scene => [scene.id, scene.choices.map(choice => runtimeChoice(choice, outline))]));
  const requirements = new Map(plan.scenes.map(scene => [scene.id, runtimeChoice({ id: 'scene_contract', text: '', next: scene.id, costs: [], gains: [], needs: scene.requires }, outline)]));
  const initial: ChoiceState = { resolve: 50, trust: 30, clues: [], resources: Object.fromEntries(outline.resources.map(resource => [resource.id, resource.initial])) };
  const stateKey = (id: string, state: ChoiceState) => JSON.stringify([id, state.clues, outline.resources.map(resource => state.resources[resource.id])]);
  const queue: { id: string; state: ChoiceState }[] = [{ id: graph.entry, state: initial }];
  const seen = new Set([stateKey(graph.entry, initial)]), enabled = new Set<string>();
  const analysis: StateAnalysis = { arrivals: new Map(), edges: new Map(), allClues: [...new Set(graph.scenes.flatMap(scene => scene.choices.flatMap(choice => choice.gains)))].sort(), states: 0 };
  for (let index = 0; index < queue.length; index++) {
    const { id, state } = queue[index], scene = byId.get(id)!;
    analysis.arrivals.set(id, includeArrival(analysis.arrivals.get(id), state));
    const blockers = choiceBlockers(requirements.get(id)!, state, outline.resources);
    if (blockers.length) throw new Error(`${id}: 正文前提并非所有实际入口共有：${contracts.get(id)!.requires.join('、')}（${blockers.join('；')}）。`);
    if (scene.ending) continue;
    let available = 0;
    for (const [choiceIndex, choice] of choices.get(id)!.entries()) {
      if (choiceBlockers(choice, state, outline.resources).length) continue;
      available++; enabled.add(JSON.stringify([id, choice.id]));
      const nextState: ChoiceState = { ...state,
        clues: [...new Set([...state.clues, ...choice.effects?.clues ?? []])].sort(),
        resources: Object.fromEntries(outline.resources.map(resource => [resource.id, Math.min(resource.max, Math.max(resource.min, state.resources[resource.id] + (choice.effects?.resources?.[resource.id] ?? 0)))])),
      };
      const incoming = analysis.edges.get(choice.nextNodeId) ?? new Map<string, EdgeSummary>();
      const edgeKey = JSON.stringify([id, choice.id]), previous = incoming.get(edgeKey);
      incoming.set(edgeKey, { fromSceneId: id, fromTitle: scene.title, choice: scene.choices[choiceIndex], arrival: includeArrival(previous?.arrival, nextState) });
      analysis.edges.set(choice.nextNodeId, incoming);
      const key = stateKey(choice.nextNodeId, nextState);
      if (!seen.has(key)) {
        seen.add(key);
        if (seen.size > STATE_LIMIT) throw new Error('状态数量超出完整检查预算，需要精简分支状态。');
        queue.push({ id: choice.nextNodeId, state: nextState });
      }
    }
    if (!available) throw new Error(`${id}: 可达状态没有任何可用选项。`);
  }
  if (analysis.arrivals.size !== graph.scenes.length) throw new Error(`${graph.routeId}: 资源/线索条件导致场景不可达：${graph.scenes.filter(scene => !analysis.arrivals.has(scene.id)).map(scene => scene.id).join('、')}。`);
  for (const scene of graph.scenes) for (const choice of scene.choices) if (!enabled.has(JSON.stringify([scene.id, choice.id]))) throw new Error(`${scene.id}/${choice.id}: 选项永远锁住。`);
  analysis.states = seen.size;
  analysisCache.set(plan, { fingerprint, analysis });
  return analysis;
}

export function validateGameplayPlan(plot: AgentPlot, route: PlotRoute, plan: GameplayPlan): void {
  validateSchema(gameplayPlanSchema, plan);
  const { graph } = plan, catalog = routeSceneCatalog(route), ids = new Set(catalog.map(slot => slot.id));
  const byId = new Map(graph.scenes.map(scene => [scene.id, scene]));
  if (!plot.outline.routes.some(item => item.id === route.id) || plan.routeId !== route.id || graph.routeId !== route.id || graph.entry !== catalog[0].id) throw new Error(`${route.id}: 游戏规划路线或入口身份不一致。`);
  if (byId.size !== graph.scenes.length || byId.size !== ids.size || graph.scenes.some(scene => !ids.has(scene.id))) throw new Error(`${route.id}: 游戏规划必须精确覆盖大纲场景编号。`);
  unique(plan.scenes.map(scene => scene.id), `${route.id}: 场景合同重复。`);
  if (plan.scenes.length !== ids.size || plan.scenes.some(scene => !ids.has(scene.id))) throw new Error(`${route.id}: 场景合同必须精确覆盖路线图。`);
  const castIds = new Set(plot.canon.cast.map(character => character.id));
  const gains = new Set(graph.scenes.flatMap(scene => scene.choices.flatMap(choice => choice.gains)));
  for (const contract of plan.scenes) {
    unique(contract.castIds, `${contract.id}: 在场人物重复。`);
    if (contract.castIds.some(id => !castIds.has(id))) throw new Error(`${contract.id}: 在场人物不在共享事实表中。`);
    if (workshopReferencedClues(contract.requires, plot.outline.resources).some(clue => !gains.has(clue))) throw new Error(`${contract.id}: 正文前提引用了未定义的线索。`);
  }
  let costScenes = 0, clueScenes = 0;
  for (const slot of catalog) {
    const scene = byId.get(slot.id)!;
    if (slot.ending ? !scene.ending || scene.ending.kind !== slot.ending.kind || scene.ending.title !== slot.ending.title || scene.choices.length !== 0 : scene.ending !== null) throw new Error(`${scene.id}: 结局身份与大纲不一致。`);
    if (!scene.ending && (new Set(scene.choices.map(choice => choice.next)).size < 2 || !scene.choices.some(choice => choice.needs.length === 0 && choice.costs.every(cost => cost.delta >= 0)))) throw new Error(`${scene.id}: 缺少实际分支或免费出口。`);
    unique(scene.choices.map(choice => choice.id), `${scene.id}: 选项 ID 重复。`);
    for (const choice of scene.choices) {
      unique(choice.costs.map(cost => cost.resource), `${scene.id}: 选项资源成本重复。`);
      if (!byId.has(choice.next)) throw new Error(`${scene.id}: 选项引用了未知去向。`);
      if (choice.costs.some(cost => !plot.outline.resources.some(resource => resource.id === cost.resource))) throw new Error(`${scene.id}: 使用了未定义的资源。`);
      if (choice.gains.some(isWorkshopPredicate)) throw new Error(`${scene.id}: 线索名称不能使用条件表达式。`);
      if (workshopReferencedClues(choice.needs, plot.outline.resources).some(clue => !gains.has(clue))) throw new Error(`${scene.id}: 选项使用了未定义的线索。`);
    }
    if (scene.choices.some(choice => choice.costs.some(cost => cost.delta < 0))) costScenes++;
    if (scene.choices.some(choice => workshopReferencedClues(choice.needs, plot.outline.resources).length > 0)) clueScenes++;
  }
  if (costScenes < 3 || clueScenes < 2) throw new Error(`${route.id}: 至少三场需要资源取舍，至少两场需要线索门槛。`);
  unique(graph.scenes.map(scene => scene.purpose), `${route.id}: 场景目的重复。`);
  const visited = new Set<string>(), active = new Set<string>(), depths = new Map<string, number>();
  const visit = (id: string): number => {
    if (active.has(id)) throw new Error(`${route.id}: 路线图存在循环。`);
    if (depths.has(id)) return depths.get(id)!;
    active.add(id); visited.add(id);
    const scene = byId.get(id)!;
    const depth = scene.ending ? 0 : 1 + Math.max(...scene.choices.map(choice => visit(choice.next)));
    active.delete(id); depths.set(id, depth); return depth;
  };
  if (visit(graph.entry) < 7 || visited.size !== graph.scenes.length) throw new Error(`${route.id}: 存在未连接场景或主要路径过短。`);
  analyzeStates(plot, plan);
}

/** Actual arrivals only. Alternative branches remain alternatives, never memories. */
export function deriveSceneContext(plot: AgentPlot, plan: GameplayPlan, sceneId: string) {
  const route = plot.outline.routes.find(item => item.id === plan.routeId);
  if (!route) throw new Error('场景上下文引用了未知路线。');
  validateGameplayPlan(plot, route, plan);
  const analysis = analyzeStates(plot, plan), arrival = analysis.arrivals.get(sceneId), contract = plan.scenes.find(scene => scene.id === sceneId);
  if (!arrival || !contract) throw new Error(`场景上下文引用了未知场景：${sceneId}`);
  const summary = (value: ArrivalSummary) => ({
    sharedClues: [...value.sharedClues].sort(), absentClues: analysis.allClues.filter(clue => !value.possibleClues.has(clue)),
    resourceRanges: structuredClone(value.resourceRanges), reachableStates: value.states,
  });
  return {
    contract: structuredClone(contract),
    cast: plot.canon.cast.filter(character => contract.castIds.includes(character.id)).map(character => ({ ...character })),
    ...summary(arrival),
    incomingChoices: [...analysis.edges.get(sceneId)?.values() ?? []].map(edge => ({
      fromSceneId: edge.fromSceneId, fromTitle: edge.fromTitle, choice: structuredClone(edge.choice),
      ...summary(edge.arrival),
    })),
  };
}
