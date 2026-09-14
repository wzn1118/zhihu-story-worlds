import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceArtFile } from '../server/art-production-files.ts';
import { authoredWorlds } from '../content/worlds.ts';
import { buildShortPlans } from '../server/art-production-short.ts';
import { artBindingSource } from '../shared/art-binding-source.ts';
import { getWorld } from '../server/worlds.ts';
import { artService, withApprovedArt } from '../server/workshop-art.ts';
import { buildArtSourceMetadata } from '../server/art-production-source-registry.ts';
import { sourceEnvironmentPlacements } from '../server/art-production-environment-placements.ts';
import { withKnownDeliveries, type PublicationRow } from './art-production-delivery-overlay.ts';
import { mergeDirectDeliveries } from './art-production-direct-deliveries.ts';

const root = process.cwd();
const stateFile = path.join(root, 'output/imagegen/scene-production/formal-production-20260907/state.json');
const publicFile = path.join(root, 'public/generated-art/production-manifest.json');
const internalFile = path.join(root, 'output/imagegen/scene-production/formal-production-20260907/published-manifest.json');
const watch = process.argv.includes('--watch');

type StateJob = PublicationRow & { kind?: string; status?: string; jobId?: string };

const atomic = async (filename: string, value: unknown) => {
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await replaceArtFile(temporary, filename);
};

const verifiedFiles = new Map<string, string>();
export const verifiedPublicAsset = async (asset: NonNullable<NonNullable<StateJob['job']>['asset']>, assetRoot = root) => {
  if (!/^\/generated-art\/scene_[a-f0-9]+\.png$/.test(asset.url)) return false;
  try {
    const filename = path.join(assetRoot, 'public', asset.url.slice(1));
    const info = await stat(filename);
    const fingerprint = `${info.mtimeMs}:${info.ctimeMs}:${info.size}:${asset.sha256}:${asset.bytes}:${asset.width}:${asset.height}`;
    if (verifiedFiles.get(filename) === fingerprint) return true;
    const bytes = await readFile(filename);
    if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) return false;
    if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString() !== 'IHDR') return false;
    const valid = bytes.readUInt32BE(16) === asset.width && bytes.readUInt32BE(20) === asset.height;
    if (valid) verifiedFiles.set(filename, fingerprint);
    return valid;
  } catch { return false; }
};

export async function currentReview(job: NonNullable<StateJob['job']>, reviewRoot = root, requireNativeSidecar = false) {
  // Existing approvals remain valid under the user's bulk integration request.
  // A present sidecar overrides the queue decision, including a later rejection.
  if (!/^scene_[a-f0-9]+$/.test(job.id) || !job.asset) return requireNativeSidecar ? undefined : job.review;
  if (requireNativeSidecar && job.review?.decision === 'rejected') return job.review;
  try {
    const review = JSON.parse(await readFile(path.join(reviewRoot, 'output/imagegen/scene-production/formal-production-20260907/reviews', `${job.id}.json`), 'utf8'));
    return review.jobId === job.id && review.sha256 === job.asset.sha256 && review.fullImageViewed === true
      && review.styleReviewed === true && ['approved', 'rejected'].includes(review.decision)
      && (!requireNativeSidecar || review.decision !== 'approved' || review.nativeDetailViewed === true) ? review : undefined;
  } catch (error) { return !requireNativeSidecar && (error as NodeJS.ErrnoException).code === 'ENOENT' ? job.review : undefined; }
}

async function verifyRows<T, R>(items: T[], verify: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  // Bound simultaneous full-file reads on the first publication of this process.
  for (let offset = 0; offset < items.length; offset += 8)
    results.push(...await Promise.all(items.slice(offset, offset + 8).map(verify)));
  return results;
}

