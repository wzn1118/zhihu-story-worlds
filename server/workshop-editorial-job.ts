import { basename, dirname, join } from 'node:path';
import type { GeneratedDraft, ImportedSource } from '../shared/workshop.ts';
import { jsonFile, writeJson } from './story-workshop.ts';
import { editorialHash, reviewAndRepairStory, type EditorialOptions } from './workshop-editorial.ts';
import { completeOpeningStyle, playerChoiceStyle, repairChoiceStyle, runCreative, wholeStoryStyle } from './workshop-creative.ts';
import { workshopArtDirection } from './workshop-art-direction.ts';

export const workshopEditorialPolicy = [playerChoiceStyle, wholeStoryStyle, completeOpeningStyle, workshopArtDirection, repairChoiceStyle].join('\n');
export const workshopEditorialPolicyHash = editorialHash(workshopEditorialPolicy);
export interface EditorialNotes { sourceHash: string; observedDraftHash: string; notes: string[]; repairMode?: 'preserve-and-extend-v2' }
export function editorialPolicyHash(notes?: EditorialNotes) {
  return notes ? editorialHash({ policy: workshopEditorialPolicy, notes }) : workshopEditorialPolicyHash;
}
export async function readEditorialNotes(directory: string, source: ImportedSource): Promise<EditorialNotes | undefined> {
  let notes = await jsonFile<EditorialNotes>(join(directory, 'editorial-notes.json')).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (!notes) {
    const origin = await jsonFile<{ kind: string; baseVersion: string }>(join(directory, 'revision-origin.json')).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    });
    if (origin) {
      const current = /^r([1-9][0-9]*)$/.exec(basename(directory));
      const base = /^r([1-9][0-9]*)$/.exec(origin.baseVersion);
      if (origin.kind !== 'editorial-revision' || !current || !base || Number(base[1]) >= Number(current[1])) throw new Error('Editorial notes revision ancestry is invalid');
      // A new revision inherits observations, never its predecessor's approval.
      notes = await readEditorialNotes(join(dirname(directory), origin.baseVersion), source);
    }
  }
  if (notes && (notes.sourceHash !== editorialHash(source) || !/^[a-f0-9]{64}$/.test(notes.observedDraftHash)
    || !Array.isArray(notes.notes) || !notes.notes.length || notes.notes.length > 32
    || notes.notes.some(n => typeof n !== 'string' || !n.trim() || n.length > 2500)
    || (notes.repairMode !== undefined && notes.repairMode !== 'preserve-and-extend-v2'))) throw new Error('Editorial notes do not match the source or expected structure');
  return notes;
}
interface EditorialRunLedger { series: number; inputHash: string; policyHash?: string; status: 'working' | 'passed' | 'blocked' }

/** Existing worker owns the project lease. Resuming an interrupted stage reuses its
 * accepted checkpoints; an explicit retry of an exhausted review starts a new budget. */
export async function runWorkshopEditorial(source: ImportedSource, draft: GeneratedDraft,
  options: EditorialOptions & { attempt: number; review?: typeof reviewAndRepairStory }) {
  if (!Number.isSafeInteger(options.attempt) || options.attempt < 1) throw new Error('Invalid editorial job attempt');
  const ledgerFile = join(options.directory, 'editorial-run.json');
  const notes = await readEditorialNotes(options.directory, source), policyHash = editorialPolicyHash(notes);
  if (notes) await writeJson(join(options.directory, 'editorial-notes.json'), notes);
  const prior = await jsonFile<EditorialRunLedger>(ledgerFile).catch(() => null);
  if (prior && (!Number.isSafeInteger(prior.series) || prior.series < 1 || !['working', 'passed', 'blocked'].includes(prior.status))) throw new Error('Editorial run ledger is invalid');
  const series = prior?.status === 'blocked' || (prior && prior.policyHash !== policyHash) ? options.attempt : prior?.series ?? options.attempt;
  const ledger: EditorialRunLedger = { series, inputHash: editorialHash({ source, draft }), policyHash, status: 'working' };
  await writeJson(ledgerFile, ledger);
  const { attempt: _attempt, review = reviewAndRepairStory, ...stageOptions } = options;
  const generate = options.generate ?? runCreative;
  // The policy scopes the checkpoint directory as well as the actual request. A
  // prior accepted response must not silently satisfy newly supplied requirements.
  const result = await review(source, draft, { ...stageOptions,
    allowSceneAdditions: notes?.repairMode === 'preserve-and-extend-v2',
    directory: join(options.directory, 'editorial', `run-${series}-${policyHash.slice(0, 12)}`),
    generate: (dir, label, schema, prompt, onChild) => generate(dir, label, schema,
      `${prompt}\nTRUSTED_ADAPTATION_EDITORIAL_REQUIREMENTS=${JSON.stringify(workshopEditorialPolicy)}${notes ? `\n独立人工复核的历史观察如下。逐项核对当前稿；只为仍存在的问题给出当前稿的精确引文，不把已修好的旧问题再报一次，不把建议当作已发生事实。\nREVIEWER_OBSERVATIONS_DATA=${JSON.stringify(notes)}` : ''}`, onChild),
  });
  await writeJson(ledgerFile, { ...ledger, status: result.report.status });
  return result;
}
