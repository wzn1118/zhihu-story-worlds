import assert from 'node:assert/strict';
import { readFile, writeFile, rename, open, unlink, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { buildShortPlans, SHORT_FOLDER } from '../server/art-production-short.ts';
import { canonical, sha256 } from '../server/art-production-prompts.ts';
import { formalStyleBrief } from './art-production-formal-supervisor.ts';
import { createFormalReferenceDigestReader } from './art-production-formal-reference-cache.ts';
import { readArtReviewEvidence } from '../server/art-production-review-files.ts';
import { verifiedPublicAsset } from './art-production-publish-manifest.ts';

const root = process.cwd();
const coordination = path.join(root, 'output/coordination/art-remake-12h-20260912');
const formalFile = path.join(root, SHORT_FOLDER, 'state.json');
const direct = path.join(coordination, 'full64-direct');
const ledgerFile = path.join(root, 'output/imagegen/scene-production/manifest.json');
const key = (row: any) => `${row.worldId}/${row.nodeId}`;
const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const atomic = async (file: string, value: unknown) => {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n'); await rename(temporary, file);
};
async function adopt() {
const lockFile = path.join(direct, 'projection-adoption.lock');
const lock = await open(lockFile, 'wx'); await lock.writeFile(String(process.pid)); await lock.close();
try {
  const [formalBytes, ledgerBytes] = await Promise.all([formalFile, ledgerFile].map(file => readFile(file)));
  const formal = JSON.parse(formalBytes.toString()), ledger = JSON.parse(ledgerBytes.toString());
  const campaign = await readJson(path.join(coordination, 'full64-direct/campaign.json'));
  assert.equal(campaign.target, 1000); assert.equal(campaign.concurrency, 64);
  assert.equal(formal.qualityPolicy, 'style-first');
  const selectionFiles = (await readdir(direct)).filter(file => /^selection-\d+\.json$/.test(file)).sort();
  const selected = new Map<string, any>(), selectionHashes: Record<string, string> = {};
  const submitted = new Set<string>(campaign.submittedJobIds);
  for (const file of selectionFiles) {
    const bytes = await readFile(path.join(direct, file)), selection = JSON.parse(bytes.toString());
    assert.equal(selection.concurrency, 64); assert.equal(selection.count, selection.rows.length);
    assert(Date.parse(selection.at) >= Date.parse(campaign.startedAt), 'SELECTION_PRECEDES_CAMPAIGN');
    selectionHashes[file] = sha256(bytes);
    for (const row of selection.rows) if (submitted.has(row.jobId)) {
      const previous = selected.get(row.jobId);
      assert(!previous || canonical(previous) === canonical(row), 'SELECTION_IDENTITY_CHANGED');
      selected.set(row.jobId, row);
    }
  }
  const plans = await buildShortPlans(root, authoredWorlds), planHash = sha256(canonical(plans));
  const all = ledger.batches.flatMap((batch: any) => batch.jobs);
  const byId = new Map<string, any>();
  for (const job of all) { assert(!byId.has(job.id), 'DUPLICATE_LEDGER_ID'); byId.set(job.id, job); }
  const planned = new Map(plans.map(plan => [key(plan), plan]));
  const candidates = new Map<string, any>();
  for (const picked of selected.values()) {
    const job = byId.get(picked.jobId);
    if (job?.stale === false && job.asset && ['generated', 'resolution_mismatch'].includes(job.state)) candidates.set(key(job), job);
  }
  const digests = createFormalReferenceDigestReader();
  const adopted: any[] = [], skipped: any[] = [];
  const approvedBefore: string[] = [];
  const evidenceHashes = new Map<string, string>();
  const evidence = async (jobId: string) => {
    const file = path.join(root, SHORT_FOLDER, 'reviews', `${jobId}.json`);
    const bytes = await readFile(file).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    if (!bytes) return undefined;
    const { review } = await readArtReviewEvidence(file);
    if (review) { assert.equal(sha256(await readFile(file)), sha256(bytes), 'REVIEW_CHANGED_DURING_READ'); evidenceHashes.set(file, sha256(bytes)); }
    return review;
  };
  const rows = [];
  for (const old of formal.jobs) {
    const current = candidates.get(key(old));
    if (!current) { rows.push(old); continue; }
    const priorEvidence = old.jobId ? await evidence(old.jobId) : undefined;
    const priorApproved = priorEvidence?.sha256 === old.job?.asset?.sha256
      ? priorEvidence?.decision === 'approved' && priorEvidence.styleReviewed === true
      : old.job?.review?.decision === 'approved';
    if (priorApproved && current.id !== old.jobId) { approvedBefore.push(old.job.id); rows.push(old); skipped.push({ jobId: current.id, reason: 'APPROVED_DEFAULT_PRESERVED' }); continue; }
    const picked = selected.get(current.id), plan = planned.get(key(old));
    const brief = plan && await formalStyleBrief(root, plan, all, digests);
    const identities = ['worldId', 'nodeId', 'sourceHash', 'promptHash', 'referenceHash'];
    if (!current || current.stale !== false || !plan || !brief || !campaign.submittedJobIds.includes(current.id)
      || identities.some(field => typeof current[field] !== 'string' || !current[field] || current[field] !== picked[field])
      || current.worldId !== old.worldId || current.nodeId !== old.nodeId || current.sourceHash !== plan.sourceHash
      || plan.blocked || current.assetKind !== plan.kind
      || current.promptHash !== sha256(plan.prompt) || current.referenceHash !== brief.referenceHash
      || ['unknown_outcome', 'recoverable', 'failed', 'blocked'].includes(current.state)) {
      rows.push(old); skipped.push({ jobId: current.id, reason: 'IDENTITY_CHANGED_OR_QUARANTINED' }); continue;
    }
    if (current.asset && (!current.asset.originalPixels || current.asset.duplicate || !await verifiedPublicAsset(current.asset))) {
      rows.push(old); skipped.push({ jobId: current.id, reason: 'PUBLIC_PIXELS_UNVERIFIED' }); continue;
    }
    const job = structuredClone(current);
    delete job.review;
    if (job.asset) {
      const review = job.id === old.jobId ? priorEvidence : await evidence(job.id);
      if (review && review.sha256 === job.asset.sha256 && review.styleReviewed === true) {
        const unchanged = old.job?.asset?.sha256 === job.asset.sha256 && old.job?.review?.decision === review.decision
          && old.job.review.reviewer === review.reviewer && old.job.review.notes === review.notes;
        job.review = unchanged ? old.job.review : { decision: review.decision, reviewer: review.reviewer, notes: review.notes, reviewedAt: new Date().toISOString() };
      } else if (old.jobId === job.id && old.job?.asset?.sha256 === job.asset.sha256) {
        // Preserve existing decisions when an independent sidecar is temporarily mid-write.
        job.review = old.job.review;
      }
    }
    if (old.jobId === job.id && canonical(old.job?.asset) === canonical(job.asset)
      && canonical(old.job?.review) === canonical(job.review) && old.job?.state === job.state) { rows.push(old); continue; }
    rows.push({ ...plan, jobId: job.id, batchId: ledger.batches.find((batch: any) => batch.jobs.some((item: any) => item.id === job.id)).id,
      status: job.state, job, references: brief.references.map(file => path.relative(root, file).replaceAll('\\', '/')) });
    adopted.push({ jobId: job.id, replaced: old.jobId, asset: !!job.asset, newAsset: old.job?.asset?.sha256 !== job.asset?.sha256,
      sha256: job.asset?.sha256, review: job.review?.decision ?? 'pending' });
  }
  // Recheck all mutable identity inputs before the sole official-index write.
  assert.equal(sha256(await readFile(formalFile)), sha256(formalBytes), 'FORMAL_CHANGED_DURING_VALIDATION');
  for (const [file, digest] of Object.entries(selectionHashes)) assert.equal(sha256(await readFile(path.join(direct, file))), digest, 'SELECTION_CHANGED_DURING_VALIDATION');
  for (const [file, digest] of evidenceHashes) assert.equal(sha256(await readFile(file)), digest, 'REVIEW_CHANGED_DURING_VALIDATION');
  const latestPlans = await buildShortPlans(root, authoredWorlds);
  assert.equal(sha256(canonical(latestPlans)), planHash, 'PLANS_CHANGED_DURING_VALIDATION');
  const latest = (await readJson(ledgerFile)).batches.flatMap((batch: any) => batch.jobs);
  const latestById = new Map<string, any>(latest.map((job: any) => [job.id, job]));
  for (const item of adopted) {
    const before = byId.get(item.jobId), current = latestById.get(item.jobId);
    assert(current && current.stale === false && ['worldId', 'nodeId', 'sourceHash', 'promptHash', 'referenceHash'].every(field => current[field] === before[field]), 'LEDGER_IDENTITY_CHANGED');
    assert(current.state === 'generated' || current.state === 'resolution_mismatch', 'LEDGER_STATE_CHANGED');
    assert(current.asset?.originalPixels === true && current.asset.duplicate === false, 'LEDGER_ASSET_QUALIFICATION_CHANGED');
    assert(await verifiedPublicAsset(current.asset), 'LEDGER_PUBLIC_ASSET_CHANGED');
    if (before.asset) assert.equal(canonical(current.asset), canonical(before.asset), 'LEDGER_ASSET_CHANGED');
    const brief = await formalStyleBrief(root, planned.get(key(before))!, latest, digests);
    assert.equal(brief?.referenceHash, before.referenceHash, 'CURRENT_REFERENCE_CHANGED');
  }
  const next = { ...formal, at: new Date().toISOString(), planHash, globalConcurrency: 64,
    prepared: rows.filter(row => row.job).length, paid: rows.reduce((total, row) => total + (row.job?.paidAttempts ?? 0), 0),
    generated: rows.filter(row => row.job?.asset).length, native4k: rows.filter(row => row.job?.asset?.native4k).length,
    reviewed: rows.filter(row => row.job?.review).length, approved: rows.filter(row => row.job?.review?.decision === 'approved').length,
    inFlight: latest.filter((job: any) => job.state === 'generating').length,
    projection: { type: 'full64-current-identity', adopted: adopted.length, selectionHashes }, jobs: rows };
  const receipt = { at: next.at, adopted: adopted.length, withNativeAsset: adopted.filter(row => row.asset).length,
    approved: adopted.filter(row => row.review === 'approved').length, rejected: adopted.filter(row => row.review === 'rejected').length,
    protectedApproved: approvedBefore.length, skipped: skipped.length, privateWrites: 0, paidRequests: 0,
    newAssets: adopted.filter(row => row.newAsset).length,
    formalBeforeSha256: sha256(formalBytes), selectionHashes,
    ledgerSnapshotSha256: sha256(ledgerBytes), planHash, adoptedRows: adopted, skippedRows: skipped };
  if (adopted.length) {
    await atomic(path.join(coordination, 'full64-direct/formal-before-projection.json'), formal);
    await atomic(formalFile, next);
    await atomic(path.join(direct, `projection-increment-${Date.now()}.json`), receipt);
  }
  await atomic(path.join(coordination, 'full64-direct/projection-adoption-receipt.json'), receipt);
  console.log(JSON.stringify({ at: receipt.at, adopted: receipt.adopted, withNativeAsset: receipt.withNativeAsset,
    newAssets: receipt.newAssets, approved: receipt.approved, rejected: receipt.rejected, skipped: receipt.skipped }));
} finally { await unlink(lockFile); }
}

if (!process.argv.includes('--watch')) await adopt();
else {
  const watchLock = path.join(direct, 'projection-watch.lock');
  const handle = await open(watchLock, 'wx'); await handle.writeFile(String(process.pid)); await handle.close();
  let previous = '';
  try {
    while (true) {
      try {
        const reviews = path.join(root, SHORT_FOLDER, 'reviews');
        const files = [ledgerFile, ...await readdir(reviews).then(names => names.filter(name => /^scene_[a-f0-9]+\.json$/.test(name)).map(name => path.join(reviews, name)))];
        const marks = await Promise.all(files.map(async file => { const info = await stat(file); return `${file}:${info.size}:${info.mtimeMs}`; }));
        const fingerprint = sha256(marks.join('\n'));
        if (fingerprint !== previous) { await adopt(); previous = fingerprint; }
      } catch (error) {
        console.error(JSON.stringify({ at: new Date().toISOString(), stage: 'projection-deferred', code: (error as any).code ?? (error as Error).message }));
      }
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  } finally { await unlink(watchLock); }
}
