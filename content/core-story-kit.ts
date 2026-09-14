import type { AuthoredWorld } from './worlds.ts';
import type { Choice, SceneNode } from '../shared/types.ts';

export const pick = (id: string, text: string, nextNodeId: string, effects?: Choice['effects'], requires?: Choice['requires'], feedback?: string): Choice => ({
  id, text, nextNodeId, effects, requires,
  ...(feedback ? { feedback: { tone: 'neutral' as const, text: feedback } } : {}),
});
export function storyKit(world: AuthoredWorld, chapter: string) {
  const nodes = structuredClone(world.nodes);
  const add = (id: string, title: string, location: string, text: string[], choices: Choice[], speaker?: string) => {
    if (nodes[id]) throw new Error(`Duplicate core scene: ${world.id}/${id}`);
    const time = world.id === 'future-island' ? '灾变 第30夜' : world.id === 'velvet-alibi' ? '宴会当夜' : '当夜';
    nodes[id] = { id, title, location, chapter, time, background: `/assets/scenes/${world.id}/${id}.webp`, text, choices, speaker };
  };
  const finish = (id: string, title: string, location: string, text: string[], tone: NonNullable<SceneNode['ending']>['tone']) => {
    add(id, title, location, text, []);
    nodes[id].chapter = '终章 · 原创改编';
    nodes[id].time = '此后';
    nodes[id].ending = { title, text: text.at(-1)!, tone };
  };
  const seed = (id: string, text: string, choice?: Choice) => {
    nodes[id].text[nodes[id].text.length - 1] += text;
    if (choice) nodes[id].choices.push(choice);
  };
  return { nodes, add, finish, seed };
}

export function renameChoice(node: SceneNode, id: string, text: string) {
  const choice = node.choices.find(choice => choice.id === id);
  if (!choice) throw new Error(`Missing choice ${node.id}/${id}`);
  if (choice.text === text) return;
  choice.legacyTexts = [...new Set([...(choice.legacyTexts ?? []), choice.text])];
  choice.text = text;
}
