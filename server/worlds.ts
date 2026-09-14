import { Compiler } from 'inkjs/full';
import { authoredWorlds, type AuthoredWorld } from '../content/worlds.ts';
import type { GameWorld } from '../shared/types.ts';
import { resourceVariable } from '../shared/choice-rules.ts';
import { StorySourceError, validateStoryId } from './story-source.ts';

function inkText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/([{}\[\]#|])/g, '\\$1');
}

export function compileWorld(world: AuthoredWorld): GameWorld {
  const resources = world.resources ?? [];
  const resourceIds = new Set<string>();
  for (const resource of resources) {
    if (!/^[a-z][a-z0-9_]*$/.test(resource.id) || resourceIds.has(resource.id)
      || ![resource.initial, resource.min, resource.max].every(Number.isSafeInteger)
      || resource.min > resource.initial || resource.initial > resource.max) throw new Error(`Invalid resource: ${resource.id}`);
    resourceIds.add(resource.id);
  }
  const clueNames = [...new Set(Object.values(world.nodes).flatMap((node) => node.choices.flatMap((choice) => choice.effects?.clues ?? [])))];
  const clueVariables = Object.fromEntries(clueNames.map((clue, index) => [clue, `clue_${index}`]));
  validateOperationJournals(world, new Set(clueNames));
  const passageIds = new Set<string>();
  for (const passage of world.sourcePassages ?? []) {
    if (!/^[a-z][a-z0-9-]*$/.test(passage.id) || passageIds.has(passage.id)
      || !passage.label.trim() || !passage.note.trim()
      || passage.quote.trim() !== passage.quote || passage.quote.length < 12 || passage.quote.length > 240 || /[\r\n]/.test(passage.quote)
      || !passage.nodeIds.length || passage.nodeIds.some(id => !world.nodes[id])
      || passage.clues?.some(clue => !clueNames.includes(clue))) throw new Error(`Invalid source passage: ${passage.id}`);
    passageIds.add(passage.id);
  }
  const lines = ['VAR resolve = 50', 'VAR trust = 30', ...resources.map(resource => `VAR ${resourceVariable(resource.id)} = ${resource.initial}`), ...Object.values(clueVariables).map((variable) => `VAR ${variable} = false`), `-> ${world.startNodeId}`, ''];
  for (const node of Object.values(world.nodes)) {
    if (!/^[a-z][a-z0-9_]*$/.test(node.id)) throw new Error(`Invalid scene identifier: ${node.id}`);
    lines.push(`=== ${node.id} ===`, `# node:${node.id}`, ...node.text.map(inkText));
    if (node.ending) lines.push(`# ending:${node.id}`, '-> END');
    for (const choice of node.choices) {
      if (!world.nodes[choice.nextNodeId]) throw new Error(`Missing scene ${choice.nextNodeId}`);
      const clauses: string[] = [];
      const clueCondition = (clue: string) => {
        if (!clueVariables[clue]) throw new Error(`Unknown required clue: ${clue}`);
        return clueVariables[clue];
      };
      for (const clue of [...(choice.requires?.allClues ?? []), ...(choice.requiresClue ? [choice.requiresClue] : [])]) clauses.push(clueCondition(clue));
      if (choice.requires?.anyClues?.length) clauses.push(`(${choice.requires.anyClues.map(clueCondition).join(' || ')})`);
      for (const clue of choice.requires?.noneClues ?? []) clauses.push(`!${clueCondition(clue)}`);
      for (const id of new Set([...Object.keys(choice.effects?.resources ?? {}), ...Object.keys(choice.requires?.resources ?? {})])) {
        if (!resourceIds.has(id)) throw new Error(`Unknown resource: ${id}`);
      }
      const addRange = (variable: string, range: { min?: number; max?: number } | undefined) => {
        for (const [bound, operator] of [['min', '>='], ['max', '<=']] as const) {
          if (range?.[bound] === undefined) continue;
          if (!Number.isSafeInteger(range[bound])) throw new Error(`Invalid requirement: ${variable}`);
          clauses.push(`${variable} ${operator} ${range[bound]}`);
        }
      };
      for (const resource of resources) {
        const delta = choice.effects?.resources?.[resource.id] ?? 0;
        if (!Number.isSafeInteger(delta)) throw new Error(`Invalid resource effect: ${resource.id}`);
        addRange(resourceVariable(resource.id), choice.requires?.resources?.[resource.id]);
        if (delta < 0) clauses.push(`${resourceVariable(resource.id)} >= ${resource.min - delta}`);
      }
      addRange('resolve', choice.requires?.resolve);
      addRange('trust', choice.requires?.trust);
      const condition = clauses.length ? `{${clauses.join(' && ')}} ` : '';
      lines.push(`${choice.repeatable ? '+' : '*'} ${condition}[${inkText(choice.text)} # choice:${choice.id}]`);
      if (choice.effects?.resolve) lines.push(`  ~ resolve = MIN(100, MAX(0, resolve + ${choice.effects.resolve}))`);
      if (choice.effects?.trust) lines.push(`  ~ trust = MIN(100, MAX(0, trust + ${choice.effects.trust}))`);
      for (const clue of choice.effects?.clues ?? []) lines.push(`  ~ ${clueVariables[clue]} = true`);
      for (const resource of resources) {
        const delta = choice.effects?.resources?.[resource.id];
        if (delta) lines.push(`  ~ ${resourceVariable(resource.id)} = MIN(${resource.max}, MAX(${resource.min}, ${resourceVariable(resource.id)} + ${delta}))`);
      }
      lines.push(`  -> ${choice.nextNodeId}`);
    }
    lines.push('');
  }
  const compiler = new Compiler(lines.join('\n'));
  let compiledJson: string | void;
  try { compiledJson = compiler.Compile().ToJson(); }
  catch { throw new Error(`${world.id}: ${compiler.errors.join('; ') || 'Ink compilation failed'}`); }
  if (typeof compiledJson !== 'string') throw new Error(`Ink compilation did not return JSON: ${world.id}`);
  const ink = JSON.parse(compiledJson) as Record<string, unknown>;
  return { ...world, ink, clueVariables };
}

function validateOperationJournals(world: AuthoredWorld, clues: Set<string>): void {
  const ids = new Set<string>();
  for (const journal of world.operationJournals ?? []) {
    if (ids.has(journal.id) || !journal.nodeIds.length || journal.nodeIds.some(id => !world.nodes[id])) throw new Error(`Invalid journal: ${journal.id}`);
    ids.add(journal.id);
    const itemIds = new Set<string>();
    for (const item of journal.items) {
      if (itemIds.has(item.id)) throw new Error(`Duplicate journal item: ${item.id}`);
      itemIds.add(item.id);
      for (const stage of item.stages) {
        const requirements = [...(stage.allClues ?? []), ...(stage.anyClues ?? [])];
        if (!requirements.length || requirements.some(clue => !clues.has(clue))) throw new Error(`Invalid journal evidence: ${journal.id}/${item.id}`);
      }
    }
    if (journal.closedClues?.some(clue => !clues.has(clue))) throw new Error(`Invalid journal closure: ${journal.id}`);
    if (journal.cargo) {
      const resource = world.resources?.find(candidate => candidate.id === journal.cargo!.resourceId);
      if (!resource) throw new Error(`Unknown cargo resource: ${journal.id}`);
      for (const load of journal.cargo.loads) {
        if (!clues.has(load.clue) || !Number.isSafeInteger(load.slots) || load.slots < 1 || load.slots > resource.max - resource.min) throw new Error(`Invalid cargo load: ${journal.id}`);
      }
    }
  }
}

const compiledWorlds = new Map<string, GameWorld>();

export function getWorld(id: string): GameWorld {
  validateStoryId(id);
  const world = authoredWorlds.find((entry) => entry.storyId === id);
  if (!world) throw new StorySourceError('WORLD_NOT_PREPARED', '这部真实故事尚未制作互动改编。可以先阅读来源节选。', 409);
  let compiled = compiledWorlds.get(id);
  if (!compiled) {
    compiled = compileWorld(world);
    compiledWorlds.set(id, compiled);
  }
  return compiled;
}
