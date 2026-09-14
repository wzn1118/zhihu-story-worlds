import type { GameWorld } from './types';

export function visitWorkshopProse(world: GameWorld, edit: (path: string, text: string) => string): void {
  for (const key of ['title', 'subtitle', 'summary', 'objective'] as const) world[key] = edit(key, world[key]);
  world.introduction = world.introduction.map((text, i) => edit(`introduction/${i}`, text));
  world.player.role = edit('player/role', world.player.role);
  for (const character of world.characters) for (const key of ['role', 'description'] as const) character[key] = edit(`characters/${character.id}/${key}`, character[key]);
  for (const resource of world.resources ?? []) resource.description = edit(`resources/${resource.id}/description`, resource.description);
  if (world.mechanics) for (const key of ['title', 'description', 'beginnerTip'] as const) world.mechanics[key] = edit(`mechanics/${key}`, world.mechanics[key]);
  for (const node of Object.values(world.nodes)) {
    const path = `nodes/${node.id}`;
    for (const key of ['chapter', 'title', 'location', 'time'] as const) node[key] = edit(`${path}/${key}`, node[key]);
    node.text = node.text.map((text, i) => edit(`${path}/text/${i}`, text));
    if (node.challenge) for (const key of ['prompt', 'hint'] as const) node.challenge[key] = edit(`${path}/challenge/${key}`, node.challenge[key]);
    for (const choice of node.choices) {
      const original = choice.text;
      choice.text = edit(`${path}/choices/${choice.id}/text`, original);
      if (original !== choice.text) choice.legacyTexts = [...new Set([...(choice.legacyTexts ?? []), original])];
      if (choice.hint !== undefined) choice.hint = edit(`${path}/choices/${choice.id}/hint`, choice.hint);
      if (choice.feedback) choice.feedback.text = edit(`${path}/choices/${choice.id}/feedback`, choice.feedback.text);
    }
    if (node.ending) for (const key of ['title', 'text'] as const) node.ending[key] = edit(`${path}/ending/${key}`, node.ending[key]);
  }
}

export function workshopProseFields(world: GameWorld): Record<string, string> {
  const fields: Record<string, string> = {};
  visitWorkshopProse(structuredClone(world), (path, text) => { fields[path] = text; return text; });
  return fields;
}
