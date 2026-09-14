import { randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function publishImportRecord(file: string, value: unknown): Promise<boolean> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx');
  try { await handle.writeFile(JSON.stringify(value), 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  try {
    try { await link(temporary, file); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false; throw error; }
  } finally { await rm(temporary, { force: true }); }
}

export async function claimImportRecovery(indexFile: string, isAlive: (pid: number) => boolean): Promise<null | (() => Promise<void>)> {
  const directory = `${indexFile}.recover-v2`;
  await mkdir(directory, { recursive: true });
  // A dead owner advances the generation; no contender ever removes a shared
  // lock name, so a delayed reclaimer cannot delete a newer caller's claim.
  for (let generation = 0; ; generation++) {
    const record = join(directory, `${generation}.json`), token = randomUUID();
    if (await publishImportRecord(record, { pid: process.pid, token })) {
      return async () => { await publishImportRecord(join(dirname(record), `${generation}.${token}.released`), { released: true }); };
    }
    const owner = JSON.parse(await readFile(record, 'utf8')) as { pid: number; token: string };
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || !/^[a-f0-9-]{36}$/.test(owner.token)) throw new Error('Invalid import recovery owner');
    const released = await readFile(join(directory, `${generation}.${owner.token}.released`), 'utf8').then(() => true).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    });
    if (!released && isAlive(owner.pid)) return null;
  }
}
