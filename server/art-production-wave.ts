import type { ArtBatch, ArtJob } from '../shared/production.ts';

export interface ArtWaveSelection {
  batchId: string;
  jobId: string;
  worldId: string;
  nodeId: string;
  sourceHash: string;
  promptHash: string;
  referenceHash: string;
}

export function planArtWave(batches: ArtBatch[], worldIds: string[], perWorld = 2,
  preferred: Record<string, string[]> = {}): ArtWaveSelection[] {
  if (!worldIds.length || new Set(worldIds).size !== worldIds.length
    || !Number.isInteger(perWorld) || perWorld < 1 || perWorld > 30) throw new Error('INVALID_ART_WAVE');
  const all = batches.flatMap(batch => batch.jobs);
  const touched = new Set(all.filter(job => job.paidAttempts > 0
    || ['generating', 'recoverable', 'unknown_outcome'].includes(job.state))
    .map(job => JSON.stringify([job.worldId, job.nodeId])));
  const candidates = worldIds.map(worldId => {
    const batch = batches.find(item => item.worldId === worldId);
    if (!batch) throw new Error(`WAVE_WORLD_NOT_PREPARED:${worldId}`);
    const jobs = batch.jobs.filter(job => !job.stale && job.state === 'queued' && job.paidAttempts === 0
      && !job.asset && !job.review && !touched.has(JSON.stringify([job.worldId, job.nodeId])));
    const ranking = new Map((preferred[worldId] ?? []).map((nodeId, index) => [nodeId, index]));
    jobs.sort((left, right) => (ranking.get(left.nodeId) ?? Infinity) - (ranking.get(right.nodeId) ?? Infinity));
    if (jobs.length < perWorld) throw new Error(`WAVE_UNTOUCHED_SHORTFALL:${worldId}`);
    return { batch, jobs };
  });
  const selected: ArtWaveSelection[] = [];
  // First cover every story, then take each story's second independent scene.
  for (let round = 0; round < perWorld; round++) {
    for (const { batch, jobs } of candidates) {
      const job = jobs[round];
      selected.push({ batchId: batch.id, jobId: job.id, worldId: job.worldId, nodeId: job.nodeId,
        sourceHash: job.sourceHash, promptHash: job.promptHash, referenceHash: job.referenceHash });
    }
  }
  return selected;
}

export function resolveArtWave(selection: ArtWaveSelection[], batches: ArtBatch[]): ArtJob[] {
  return selection.map(item => {
    const job = batches.find(batch => batch.id === item.batchId)?.jobs.find(job => job.id === item.jobId);
    if (!job || job.stale || job.worldId !== item.worldId || job.nodeId !== item.nodeId
      || job.sourceHash !== item.sourceHash || job.promptHash !== item.promptHash
      || job.referenceHash !== item.referenceHash) throw new Error(`WAVE_REVISION_CHANGED:${item.worldId}/${item.nodeId}`);
    return job;
  });
}

export function inspectArtWave(selection: ArtWaveSelection[], batches: ArtBatch[]) {
  let missing = 0;
  let changed = 0;
  const jobs: ArtJob[] = [];
  const current: ArtJob[] = [];
  for (const item of selection) {
    const job = batches.find(batch => batch.id === item.batchId)?.jobs.find(job => job.id === item.jobId);
    if (!job) { missing++; continue; }
    jobs.push(job);
    if (job.stale || job.worldId !== item.worldId || job.nodeId !== item.nodeId
      || job.sourceHash !== item.sourceHash || job.promptHash !== item.promptHash
      || job.referenceHash !== item.referenceHash) changed++;
    else current.push(job);
  }
  return { planned: selection.length, worlds: new Set(selection.map(item => item.worldId)).size,
    missing, changed, generated: jobs.filter(job => job.asset).length,
    reviewed: jobs.filter(job => job.review).length,
    approved: current.filter(job => job.review?.decision === 'approved' && job.asset?.native4k && !job.asset.duplicate).length,
    paidAttempts: jobs.reduce((sum, job) => sum + job.paidAttempts, 0),
    inFlight: jobs.filter(job => job.state === 'generating').length };
}

export function nextArtWaveJobs(selection: ArtWaveSelection[], batches: ArtBatch[]): ArtJob[] {
  const jobs = resolveArtWave(selection, batches);
  if (jobs.some(job => job.asset && !job.review)) throw new Error('WAVE_DELIVERED_IMAGE_NEEDS_MANUAL_REVIEW');
  const capacity = Math.max(0, 2 - batches.flatMap(batch => batch.jobs).filter(job => job.state === 'generating').length);
  const runningWorlds = new Set(batches.filter(batch => batch.state === 'running').map(batch => batch.worldId));
  const worlds = new Set<string>();
  return jobs.filter(job => {
    if (job.state !== 'queued' || job.paidAttempts !== 0 || worlds.has(job.worldId) || runningWorlds.has(job.worldId)) return false;
    worlds.add(job.worldId);
    return true;
  }).slice(0, capacity);
}
