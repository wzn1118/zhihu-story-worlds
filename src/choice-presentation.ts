import type { Choice, ResourceDefinition } from '../shared/types';
import { choiceBlockers, type ChoiceState } from '../shared/choice-rules';

/** Only costs are decision information; rewards stay undisclosed until after the action. */
export function choiceCostLabels(choice: Choice, resources: ResourceDefinition[]): string[] {
  return Object.entries(choice.effects?.resources ?? [])
    .filter(([, delta]) => delta < 0)
    .map(([id, delta]) => `${resources.find(resource => resource.id === id)?.label ?? id} ${delta}`);
}

/** Challenge runs reveal the missing category without naming uncollected clues. */
export function choiceLockLabels(choice: Choice, state: ChoiceState, resources: ResourceDefinition[], challenge: boolean, labelClue: (clue: string) => string = clue => clue): string[] {
  const labels = choiceBlockers(choice, state, resources, labelClue);
  if (!challenge) return labels;
  return [...new Set(labels.map(label => label.startsWith('缺少线索：') || label.startsWith('需要任一线索：')
    ? '还缺少经过核实的线索' : label))];
}
