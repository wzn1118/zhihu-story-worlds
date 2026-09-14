import type { ShortAssetPlan } from './art-production-short.ts';

export type ReviewedEnvironmentAsset = {
  nodeId: string;
  sourceHash: string;
  bindingReady: boolean;
  jobId?: string;
  asset?: { sha256: string };
};

// Scene compatibility evidence, separate from image approval:
// output/coordination/formal-background-batch-20260911/red-plum-reuse-evidence.json
// Nighttime breaches, the loaded cart, and the after-dark transition were excluded.
const reviewedPlacements = [
  {
    worldId: 'red-plum',
    nodeId: '__art_environment_red-plum-arrival-environment',
    jobId: 'scene_35af2d5bdf4c27d6a5e92b47b02d',
    sha256: 'ceda84b21b285975b6d0883232a451ed60e025a57f17b03115b5b439cc3a12c6',
    sourceHash: 'e4f75be5f3fa939a6c9aae96021b1734fa669a0554f5647fe36610c21b70731f',
    scenes: [
      ['field_0', '51891e1b980bc5d866c0867db42da06c592213986f7f8e6f70d00458a7dd56a1'],
      ['puzzle_0', '95ab7851260cf77b789ab228536859152c8898c6a348966a1c6aa1b9b0126284'],
      ['aftermath_0', '56437156eb9139e8a674df3be37b23f4885e4d1f7e64007fa18c5e5f2fbe730b'],
    ],
  },
  {
    worldId: 'red-plum',
    nodeId: '__art_environment_red-plum-field_1-environment',
    jobId: 'scene_792e64c43741af9f7d05a29a506a',
    sha256: '147a117a5fa5c6401b68f75aa3396d4c30580509ca17fb9834db8a99d58f460c',
    sourceHash: 'e4b5622fdeceb7f0fcef5aa448aebcfe0354fb1cfd9aaebd0c3348d4045a2a0a',
    scenes: [
      ['puzzle_1', 'e8b52e7fb966cadd0b19b86f9aa2ddced5362fb0c8bf3d999cbd5501c7898c11'],
      ['aftermath_1', '37bd0ec312d57b55b2f7a3bc60c2157d206583d18c544a10611ea59a47a7e9ba'],
    ],
  },
  {
    worldId: 'red-plum',
    nodeId: '__art_environment_red-plum-field_2-environment',
    jobId: 'scene_6c3f44a1993aa4cb1de3de4248ba',
    sha256: '8e935b4a3a456dad1c029438f58b60704a14c6e443f85f38226dadee90030e97',
    sourceHash: '2670a4c73eb8ba03f0b1e52565d63602d0246ed0ed15eca908ba85f724bd409f',
    scenes: [
      ['puzzle_2', '3a43830e589ed2af01981b064984ce2c985551fa2a61d20b99fbd5f4ae2817ea'],
    ],
  },
] as const;

/** Return only reviewed scene mappings whose image and story evidence remain exact. */
export function reviewedEnvironmentNodeIds(
  worldId: string,
  asset: ReviewedEnvironmentAsset,
  scenePlans: Map<string, ShortAssetPlan>,
): string[] {
  if (asset.bindingReady !== true) return [];
  const evidence = reviewedPlacements.find(row => row.worldId === worldId
    && row.nodeId === asset.nodeId && row.jobId === asset.jobId
    && row.sha256 === asset.asset?.sha256 && row.sourceHash === asset.sourceHash);
  if (!evidence) return [];
  return evidence.scenes.flatMap(([nodeId, sourceHash]) => {
    const scene = scenePlans.get(nodeId);
    return scene?.worldId === worldId && scene.nodeId === nodeId && scene.kind === 'scene'
      && !scene.blocked && scene.sourceHash === sourceHash ? [nodeId] : [];
  });
}