async function publish() {
  const state = JSON.parse(await readFile(stateFile, 'utf8')) as {
    at: string; profile: string; styleRevision: string; qualityPolicy: string;
    requiredAssets: number; requiredScenes: number; jobs: StateJob[];
  };
  // Style-first publication already has the complete current source/review/file
  // records below; loading the strict runtime again reads every PNG a second time.
  const batches = state.qualityPolicy === 'style-first' ? [] : await (await artService()).listArtBatches();
  const lookup = { listArtBatches: async () => batches,
    getArtBatch: async (id: string) => batches.find(batch => batch.id === id) ?? null };
  const worlds = await Promise.all(authoredWorlds.map(async authored => {
    const original = getWorld(authored.storyId);
    return { original, bound: state.qualityPolicy === 'style-first' ? structuredClone(original) : await withApprovedArt(original, undefined, lookup) };
  }));
  const boundUrls = new Map(worlds.map(({ original, bound }) => [original.id, new Set([
    bound.cover, bound.background, ...Object.values(bound.nodes).map(node => node.background),
    ...[...bound.characters, ...(bound.artCharacters ?? [])].flatMap(character => [character.portrait, character.portraits?.main, character.portraits?.reaction]),
  ].filter((url): url is string => Boolean(url?.startsWith('/generated-art/'))))]));
  const currentPlans = await buildShortPlans(root, authoredWorlds);
  const sourceMetadata = await buildArtSourceMetadata(root, authoredWorlds, currentPlans);
  const currentPlanHashes = new Map(currentPlans
    .map(plan => [`${plan.worldId}/${plan.nodeId}`, plan.sourceHash]));
  let publicationRows = state.jobs;
  let overlaidIds = new Set<string>();
  if (state.qualityPolicy === 'style-first') {
    try {
      const ledger = JSON.parse(await readFile(path.join(root, 'output/imagegen/scene-production/manifest.json'), 'utf8'));
      if (ledger.schemaVersion === 1 && Array.isArray(ledger.batches)) {
        const jobs = ledger.batches.flatMap((batch: { jobs?: unknown }) => Array.isArray(batch.jobs) ? batch.jobs : []);
        const merged = withKnownDeliveries(state.jobs, jobs);
        publicationRows = merged.rows; overlaidIds = merged.overlaidIds;
      }
    } catch { /* Retain the formal snapshot when a supplemental ledger is unavailable. */ }
  }
  const rows = (await verifyRows(publicationRows.filter(row => row.job && !row.job.stale && row.job.asset), async row => {
    const asset = row.job!.asset!;
    if (!await verifiedPublicAsset(asset)) return null;
    const review = await currentReview(row.job!, root, overlaidIds.has(row.job!.id));
    // Style-first production retains actual pixels and dimensions without upscaling.
    // User-authorized direct import: a delivered, source-current, intact PNG
    // may enter the game without waiting for editorial review.
    const gameReady = asset.originalPixels && !asset.duplicate
      && (state.qualityPolicy === 'style-first' || boundUrls.get(row.worldId)?.has(asset.url) === true)
      && currentPlanHashes.get(`${row.worldId}/${row.nodeId}`) === row.job!.sourceHash;
    return {
      worldId: row.worldId,
      nodeId: row.nodeId,
      assetKind: row.kind ?? 'scene',
      sceneTitle: row.job!.sceneTitle ?? row.nodeId,
      state: row.job!.state,
      review: review?.decision ?? 'pending',
      bindingReady: gameReady,
      gameReady: gameReady && (row.kind ?? 'scene') === 'scene',
      asset: { url: asset.url, width: asset.width, height: asset.height, bytes: asset.bytes,
        sha256: asset.sha256, native4k: asset.native4k },
      sourceHash: row.job!.sourceHash,
      jobId: row.job!.id,
    };
  })).filter((row): row is Exclude<typeof row, null> => row !== null);
  const gameAssets = rows.filter(row => row.gameReady && row.assetKind === 'scene');
  const byWorld = new Map<string, typeof rows>();
  for (const row of rows) byWorld.set(row.worldId, [...(byWorld.get(row.worldId) ?? []), row]);
  const manifest = {
    schemaVersion: 2,
    bindingPolicy: state.qualityPolicy === 'style-first' ? 'style-first-approved-current-v1' : 'native-4k-current-evidence-v1',
    generatedAt: new Date().toISOString(),
    sourceStateAt: state.at,
    profile: state.profile,
    styleRevision: state.styleRevision,
    qualityPolicy: state.qualityPolicy,
    counts: {
      requiredAssets: state.requiredAssets,
      requiredScenes: state.requiredScenes,
      delivered: rows.length,
      gameReadyScenes: gameAssets.length,
      reviewed: rows.filter(row => row.review !== 'pending').length,
      approved: rows.filter(row => row.review === 'approved').length,
      bindingReadyAssets: rows.filter(row => row.bindingReady).length,
      pendingReview: rows.filter(row => row.review === 'pending').length,
      rejected: rows.filter(row => row.review === 'rejected').length,
    },
    worlds: [...byWorld.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([worldId, assets]) => ({
      worldId,
      storyId: authoredWorlds.find(world => world.id === worldId)!.storyId,
      version: authoredWorlds.find(world => world.id === worldId)!.version,
      bindingSourceHash: createHash('sha256').update(artBindingSource(getWorld(authoredWorlds.find(world => world.id === worldId)!.storyId))).digest('hex'),
      supportingCharacters: sourceMetadata.get(worldId)!.supportingCharacters,
      sceneCharacters: sourceMetadata.get(worldId)!.sceneCharacters,
      ...sourceEnvironmentPlacements(authoredWorlds.find(world => world.id === worldId)!, currentPlans, assets),
      gameReadyScenes: assets.filter(row => row.gameReady && row.assetKind === 'scene').length,
      assets: assets.sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    })),
  };
  await mkdir(path.dirname(publicFile), { recursive: true });
  await mkdir(path.dirname(internalFile), { recursive: true });
  await mergeDirectDeliveries(manifest, root);
  await atomic(publicFile, manifest);
  await atomic(internalFile, manifest);
  console.log(JSON.stringify({ at: manifest.generatedAt, delivered: rows.length, gameReadyScenes: gameAssets.length,
    pendingReview: manifest.counts.pendingReview, rejected: manifest.counts.rejected }));
}

export async function watchPublications(publishOnce: () => Promise<void>,
  wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 30000))) {
  while (true) {
    await wait();
    // Reviews and source books can change without touching state.json. Revalidate
    // every interval; unchanged PNGs use verifiedFiles instead of being reread.
    try { await publishOnce(); }
    catch (error) {
      console.error(JSON.stringify({ at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }));
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await publish();
  if (watch) await watchPublications(publish);
}
