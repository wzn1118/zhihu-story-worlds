import type { GameWorld } from '../shared/types';
import type { Session } from './game';
import { ART_MANIFESTS, reconcileArtManifestRevision, type ArtManifestRevision } from './art-manifest-cache';

export const ART_REFRESH_INTERVAL = 60_000;
export { ART_MANIFESTS };
export type ArtRevisions = Record<string, ArtManifestRevision>;

/** Revalidate small headers; artwork and world data are fetched only after a revision changes. */
export async function checkArtRevisions(previous: ArtRevisions = {}): Promise<{ revisions: ArtRevisions; changed: boolean }> {
  const entries = await Promise.all(ART_MANIFESTS.map(async url => {
    const prior = previous[url], headers: Record<string, string> = {};
    if (prior?.etag) headers['If-None-Match'] = prior.etag;
    else if (prior?.modified) headers['If-Modified-Since'] = prior.modified;
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store', headers, signal: AbortSignal.timeout(8000) });
    if (response.status === 304 && prior) return [url, prior] as const;
    if (!response.ok) throw new Error('ART_REVISION_UNAVAILABLE');
    return [url, { etag: response.headers.get('etag'), modified: response.headers.get('last-modified') }] as const;
  }));
  const revisions = Object.fromEntries(entries);
  for (const [url, revision] of entries) reconcileArtManifestRevision(url, revision);
  return { revisions, changed: entries.some(([url, revision]) => !previous[url]
    || (!revision.etag && !revision.modified)
    || revision.etag !== previous[url].etag || revision.modified !== previous[url].modified) };
}

/** Merge into the latest progress, never the request's older paragraph or choice state. */
export function applySessionArt(current: Session | null, requested: Session, world: GameWorld): Session | null {
  if (!current || current.engine !== requested.engine || current.world !== requested.world
    || world.id !== current.world.id || world.storyId !== current.world.storyId || world.version !== current.world.version
    || !world.nodes[current.node.id]) return current;
  return { ...current, world, node: world.nodes[current.node.id] };
}

export function versionedArtUrl(url: string, sha256?: string): string {
  return sha256 && /^[a-f0-9]{64}$/.test(sha256) && url.startsWith('/generated-art/cutouts/')
    ? `${url}${url.includes('?') ? '&' : '?'}sha256=${sha256}` : url;
}
