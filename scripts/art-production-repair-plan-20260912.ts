import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { buildShortPlans, SHORT_FOLDER, SHORT_REPAIR_FILE } from '../server/art-production-short.ts';
import { formalStyleBrief } from './art-production-formal-supervisor.ts';
import { canonical, sha256 } from '../server/art-production-prompts.ts';
import { replaceArtFile } from '../server/art-production-files.ts';
import { anchorRepairs, sceneRepairs, environmentMaterialRepairs } from './art-production-repair-prompts-20260912.ts';
import type { ArtJob } from '../shared/production.ts';

const root = process.cwd();
const folder = path.join(root, SHORT_FOLDER);
const out = path.join(folder, 'repair-plan-20260912');
const read = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
// This dated plan may be inspected repeatedly, but must only append one revision
// for each exact rejected PNG. Replays never create a second correction batch.
if (process.argv.includes('--apply')) {
  const existing = await read(path.join(out, 'dispatch-report.json')).catch(error => {
    if (error.code === 'ENOENT') return undefined; throw error;
  });
  if (existing) {
    console.log(JSON.stringify({ status: 'ALREADY_APPLIED_NO_NEW_REVISIONS', count: existing.count, report: path.join(out, 'dispatch-report.json') }));
    process.exit(0);
  }
}
const state = await read(path.join(folder, 'state.json'));
const manifest = await read(path.join(root, 'output/imagegen/scene-production/manifest.json'));
const all: ArtJob[] = manifest.batches.flatMap((batch: any) => batch.jobs);
const repairs = await read(path.join(root, SHORT_REPAIR_FILE));
const repairBytes = await readFile(path.join(root, SHORT_REPAIR_FILE));
const plans = await buildShortPlans(root, authoredWorlds);
const uncertain = (worldId: string, nodeId: string) => all.filter(job => job.worldId === worldId && job.nodeId === nodeId
  && (['generating', 'unknown_outcome', 'recoverable'].includes(job.state) || (job.recoveryAvailable && !job.asset)));
const distances = new Map<string, Map<string, number>>();
for (const world of authoredWorlds) {
  const depth = new Map([[world.startNodeId, 0]]), queue = [world.startNodeId];
  for (let i = 0; i < queue.length; i++) for (const choice of world.nodes[queue[i]]?.choices ?? []) {
    if (!depth.has(choice.nextNodeId)) { depth.set(choice.nextNodeId, depth.get(queue[i])! + 1); queue.push(choice.nextNodeId); }
  }
  distances.set(world.id, depth);
}
const candidates: any[] = [], excluded: any[] = [];
for (const row of state.jobs) {
  if (!['character-anchor', 'environment', 'scene'].includes(row.kind) || row.job?.review?.decision !== 'rejected' || !row.job.asset) continue;
  const key = `${row.worldId}/${row.nodeId}`;
  const pending = uncertain(row.worldId, row.nodeId);
  if (pending.length) { excluded.push({ key, reason: 'UNRESOLVED_SAME_NODE', jobIds: pending.map(job => job.id) }); continue; }
  const plan = plans.find(plan => plan.worldId === row.worldId && plan.nodeId === row.nodeId)!;
  if (plan.blocked || !await formalStyleBrief(root, plan, all)) { excluded.push({ key, reason: plan.blocked ?? 'AWAITING_APPROVED_ANCHORS' }); continue; }
  const file = path.join(root, 'public/generated-art', `${row.jobId}.png`);
  const bytes = await readFile(file).catch(() => null);
  if (!bytes || sha256(bytes) !== row.job.asset.sha256 || bytes.length !== row.job.asset.bytes) { excluded.push({ key, reason: 'PNG_INTEGRITY_FAILURE' }); continue; }
  const review = await read(path.join(folder, 'reviews', `${row.jobId}.json`)).catch(() => null);
  if (!review || review.decision !== 'rejected' || review.sha256 !== row.job.asset.sha256 || !review.fullImageViewed || !review.styleReviewed) {
    excluded.push({ key, reason: 'REJECT_EVIDENCE_NOT_CURRENT' }); continue;
  }
  const nodeIds = row.kind === 'scene' ? [row.nodeId] : (row.sourceFacts ?? []).flatMap((fact: string) => {
    const a = /^节点 ([^；]+)；/.exec(fact), b = new RegExp(`^${row.worldId}/(.+)$`).exec(fact);
    return a ? [a[1]] : b ? [b[1]] : [];
  });
  const depth = Math.min(999, ...nodeIds.map((id: string) => distances.get(row.worldId)!.get(id) ?? 999));
  candidates.push({ key, worldId: row.worldId, nodeId: row.nodeId, kind: row.kind, depth, nodeIds,
    correctionOf: row.jobId, correctionSha256: row.job.asset.sha256, previousPrompt: row.prompt,
    referenceFiles: plan.referenceFiles ?? [], dependencies: plan.dependencies, observedDefect: review.notes,
    reviewFile: path.relative(root, path.join(folder, 'reviews', `${row.jobId}.json`)).replaceAll('\\', '/'),
    previousRepair: repairs[key], sourceFacts: row.sourceFacts,
  });
}
candidates.sort((a, b) => (a.kind === 'character-anchor' ? 0 : a.kind === 'environment' ? 1 : 2)
  - (b.kind === 'character-anchor' ? 0 : b.kind === 'environment' ? 1 : 2) || a.depth - b.depth || a.key.localeCompare(b.key));
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'candidates.json'), JSON.stringify({ at: new Date().toISOString(), stateAt: state.at,
  sourceRepairsSha256: sha256(await readFile(path.join(root, SHORT_REPAIR_FILE))), candidates, excluded }, null, 2) + '\n');
