import type { AuthoredWorld } from './worlds.ts';
import type { Choice } from '../shared/types.ts';
import { worldProseB } from './world-prose-b.ts';
import { continuationB } from './world-continuation-b.ts';
import revisions from './catalog-b-editorial-data.json';
import followup from './catalog-b-editorial-followup.json';

export const catalogBEditorialRevisions = [...revisions, ...followup];

// The B export precedes both exact-match shared layers. Compare a targeted field
// against its final, reviewed spelling, without running either shared pass on
// unrelated fields early. Thus a concurrent newer sentence is never overwritten.
export function withCatalogBEditorial(input: AuthoredWorld): AuthoredWorld {
  const entries = catalogBEditorialRevisions.filter(r => r.worldId === input.id);
  if (!entries.length) return input;
  const world = structuredClone(input);
  const prose = new Map(worldProseB[world.id] ?? []);
  const continuation = new Map(continuationB[world.id] ?? []);
  const projected = (text: string) => {
    const first = prose.get(text) ?? text;
    return continuation.get(first) ?? first;
  };
  for (const entry of entries) {
    const parts = entry.path.split('.');
    let holder: any = world;
    for (const part of parts.slice(0, -1)) {
      holder = Array.isArray(holder) && !/^\d+$/.test(part) ? holder.find(v => v.id === part) : holder[part];
      if (!holder) throw new Error(`Missing editorial target ${world.id}/${entry.path}`);
    }
    const key = parts.at(-1)!;
    const current = holder[key];
    if (current === entry.after) continue;
    // Resource descriptions aren't traversed by the shared prose passes.
    const expected = parts[0] === 'resources' ? current : projected(current);
    if (expected !== entry.before) continue;
    if (parts.includes('choices')) {
      const choice = holder as Choice;
      choice.legacyTexts = [...new Set([...(choice.legacyTexts ?? []), current, entry.before])];
    }
    holder[key] = entry.after;
    if (parts[0] === 'nodes') {
      const node = world.nodes[parts[1]];
      if (node.ending) {
        if (parts[2] === 'text' && Number(parts[3]) === node.text.length - 1) node.ending.text = entry.after;
        if (parts[2] === 'title') node.ending.title = entry.after;
      }
    }
  }
  return world;
}
