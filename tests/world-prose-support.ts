import type { AuthoredWorld } from '../content/worlds.ts';

export function visibleProse(world: AuthoredWorld) {
  const fields: { path: string; text: string }[] = [];
  const add = (path: string, text: string | undefined) => {
    if (text !== undefined) fields.push({ path, text });
  };
  add('summary', world.summary);
  add('objective', world.objective);
  world.introduction.forEach((text, i) => add(`introduction.${i}`, text));
  world.characters.forEach(c => add(`characters.${c.id}.description`, c.description));
  if (world.mechanics) for (const key of ['title', 'description', 'beginnerTip'] as const) add(`mechanics.${key}`, world.mechanics[key]);
  for (const node of Object.values(world.nodes)) {
    const path = `nodes.${node.id}`;
    add(`${path}.title`, node.title);
    node.text.forEach((text, i) => add(`${path}.text.${i}`, text));
    if (node.challenge) {
      add(`${path}.challenge.prompt`, node.challenge.prompt);
      add(`${path}.challenge.hint`, node.challenge.hint);
    }
    for (const choice of node.choices) {
      add(`${path}.choices.${choice.id}.text`, choice.text);
      add(`${path}.choices.${choice.id}.hint`, choice.hint);
      add(`${path}.choices.${choice.id}.feedback.text`, choice.feedback?.text);
    }
  }
  return fields;
}

export const proseMarkers = /不是|不只是|真正|并非|而是/g;
export const markerCount = (world: AuthoredWorld) => visibleProse(world).reduce((n, field) => n + [...field.text.matchAll(proseMarkers)].length, 0);

export function gameplayContract(input: AuthoredWorld) {
  const world = structuredClone(input);
  world.summary = '';
  world.objective = '';
  world.introduction.fill('');
  for (const character of world.characters) character.description = '';
  if (world.mechanics) world.mechanics = { title: '', description: '', beginnerTip: '' };
  for (const resource of world.resources ?? []) resource.description = '';
  for (const node of Object.values(world.nodes)) {
    node.title = '';
    node.text.fill('');
    if (node.challenge) { node.challenge.prompt = ''; node.challenge.hint = ''; }
    for (const choice of node.choices) {
      choice.text = '';
      delete choice.legacyTexts;
      if (choice.hint !== undefined) choice.hint = '';
      if (choice.feedback) choice.feedback.text = '';
    }
    if (node.ending) { node.ending.title = ''; node.ending.text = ''; }
  }
  return JSON.parse(JSON.stringify(world));
}
