import { createFormalReferenceDigestReader, type FormalReferenceDigestReader } from './art-production-formal-reference-cache.ts';
import path from 'node:path';
import type { ArtConcurrency, ArtJob, ArtJobKind } from '../shared/production.ts';
import { canonical, sha256, type SceneBrief } from '../server/art-production-prompts.ts';
import { SHORT_PROFILE, type ShortAssetPlan } from '../server/art-production-short.ts';

export interface FormalRow {
  worldId: string; nodeId: string; kind: ArtJobKind; status: string; blocked?: string;
  jobId?: string; batchId?: string; job?: ArtJob;
}
export interface FormalSnapshot {
  jobs: FormalRow[]; allJobs: ArtJob[]; worldOrder: string[];
  inFlight: number; runningBatches?: number; paused?: boolean; sourceChanged?: boolean;
  circuitBreaker?: { code: string; at: string };
}
export interface FormalSupervisorOptions {
  maxWave: number; concurrency: ArtConcurrency; cooldownSeconds: number; maxCooldownSeconds: number; idlePollSeconds: number;
  maxRecoveryAttempts: number; once?: boolean; requestedIds?: string[]; acknowledgeGate?: string;
}
export interface FormalSupervisorState {
  schemaVersion: 1;
  status: 'starting' | 'dispatching' | 'recovering' | 'draining' | 'cooldown' | 'waiting-anchors'
    | 'waiting-inspection' | 'waiting-source-refresh' | 'waiting-work' | 'paused' | 'stopped' | 'yielded' | 'complete';
  updatedAt: string; code?: string; wakeAt?: string; wave: number; rateLimitCount: number;
  coolingGate?: string; cooledRateGate?: string; lastDispatchJobIds: string[];
  recoveryAttempts: Record<string, number>;
  recoveryGate?: { at: string; jobIds: string[] };
}
export interface FormalSupervisorPorts {
  load(): Promise<FormalSnapshot>;
  dispatch(rows: FormalRow[], acknowledgeGate?: string): Promise<void>;
  recover(jobs: ArtJob[]): Promise<void>;
  drain(): Promise<void>;
  persist(state: FormalSupervisorState): Promise<void>;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
}
export function formalSupervisorOptions(args: string[]): FormalSupervisorOptions {
  const allowed = new Set(['max-wave', 'concurrency', 'cooldown-seconds', 'max-cooldown-seconds', 'idle-poll-seconds',
    'max-recovery-attempts', 'job-ids', 'acknowledge-gate']);
  const values = new Map<string, string>();
  let once = false;
  for (const argument of args) {
    if (argument === '--once') { once = true; continue; }
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match || !allowed.has(match[1]) || values.has(match[1])) throw new Error('INVALID_FORMAL_SUPERVISOR_OPTION');
    values.set(match[1], match[2]);
  }
  const integer = (name: string, fallback: number, minimum: number, maximum: number) => {
    const value = Number(values.get(name) ?? fallback);
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error('INVALID_FORMAL_SUPERVISOR_OPTION');
    return value;
  };
  const maxWave = integer('max-wave', 32, 1, 64);
  const concurrency = integer('concurrency', 32, 1, 64) as ArtConcurrency;
  const cooldownSeconds = integer('cooldown-seconds', 60, 60, 3600);
  const maxCooldownSeconds = integer('max-cooldown-seconds', 900, cooldownSeconds, 3600);
  const requestedIds = values.get('job-ids')?.split(',');
  if (requestedIds && (requestedIds.length > maxWave || new Set(requestedIds).size !== requestedIds.length
    || requestedIds.some(id => !/^scene_[a-f0-9]+$/.test(id)))) throw new Error('INVALID_FORMAL_JOB_SELECTION');
  return { maxWave, concurrency, cooldownSeconds, maxCooldownSeconds, idlePollSeconds: integer('idle-poll-seconds', 60, 1, 3600),
    maxRecoveryAttempts: integer('max-recovery-attempts', 2, 0, 3), once: once || !!requestedIds,
    requestedIds, acknowledgeGate: values.get('acknowledge-gate') };
}

