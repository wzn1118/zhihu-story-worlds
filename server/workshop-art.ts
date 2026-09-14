import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { GameWorld, SceneNode } from '../shared/types.ts';
import type { ArtBatch, ArtJob, PrepareArtBatchInput, ReviewArtJobInput, RunArtBatchOptions } from '../shared/production.ts';
import type { WorkshopProject } from '../shared/workshop.ts';
import { WorkshopError } from './story-workshop.ts';
import { canonical, sha256 } from './art-production-prompts.ts';
import { buildShortPlans } from './art-production-short.ts';
import { readArtReviewEvidence } from './art-production-review-files.ts';
import { bindApprovedCharacters } from './workshop-art-characters.ts';
import { bindApprovedAncillaryArt } from './workshop-art-ancillary.ts';
interface ArtService {
  prepareArtBatch(input: PrepareArtBatchInput): Promise<ArtBatch>; listArtBatches(): Promise<ArtBatch[]>;
  getArtBatch(id: string): Promise<ArtBatch | null>; runArtBatch(id: string, options?: RunArtBatchOptions): Promise<ArtBatch>;
  pauseArtBatch(id: string): Promise<ArtBatch>; reviewArtJob(id: string, job: string, input: ReviewArtJobInput): Promise<ArtBatch>;
}
export async function artService(): Promise<ArtService> {
  // Late binding lets the independent art owner publish implementation without an app restart.
  const modulePath = './art-production.ts';
  try { return await import(modulePath) as ArtService; }
  catch { throw new WorkshopError('ART_SERVICE_UNAVAILABLE', '美术服务模块尚未就绪；文本游戏保留，稍后可登记或续跑美术。', 503); }
}
export function artStatus(batch: ArtBatch): WorkshopProject['art'] {
  const geometryMismatches = batch.jobs.filter(j => !j.stale && j.asset && Math.abs(j.asset.width / j.asset.height / (16 / 9) - 1) > .005).length;
  const sizeReady = batch.qualityPolicy === 'style-first' ? geometryMismatches === 0 : batch.progress.native4k >= batch.progress.current;
  return { batchId: batch.id, approved: batch.progress.covered, total: batch.progress.current,
    status: batch.progress.missing === 0 && batch.progress.sceneShortfall === 0 && sizeReady ? 'ready' : batch.state === 'running' ? 'in-progress' : batch.state === 'blocked' || batch.progress.failed > 0 || batch.progress.unknownOutcome > 0 ? 'failed' : 'queued',
    message: `${batch.progress.generated} 张已生成 / ${batch.progress.native4k} 张原生4K / ${batch.progress.covered} 张审核通过；${geometryMismatches} 张比例不符合16:9；${batch.progress.unknownOutcome} 项结果待确认${batch.circuitBreaker ? `；服务暂停：${batch.circuitBreaker.code}` : ''}` };
}
export async function prepareWorkshopArt(world: GameWorld, qualityPolicy: 'native-4k' | 'style-first' = 'native-4k') {
  if (world.storyId.startsWith('import-')) {
    const { prepareImages } = await import('./workshop-images.ts');
    const { directWorkshopImages } = await import('./workshop-image-direction.ts');
    return artStatus(await prepareImages(world, await directWorkshopImages(world)));
  }
  const service = await artService(); return artStatus(await service.prepareArtBatch({ world, minimumImages: 30, qualityPolicy }));
}
export function currentSceneSourceHash(world: GameWorld, node: SceneNode): string {
  // Match buildSceneBrief's source projection without reading art references or preparing jobs.
  const { background: _background, ...scene } = node;
  const cast = world.characters.map(({ portrait: _p, portraits: _ps, ...character }) => character);
  return sha256(canonical({ worldId: world.id, storyId: world.storyId, title: world.title,
    source: world.source, summary: world.summary, adaptation: world.adaptation, cast, scene }));
}

const formalSceneSourceCache = new Map<string, { fingerprint: string; hashes: Promise<Map<string, string>> }>();

async function formalSceneSourceHash(world: GameWorld, node: SceneNode): Promise<string | undefined> {
  const fingerprint = sha256(canonical({ worldId: world.id, storyId: world.storyId, title: world.title,
    version: world.version, source: world.source, summary: world.summary, adaptation: world.adaptation,
    characters: world.characters, nodes: world.nodes }));
  const previous = formalSceneSourceCache.get(world.id);
  if (!previous || previous.fingerprint !== fingerprint) {
    const hashes = buildShortPlans(resolve(), [world]).then(plans => new Map(plans
      .filter(plan => plan.kind === 'scene')
      .map(plan => [plan.nodeId, plan.sourceHash]))).catch(error => {
        formalSceneSourceCache.delete(world.id);
        throw error;
      });
    formalSceneSourceCache.set(world.id, { fingerprint, hashes });
  }
  return (await formalSceneSourceCache.get(world.id)!.hashes).get(node.id);
}

async function sourceHashMatchesCurrentScene(world: GameWorld, node: SceneNode, sourceHash: string): Promise<boolean> {
  if (sourceHash === currentSceneSourceHash(world, node)) return true;
  // Formal production intentionally uses a concise, source-specific prompt hash.
  // Rebuild that plan here so formal images can bind without relaxing staleness checks.
  return sourceHash === await formalSceneSourceHash(world, node);
}