console.log(JSON.stringify({ candidates: candidates.length, kinds: Object.fromEntries(['character-anchor', 'environment', 'scene'].map(kind => [kind, candidates.filter(row => row.kind === kind).length])),
  excluded: excluded.length, out }));

const selected = candidates.filter(row => anchorRepairs[row.key] || sceneRepairs[row.key] || environmentMaterialRepairs[row.key]);
const proposed = structuredClone(repairs);
const authorization = 'Direct user authorization relayed by root on 2026-09-12: redo rejected images, review and bind; continue 12h. One scoped fresh correction per selected rejected PNG.';
for (const row of selected) {
  const environmentBase = row.previousPrompt.replace(/，单幅无人场景。$/, '');
  const prompt = anchorRepairs[row.key] ?? sceneRepairs[row.key]
    ?? `${environmentBase}。手绘水粉粗笔触，${environmentMaterialRepairs[row.key]}，单幅无人横景。`;
  if (prompt.length > 90 || !prompt.startsWith('吸血鬼猎人D画风，') || prompt === row.previousPrompt) throw new Error(`INVALID_REPAIR_PROMPT:${row.key}:${prompt.length}`);
  let references = [...row.referenceFiles];
  // These two identities need no film props. Preserve their fixed identity source,
  // while removing the style image responsible for the observed sword intrusion.
  if (row.key === 'future-island/__art_character_cuiyingrui') references = references.slice(1);
  if (row.key === 'future-island/__art_character_xiwei') references = [`public/generated-art/${row.correctionOf}.png`];
  if (row.kind === 'environment') references = [];
  proposed[row.key] = { ...row.previousRepair, prompt, referenceFiles: references, correctionOf: row.correctionOf,
    correctionSha256: row.correctionSha256, correctionOrdinal: (row.previousRepair?.correctionOrdinal ?? 0) + 1,
    maximumCorrections: (row.previousRepair?.correctionOrdinal ?? 0) + 1,
    observedDefect: row.observedDefect, reviewFile: row.reviewFile, repairBatch: 'rejected-png-20260912', authorization,
    priorCorrectionLimit: row.previousRepair?.maximumCorrections, sourceNodeIds: row.nodeIds,
    ...(row.kind === 'environment' ? { generatedWithoutCharacterReferences: true } : {}),
  };
}
if (selected.length !== 64) throw new Error(`INSUFFICIENT_VERIFIED_REPAIRS:${selected.length}`);
await writeFile(path.join(out, 'proposed-review-repairs.json'), JSON.stringify(proposed, null, 2) + '\n');
await writeFile(path.join(out, 'selected-corrections.json'), JSON.stringify(selected.map(row => ({ ...row, proposedRepair: proposed[row.key] })), null, 2) + '\n');
console.log(JSON.stringify({ proposed: selected.length, anchors: selected.filter(row => row.kind === 'character-anchor').length,
  environments: selected.filter(row => row.kind === 'environment').length, scenes: selected.filter(row => row.kind === 'scene').length,
  maxPromptLength: Math.max(...selected.map(row => proposed[row.key].prompt.length)), apply: process.argv.includes('--apply') }));

