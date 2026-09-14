import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { accountStorageKey, subscribeAccountStorage } from './account-storage';
import { artworkLoader, isArtworkAbort, type ArtworkPriority } from './art-loader';
import { versionedArtUrl } from './live-published-art';

export interface ArtworkState {
  requestedSource: string | null;
  source: string | null;
  status: 'loading' | 'ready' | 'unavailable';
  degraded: boolean;
  width?: number;
  height?: number;
}

// A focus/session recheck of the same account must not interrupt its images.
let scope = accountStorageKey('artwork');
subscribeAccountStorage(() => {
  const next = accountStorageKey('artwork');
  if (scope !== next) { scope = next; artworkLoader.reset(); }
});

export const ArtworkActivity = createContext(true);

/** All game art shares the same network budget, including covers and references. */
export function Artwork({ src, fallback, fallbacks = [], versions = {}, className, alt, onStateChange, placeholder,
  priority = 'visible' }: {
  src?: string; fallback?: string; fallbacks?: string[]; className?: string; alt: string;
  versions?: Record<string, string>; placeholder?: ReactNode; priority?: ArtworkPriority;
  onStateChange?: (state: ArtworkState) => void;
}) {
  const active = useContext(ArtworkActivity);
  const imageRef = useRef<HTMLImageElement>(null);
  const [intersecting, setIntersecting] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<{ source: string; displaySource: string; width: number; height: number } | null>(null);
  const current = [src, fallback, ...fallbacks].find(candidate => candidate && !failed.includes(versionedArtUrl(candidate, versions[candidate])));
  const requestSource = current ? versionedArtUrl(current, versions[current]) : undefined;
  const status = !current ? 'unavailable' : loaded?.source === requestSource ? 'ready' : 'loading';
  const enabled = active && (priority === 'critical' || intersecting);

  useEffect(() => {
    const target = imageRef.current?.parentElement;
    if (!target || priority === 'critical') return;
    if (!('IntersectionObserver' in window)) { setIntersecting(true); return; }
    // Observe the existing frame: an image without src can have zero intrinsic size.
    const observer = new IntersectionObserver(entries => setIntersecting(entries[0].isIntersecting), { rootMargin: '0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    if (!requestSource || !enabled) return;
    let subscribed = true;
    const lease = artworkLoader.acquire(requestSource, { priority });
    void lease.promise.then(result => {
      if (subscribed) setLoaded({ ...result, source: requestSource, displaySource: result.displaySource ?? requestSource });
    }).catch(error => {
      if (subscribed && !isArtworkAbort(error)) setFailed(previous => previous.includes(requestSource) ? previous : [...previous, requestSource]);
    });
    return () => { subscribed = false; queueMicrotask(() => lease.release()); };
  }, [requestSource, enabled, priority]);

  useEffect(() => {
    onStateChange?.({ requestedSource: src ?? null, source: current ?? null, status, degraded: Boolean(src && current !== src),
      ...(loaded?.source === requestSource ? { width: loaded?.width, height: loaded?.height } : {}) });
  }, [src, current, requestSource, status, loaded, onStateChange]);

  return <>{status !== 'ready' && placeholder}<img ref={imageRef} className={className}
    src={status === 'ready' ? loaded!.displaySource : undefined} alt={alt}
    decoding="async" fetchPriority={priority === 'critical' ? 'high' : 'low'} referrerPolicy="no-referrer"
    data-art-source={requestSource} data-art-state={status} style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
    onError={() => { if (requestSource && status === 'ready') setFailed(previous => [...previous, requestSource]); }} /></>;
}
