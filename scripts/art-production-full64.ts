import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createArtProductionService, normalizeArtReviewText } from '../server/art-production.ts';
import { authoredWorlds } from '../content/worlds.ts';
import { augmentedShortWorld, buildShortPlans, SHORT_FOLDER, SHORT_REPAIR_FILE } from '../server/art-production-short.ts';
import { formalStyleBrief, selectFormalJobs } from './art-production-formal-supervisor.ts';
import { createFormalReferenceDigestReader } from './art-production-formal-reference-cache.ts';
import { canonical, sha256, type SceneBrief } from '../server/art-production-prompts.ts';
import { readArtReviewEvidence } from '../server/art-production-review-files.ts';

const root = process.cwd();
const coord = path.join(root, 'output/coordination/art-remake-12h-20260912/full64-direct');
const formal = path.join(root, SHORT_FOLDER);
const privateRoot = path.join(root, 'output/imagegen/scene-production/.private');
const campaignFile = path.join(coord, 'campaign.json');
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const atomic = async (file: string, value: unknown) => {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, file);
};
const alive = (pid?: number) => {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
};
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
await mkdir(coord, { recursive: true });
const authorization = await json(path.join(coord, 'batch1000-authorization.json'));
assert.equal(authorization.targetNewNativeImages, 1000);
assert.equal(authorization.concurrency, 64);
const protectedIdentityFile = path.join(root, 'output/coordination/art-remake-12h-20260912/protected-two-identities-2312.json');
const protectedIdentities = (await json(protectedIdentityFile)).assets;
assert(Array.isArray(protectedIdentities) && protectedIdentities.length === 2, 'PROTECTED_IDENTITIES_REQUIRED');
const protectedPairs = new Set(protectedIdentities.map((row: any) => `${row.worldId}/${row.nodeId}`));
assert.deepEqual([...protectedPairs].sort(), ['blue-blood/b_blackout', 'future-island/ending_commons']);

// Check the OS identity, not just a recycled PID. A failed CIM query aborts.
const observations = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
  "@(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,Name,CommandLine,@{Name='createdAt';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}}) | ConvertTo-Json -Compress"],
  { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 }).trim());
assert(Array.isArray(observations) && observations.length > 0, 'PROCESS_IDENTITY_PROBE_FAILED');
const identity = new Map<number, any>(observations.map((p: any) => [p.ProcessId, p]));
const isArtWriter = (p: any) => /^(node|python)(\.exe)?$/i.test(p.Name)
  && /(?:scripts[\\/]art-production-(?:formal|worker|full64|client)\.(?:ts|py)|reconcile-wave68\.ts|generate_image2\.py|openqi_imagegen\.py)/i.test(p.CommandLine ?? '');
