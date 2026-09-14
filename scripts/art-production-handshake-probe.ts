import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createArtProductionService } from '../server/art-production.ts';
import { sha256 } from '../server/art-production-prompts.ts';
import type { ArtWorldInput } from '../shared/production.ts';

// Isolated synthetic executor: no provider, Python client or production-store writes.
const root = await mkdtemp(path.join(os.tmpdir(), 'art-handshake-probe-'));
const stateFile = path.join(root, 'output/imagegen/scene-production/.private/state.json');
const ids = Array.from({ length: 32 }, (_, index) => `synthetic-${index}`);
const world: ArtWorldInput = { id: 'synthetic-handshake', storyId: 'test', title: 'Test only', version: '1',
  characters: [], source: { title: 'Synthetic', author: 'Test', url: '' },
  nodes: Object.fromEntries(ids.map(id => [id, { id, chapter: 'Test', title: id, location: 'Test', time: '',
    background: '', text: ['Test only'], choices: [] }])) };
let confirmed = 0, release!: () => void, reachedLimit!: () => void;
const held = new Promise<void>(resolve => { release = resolve; });
const full = new Promise<void>(resolve => { reachedLimit = resolve; });
const failures: { stage: string; code: string }[] = [];
const service = createArtProductionService({ root, startWorker: () => {},
  buildBrief: async (_root, _world, node) => ({ prompt: node.id, references: [],
    sourceHash: sha256(node.id), referenceHash: sha256('none') }),
  execute: async ({ onPid }) => {
    try { await onPid(process.pid); }
    catch (error) { failures.push({ stage: 'persist-client-pid', code: (error as { code?: string }).code ?? 'UNCLASSIFIED' }); throw error; }
    confirmed++; if (confirmed === 32) reachedLimit();
    await held;
    return { state: 'failed', errorCode: 'SYNTHETIC_TEST_NO_POST', recoveryAvailable: false };
  } });
const batch = await service.prepareArtBatch({ world });
const store = JSON.parse(await readFile(stateFile, 'utf8'));
for (const job of store.batches[0].jobs) job.prompt = 'x'.repeat(2_400_000);
await writeFile(stateFile, JSON.stringify(store));
const storeBytes = (await readFile(stateFile)).length;
await service.runArtBatch(batch.id, { maxJobs: 32, concurrency: 32 });
const started = Date.now();
const draining = service.drain().catch(error => {
  failures.push({ stage: 'drain', code: (error as { code?: string }).code ?? 'UNCLASSIFIED' });
  release(); reachedLimit();
});
let timer: ReturnType<typeof setTimeout> | undefined;
await Promise.race([full, new Promise(resolve => { timer = setTimeout(resolve, 60000); })]);
clearTimeout(timer);
const confirmedBeforeRelease = confirmed;
release(); await draining;
const result = (await service.getArtBatch(batch.id))!;
const report = { at: new Date().toISOString(), syntheticExecutor: true, paidRequests: 0, storeBytes,
  expectedConcurrency: 32, confirmedBeforeRelease, confirmedTotal: confirmed,
  durationMs: Date.now() - started, failures,
  resultStates: result.jobs.reduce<Record<string, number>>((counts, job) => {
    counts[job.state] = (counts[job.state] ?? 0) + 1; return counts;
  }, {}), passed: confirmedBeforeRelease === 32 && failures.length === 0 };
const folder = path.join(process.cwd(), 'output/imagegen/scene-production/formal-production-20260907/handshake-probes');
await mkdir(folder, { recursive: true });
await writeFile(path.join(folder, `${started}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
