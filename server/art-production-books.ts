import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Local authoring revisions take precedence; clean clones use the shipped source books. */
export async function readArtSourceBook<T>(root: string, owner: string): Promise<T> {
  const local = join(root, 'output/imagegen/scene-production/art-team', owner, 'short-production-20260907/book.json');
  let text: string;
  try { text = await readFile(local, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    text = await readFile(join(root, 'content/art-books', `${owner}.json`), 'utf8');
  }
  // Malformed local revisions must not silently fall back to an older book.
  return JSON.parse(text) as T;
}
