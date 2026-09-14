import { existsSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { claimImportRecovery } from '../../server/import-recovery.ts';
import { alive, StoryWorkshop } from '../../server/story-workshop.ts';
import type { ImportedSource } from '../../shared/workshop.ts';

function message(type: string) {
  return new Promise<void>(resolve => {
    const receive = (value: unknown) => {
      if ((value as { type?: string })?.type !== type) return;
      process.off('message', receive);
      resolve();
    };
    process.on('message', receive);
  });
}

function send(value: object) {
  return new Promise<void>((resolve, reject) => {
    process.send!(value, error => error ? reject(error) : resolve());
  });
}

async function main() {
  const [mode, target, input] = process.argv.slice(2);
  const start = message('start');
  await send({ type: 'ready', pid: process.pid });
  await start;

  if (mode === 'claim-hold') {
    const release = await claimImportRecovery(target, alive);
    const finish = message('release');
    await send({ type: 'claimed', claimed: Boolean(release), pid: process.pid });
    await finish;
    if (release) await release();
  } else if (mode === 'claim-delayed') {
    let observed = false;
    const release = await claimImportRecovery(target, pid => {
      if (!observed && !alive(pid)) {
        observed = true;
        writeFileSync(`${input}.observed`, JSON.stringify({ pid }));
        const sleeper = new Int32Array(new SharedArrayBuffer(4));
        const deadline = Date.now() + 15_000;
        while (!existsSync(input)) {
          if (Date.now() >= deadline) throw new Error('Timed out waiting for the delayed-claim gate');
          Atomics.wait(sleeper, 0, 0, 10);
        }
      }
      return alive(pid);
    });
    await send({ type: 'claimed', claimed: Boolean(release), pid: process.pid });
    if (release) await release();
  } else if (mode === 'import') {
    const source = JSON.parse(await readFile(input, 'utf8')) as ImportedSource;
    const workshop = new StoryWorkshop(target);
    const project = source.scope === 'zhihu-excerpt'
      ? await workshop.importZhihuSearch(source) : await workshop.import(source);
    await send({ type: 'result', pid: process.pid, id: project.id, sourceHash: project.sourceHash, revision: project.revision });
  } else {
    throw new Error(`Unknown test child mode: ${mode}`);
  }
  process.disconnect();
}

main().catch(async error => {
  await send({ type: 'failure', message: error instanceof Error ? error.stack : String(error) }).catch(() => {});
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
