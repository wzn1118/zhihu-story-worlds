import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createArtProductionService, type ArtClientResult } from '../server/art-production.ts';
import { canonical, sha256 } from '../server/art-production-prompts.ts';
import type { ArtWorldInput } from '../shared/production.ts';

const source: ArtWorldInput = {
  id: 'quarantine-test', storyId: 'quarantine-test', title: 'Offline quarantine fixture', version: '1', characters: [],
  source: { title: 'Fixture', author: 'Test', url: '' },
  nodes: Object.fromEntries(['first', 'second', 'third'].map(id => [id, {
    id, title: id, chapter: 'one', location: 'room', time: 'day', text: [id], background: '', choices: [],
  }])),
};
const brief = async (_root: string, _world: ArtWorldInput, node: ArtWorldInput['nodes'][string]) => ({
  prompt: node.text.join('\n'), references: [], sourceHash: sha256(canonical(node)), referenceHash: sha256('no references'),
});

test('authorized independent work continues while uncertain job and replacement node remain quarantined', async t => {
  for (const errorCode of ['HTTP_502', 'CLIENT_FAILED_OR_UNKNOWN', 'CLIENT_RESULT_MISSING']) await t.test(errorCode, async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'art-quarantine-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    let calls = 0;
    const service = createArtProductionService({ root, buildBrief: brief, startWorker: () => {},
      continueIndependentAfterUncertainResult: true,
      execute: async ({ directory }): Promise<ArtClientResult> => {
        calls++;
        if (calls === 1) return { state: 'unknown_outcome', errorCode, recoveryAvailable: false };
        const bytes = Buffer.alloc(64); bytes.write('89504e470d0a1a0a', 0, 'hex');
        bytes.writeUInt32BE(1600, 16); bytes.writeUInt32BE(900, 20); bytes.writeUInt32BE(calls, 32);
        const file = path.join(directory, 'test-only.png'); await writeFile(file, bytes);
        return { state: 'resolution_mismatch', file, width: 1600, height: 900, bytes: bytes.length,
          sha256: sha256(bytes), native4k: false, recoveryAvailable: true };
      } });
    const batch = await service.prepareArtBatch({ world: source, qualityPolicy: 'style-first' });
    await service.runArtBatch(batch.id, { maxJobs: 3, concurrency: 1 }); await service.drain();
    const delivered = (await service.getArtBatch(batch.id))!;
    assert.equal(calls, 3); assert.equal(delivered.circuitBreaker, undefined);
    const uncertain = delivered.jobs.find(job => job.state === 'unknown_outcome')!;
    assert(uncertain); assert.equal(uncertain.paidAttempts, 1); assert.equal(delivered.progress.generated, 2);
    const replacement = structuredClone(source);
    replacement.nodes[uncertain.nodeId].text.push('A new prompt cannot evade quarantine.');
    const next = await service.prepareArtBatch({ world: replacement, qualityPolicy: 'style-first', nodeIds: [uncertain.nodeId] });
    await service.runArtBatch(next.id, { maxJobs: 1, concurrency: 1 }); await service.drain();
    assert.equal(calls, 3);
    const final = (await service.listArtBatches()).flatMap(batch => batch.jobs);
    assert.equal(final.find(job => job.id === uncertain.id)?.paidAttempts, 1);
    assert(final.some(job => job.nodeId === uncertain.nodeId && job.id !== uncertain.id && job.paidAttempts === 0));
  });
});

test('default uncertainty and account, endpoint, rate, integrity gates still stop new claims', async t => {
  for (const errorCode of ['HTTP_502', 'HTTP_401', 'HTTP_402', 'HTTP_403', 'HTTP_404', 'HTTP_429', 'HTTP_503', 'ART_CLIENT_INTEGRITY_FAILED']) await t.test(errorCode, async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'art-quarantine-gate-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    let calls = 0;
    const service = createArtProductionService({ root, buildBrief: brief, startWorker: () => {},
      continueIndependentAfterUncertainResult: errorCode !== 'HTTP_502',
      execute: async () => { calls++; return { state: 'unknown_outcome', errorCode, recoveryAvailable: false }; } });
    const batch = await service.prepareArtBatch({ world: source, qualityPolicy: 'style-first' });
    await service.runArtBatch(batch.id, { maxJobs: 3, concurrency: 1 }); await service.drain();
    assert.equal(calls, 1);
    const final = (await service.getArtBatch(batch.id))!;
    assert.equal(final.circuitBreaker?.code, errorCode); assert.equal(final.progress.queued, 2);
  });
});


