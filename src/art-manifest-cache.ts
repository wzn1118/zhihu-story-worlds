/** Only authored, public publication metadata belongs in this cache. */
export const ART_MANIFESTS = ['/generated-art/production-manifest.json', '/generated-art/character-cutouts.json'] as const;
export type ArtManifestUrl = typeof ART_MANIFESTS[number];
export type ArtManifestRevision = { etag: string | null; modified: string | null };

type Snapshot = ArtManifestRevision & { data: unknown };
type Pending = { controller: AbortController; promise: Promise<unknown> };
const snapshots = new Map<ArtManifestUrl, Snapshot>();
const pending = new Map<ArtManifestUrl, Pending>();
const generations = new Map<ArtManifestUrl, number>();

export function invalidateArtManifest(url: ArtManifestUrl): void {
  snapshots.delete(url);
  generations.set(url, (generations.get(url) ?? 0) + 1);
  pending.get(url)?.controller.abort();
  pending.delete(url);
}

/** A successful HEAD cannot leave an older body or an older in-flight read reusable. */
export function reconcileArtManifestRevision(url: ArtManifestUrl, revision: ArtManifestRevision): void {
  const snapshot = snapshots.get(url);
  if (snapshot && (revision.etag || revision.modified)
    && snapshot.etag === revision.etag && snapshot.modified === revision.modified) return;
  invalidateArtManifest(url);
}

/**
 * Share concurrent reads and parsed 304 bodies, but revalidate on every later read.
 * There is deliberately no TTL or stale-on-error fallback for live approvals.
 */
export function readArtManifest<T>(url: ArtManifestUrl): Promise<T> {
  if (!ART_MANIFESTS.includes(url)) return Promise.reject(new Error('ART_MANIFEST_NOT_PUBLIC'));
  const active = pending.get(url);
  if (active) return active.promise as Promise<T>;
  const snapshot = snapshots.get(url), generation = generations.get(url) ?? 0;
  const headers: Record<string, string> = {};
  if (snapshot?.etag) headers['If-None-Match'] = snapshot.etag;
  else if (snapshot?.modified) headers['If-Modified-Since'] = snapshot.modified;
  // Fetch's implicit no-cache header makes Express ignore validators and send
  // a full 200. Explicit max-age=0 permits 304 while no-store still bypasses
  // the browser cache and the server must validate every request.
  if (snapshot?.etag || snapshot?.modified) headers['Cache-Control'] = 'max-age=0';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const request = (async () => {
    const response = await fetch(url, { cache: 'no-store', headers, signal: controller.signal });
    if (controller.signal.aborted || (generations.get(url) ?? 0) !== generation) throw new Error('ART_MANIFEST_SUPERSEDED');
    if (response.status === 304 && snapshot) return snapshot.data;
    if (!response.ok) throw new Error('ART_MANIFEST_UNAVAILABLE');
    const data: unknown = await response.json();
    if (controller.signal.aborted || (generations.get(url) ?? 0) !== generation) throw new Error('ART_MANIFEST_SUPERSEDED');
    const revision = { etag: response.headers.get('etag'), modified: response.headers.get('last-modified') };
    if (revision.etag || revision.modified) snapshots.set(url, { ...revision, data });
    else snapshots.delete(url);
    return data;
  })().finally(() => {
    clearTimeout(timeout);
    if (pending.get(url)?.promise === request) pending.delete(url);
  });
  pending.set(url, { controller, promise: request });
  return request as Promise<T>;
}
