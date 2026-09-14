import type { Choice, ResourceDefinition } from './types';

export interface ChoiceState {
  clues: string[];
  resources: Record<string, number>;
  resolve: number;
  trust: number;
}

export function resourceVariable(id: string): string { return `resource_${id}`; }

export function choiceBlockers(choice: Choice, state: ChoiceState, resources: ResourceDefinition[] = [], labelClue: (clue: string) => string = clue => clue): string[] {
  const reasons: string[] = [];
  const required = [...new Set([...(choice.requires?.allClues ?? []), ...(choice.requiresClue ? [choice.requiresClue] : [])])];
  for (const clue of required) if (!state.clues.includes(clue)) reasons.push(`缺少线索：${labelClue(clue)}`);
  const alternatives = choice.requires?.anyClues;
  if (alternatives?.length && !alternatives.some(clue => state.clues.includes(clue))) reasons.push(`需要任一线索：${alternatives.map(labelClue).join('、')}`);
  for (const clue of choice.requires?.noneClues ?? []) if (state.clues.includes(clue)) reasons.push(`已经记录：${labelClue(clue)}`);
  for (const resource of resources) {
    const value = state.resources[resource.id] ?? resource.initial;
    const range = choice.requires?.resources?.[resource.id];
    const cost = Math.max(0, -(choice.effects?.resources?.[resource.id] ?? 0));
    const minimum = Math.max(range?.min ?? resource.min, resource.min + cost);
    if (value < minimum) reasons.push(`${resource.label}至少 ${minimum}`);
    if (range?.max !== undefined && value > range.max) reasons.push(`${resource.label}不能高于 ${range.max}`);
  }
  for (const [id, label] of [['resolve', '决心'], ['trust', '信任']] as const) {
    const range = choice.requires?.[id];
    if (range?.min !== undefined && state[id] < range.min) reasons.push(`${label}至少 ${range.min}`);
    if (range?.max !== undefined && state[id] > range.max) reasons.push(`${label}不能高于 ${range.max}`);
  }
  return reasons;
}
