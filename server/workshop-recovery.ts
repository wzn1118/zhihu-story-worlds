import { randomUUID } from 'node:crypto';
import { mkdir, readdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { GeneratedDraft, ImportedSource, RouteDraft, StoryOutline, WorkshopProject } from '../shared/workshop.ts';
import { buildGeneratedWorld } from './workshop-compiler.ts';
import { editorialHash, editorialProtocol, extendedEditorialProtocol, validateEditorialReview, type CreativeEditorialReview } from './workshop-editorial.ts';
import type { EditorialNotes } from './workshop-editorial-job.ts';
import { outlineSchema, routeSchema, validateSchema, type Schema } from './workshop-schema.ts';
import { StoryWorkshop, hashSource, jsonFile, writeJson, type LockOwner } from './story-workshop.ts';

interface RecoverySelection {
  id: string; revision: number; sourceHash: string; draftHash: string;
  draft: GeneratedDraft; notes: EditorialNotes; provenance: string[];
  validation: unknown; createdAt: string; appliedAt?: string;
}
interface InputRecord { protocol: string; runId: string; kind: string; sourceHash: string; draftHash: string; schema: Schema; prompt: string }

function validateDraft(source: ImportedSource, draft: GeneratedDraft) {
  validateSchema(outlineSchema, draft.outline);
  if (draft.routes.length !== 3 || new Set(draft.routes.map(r => r.routeId)).size !== 3) throw new Error('Recovery needs three complete routes');
  for (const fact of draft.outline.facts) if (!source.text.includes(fact.quote)) throw new Error('Recovery source quotation differs');
  for (const route of draft.routes) {
    validateSchema(routeSchema, route);
    if (!draft.outline.routes.some(r => r.id === route.routeId)) throw new Error('Recovery route identity differs');
  }
}
function preserveIds(before: GeneratedDraft, after: GeneratedDraft) {
  for (const field of ['routes', 'resources', 'characters'] as const) {
    if (JSON.stringify(before.outline[field].map(v => v.id)) !== JSON.stringify(after.outline[field].map(v => v.id))) throw new Error(`Recovery changed ${field} identity`);
  }
  for (const old of before.routes) {
    const next = after.routes.find(r => r.routeId === old.routeId);
    if (!next || old.entry !== next.entry) throw new Error('Recovery changed route entry');
    const ids = new Set(next.scenes.map(s => s.id)), oldIds = new Set(old.scenes.map(s => s.id));
    if (ids.size !== next.scenes.length || next.scenes.some(s => !oldIds.has(s.id) && !s.id.startsWith(`${old.routeId}_`))) throw new Error('Recovery scene identity differs');
    for (const scene of old.scenes) {
      const updated = next.scenes.find(s => s.id === scene.id);
      if (!updated || scene.choices.some(c => !updated.choices.some(n => n.id === c.id))) throw new Error('Recovery removed a scene or choice');
    }
  }
}
async function privateFile(root: string, file: string) {
  const actual = await realpath(resolve(file)), parent = await realpath(root);
  const local = relative(parent, actual);
  if (!local || isAbsolute(local) || local.startsWith(`..${sep}`) || local === '..' || resolve(parent, local) !== actual) throw new Error('Recovery file is outside its editorial run');
  return actual;
}

/** Stage real model checkpoints only. The next owned worker applies this snapshot,
 * then repeats structural repair, independent review and publication checks. */
export async function stageDraftRecovery(service: StoryWorkshop, id: string, snapshot: string, repairs: string[], observations: string[]) {
  const project = await service.get(id), directory = join(service.dir(id), `r${project.revision}`);
  if (!['failed', 'interrupted'].includes(project.status) || project.publishedVersion === `r${project.revision}`) throw new Error('Recovery requires an inactive unpublished revision');
  const lock = join(service.dir(id), 'job.lock'), token = randomUUID();
  await mkdir(lock);
  try {
    await writeJson(join(lock, 'owner.json'), { token, pid: process.pid, heartbeat: new Date().toISOString() });
    const current = await service.get(id);
    if (current.jobId !== project.jobId || current.revision !== project.revision || current.sourceHash !== project.sourceHash
      || current.publishedVersion === `r${project.revision}` || !['failed', 'interrupted'].includes(current.status)) throw new Error('Recovery project changed while acquiring ownership');
    const source = await service.source(id), file = await privateFile(join(directory, 'editorial'), snapshot);
    if (hashSource(source) !== project.sourceHash) throw new Error('Recovery original source hash differs');
    const round = /^round-(\d+)\.draft\.json$/.exec(basename(file));
    if (!round) throw new Error('Recovery requires a complete editorial round snapshot');
    const run = dirname(file), original = await jsonFile<{ protocol: string; sourceHash: string; inputDraftHash: string; maxRepairRounds: number; source: ImportedSource; draft: GeneratedDraft }>(join(run, 'input.json'));
    const identity = { protocol: original.protocol, sourceHash: original.sourceHash, inputDraftHash: original.inputDraftHash, maxRepairRounds: original.maxRepairRounds };
    const runId = editorialHash(identity);
    if (editorialHash(original.source) !== editorialHash(source) || original.sourceHash !== editorialHash(source)) throw new Error('Recovery source envelope differs');
    if (![editorialProtocol, extendedEditorialProtocol].includes(original.protocol) || original.inputDraftHash !== editorialHash(original.draft)
      || !Number.isInteger(original.maxRepairRounds) || original.maxRepairRounds < 0 || original.maxRepairRounds > 3
      || basename(run) !== `${original.protocol}-${runId.slice(0, 24)}`) throw new Error('Recovery run identity differs');
    validateDraft(source, original.draft);
    let draft = await jsonFile<GeneratedDraft>(file);
    validateDraft(source, draft); preserveIds(original.draft, draft);
    const reviewInputs = (await readdir(run)).filter(name => name.startsWith(`review-r${round[1]}-`) && name.endsWith('.input.json'));
    let verifiedReview = false;
    for (const name of reviewInputs) {
      const input = await jsonFile<InputRecord>(join(run, name)), hash = editorialHash(input);
      if (input.kind !== 'review' || input.protocol !== original.protocol || input.runId !== runId || input.sourceHash !== editorialHash(source) || input.draftHash !== editorialHash(draft) || !name.endsWith(`${hash.slice(0, 24)}.input.json`)) continue;
      for (const attempt of [1, 2]) {
        const accepted = await jsonFile<{ inputHash: string; outputHash: string; data: CreativeEditorialReview }>(join(run, name.replace('.input.json', `-a${attempt}.accepted.json`))).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
        if (!accepted) continue;
        if (accepted.inputHash !== hash || accepted.outputHash !== editorialHash(accepted.data)) throw new Error('Recovery review checksum differs');
        validateEditorialReview(source, draft, accepted.data); verifiedReview = true;
      }
    }
    if (!verifiedReview) throw new Error('Recovery snapshot has no complete verified model review');
    const provenance = [file];
    for (const repair of repairs) {
      const patchFile = await privateFile(run, repair);
      if (dirname(patchFile) !== run || !/-a[12]\.(accepted|rejected)\.json$/.test(patchFile)) throw new Error('Recovery repair filename differs');
      const input = await jsonFile<InputRecord>(patchFile.replace(/-a[12]\.(accepted|rejected)\.json$/, '.input.json'));
      const output = await jsonFile<{ inputHash: string; outputHash?: string; message?: string; data: unknown }>(patchFile);
      if (input.protocol !== original.protocol || input.runId !== runId || input.sourceHash !== editorialHash(source)
        || input.draftHash !== editorialHash(draft) || output.inputHash !== editorialHash(input)
        || !basename(patchFile).includes(`-${output.inputHash.slice(0, 24)}-a`)) throw new Error('Recovery repair does not continue the exact previous draft');
      if (patchFile.endsWith('.accepted.json') ? output.outputHash !== editorialHash(output.data) : !/^Editorial IDs differ: [a-z][a-z0-9_]*$/.test(output.message ?? '')) throw new Error('Recovery output was rejected for an unrelated reason');
      validateSchema(input.schema, output.data);
      const line = input.prompt.split('\n').find(s => s.startsWith('REPAIR_TARGET_DATA='));
      if (!line) throw new Error('Recovery repair has no scoped target');
      const target = JSON.parse(line.slice('REPAIR_TARGET_DATA='.length)) as { outlineFields: string[]; routeIds: string[] };
      const next = structuredClone(draft);
      if (input.kind === 'outline-repair') {
        if (JSON.stringify(Object.keys(output.data as object).sort()) !== JSON.stringify([...target.outlineFields].sort())) throw new Error('Recovery outline fields differ');
        next.outline = { ...next.outline, ...output.data as Partial<StoryOutline> };
      } else if (input.kind === 'route-repair') {
        const route = output.data as RouteDraft;
        if (target.routeIds.length !== 1 || target.routeIds[0] !== route.routeId) throw new Error('Recovery repair target differs');
        next.routes = next.routes.map(r => r.routeId === route.routeId ? route : r);
      } else throw new Error('Recovery accepts only actual repair outputs');
      validateDraft(source, next); preserveIds(draft, next); draft = next; provenance.push(patchFile);
    }
    let validation: unknown;
    try { validation = { status: 'passed', ...buildGeneratedWorld(id, project.revision, source, draft).validation }; }
    catch (error) { validation = { status: 'needs-repair', message: String(error) }; }
    if (!observations.length || observations.length > 32 || observations.some(note => !note.trim() || note.length > 2500)) throw new Error('Recovery needs bounded review observations');
    const selection: RecoverySelection = { id, revision: project.revision, sourceHash: project.sourceHash, draftHash: editorialHash(draft), draft,
      notes: { sourceHash: editorialHash(source), observedDraftHash: editorialHash(draft), notes: observations, repairMode: 'preserve-and-extend-v2' },
      provenance, validation, createdAt: new Date().toISOString() };
    const archive = join(directory, 'recovery', randomUUID()); await mkdir(archive, { recursive: true });
    await writeJson(join(archive, 'previous-draft.json'), await jsonFile(join(directory, 'draft.json')));
    await writeJson(join(archive, 'selection.json'), selection);
    await writeJson(join(directory, 'draft-recovery.json'), selection);
    return { archive, draftHash: selection.draftHash, validation, provenance, nextAction: 'resume-through-workshop' };
  } finally {
    if ((await jsonFile<LockOwner>(join(lock, 'owner.json')).catch(() => null))?.token === token) await rm(lock, { recursive: true, force: true });
  }
}

/** The applied marker is written last, so a crash repeats the whole snapshot,
 * never a mixture of old and recovered route files. No approval is inherited. */
export async function applyDraftRecovery(service: StoryWorkshop, project: WorkshopProject, source: ImportedSource, token: string) {
  const directory = join(service.dir(project.id), `r${project.revision}`), file = join(directory, 'draft-recovery.json');
  const selection = await jsonFile<RecoverySelection>(file).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; });
  if (!selection || selection.appliedAt) return;
  const owner = await jsonFile<LockOwner>(join(service.dir(project.id), 'job.lock', 'owner.json'));
  const current = await service.get(project.id), actualSource = await service.source(project.id);
  if (owner.token !== token || owner.pid !== process.pid || selection.id !== project.id || selection.revision !== project.revision
    || current.revision !== project.revision || current.jobId !== token || current.status !== 'running' || current.sourceHash !== project.sourceHash
    || current.publishedVersion === `r${project.revision}`
    || editorialHash(actualSource) !== editorialHash(source)
    || selection.sourceHash !== project.sourceHash || hashSource(source) !== project.sourceHash || selection.notes.sourceHash !== editorialHash(source)
    || selection.draftHash !== editorialHash(selection.draft) || selection.notes.observedDraftHash !== selection.draftHash
    || selection.notes.repairMode !== 'preserve-and-extend-v2' || project.publishedVersion === `r${project.revision}`) throw new Error('Recovery ownership or snapshot checksum differs');
  validateDraft(source, selection.draft);
  await writeJson(join(directory, 'outline.json'), selection.draft.outline);
  for (const route of selection.draft.routes) await writeJson(join(directory, `route-${route.routeId}.json`), route);
  await writeJson(join(directory, 'draft.json'), selection.draft);
  await writeJson(join(directory, 'editorial-notes.json'), selection.notes);
  await writeJson(file, { ...selection, appliedAt: new Date().toISOString() });
}
