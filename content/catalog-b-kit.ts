import type { Choice, SceneNode, SourcePassage } from '../shared/types.ts';

// Only construction helpers. Route topology, costs, prose and outcomes are authored
// per story; there is deliberately no field -> puzzle -> aftermath generator here.
export const pick = (id: string, text: string, nextNodeId: string, resources?: Record<string, number>, clues?: string[], requires?: Choice['requires']): Choice => ({
  id, text, nextNodeId,
  ...(resources || clues ? { effects: { ...(resources ? { resources } : {}), ...(clues ? { clues } : {}) } } : {}),
  ...(requires ? { requires } : {}),
});
export const node = (id: string, title: string, location: string, prose: string, choices: Choice[]): SceneNode => ({
  id, title, location, chapter: '原创续写', time: '限时行程', background: '', text: prose.split('\n'), choices,
});
export const end = (id: string, title: string, location: string, prose: string, tone: 'hopeful' | 'uneasy' | 'dark'): SceneNode => ({
  ...node(id, title, location, prose, []), chapter: '游戏原创结局', time: '事后',
  ending: { title, text: prose.split('\n').at(-1)!, tone },
});
export interface BRoute {
  id: string;
  label: string;
  entry: string;
  nodes: SceneNode[];
  withdrawal: { to: string; text: string };
}
export interface BExpansion {
  routes: [BRoute, BRoute];
  summary: string;
  urgency: string;
  opening: string[];
  passages: Omit<SourcePassage, 'nodeIds'>[];
}
export function route(id: string, label: string, entry: string, withdrawal: BRoute['withdrawal'], nodes: SceneNode[]): BRoute {
  // An explicit, story-specific concession is always available even at zero.
  // It never grants clues, refills resources, or teleports to the other route.
  return { id, label, entry, withdrawal, nodes: nodes.map(n => n.ending ? n : ({
    ...n, choices: [...n.choices, pick('b_withdraw', withdrawal.text, withdrawal.to)],
  })) };
}