for (const continueIndependentAfterUncertainResult of [false, true]) {
  for (const errorCode of ['HTTP_401', 'HTTP_402', 'HTTP_403', 'HTTP_404', 'HTTP_429', 'HTTP_503', 'ART_CLIENT_INTEGRITY_FAILED']) {
    test(`concurrency=2 retains ${errorCode} after later NO_POST with independent continuation=${continueIndependentAfterUncertainResult}`,
      { timeout: 30_000 }, async t => {
        const fixtureDirectory = path.resolve('output/coordination/art-remake-12h-20260912/full64-direct/boundary-regression/fixtures');
        await mkdir(fixtureDirectory, { recursive: true });
        const root = await mkdtemp(path.join(fixtureDirectory, 'hard-gate-'));
        t.after(() => rm(root, { recursive: true, force: true }));
        const started: { jobId: string; directory: string; finish: (result: ArtClientResult) => void }[] = [];
        let markBothStarted!: () => void;
        const bothStarted = new Promise<void>(resolve => { markBothStarted = resolve; });
        const service = createArtProductionService({ root, buildBrief: brief, startWorker: () => {},
          continueIndependentAfterUncertainResult,
          execute: ({ directory }) => new Promise<ArtClientResult>(resolve => {
            started.push({ jobId: path.basename(directory), directory, finish: resolve });
            if (started.length === 2) markBothStarted();
            if (started.length > 2) resolve({ state: 'failed', errorCode: 'UNEXPECTED_OFFLINE_CLAIM', recoveryAvailable: false });
          }),
        });
        const batch = await service.prepareArtBatch({ world: source, qualityPolicy: 'style-first' });
        await service.runArtBatch(batch.id, { maxJobs: 3, concurrency: 2 });
        const draining = service.drain();
        try {
          await bothStarted;
          assert.equal(started.length, 2);
          if (errorCode === 'ART_CLIENT_INTEGRITY_FAILED') {
            // Exercise actual ingest validation without creating or publishing a PNG.
            const binary = Buffer.alloc(64); binary.write('89504e470d0a1a0a', 0, 'hex');
            binary.writeUInt32BE(1600, 16); binary.writeUInt32BE(900, 20);
            const file = path.join(started[0].directory, 'invalid-delivery.bin');
            await writeFile(file, binary);
            started[0].finish({ state: 'resolution_mismatch', file, width: 1600, height: 900,
              bytes: binary.length, sha256: '0'.repeat(64), recoveryAvailable: true });
          } else started[0].finish({ state: 'unknown_outcome', errorCode, recoveryAvailable: false });

          // Keep the second result outstanding until the hard gate is durably visible.
          // This reproduces a later completion overwriting the gate in another transaction.
          let beforeSecond = await service.getArtBatch(batch.id);
          const deadline = Date.now() + 15_000;
          while (beforeSecond?.circuitBreaker?.code !== errorCode && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 50));
            beforeSecond = await service.getArtBatch(batch.id);
          }
          assert.equal(beforeSecond?.circuitBreaker?.code, errorCode);
          assert.equal(beforeSecond?.jobs.find(job => job.id === started[1].jobId)?.state, 'generating');
          const originalGate = { ...beforeSecond!.circuitBreaker! };
          started[1].finish({ state: 'failed', errorCode: 'DISPATCH_NOT_CONFIRMED_NO_POST',
            errorStage: 'pid_persist', recoveryAvailable: false });
          await draining;

          const final = (await service.getArtBatch(batch.id))!;
          assert.equal(started.length, 2, 'The untouched third job must never be claimed after the hard gate.');
          assert.deepEqual(final.circuitBreaker, originalGate, 'A later NO_POST must retain the original hard code and timestamp.');
          assert.equal(final.state, 'blocked');
          const hardJob = final.jobs.find(job => job.id === started[0].jobId)!;
          assert.equal(hardJob.errorCode, errorCode);
          assert.equal(hardJob.paidAttempts, 1);
          assert.equal(hardJob.asset, undefined);
          const noPostJob = final.jobs.find(job => job.id === started[1].jobId)!;
          assert.equal(noPostJob.state, 'failed');
          assert.equal(noPostJob.errorCode, 'DISPATCH_NOT_CONFIRMED_NO_POST');
          assert.equal(noPostJob.paidAttempts, 1, 'Ingestion must not authorize or reset an unsubmitted attempt.');
          const untouched = final.jobs.find(job => !started.some(call => call.jobId === job.id))!;
          assert.equal(untouched.state, 'queued'); assert.equal(untouched.paidAttempts, 0);
          await assert.rejects(service.runArtBatch(batch.id, { maxJobs: 1, concurrency: 2 }), /ART_CIRCUIT_OPEN/);
        } finally {
          // Unblock pending injected calls even if an assertion fails; no real child exists.
          for (const call of started) call.finish({ state: 'failed', errorCode: 'OFFLINE_TEST_CLEANUP', recoveryAvailable: false });
          await draining;
        }
      });
  }
}
