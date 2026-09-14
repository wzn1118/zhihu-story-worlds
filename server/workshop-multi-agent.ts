import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { GeneratedDraft, ImportedSource, RouteDraft } from '../shared/workshop.ts';
import { jsonFile, writeJson } from './story-workshop.ts';
import { outlineSchema, routeSchema, validateSchema, type Schema } from './workshop-schema.ts';
import { assertSceneGroup, routeSceneGroupSchema } from './workshop-route-generation.ts';
import { agentContentHash, applyStylePatches, stylePatchSchema, type StylePatchSet } from './workshop-agent-patches.ts';
import { agentPlotSchema, characterNotesSchema, gameplayPlanSchema, validateAgentPlot, validateCharacterNotes, validateGameplayPlan, type AgentPlot, type CharacterNotes, type GameplayPlan } from './workshop-agent-contract.ts';
import { characterAgentPrompt, gameplayAgentPrompt, openingAgentPrompt, plotAgentPrompt, sceneAgentPrompt, styleAgentPrompt } from './workshop-agent-prompts.ts';
import { loadMultiAgentDraft, saveMultiAgentDraft } from './workshop-agent-draft.ts';
import type { createAgentRunner } from './workshop-agent-runner.ts';

export const fullAgentProtocol = 'full-multi-agent-v1';
export const fullAgentRoles = { plot: '剧情', character: '人物', gameplay: '游戏性', scene: '场景', style: '修辞' } as const;
const markerName = 'multi-agent.json';

/** Existing revisions keep their original generation strategy, including CLI/review resumes. */
export async function usesFullMultiAgent(directory: string, enabled = process.env.WORKSHOP_FULL_MULTI_AGENT !== '0'): Promise<boolean> {
  try {
    const marker = await jsonFile<{ protocol: string }>(join(directory, markerName));
    if (marker.protocol !== fullAgentProtocol) throw new Error('完整模式分工记录的版本不受支持。');
    return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (!enabled) return false;
  const files = await readdir(directory).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; });
  return !files.some(file => ['outline.json', 'draft.json', 'revision-origin.json', 'creative', 'route-parts', 'editorial', 'world.json'].includes(file) || /^route-.*\.json$/.test(file));
}

export interface MultiAgentReport {
  protocol: typeof fullAgentProtocol; sourceHash: string; contractHash: string; draftHash: string;
  startedAt: string; finishedAt: string; elapsedMs: number;
  roles: (keyof typeof fullAgentRoles)[];
  routes: { routeId: string; scenes: number }[];
  style: { key: string; status: 'applied' | 'unchanged' | 'skipped'; patches: number }[];
  editorialReview: 'required';
}
interface Options {
  source: ImportedSource; directory: string; attempt: number; runner: ReturnType<typeof createAgentRunner>;
  onRoute?: (route: RouteDraft) => Promise<void>;
}
const openingTextSchema: Schema = {
  type: 'object', additionalProperties: false, required: ['text'],
  properties: { text: outlineSchema.properties!.opening.properties!.text },
};

/** Stops scheduling after a required task fails, while letting accepted siblings commit. */
async function batches<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  let next = 0, failed = false, failure: unknown;
  const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try { await work(item); } catch (error) { failed = true; failure ??= error; }
    }
  }));
  for (const result of results) if (result.status === 'rejected') { failed = true; failure ??= result.reason; }
  if (failed) throw failure;
}

