import type { GameWorld, ResourceDefinition } from '../shared/types.ts';
import { choiceBlockers } from '../shared/choice-rules';

/** The default mode remains classic so callers that predate challenge mode keep their rules. */
export type DifficultyMode = 'classic' | 'challenge';

export interface SessionDifficultyOptions {
  difficulty?: DifficultyMode;
}

export const DEFAULT_DIFFICULTY: DifficultyMode = 'classic';
export const CHALLENGE_REWINDS = 3;

const nonDepletingIds = new Set([
  'fear', 'risk', 'danger', 'alarm', 'suspicion', 'exposure', 'corruption', 'stress', 'damage',
  'mastery', 'candor', 'bond', 'harvest', 'progress', 'evidence',
]);

/**
 * Resources that describe risk, accumulated evidence, or a completed process
 * are deliberately left alone. Challenge mode only tightens things the player
 * can spend to take an action.
 */
export function isChallengeSpendable(resource: ResourceDefinition, world?: GameWorld): boolean {
  if (resource.initial <= resource.min || nonDepletingIds.has(resource.id.toLowerCase())) return false;
  const semanticText = `${resource.id} ${resource.label} ${resource.description}`.toLowerCase();
  if (/(惊悚|恐惧|风险|污染|暴露|进度|掌握|迁移能力|契合|澄清|证据|已记录|声望|警觉|威胁)/u.test(semanticText)) return false;

  // A value that is only ever accumulated is not a budget. This also keeps
  // imported worlds with progress counters safe by default.
  const effects = world
    ? Object.values(world.nodes).flatMap(node => node.choices.map(choice => choice.effects?.resources?.[resource.id] ?? 0))
    : [];
  if (effects.length && !effects.some(delta => delta < 0)) return false;
  return true;
}

/** Return the initial value used by challenge mode for one spendable resource. */
export function challengeInitial(resource: ResourceDefinition, world?: GameWorld): number {
  return isChallengeSpendable(resource, world) ? Math.max(resource.min, resource.initial - 1) : resource.initial;
}

/**
 * Explicit capacity thresholds (such as the island's four empty cargo slots)
 * describe a complete operational setup. Keep those balances intact, while
 * reducing the accompanying action budgets.
 */
export function challengeInitials(world: GameWorld): Record<string, number> {
  const result: Record<string, number> = {};
  for (const resource of world.resources ?? []) {
    const candidate = challengeInitial(resource, world);
    const preservesThreshold = candidate !== resource.initial && Object.values(world.nodes)
      .flatMap(node => node.choices)
      .some(choice => (choice.requires?.resources?.[resource.id]?.min ?? resource.min) > candidate);
    result[resource.id] = preservesThreshold ? resource.initial : candidate;
  }
  const opening = world.nodes[world.startNodeId];
  const state = { resources: result, clues: [], resolve: 50, trust: 30 };
  if (opening && !opening.ending && !opening.choices.some(choice => !choiceBlockers(choice, state, world.resources).length)) {
    // Some imported stories spend their only unit before exposing a free exit.
    // Preserve that opening instead of creating a run with no first action.
    return Object.fromEntries((world.resources ?? []).map(resource => [resource.id, resource.initial]));
  }
  return result;
}

export function normalizeDifficulty(value: unknown): DifficultyMode {
  return value === 'challenge' ? 'challenge' : DEFAULT_DIFFICULTY;
}
