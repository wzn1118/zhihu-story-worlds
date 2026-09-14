import { join } from 'node:path';
import type { GeneratedDraft, ImportedSource } from '../shared/workshop.ts';
import { hashSource, jsonFile, writeJson } from './story-workshop.ts';
import { outlineSchema, routeSchema, validateSchema } from './workshop-schema.ts';
import { agentContentHash } from './workshop-agent-patches.ts';

interface Snapshot { protocol: 'full-agent-draft-v1'; sourceHash: string; draftHash: string; draft: GeneratedDraft; consumedRecoveryHash?: string }
function validate(source: ImportedSource, draft: GeneratedDraft) {
  validateSchema(outlineSchema, draft.outline);
  if (draft.outline.facts.some(fact => !source.text.includes(fact.quote))) throw new Error('完整稿的原文依据不匹配。');
  const ids = new Set(draft.outline.routes.map(route => route.id));
  if (ids.size !== 3 || draft.routes.length !== 3 || new Set(draft.routes.map(route => route.routeId)).size !== 3 || draft.routes.some(route => !ids.has(route.routeId))) throw new Error('完整稿的三条路线不齐全。');
  for (const route of draft.routes) validateSchema(routeSchema, route);
}
async function optional<T>(file: string) { return jsonFile<T>(file).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }); }

/** One atomic envelope binds the latest accepted draft, including later editorial fixes. */
export async function saveMultiAgentDraft(source: ImportedSource, directory: string, draft: GeneratedDraft, consumedRecoveryHash?: string) {
  validate(source, draft);
  const previous = await optional<Snapshot>(join(directory, 'agent-current-draft.json'));
  const consumed = consumedRecoveryHash ?? previous?.consumedRecoveryHash;
  const snapshot: Snapshot = { protocol: 'full-agent-draft-v1', sourceHash: agentContentHash(source), draftHash: agentContentHash(draft), draft,
    ...(consumed ? { consumedRecoveryHash: consumed } : {}) };
  await writeJson(join(directory, 'agent-current-draft.json'), snapshot);
  await writeJson(join(directory, 'draft.json'), draft);
}
export async function loadMultiAgentDraft(source: ImportedSource, directory: string): Promise<GeneratedDraft | undefined> {
  const sourceHash = agentContentHash(source);
  const snapshot = await optional<Snapshot>(join(directory, 'agent-current-draft.json'));
  if (snapshot) {
    if (snapshot.protocol !== 'full-agent-draft-v1' || snapshot.sourceHash !== sourceHash || snapshot.draftHash !== agentContentHash(snapshot.draft)) throw new Error('分工创作完整稿与原文或校验和不匹配，已停止覆盖。');
    validate(source, snapshot.draft);
  }
  // applyDraftRecovery validates ownership before writing its applied marker. It
  // is later than a previous generator/editor snapshot and must take precedence.
  const recovery = await optional<{ appliedAt?: string; sourceHash: string; draftHash: string; draft: GeneratedDraft; notes: { sourceHash: string } }>(join(directory, 'draft-recovery.json'));
  const recoveryHash = recovery && agentContentHash(recovery);
  if (snapshot && snapshot.consumedRecoveryHash === recoveryHash) return snapshot.draft;
  // The ordinary draft is a compatibility mirror, not the atomic authority.
  const mirrored = await optional<GeneratedDraft>(join(directory, 'draft.json')).catch(error => {
    if (snapshot && error instanceof SyntaxError) return undefined;
    throw error;
  });
  if (recovery?.appliedAt && recovery.sourceHash === hashSource(source) && recovery.notes.sourceHash === sourceHash
    && agentContentHash(recovery.draft) === recovery.draftHash && mirrored && agentContentHash(mirrored) === recovery.draftHash) {
    validate(source, mirrored); await saveMultiAgentDraft(source, directory, mirrored, recoveryHash); return mirrored;
  }
  if (!snapshot) return undefined;
  return snapshot.draft;
}
