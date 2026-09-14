import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/** Only published world bytes trigger art work; draft/editorial events do not. */
export async function publishedArtSources(root: string) {
  const directory = path.join(root, '.local/story-workshop/projects');
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  const result: { projectId: string; version: string; worldId: string; sha256: string }[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !/^import-[0-9a-f-]{36}$/.test(entry.name)) continue;
    const project = JSON.parse(await readFile(path.join(directory, entry.name, 'project.json'), 'utf8'));
    if (!project.publishedVersion) continue;
    if (!/^r[1-9][0-9]*$/.test(project.publishedVersion)) throw new Error('INVALID_ART_PUBLICATION_VERSION');
    const bytes = await readFile(path.join(directory, entry.name, project.publishedVersion, 'world.json'));
    const world = JSON.parse(bytes.toString('utf8'));
    const expectedId = `workshop-${entry.name.slice('import-'.length)}-${project.publishedVersion}`;
    if (world.id !== expectedId || world.version !== project.publishedVersion || !world.nodes)
      throw new Error('ART_PUBLICATION_IDENTITY_MISMATCH');
    result.push({ projectId: entry.name, version: project.publishedVersion, worldId: world.id,
      sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return result;
}
