import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { StoryWorkshop, jsonFile } from './story-workshop.ts';
import { generateSimpleImages, getSimpleImageStatus } from './workshop-simple-images.ts';

async function main() {
  const [root, id, version] = process.argv.slice(2), service = new StoryWorkshop(root);
  const directory = service.dir(id), lock = join(directory, version, 'simple-images.lock');
  try {
    const world = await service.world(id, version);
    const status = await getSimpleImageStatus(world, directory);
    await generateSimpleImages(world, directory, { retry: ['failed', 'partial'].includes(status.state) });
  } finally {
    if ((await jsonFile<{ pid: number }>(join(lock, 'owner.json')).catch(() => null))?.pid === process.pid) await rm(lock, { recursive: true, force: true });
  }
}
void main().catch(() => { process.exitCode = 1; });