export function selectFormalJobs(snapshot: FormalSnapshot, maxWave: number, requestedIds?: string[]): FormalRow[] {
  const pending = snapshot.jobs.filter(row => row.jobId && row.batchId && row.status === 'queued' && !row.blocked
    && row.job?.state === 'queued' && !row.job.stale && row.job.paidAttempts === 0 && !row.job.asset
    && !snapshot.allJobs.some(prior => prior.worldId === row.worldId && prior.nodeId === row.nodeId
      && (['generating', 'unknown_outcome', 'recoverable'].includes(prior.state)
        || (prior.recoveryAvailable && !prior.asset))));
  if (requestedIds) return pending.filter(row => requestedIds.includes(row.jobId!)).slice(0, maxWave);
  const selected: FormalRow[] = [];
  // Anchors unlock dependent scenes; then fill with scene/environment work.
  for (const kind of ['character-anchor', 'scene', 'environment', 'cover', 'character-reaction']) {
    for (let round = 0; round < maxWave; round++) for (const worldId of snapshot.worldOrder) {
      const row = pending.filter(item => item.worldId === worldId && item.kind === kind)[round];
      if (row && selected.length < maxWave) selected.push(row);
    }
    if (selected.length === maxWave) break;
  }
  return selected;
}

/** Formal production keeps actual dimensions factual and selects anchors by approved style plus file integrity. */
export async function formalStyleBrief(root: string, plan: ShortAssetPlan, jobs: ArtJob[],
  readDigest: FormalReferenceDigestReader = createFormalReferenceDigestReader()): Promise<SceneBrief | undefined> {
  if (plan.blocked) return undefined;
  const references: string[] = [], hashes: string[] = [];
  for (const file of plan.referenceFiles ?? []) {
    const filename = path.resolve(root, file);
    references.push(filename); hashes.push((await readDigest(filename)).sha256);
  }
  for (const nodeId of plan.dependencies) {
    const anchor = jobs.find(job => job.worldId === plan.worldId && job.nodeId === nodeId && !job.stale
      && job.assetKind === 'character-anchor' && job.review?.decision === 'approved'
      && job.asset?.originalPixels && !job.asset.duplicate);
    if (!anchor?.asset) return undefined;
    const filename = path.join(root, 'public/generated-art', `${anchor.id}.png`);
    const { sha256: hash } = await readDigest(filename, { sha256: anchor.asset.sha256, bytes: anchor.asset.bytes });
    references.push(filename); hashes.push(hash);
  }
  const portrait = plan.kind === 'character-anchor' || plan.kind === 'character-reaction';
  return { prompt: plan.prompt, sourceHash: plan.sourceHash, references,
    ...(portrait ? { aspectRatio: '2:3' as const } : {}),
    referenceHash: sha256(canonical({ profile: SHORT_PROFILE, hashes, ...(portrait ? { aspectRatio: '2:3' } : {}) })) };
}