if (process.argv.includes('--apply')) {
  if (sha256(await readFile(path.join(root, SHORT_REPAIR_FILE))) !== sha256(repairBytes)) throw new Error('REPAIRS_CHANGED_RECHECK');
  const freshManifest = await read(path.join(root, 'output/imagegen/scene-production/manifest.json'));
  const freshAll: ArtJob[] = freshManifest.batches.flatMap((batch: any) => batch.jobs);
  for (const row of selected) {
    const same = freshAll.filter(job => job.worldId === row.worldId && job.nodeId === row.nodeId);
    const prior = same.find(job => job.id === row.correctionOf);
    if (!prior || prior.stale || prior.review?.decision !== 'rejected' || prior.asset?.sha256 !== row.correctionSha256
      || same.some(job => ['generating', 'unknown_outcome', 'recoverable'].includes(job.state) || (job.recoveryAvailable && !job.asset)))
      throw new Error(`REPAIR_IDENTITY_CHANGED_RECHECK:${row.key}`);
  }
  await copyFile(path.join(root, SHORT_REPAIR_FILE), path.join(out, `review-repairs.before-${Date.now()}.json`));
  const temp = path.join(root, `${SHORT_REPAIR_FILE}.${process.pid}.tmp`);
  await writeFile(temp, JSON.stringify(proposed, null, 2) + '\n');
  await replaceArtFile(temp, path.join(root, SHORT_REPAIR_FILE));
  const revised = await buildShortPlans(root, authoredWorlds);
  const ready = [];
  for (const row of selected) {
    const plan = revised.find(plan => `${plan.worldId}/${plan.nodeId}` === row.key)!;
    const brief = await formalStyleBrief(root, plan, freshAll);
    if (!brief) throw new Error(`REVISED_BRIEF_NOT_READY:${row.key}`);
    const promptHash = sha256(brief.prompt);
    const jobId = `scene_${sha256(canonical([plan.worldId, plan.nodeId, brief.sourceHash, brief.referenceHash, promptHash,
      ...(brief.aspectRatio === '2:3' ? [{ aspectRatio: '2:3' }] : []), ...(plan.kind === 'scene' ? [] : [{ kind: plan.kind }])])).slice(0, 28)}`;
    if (freshAll.some(job => job.id === jobId)) throw new Error(`REPAIR_NOT_FRESH:${jobId}`);
    ready.push({ key: row.key, worldId: row.worldId, nodeId: row.nodeId, kind: row.kind, depth: row.depth,
      jobId, batchId: `art_${sha256(plan.worldId).slice(0, 20)}`, sourceHash: brief.sourceHash, referenceHash: brief.referenceHash,
      promptHash, prompt: brief.prompt, references: brief.references.map(file => path.relative(root, file).replaceAll('\\', '/')),
      correctionOf: row.correctionOf, correctionSha256: row.correctionSha256, reviewFile: row.reviewFile });
  }
  const report = { at: new Date().toISOString(), status: 'REPAIRS_APPLIED_AWAITING_FORMAL_PREPARE', count: ready.length,
    submitted: 0, requiresSupervisorSourceReload: true, repairFile: path.join(root, SHORT_REPAIR_FILE),
    repairFileSha256: sha256(await readFile(path.join(root, SHORT_REPAIR_FILE))), priorRepairFileSha256: sha256(repairBytes),
    ready, predictedFreshJobIds: ready.map(row => row.jobId) };
  await writeFile(path.join(out, 'dispatch-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ applied: ready.length, submitted: 0, report: path.join(out, 'dispatch-report.json') }));
}
