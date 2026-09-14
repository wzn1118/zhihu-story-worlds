type Asset = {
  url: string; width: number; height: number; bytes: number; sha256: string;
  native4k: boolean; duplicate: boolean; originalPixels: boolean;
};
export type PublicationJob = {
  id: string; worldId?: string; nodeId?: string; sourceHash: string;
  promptHash?: string; referenceHash?: string; sceneTitle?: string; state: string; stale: boolean;
  asset?: Asset; review?: { decision: 'approved' | 'rejected'; reviewer: string; reviewedAt?: string };
};
export type PublicationRow = { worldId: string; nodeId: string; job?: PublicationJob };

/** Add completed bytes only to a formal identity that already exists. */
export function withKnownDeliveries<T extends PublicationRow>(rows: T[], ledgerJobs: PublicationJob[]) {
  const byId = new Map<string, PublicationJob>(), duplicateIds = new Set<string>();
  for (const job of ledgerJobs) {
    if (!job || typeof job.id !== 'string') continue;
    if (byId.has(job.id)) duplicateIds.add(job.id);
    else byId.set(job.id, job);
  }
  const overlaidIds = new Set<string>();
  const identities = ['id', 'worldId', 'nodeId', 'sourceHash', 'promptHash', 'referenceHash'] as const;
  const merged = rows.map(row => {
    const formal = row.job, current = formal && byId.get(formal.id);
    if (!formal || formal.asset || formal.stale !== false || !current || duplicateIds.has(formal.id)
      || current.stale !== false || !current.asset || !['generated', 'resolution_mismatch'].includes(current.state)
      || current.worldId !== row.worldId || current.nodeId !== row.nodeId
      || identities.some(key => typeof formal[key] !== 'string' || !formal[key] || formal[key] !== current[key])) return row;
    overlaidIds.add(formal.id);
    // Carry vetoes forward; an old approval sidecar must not undo a later rejection.
    const review = [current.review, formal.review].find(value => value?.decision === 'rejected');
    return { ...row, job: { ...formal, state: current.state, asset: current.asset, review } };
  });
  return { rows: merged, overlaidIds };
}
