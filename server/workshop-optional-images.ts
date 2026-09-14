import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import type { GameWorld } from '../shared/types.ts';
import type { GenerationOptions } from '../shared/workshop.ts';
import { alive, jsonFile, writeJson } from './story-workshop.ts';
import { startImageLaunch } from './workshop-image-launch.ts';

export async function launchOptionalImages(world: GameWorld, provider: GenerationOptions['images'], root: string) {
  if (provider === 'none') return;
  if (provider === 'image2') { await startImageLaunch(world); return; }
  const directory = join(root, 'projects', world.storyId, world.version), lock = join(directory, 'simple-images.lock');
  try { await mkdir(lock); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const owner = await jsonFile<{ pid: number }>(join(lock, 'owner.json')).catch(() => null);
    if (!owner || alive(owner.pid)) return;
    // Stale illustration ownership has no authority over the text-generation lock.
    await rm(lock, { recursive: true, force: true });
    try { await mkdir(lock); } catch { return; }
  }
  await writeJson(join(lock, 'owner.json'), { pid: process.pid });
  try {
    const child = spawn(process.execPath, ['--import', 'tsx', resolve('server/workshop-simple-image-worker.ts'), root, world.storyId, world.version], { cwd: process.cwd(), detached: true, windowsHide: true, stdio: 'ignore', shell: false });
    await new Promise<void>((yes, no) => { child.once('spawn', yes); child.once('error', no); });
    await writeJson(join(lock, 'owner.json'), { pid: child.pid });
    child.unref();
  } catch (error) { await rm(lock, { recursive: true, force: true }); throw error; }
}
