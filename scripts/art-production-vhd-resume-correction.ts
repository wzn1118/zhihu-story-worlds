import { readFile, writeFile } from 'node:fs/promises';
import { authoredWorlds } from '../content/worlds.ts';
import { buildSceneBrief, sha256 } from '../server/art-production-prompts.ts';
import { listArtBatches, runArtBatch } from '../server/art-production.ts';
import { VHD_REFERENCE_REVISION } from '../server/art-production-references.ts';

const directory = 'output/imagegen/scene-production/batch-vhd-20260906';
const selectedId = 'scene_49ad3c28e064bf0ec5fa2f04e75b';
const inspectedGate = { code: 'NATIVE_4K_GATE_FAILED', at: '2026-09-06T05:00:05.241Z' };
const batches = await listArtBatches();
const jobs = batches.flatMap(batch => batch.jobs);
const batch = batches.find(batch => batch.jobs.some(job => job.id === selectedId));
const selected = batch?.jobs.find(job => job.id === selectedId);
const original = jobs.find(job => job.id === 'scene_1e8a6a0c597378e1dce1e094cc44');
const undersized = jobs.find(job => job.id === 'scene_e789e2ac517008e32c504855f955');
const unknown = jobs.find(job => job.id === 'scene_b6d835c0e9972b9f4ed8c9fd9dba');
if (!batch || !selected || selected.stale || selected.state !== 'queued' || selected.paidAttempts !== 0
  || !original?.asset?.native4k || original.review?.decision !== 'rejected') throw new Error('RESERVED_UNPAID_REVIEWED_CORRECTION_REQUIRED');
if (batch.circuitBreaker?.code !== inspectedGate.code || batch.circuitBreaker.at !== inspectedGate.at
  || undersized?.asset?.width !== 1672 || undersized.asset.height !== 941 || undersized.asset.native4k
  || undersized.review?.decision !== 'rejected') throw new Error('EXACT_SIZE_GATE_REVIEW_REQUIRED');
if (!unknown || unknown.state !== 'unknown_outcome' || unknown.paidAttempts !== 1 || unknown.recoveryAvailable
  || jobs.some(job => ['generating', 'recoverable', 'unknown_outcome'].includes(job.state) && job.id !== unknown.id))
  throw new Error('UNINSPECTED_OUTCOME_NO_RESUME');
const reserved = JSON.parse(await readFile(`${directory}/runs/${selectedId}.intent.json`, 'utf8'));
if (!reserved.selected.some((job: { id: string }) => job.id === selectedId)
  || reserved.createdAt >= inspectedGate.at || reserved.maxNewPaidRequests !== 1) throw new Error('PREEXISTING_SINGLE_JOB_RESERVATION_REQUIRED');
const world = authoredWorlds.find(world => world.id === selected.worldId)!;
const brief = await buildSceneBrief(process.cwd(), world, world.nodes[selected.nodeId]);
if (!brief.prompt.includes(VHD_REFERENCE_REVISION) || brief.quality !== 'high' || brief.pixelSize
  || sha256(brief.prompt) !== selected.promptHash || brief.sourceHash !== selected.sourceHash
  || brief.referenceHash !== selected.referenceHash) throw new Error('CORRECTION_CHANGED_REPREPARE');
const receipt = { at: new Date().toISOString(), jobId: selectedId, inspectedGate,
  scope: 'Resume only the previously reserved, unsubmitted single visual correction after reviewing an unrelated undersized delivery.',
  originalReviewedJob: original.id, rejectedUndersizedJob: undersized.id,
  unknownRetained: { id: unknown.id, paidAttempts: unknown.paidAttempts, recoveryAttempts: unknown.recoveryAttempts },
  maxNewPaidRequests: 1, noOtherJobsReleased: true, noPostRetried: true };
await writeFile(`${directory}/runs/${selectedId}.resume-intent.json`, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
const running = await runArtBatch(batch.id, { jobIds: [selectedId], maxJobs: 1, concurrency: 2, acknowledgeBlock: true });
const result = { ...receipt, batchState: running.state, job: running.jobs.find(job => job.id === selectedId) };
await writeFile(`${directory}/runs/${selectedId}.resume-result.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