assert(!observations.some((p: any) => p.ProcessId !== process.pid && isArtWriter(p)), 'ANOTHER_PRODUCTION_WRITER_ACTIVE');
const initialBytes = await readFile(path.join(privateRoot, 'state.json'));
const initial = JSON.parse(initialBytes.toString('utf8'));
const initialJobs = initial.batches.flatMap((b: any) => b.jobs);
const retired = new Set<number>();
const proof: object[] = [];
for (const job of initialJobs.filter((j: any) => j.state === 'generating')) {
  for (const pid of [job.workerPid, job.childPid].filter(Boolean)) {
    const observation = identity.get(pid);
    if (observation) {
      const created = Date.parse(observation.createdAt);
      assert(Number.isFinite(created), 'PROCESS_CREATION_TIME_UNREADABLE');
      assert(!isArtWriter(observation) || created > Date.parse(job.updatedAt) + 1000, 'ORIGINAL_JOB_PROCESS_STILL_LIVE');
    }
    retired.add(pid);
    proof.push({ pid, currentExecutable: observation?.Name ?? null, currentCreatedAt: observation?.createdAt ?? null,
      jobUpdatedAt: job.updatedAt, disposition: observation ? 'reused-unrelated-identity' : 'exited' });
  }
}
const supervisorLock = path.join(formal, 'supervisor.lock');
try {
  const previous = await json(supervisorLock);
  const observed = identity.get(previous.pid);
  assert(!observed || !isArtWriter(observed), 'SUPERVISOR_ALREADY_ACTIVE');
  await atomic(path.join(coord, 'previous-supervisor-lock.json'), previous);
  await unlink(supervisorLock);
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const token = randomUUID();
const handle = await open(supervisorLock, 'wx');
await handle.writeFile(JSON.stringify({ pid: process.pid, token, at: new Date().toISOString(), owner: 'full64-direct-1000' }));
await handle.close();
await atomic(path.join(coord, 'active-owner.json'), { at: new Date().toISOString(), pid: process.pid,
  command: 'node --import tsx scripts/art-production-full64.ts', target: 1000, concurrency: 64,
  provider: 'img.openqi.sbs', supervisorToken: token });
let campaign = await json(campaignFile).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return { startedAt: new Date().toISOString(), target: 1000, concurrency: 64, submittedJobIds: [], recoveredJobIds: [], stage: 'recovering', newNativeImages: 0 };
});
const save = async (stage: string, extra = {}) => {
  Object.assign(campaign, extra, { stage, updatedAt: new Date().toISOString(), pid: process.pid });
  await atomic(campaignFile, campaign);
  console.log(JSON.stringify({ stage, newNativeImages: campaign.newNativeImages, submitted: campaign.submittedJobIds.length, ...extra }));
};
try {
  await atomic(path.join(coord, 'recovery-process-proof.json'), { at: new Date().toISOString(), proof, probeSucceeded: true });
  if (initial.batches.some((b: any) => b.state === 'running' && b.remainingRunBudget > 0)) {
    const handoff = await json(path.join(coord, 'settled-handoff.json')).catch((error: any) => {
      if (error?.code === 'ENOENT') return undefined;
      throw error;
    });
    if (handoff) {
    // The handoff is authoritative when it matches the current durable ledger;
    // older owners may have written a stale digest during an orderly exit.
    assert.equal(handoff.stateSha256, sha256(initialBytes), 'RESUME_STATE_CHANGED');
      assert.equal(handoff.status, 'previous-owner-exited-with-saved-results');
      assert.equal(handoff.liveGenerationChildren, 0);
    }
    const reserved = new Set(campaign.submittedJobIds);
    assert(initial.batches.filter((b: any) => b.state === 'running' && !b.recoverOnly).every((b: any) =>
      b.concurrency === 64 && Array.isArray(b.selectedJobs) && b.selectedJobs.every((id: string) => {
        if (reserved.has(id)) return true;
        const row = initialJobs.find((job: any) => job.id === id);
        return row?.state === 'queued' && row?.paidAttempts === 0 && !row?.asset;
      })),
    'UNRECOGNIZED_RESERVATION_BUDGET');
  }
  const recovery = createArtProductionService({ startWorker: () => {}, orphanInspectionConcurrency: 64,
    isProcessAlive: pid => !!pid && (retired.has(pid) ? false : alive(pid)) });
  await save('recovering');
  for (const batch of initial.batches.filter((b: any) => b.state === 'running' && b.recoverOnly)) {
    await recovery.pauseArtBatch(batch.id);
  }
  // Only enter the recovery drain when this snapshot contains actual orphaned
  // generation work. Empty or already-settled recovery lanes must not hold up
  // the normal 64-way dispatch loop.
  const hasRecoveryWork = initialJobs.some((j: any) => j.state === 'generating')
    || initial.batches.some((b: any) => b.state === 'running' && b.recoverOnly);
  if (hasRecoveryWork) await recovery.drain();
  let batches = await recovery.listArtBatches();
  let jobs = batches.flatMap(b => b.jobs);
  if (hasRecoveryWork) assert(!jobs.some(j => j.state === 'generating'), 'ORPHAN_RECOVERY_INCOMPLETE');
  const recovered = initialJobs.filter((j: any) => j.state === 'generating' && !j.asset && !campaign.submittedJobIds.includes(j.id))
    .filter((j: any) => jobs.find(now => now.id === j.id)?.asset).map((j: any) => j.id);
  campaign.recoveredJobIds = [...new Set([...campaign.recoveredJobIds, ...recovered])];
  // Existing unresolved requests belong to the recovery lane. Restarting this
  // producer must not repeatedly download its expired URLs or revive its gates.
  // The drain above only reconciles orphaned files from the settled handoff.
  batches = await recovery.listArtBatches(); jobs = batches.flatMap(b => b.jobs);
  const canResolveNoPost = !batches.some((batch: any) => batch.state === 'running' || batch.jobs.some((job: any) => job.state === 'generating'));
  for (const batch of batches) for (const job of batch.jobs) {
    if (!canResolveNoPost) continue;
    if (job.state !== 'failed' || job.errorCode !== 'DISPATCH_NOT_CONFIRMED_NO_POST' || job.asset || job.recoveryAvailable || job.paidAttempts !== 1) continue;
    const bytes = await readFile(path.join(privateRoot, 'jobs', job.id, 'result.json'));
    await recovery.confirmUnsubmittedArtJob(batch.id, job.id, sha256(bytes));
  }
  // Resume independent untouched work under the user's explicit authorization.
  const pauseFile = path.join(formal, 'pause');
  try {
    const pause = await json(pauseFile);
    assert(['WAVE_OUTCOME_INSPECTION', 'CLIENT_FAILED_OR_UNKNOWN'].includes(pause.code), 'NEW_PAUSE_REQUIRES_INSPECTION');
    await rename(pauseFile, path.join(coord, `released-pause-${Date.now()}.json`));
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const briefs = new Map<string, SceneBrief>();
  const service = createArtProductionService({ startWorker: () => {}, continueIndependentAfterUncertainResult: true,
    buildBrief: async (_root, world, node) => {
    const brief = briefs.get(`${world.id}/${node.id}`); assert(brief, 'CURRENT_BRIEF_REQUIRED'); return brief;
  } });
  while (campaign.newNativeImages < campaign.target) {
    const phaseStarted = Date.now();
    const phaseTiming: Record<string, number> = {};
    await save('preparing');
    batches = await service.listArtBatches(); jobs = batches.flatMap(b => b.jobs);
    const hardGate = batches.find(b => b.circuitBreaker)?.circuitBreaker;
    const rechargeFile = path.join(coord, 'recharge-2307-acknowledgement.json');
    const rechargeAuthorized = await json(rechargeFile).then(async receipt =>
      receipt.sourceAuthorizationSha256 === sha256(await readFile(path.join(root, 'output/coordination/art-remake-12h-20260912/recharge-resume-authority-2307.json')))
      && receipt.previousGate?.code === 'HTTP_402', () => false);
    assert(!hardGate || ['HTTP_502', 'CLIENT_FAILED_OR_UNKNOWN', 'CLIENT_RESULT_MISSING',
      'DISPATCH_NOT_CONFIRMED_NO_POST'].includes(hardGate.code) || (hardGate.code === 'HTTP_402' && rechargeAuthorized),
      hardGate?.code ?? 'CHANNEL_BLOCKED');
    // Import only existing SHA-bound review evidence; this runner grants no visual approvals.
    const reviewImports: Parameters<typeof service.reviewArtJobs>[0] = [];
    for (const file of await readdir(path.join(formal, 'reviews'))) {
      if (!/^scene_[a-f0-9]+\.json$/.test(file)) continue;
      const { review } = await readArtReviewEvidence(path.join(formal, 'reviews', file));
      if (!review) continue;
      const batch = batches.find(b => b.jobs.some(j => j.id === review.jobId));
      const job = batch?.jobs.find(j => j.id === review.jobId);
      if (job && protectedPairs.has(`${job.worldId}/${job.nodeId}`)) continue;
      if (!batch || !job?.asset || job.asset.sha256 !== review.sha256 || (job.stale && review.decision === 'approved')) continue;
      if (job.review?.decision === review.decision
        && job.review.reviewer === normalizeArtReviewText(review.reviewer)
        && job.review.notes === normalizeArtReviewText(review.notes)) continue;
      reviewImports.push({ batchId: batch.id, jobId: job.id, sha256: review.sha256, review });
    }
    await service.reviewArtJobs(reviewImports);
    phaseTiming.reviewImportMs = Date.now() - phaseStarted;
    batches = await service.listArtBatches(); jobs = batches.flatMap(b => b.jobs);
    let plans = await buildShortPlans(root, authoredWorlds);
    phaseTiming.buildPlansMs = Date.now() - phaseStarted - phaseTiming.reviewImportMs;
    const repairPath = path.join(root, SHORT_REPAIR_FILE);
    const repairs = await json(repairPath);
    const corrections = new Map<string, any>();
    for (const file of [
      path.join(root, 'output/coordination/art-remake-12h-20260912/root-resume-0058/zhouyang/correction-candidate.json'),
      path.join(root, 'output/coordination/art-remake-12h-20260912/palace-anchor-review-1724/correction-candidates.json'),
      path.join(root, 'output/coordination/art-remake-12h-20260912/review03-rejection-correction-candidates.json'),
      path.join(root, 'output/coordination/art-remake-12h-20260912/root-review-0125/correction-candidates.json'),
      path.join(coord, 'content-correction-candidates.json'),
    ]) {
      const payload = await json(file).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
      for (const row of payload?.rows ?? [payload]) if (row?.worldId && row?.nodeId) corrections.set(`${row.worldId}/${row.nodeId}`, row);
    }
    let repairCount = 0;
    for (const plan of plans) {
      if (protectedPairs.has(`${plan.worldId}/${plan.nodeId}`)) continue;
      const prior = jobs.find(j => !j.stale && j.worldId === plan.worldId && j.nodeId === plan.nodeId);
      if (!prior || jobs.some(j => j.worldId === plan.worldId && j.nodeId === plan.nodeId && ['generating', 'unknown_outcome', 'recoverable'].includes(j.state))) continue;
      const noPost = prior.state === 'failed' && prior.errorCode === 'DISPATCH_NOT_CONFIRMED_NO_POST';
      const rejected = prior.asset?.originalPixels && prior.review?.decision === 'rejected';
      if (!noPost && !rejected) continue;
      const key = `${plan.worldId}/${plan.nodeId}`;
      const correction = corrections.get(key);
      const correctedPrompt = correction?.prompt ?? correction?.correctedPrompt;
      const correctionJobId = correction?.correctionJobId ?? correction?.rejectedJobId;
      const correctionSha = correction?.correctionSha256 ?? correction?.rejectedSha256;
      const correctionSource = correction?.sourceHashAtReview ?? correction?.sourceHash;
      if (rejected && prior.sourceHash === plan.sourceHash && correctionJobId === prior.id
        && correctionSha === prior.asset?.sha256 && typeof correctedPrompt === 'string'
        && (!correctionSource || correctionSource === prior.sourceHash)
        && correctedPrompt.startsWith('吸血鬼猎人D画风，') && correctedPrompt.length <= 90 && correctedPrompt !== plan.prompt) {
        repairs[key] = { ...(repairs[key] ?? {}), prompt: correctedPrompt, referenceFiles: plan.referenceFiles ?? [],
          correctionOf: prior.id, correctionSha256: prior.asset!.sha256, observedDefect: correction.observedDefect,
          authorization: 'full64-direct/batch1000-authorization.json' };
        repairCount++; continue;
      }
      // A content rejection needs a source-specific correction. Generic composition
      // suffixes do not repair wrong places, missing objects, or invented prices.
      if (rejected) continue;
      if (noPost) {
        const receipt = await json(path.join(privateRoot, 'jobs', prior.id, 'no-post-resolution.json'));
        assert.equal(receipt.jobId, prior.id);
      }
      const instruction = '单幅完整画面。';
      if (plan.prompt.endsWith(instruction) || plan.prompt.length + instruction.length > 90) continue;
      repairs[key] = { ...(repairs[key] ?? {}), prompt: plan.prompt + instruction,
        referenceFiles: plan.referenceFiles ?? [], correctionOf: prior.id,
        ...(prior.asset ? { correctionSha256: prior.asset.sha256 } : {}),
        observedDefect: 'Verified unsubmitted request; preserve original subject and create a fresh request identity.',
        authorization: 'full64-direct/batch1000-authorization.json' };
      repairCount++;
    }
    phaseTiming.repairPassMs = Date.now() - phaseStarted - phaseTiming.reviewImportMs - phaseTiming.buildPlansMs;
    if (repairCount) {
      await atomic(path.join(coord, `repair-input-${Date.now()}.json`), { count: repairCount, previousFileSha256: sha256(await readFile(repairPath)) });
      await atomic(repairPath, repairs);
      plans = await buildShortPlans(root, authoredWorlds);
    }
    briefs.clear();
    const digest = createFormalReferenceDigestReader();
    for (const plan of plans) {
      const brief = await formalStyleBrief(root, plan, jobs, digest);
      if (brief && !plan.blocked) briefs.set(`${plan.worldId}/${plan.nodeId}`, brief);
    }
    phaseTiming.briefPassMs = Date.now() - phaseStarted - phaseTiming.reviewImportMs - phaseTiming.buildPlansMs - phaseTiming.repairPassMs;
    for (const world of authoredWorlds) {
      const ready = plans.filter(p => p.worldId === world.id && !protectedPairs.has(`${p.worldId}/${p.nodeId}`)
        && briefs.has(`${p.worldId}/${p.nodeId}`));
      const changed = ready.filter(p => {
        const b = briefs.get(`${p.worldId}/${p.nodeId}`)!;
        return !jobs.some(j => !j.stale && j.worldId === p.worldId && j.nodeId === p.nodeId && j.sourceHash === b.sourceHash && j.promptHash === sha256(b.prompt) && j.referenceHash === b.referenceHash);
      });
      if (changed.length) await service.prepareArtBatch({ world: augmentedShortWorld(world, changed), qualityPolicy: 'style-first', nodeIds: changed.map(p => p.nodeId), jobKinds: Object.fromEntries(changed.map(p => [p.nodeId, p.kind])) });
    }
    batches = await service.listArtBatches(); jobs = batches.flatMap(b => b.jobs);
    campaign.newNativeImages = campaign.submittedJobIds.filter((id: string) => jobs.some(j => j.id === id && j.asset?.originalPixels)).length;
    const rows = plans.flatMap(plan => {
      if (protectedPairs.has(`${plan.worldId}/${plan.nodeId}`)) return [];
      const brief = briefs.get(`${plan.worldId}/${plan.nodeId}`);
      const job = brief && jobs.find(j => !j.stale && j.worldId === plan.worldId && j.nodeId === plan.nodeId && j.sourceHash === brief.sourceHash && j.promptHash === sha256(brief.prompt) && j.referenceHash === brief.referenceHash);
      return job ? [{ ...plan, job, jobId: job.id, batchId: batches.find(b => b.jobs.some(j => j.id === job.id))!.id, status: job.state }] : [];
    });
    const selected = selectFormalJobs({ jobs: rows, allJobs: jobs, worldOrder: authoredWorlds.map(w => w.id), inFlight: 0 }, Math.min(1000 - campaign.newNativeImages, 1000));
    // If formal prioritization has no rows despite current queued work, consume
    // only ledger jobs that already have a current plan identity. This prevents
    // historical queued rows from starving an authorized 64-slot window.
    if (!selected.length) {
      const planByKey = new Map(plans.map(plan => [`${plan.worldId}/${plan.nodeId}`, plan]));
      const fallback = jobs.filter(job => !job.stale && job.state === 'queued' && job.paidAttempts === 0 && !job.asset
        && !protectedPairs.has(`${job.worldId}/${job.nodeId}`)
        && !['unknown_outcome', 'recoverable'].includes(job.state))
        .map(job => {
          const plan = planByKey.get(`${job.worldId}/${job.nodeId}`);
          const batchId = batches.find(batch => batch.jobs.some(candidate => candidate.id === job.id))?.id;
          return plan && batchId ? { ...plan, job, jobId: job.id, batchId, status: job.state } : undefined;
        }).filter(Boolean) as any[];
      selected.push(...fallback.slice(0, Math.min(64, 1000 - campaign.newNativeImages)));
    }
    if (!selected.length) { await save('waiting-for-current-art-tasks', { awaitingApprovedReferences: plans.filter(p => !briefs.has(`${p.worldId}/${p.nodeId}`)).length }); await delay(30000); continue; }
    await atomic(path.join(coord, `pre-dispatch-timing-${Date.now()}.json`), { at: new Date().toISOString(), phaseTiming, selected: selected.length, queued: jobs.filter(j => j.state === 'queued').length });
    await atomic(path.join(coord, `selection-${Date.now()}.json`), { at: new Date().toISOString(), count: selected.length, concurrency: 64,
      rows: selected.map(r => ({ jobId: r.jobId, worldId: r.worldId, nodeId: r.nodeId, sourceHash: r.job!.sourceHash, promptHash: r.job!.promptHash, referenceHash: r.job!.referenceHash })) });
    let acknowledge = batches.some(b => b.circuitBreaker && ['HTTP_502', 'CLIENT_FAILED_OR_UNKNOWN',
      'CLIENT_RESULT_MISSING', 'DISPATCH_NOT_CONFIRMED_NO_POST'].includes(b.circuitBreaker.code));
    const runnable = [];
    for (const batch of batches) {
      const ids = selected.filter(r => r.batchId === batch.id).map(r => r.jobId!);
      if (!ids.length) continue;
      runnable.push({ batch, ids, acknowledgeBlock: acknowledge });
      acknowledge = false;
    }
    // Register every selected batch before waking the shared worker. This preserves
    // per-batch guards while allowing the global 64-slot worker to fill across batches.
    await Promise.all(runnable.map(({ batch, ids, acknowledgeBlock }) =>
      service.runArtBatch(batch.id, { maxJobs: ids.length, concurrency: 64, jobIds: ids, ...(acknowledgeBlock ? { acknowledgeBlock: true } : {}) })));
    campaign.submittedJobIds = [...new Set([...campaign.submittedJobIds, ...runnable.flatMap(r => r.ids)])];
    await save('reserved');
    await save('generating');
    await service.drain();
  }
  await save('generation-target-reached');
} catch (error) {
  const rawMessage = error instanceof Error ? error.message : '';
  const promptFailure = /^SHORT_PROMPT_INVALID:([a-z0-9_-]+\/[a-z0-9_-]+)$/.exec(rawMessage);
  const code = (error as NodeJS.ErrnoException).code ?? '';
  await save('stopped-with-evidence', {
    error: /^[A-Z0-9_]+$/.test(rawMessage) ? rawMessage : promptFailure ? 'SHORT_PROMPT_INVALID' : /^[A-Z0-9_]+$/.test(code) ? code : 'RUNNER_ERROR',
    failedStage: campaign.stage,
    errorType: error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(error.name) ? error.name : 'Error',
    sourceFrames: error instanceof Error ? [...(error.stack ?? '').matchAll(/art-production[\w-]*\.ts:\d+:\d+/g)].map(match => match[0]).slice(0, 5) : [],
    ...(promptFailure ? { invalidPromptKey: promptFailure[1] } : {}),
  });
  process.exitCode = 1;
} finally {
  const owner = await json(supervisorLock).catch(() => null);
  if (owner?.token === token) await unlink(supervisorLock);
}
