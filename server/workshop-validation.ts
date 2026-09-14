export async function validateWithRouteRepairs<T>(routeIds: string[], validate: () => T, repair: (indices: number[], issue: Error) => Promise<void>): Promise<T> {
  const repaired = new Set<number>();
  for (;;) {
    try { return validate(); }
    catch (error) {
      if (!(error instanceof Error)) throw error;
      const affected = routeIds.flatMap((id, index) => error.message.includes(id) ? [index] : []);
      const candidates = affected.length ? affected : routeIds.map((_, index) => index);
      const indices = candidates.filter(index => !repaired.has(index));
      if (!indices.length) throw error;
      // Consume the budget before the callback so failed repairs never loop silently.
      for (const index of indices) repaired.add(index);
      await repair(indices, error);
    }
  }
}
import type { RouteDraft } from '../shared/workshop.ts';
import { routeRepairSchema, routeSchema, validateSchema } from './workshop-schema.ts';

export function mergeSceneRepair(original: RouteDraft, patch: RouteDraft, options: { allowAdditions?: boolean } = {}): RouteDraft {
  validateSchema(routeRepairSchema, patch);
  const ids = new Set(original.scenes.map(scene => scene.id));
  if (patch.routeId !== original.routeId || patch.entry !== original.entry || patch.scenes.some(scene => !ids.has(scene.id) && (!options.allowAdditions || !scene.id.startsWith(`${original.routeId}_`)))
    || new Set(patch.scenes.map(scene => scene.id)).size !== patch.scenes.length) throw new Error(`${original.routeId}: 场景修订修改了路线身份、入口或未知场景`);
  const replacements = new Map(patch.scenes.map(scene => [scene.id, scene]));
  const merged = { ...original, scenes: [...original.scenes.map(scene => replacements.get(scene.id) ?? scene), ...patch.scenes.filter(scene => !ids.has(scene.id))] };
  if (options.allowAdditions) {
    for (const old of original.scenes) {
      const updated = merged.scenes.find(scene => scene.id === old.id)!;
      if (old.choices.some(choice => !updated.choices.some(next => next.id === choice.id))) throw new Error(`${original.routeId}: 结构修订删除了已有选项`);
    }
    validateSchema(routeSchema, merged);
  }
  return merged;
}