export async function runFormalSupervisor(ports: FormalSupervisorPorts, options: FormalSupervisorOptions,
  previous?: FormalSupervisorState): Promise<FormalSupervisorState> {
  const state: FormalSupervisorState = {
    schemaVersion: 1, status: 'starting', updatedAt: new Date(ports.now()).toISOString(),
    wave: 0, rateLimitCount: 0, lastDispatchJobIds: [], recoveryAttempts: {},
    ...(previous ? structuredClone(previous) : {}),
  };
  if (state.schemaVersion !== 1) throw new Error('INVALID_FORMAL_SUPERVISOR_STATE');
  const save = async (status: FormalSupervisorState['status'], code?: string, wakeAt?: string) => {
    Object.assign(state, { status, code, wakeAt, updatedAt: new Date(ports.now()).toISOString() });
    await ports.persist(structuredClone(state));
  };
  const wait = async (status: FormalSupervisorState['status'], code: string) => {
    await save(status, code, new Date(ports.now() + options.idlePollSeconds * 1000).toISOString());
    await ports.sleep(options.idlePollSeconds * 1000);
  };
  await save(state.status === 'cooldown' ? 'cooldown' : 'starting', state.code, state.wakeAt);
  while (true) {
    const snapshot = await ports.load();
    if (snapshot.paused) { await save('paused', 'PAUSE_REQUESTED'); return state; }
    const hardFailure = snapshot.allJobs.find(job => state.lastDispatchJobIds.includes(job.id)
      && ['HTTP_401', 'HTTP_402', 'HTTP_403'].includes(job.errorCode ?? ''));
    const gate = snapshot.circuitBreaker;
    if (hardFailure || (gate && ['HTTP_401', 'HTTP_402', 'HTTP_403'].includes(gate.code))) {
      await save('stopped', hardFailure?.errorCode ?? gate!.code); return state;
    }
    if (snapshot.sourceChanged) { await wait('waiting-source-refresh', 'SOURCE_CHANGED_RELOAD_REQUIRED'); continue; }
    if (snapshot.inFlight || snapshot.runningBatches) {
      await save('draining', 'RESUMING_EXISTING_RESERVATIONS'); await ports.drain(); continue;
    }
    if (gate?.code === 'HTTP_429' && state.cooledRateGate !== gate.at) {
      if (state.coolingGate !== gate.at || !state.wakeAt) {
        state.rateLimitCount++;
        state.coolingGate = gate.at;
        const seconds = Math.min(options.maxCooldownSeconds, options.cooldownSeconds * 2 ** Math.min(state.rateLimitCount - 1, 10));
        await save('cooldown', 'HTTP_429', new Date(ports.now() + seconds * 1000).toISOString());
      }
      const remaining = Math.max(0, Date.parse(state.wakeAt!) - ports.now());
      if (remaining) { await ports.sleep(Math.min(remaining, options.idlePollSeconds * 1000)); continue; }
      state.cooledRateGate = gate.at;
      delete state.coolingGate;
      await save('starting', 'RATE_LIMIT_COOLDOWN_FINISHED');
    }
    const recoverable = snapshot.allJobs.filter(job => job.paidAttempts > 0 && job.recoveryAvailable && !job.asset
      && snapshot.jobs.some(row => row.worldId === job.worldId && row.nodeId === job.nodeId)
      && job.state !== 'generating' && (state.recoveryAttempts[job.id] ?? 0) < options.maxRecoveryAttempts).slice(0, options.maxWave);
    if (recoverable.length) {
      for (const job of recoverable) state.recoveryAttempts[job.id] = (state.recoveryAttempts[job.id] ?? 0) + 1;
      if (gate) state.recoveryGate = { at: gate.at, jobIds: recoverable.map(job => job.id) };
      await save('recovering', 'SAVED_RESPONSE_ONLY'); await ports.recover(recoverable); continue;
    }
    const quarantinedGate = gate && snapshot.allJobs.some(job => job.errorCode === gate.code
      && ['unknown_outcome', 'recoverable'].includes(job.state));
    const knownPromptRejection = gate?.code === 'UPSTREAM_PROMPT_REJECTED';
    const recoveredGate = gate && state.recoveryGate?.at === gate.at
      && /^(EPERM|EACCES|EBUSY|HTTP_5\d\d|DOWNLOAD_FAILED|CLIENT_FAILED_OR_UNKNOWN|WORKER_ERROR_INSPECT_BEFORE_RETRY|TRANSPORT_TIMEOUT_UNKNOWN|CLIENT_RESULT_MISSING)$/.test(gate.code)
      && snapshot.allJobs.some(job => state.recoveryGate!.jobIds.includes(job.id)
        && job.asset?.originalPixels && !job.asset.duplicate);
    const acknowledgeGate = gate && (gate.at === options.acknowledgeGate || gate.code === 'NATIVE_4K_GATE_FAILED'
      || (gate.code === 'HTTP_429' && state.cooledRateGate === gate.at) || quarantinedGate || knownPromptRejection || recoveredGate) ? gate.at : undefined;
    if (gate && !acknowledgeGate) { await wait('waiting-inspection', gate.code); continue; }
    const selected = selectFormalJobs(snapshot, options.maxWave, options.requestedIds);
    if (options.requestedIds && selected.length !== options.requestedIds.length) {
      await save('stopped', 'REQUESTED_FORMAL_JOB_NOT_READY'); return state;
    }
    if (selected.length) {
      state.wave++; state.lastDispatchJobIds = selected.map(row => row.jobId!);
      await save('dispatching', 'FRESH_JOBS_ONLY');
      await ports.dispatch(selected, acknowledgeGate);
      if (options.once) { await save('yielded', 'ONE_WAVE_FINISHED'); return state; }
      continue;
    }
    if (snapshot.jobs.length && snapshot.jobs.every(row => !!row.job?.asset && !row.blocked && row.job.review?.decision === 'approved')) {
      await save('complete', 'ALL_CURRENT_ASSETS_STYLE_REVIEWED'); return state;
    }
    if (snapshot.jobs.some(row => row.status === 'awaiting-approved-anchors')) await wait('waiting-anchors', 'AWAITING_STYLE_APPROVED_ANCHORS');
    else if (snapshot.jobs.some(row => row.status === 'UNKNOWN_IDENTITY_QUARANTINED'
      || row.job?.review?.decision === 'rejected' || (row.job && row.job.paidAttempts > 0 && !row.job.asset)))
      await wait('waiting-inspection', 'UNRESOLVED_IDENTITIES_RETAINED');
    else await wait('waiting-work', 'NO_READY_JOBS');
  }
}