async function hasCurrentFormalReview(job: ArtJob): Promise<boolean> {
  // Formal assets require the current proof sidecar, rather than a durable but
  // possibly legacy queue decision, before they can appear in the game.
  if (!/^scene_[a-f0-9]+$/.test(job.id)) return true;
  const evidence = await readArtReviewEvidence(resolve('output/imagegen/scene-production/formal-production-20260907/reviews', `${job.id}.json`));
  const review = evidence.review;
  if (!review) return false;
  return review.sha256 === job.asset?.sha256 && review.decision === 'approved' && review.styleReviewed === true
    && (review as typeof review & { styleBaseline?: string }).styleBaseline === 'film-frames-20260907';
}

export async function withApprovedArt(world: GameWorld, batchId?: string, lookup?: Pick<ArtService, 'getArtBatch' | 'listArtBatches'>): Promise<GameWorld> {
  let result: GameWorld = { ...world,
    characters: world.characters.map(character => ({ ...character, ...(character.portraits ? { portraits: { ...character.portraits } } : {}) })),
    nodes: Object.fromEntries(Object.entries(world.nodes).map(([id, node]) => [id, { ...node }])) };
  delete result.artCharacters;
  // A previously bound snapshot is not evidence of current approval.
  if (result.background.startsWith('/generated-art/')) result.background = '';
  if (result.cover.startsWith('/generated-art/')) result.cover = '';
  for (const node of Object.values(result.nodes)) if (node.background.startsWith('/generated-art/')) node.background = '';
  for (const character of result.characters) {
    if (character.portrait?.startsWith('/generated-art/')) delete character.portrait;
    for (const expression of ['main', 'reaction'] as const) {
      if (character.portraits?.[expression]?.startsWith('/generated-art/')) delete character.portraits[expression];
    }
    if (character.portraits && !Object.keys(character.portraits).length) delete character.portraits;
  }
  if (world.generated) result.generated = { ...world.generated, artReady: false };
  try {
    const independent = world.storyId.startsWith('import-') || batchId?.startsWith('wart_');
    const images = independent ? await import('./workshop-images.ts') : null;
    const service = lookup ?? (images ? { getArtBatch: images.getImages, listArtBatches: images.listImages } : await artService());
    let batch = batchId && (!independent || batchId.startsWith('wart_')) ? await service.getArtBatch(batchId) : null;
    const matches = (candidate: ArtBatch) => (!independent || candidate.id.startsWith('wart_')) && candidate.worldId === world.id && candidate.worldVersion === world.version && candidate.storyId === world.storyId;
    if (!batch || !matches(batch)) batch = (await service.listArtBatches()).find(matches) ?? null;
    if (!batch || !matches(batch)) return result;
    const hashes = new Set<string>(), urls = new Set<string>(), sceneIds = new Set<string>();
    let count = 0;
    for (const job of batch.jobs) {
      const asset = job.asset;
      if (job.stale || !(['generated', ...(batch.qualityPolicy === 'style-first' ? ['resolution_mismatch'] : [])].includes(job.state)) || job.worldId !== world.id || job.review?.decision !== 'approved' || !asset || (!asset.native4k && batch.qualityPolicy !== 'style-first') || !asset.originalPixels || asset.duplicate || !world.nodes[job.nodeId] || sceneIds.has(job.nodeId)
        || !await sourceHashMatchesCurrentScene(world, world.nodes[job.nodeId], job.sourceHash)
        || !await hasCurrentFormalReview(job)
        || !/^\/generated-art\/[a-zA-Z0-9/_-]+\.png$/.test(asset.url) || hashes.has(asset.sha256) || urls.has(asset.url)) continue;
      try {
        const bytes = await readFile(resolve('public', `.${asset.url}`));
        if (bytes.length < 45 || bytes.length !== asset.bytes || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
          || bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString() !== 'IHDR' || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) continue;
        const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
        if (w !== asset.width || h !== asset.height || (batch.qualityPolicy !== 'style-first' && (w < 3840 || h < 2160)) || Math.abs(w / h / (16 / 9) - 1) > .005) continue;
        result.nodes[job.nodeId].background = asset.url; hashes.add(asset.sha256); urls.add(asset.url); sceneIds.add(job.nodeId); count++;
      } catch { /* A missing file does not suppress other valid scene illustrations. */ }
    }
    if (sceneIds.has(world.startNodeId)) { result.background = result.nodes[world.startNodeId].background; result.cover = result.background; }
    if (result.generated) result.generated.artReady = count >= Object.keys(world.nodes).length && count >= 30;
    // Rebuild both ancillary plans from the unmodified source world. Runtime art
    // must not become input to the source hashes used to validate another layer.
    if (independent) return result;
    const characters = await bindApprovedCharacters(world, batch);
    result = await bindApprovedAncillaryArt(result, batch, world);
    result.characters = characters.characters;
    if (characters.artCharacters) result.artCharacters = characters.artCharacters;
  } catch { /* Art failures never replace a verified playable text build with an error. */ }
  return result;
}

