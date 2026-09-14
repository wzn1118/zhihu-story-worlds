import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [directory, root] = process.argv.slice(2);
let input = '';
for await (const chunk of process.stdin) input += chunk;
if (input.trim() !== 'START') process.exit(12);
const store = JSON.parse(await readFile(path.join(root, 'output/imagegen/scene-production/.private/state.json'), 'utf8'));
const job = store.batches.flatMap(batch => batch.jobs).find(job => job.id === path.basename(directory));
const durable = job?.childPid === process.pid && job?.state === 'generating';
await writeFile(path.join(directory, 'handshake-test.json'), JSON.stringify({ durable, pid: process.pid }));
await writeFile(path.join(directory, 'result.json'), JSON.stringify({
  state: 'failed', errorCode: durable ? 'SYNTHETIC_HANDSHAKE_NO_POST' : 'SYNTHETIC_PID_NOT_DURABLE', recoveryAvailable: false,
}));
