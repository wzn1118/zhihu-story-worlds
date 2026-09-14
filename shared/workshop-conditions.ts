import type { ChoiceRequirements, ResourceDefinition } from './types';

const comparison = /^([a-z][a-z0-9_]*)\s*(<=|>=|<|>)\s*(\d+)$/;

/** A bounded data grammar, projected onto the game's existing typed conditions. */
export function parseWorkshopNeeds(needs: string[], resources: ResourceDefinition[]): ChoiceRequirements {
  const allClues: string[] = [], noneClues: string[] = [];
  const ranges = new Map<string, { min?: number; max?: number }>();
  for (const need of needs) {
    if (!need.trim()) throw new Error('条件缺少线索名称');
    if (need.startsWith('!')) {
      const clue = need.slice(1);
      if (!clue.trim() || clue.startsWith('!') || comparison.test(clue)) throw new Error(`无效的缺失线索条件：${need}`);
      noneClues.push(clue);
      continue;
    }
    const match = comparison.exec(need);
    if (!match) { allClues.push(need); continue; }
    const [, id, operator, raw] = match;
    const resource = resources.find(item => item.id === id), threshold = Number(raw);
    if (!resource || !Number.isSafeInteger(threshold)) throw new Error(`资源条件未定义或数值无效：${need}`);
    const range = ranges.get(id) ?? {};
    if (operator.startsWith('>')) range.min = Math.max(range.min ?? resource.min, threshold + (operator === '>' ? 1 : 0));
    else range.max = Math.min(range.max ?? resource.max, threshold - (operator === '<' ? 1 : 0));
    if (!Number.isSafeInteger(range.min ?? resource.min) || !Number.isSafeInteger(range.max ?? resource.max)
      || (range.min ?? resource.min) > (range.max ?? resource.max)) throw new Error(`资源条件没有可行范围：${need}`);
    ranges.set(id, range);
  }
  if (allClues.some(clue => noneClues.includes(clue))) throw new Error('同一条件同时要求已有与缺失线索');
  return { allClues, ...(noneClues.length ? { noneClues } : {}), ...(ranges.size ? { resources: Object.fromEntries(ranges) } : {}) };
}

export function workshopReferencedClues(needs: string[], resources: ResourceDefinition[]): string[] {
  const parsed = parseWorkshopNeeds(needs, resources);
  return [...parsed.allClues ?? [], ...parsed.noneClues ?? []];
}

export function isWorkshopPredicate(value: string): boolean {
  return value.startsWith('!') || comparison.test(value);
}
