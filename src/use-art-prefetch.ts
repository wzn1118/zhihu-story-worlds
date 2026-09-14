import { useEffect } from 'react';
import { artworkLoader } from './art-loader';

/** A bounded scope replaces stale lookahead as the reader changes scenes. */
export function useArtPrefetch(sources: string[], enabled = true) {
  const key = JSON.stringify([...new Set(sources)].slice(0, 3));
  useEffect(() => {
    if (!enabled) return;
    const leases: ReturnType<typeof artworkLoader.acquire>[] = [];
    const timer = window.setTimeout(() => {
      for (const source of JSON.parse(key) as string[]) {
        const lease = artworkLoader.acquire(source, { priority: 'prefetch' });
        void lease.promise.then(result => {
          // Public lookahead is evictable as soon as it is ready. Private
          // no-store bytes remain scoped until the next screen takes over.
          if (result.cacheable) lease.release();
        }).catch(() => undefined);
        leases.push(lease);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      // Let newly mounted critical consumers take over the same in-flight image.
      queueMicrotask(() => leases.forEach(lease => lease.release()));
    };
  }, [key, enabled]);
}