export async function generateMultiAgentDraft(options: Options): Promise<{ draft: GeneratedDraft; report: MultiAgentReport; plot: AgentPlot; plans: GameplayPlan[] }> {
  const { source, directory, runner } = options, started = Date.now();
  runner.assertActive();
  if (!Number.isSafeInteger(options.attempt) || options.attempt < 1) throw new Error('分工创作的续跑编号无效。');
  const sourceHash = agentContentHash(source);
  await mkdir(directory, { recursive: true });
  try {
    const marker = await jsonFile<{ protocol: string; sourceHash: string }>(join(directory, markerName));
    if (marker.protocol !== fullAgentProtocol || marker.sourceHash !== sourceHash) throw new Error('分工创作记录与本次原文不匹配。');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeJson(join(directory, markerName), { protocol: fullAgentProtocol, sourceHash, createdAt: new Date().toISOString() });
  }
  const resumed = await loadMultiAgentDraft(source, directory);
  if (resumed) {
    const contract = await jsonFile<{ sourceHash: string; contractHash: string; plot: AgentPlot; notes: CharacterNotes; plans: GameplayPlan[] }>(join(directory, 'agent-contract.json'));
    const report = await jsonFile<MultiAgentReport>(join(directory, 'agent-generation-report.json'));
    if (contract.sourceHash !== sourceHash || report.sourceHash !== sourceHash || report.contractHash !== contract.contractHash
      || contract.contractHash !== agentContentHash({ protocol: fullAgentProtocol, sourceHash, plot: contract.plot, notes: contract.notes, plans: contract.plans })) throw new Error('完整稿的分工合同记录不一致。');
    for (const route of resumed.routes) await options.onRoute?.(route);
    runner.assertActive();
    return { draft: resumed, report, plot: contract.plot, plans: contract.plans };
  }
  const plot = await runner.run<AgentPlot>({ role: 'plot', key: 'story-contract', schema: agentPlotSchema, prompt: plotAgentPrompt(source), maxOutputTokens: 8500, timeoutMs: 360_000 }, value => validateAgentPlot(source, value));
  // Each specialist sees the same immutable plot. Their outputs have separate owners.
  const specialists = await Promise.allSettled([
    runner.run<CharacterNotes>({ role: 'character', key: 'cast-voices', schema: characterNotesSchema, prompt: characterAgentPrompt(plot), maxOutputTokens: 2000, timeoutMs: 120_000 }, value => validateCharacterNotes(plot, value)),
    ...plot.outline.routes.map(route => runner.run<GameplayPlan>({ role: 'gameplay', key: route.id, schema: gameplayPlanSchema, prompt: gameplayAgentPrompt(plot, route), maxOutputTokens: 7000, timeoutMs: 300_000 }, value => validateGameplayPlan(plot, route, value))),
  ]);
  const failed = specialists.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  const notes = (specialists[0] as PromiseFulfilledResult<CharacterNotes>).value;
  const plans = specialists.slice(1).map(result => (result as PromiseFulfilledResult<GameplayPlan>).value);
  const contractHash = agentContentHash({ protocol: fullAgentProtocol, sourceHash, plot, notes, plans });
  await writeJson(join(directory, 'agent-contract.json'), { protocol: fullAgentProtocol, sourceHash, contractHash, plot, notes, plans });
  const accepted = new Map<string, RouteDraft>();
  const style: MultiAgentReport['style'] = [];
  const work = plans.flatMap(plan => Array.from({ length: Math.ceil(plan.graph.scenes.length / 3) }, (_, index) => ({ plan, index, ids: plan.graph.scenes.slice(index * 3, index * 3 + 3).map(scene => scene.id) })));
  // Three worker loops allow one batch's style pass to overlap the other batches'
  // prose. Eagerly queuing all prose first would accidentally serialize editing.
  const openingJob = runner.run<{ text: string[] }>({ role: 'scene', key: 'common-opening', schema: openingTextSchema, prompt: openingAgentPrompt(plot, notes), maxOutputTokens: 1600, timeoutMs: 120_000 });
  const sceneJob = batches(work, 3, async ({ plan, index, ids }) => {
    const key = `${plan.routeId}-group-${index + 1}`;
    const raw = await runner.run<RouteDraft>({ role: 'scene', key, schema: routeSceneGroupSchema, prompt: sceneAgentPrompt(plot, notes, plan, ids), maxOutputTokens: 5000, timeoutMs: 180_000 }, value => assertSceneGroup(plan.graph, ids, value));
    let group = raw;
    try {
      const patch = await runner.run<StylePatchSet>({ role: 'style', key, schema: stylePatchSchema, prompt: styleAgentPrompt(plot, notes, plan, raw), maxOutputTokens: 2000, timeoutMs: 60_000 }, value => {
        const edited = applyStylePatches(raw, value); assertSceneGroup(plan.graph, ids, edited);
      });
      group = applyStylePatches(raw, patch);
      style.push({ key, status: patch.patches.length ? 'applied' : 'unchanged', patches: patch.patches.length });
    } catch (error) {
      runner.assertActive();
      if (error instanceof Error && error.name === 'AbortError') throw error;
      // Optional line editing cannot destroy a complete, valid model scene. The
      // independent full editorial review below remains mandatory for publication.
      style.push({ key, status: 'skipped', patches: 0 });
    }
    accepted.set(key, group);
    const entries = work.filter(item => item.plan.routeId === plan.routeId);
    if (entries.every(item => accepted.has(`${plan.routeId}-group-${item.index + 1}`))) {
      const route: RouteDraft = { routeId: plan.routeId, entry: plan.graph.entry, scenes: entries.flatMap(item => accepted.get(`${plan.routeId}-group-${item.index + 1}`)!.scenes) };
      validateSchema(routeSchema, route);
      await writeJson(join(directory, `route-${route.routeId}.json`), route);
      await options.onRoute?.(route);
    }
  });
  const writing = await Promise.allSettled([openingJob, sceneJob]);
  const writingFailure = writing.find(result => result.status === 'rejected');
  if (writingFailure?.status === 'rejected') throw writingFailure.reason;
  const opening = (writing[0] as PromiseFulfilledResult<{ text: string[] }>).value;
  const draft: GeneratedDraft = {
    outline: { ...plot.outline, opening: { ...plot.outline.opening, text: opening.text } },
    routes: plans.map(plan => ({ routeId: plan.routeId, entry: plan.graph.entry, scenes: work.filter(item => item.plan.routeId === plan.routeId).flatMap(item => accepted.get(`${plan.routeId}-group-${item.index + 1}`)!.scenes) })),
  };
  validateSchema(outlineSchema, draft.outline);
  for (const route of draft.routes) validateSchema(routeSchema, route);
  const report: MultiAgentReport = { protocol: fullAgentProtocol, sourceHash, contractHash, draftHash: agentContentHash(draft), startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), elapsedMs: Date.now() - started, roles: ['plot', 'character', 'gameplay', 'scene', 'style'], routes: draft.routes.map(route => ({ routeId: route.routeId, scenes: route.scenes.length })), style: style.sort((a, b) => a.key.localeCompare(b.key)), editorialReview: 'required' };
  runner.assertActive();
  await writeJson(join(directory, 'outline.json'), draft.outline);
  await writeJson(join(directory, 'agent-generation-report.json'), report);
  await saveMultiAgentDraft(source, directory, draft);
  return { draft, report, plot, plans };
}
