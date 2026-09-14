export type ArtworkPriority = 'critical' | 'visible' | 'prefetch';

export interface LoadedArtwork {
  width: number;
  height: number;
  /** False for private/no-store responses, which must retain an active lease. */
  cacheable: boolean;
  /** Reuse these downloaded bytes, including for private/no-store artwork. */
  displaySource: string;
}

export interface ArtworkLease {
  promise: Promise<LoadedArtwork>;
  release(): void;
  setPriority(priority: ArtworkPriority): void;
}

export interface ArtworkImage {
  src: string;
  decoding: string;
  fetchPriority: string;
  referrerPolicy: string;
  naturalWidth: number;
  naturalHeight: number;
  onload: ((event: Event) => unknown) | null;
  onerror: ((event: Event | string) => unknown) | null;
  decode?: () => Promise<void>;
  removeAttribute(name: string): void;
}

export interface ArtworkNetworkInfo {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
  deviceMemory?: number;
}

export interface ArtworkLoaderOptions {
  createImage?: () => ArtworkImage;
  getNetworkInfo?: () => ArtworkNetworkInfo;
  getBaseUrl?: () => string | undefined;
  fetch?: typeof globalThis.fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  maxConcurrent?: number;
  maxDecodedBytes?: number;
  maxCacheEntries?: number;
  requestTimeoutMs?: number;
}

const MIB = 1024 * 1024;
const ranks: Record<ArtworkPriority, number> = { critical: 0, visible: 1, prefetch: 2 };

function browserNetworkInfo(): ArtworkNetworkInfo {
  const nav = globalThis.navigator as (Navigator & {
    connection?: ArtworkNetworkInfo;
    deviceMemory?: number;
  }) | undefined;
  return { ...nav?.connection && {
    saveData: nav.connection.saveData,
    effectiveType: nav.connection.effectiveType,
    downlink: nav.connection.downlink,
  }, deviceMemory: nav?.deviceMemory };
}

function abortError(): Error {
  const error = new Error('Artwork request was released');
  error.name = 'AbortError';
  return error;
}

export function isArtworkAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

interface Consumer {
  priority: ArtworkPriority;
  resolve(value: LoadedArtwork): void;
  reject(error: Error): void;
}

interface Attempt {
  image?: ArtworkImage;
  controller?: AbortController;
  objectUrl?: string;
  encodedBytes: number;
  timer?: ReturnType<typeof setTimeout>;
  resetTimeout?: () => void;
}

interface Entry {
  key: string;
  source: string;
  state: 'queued' | 'loading' | 'ready';
  consumers: Set<Consumer>;
  sequence: number;
  touched: number;
  attempt?: Attempt;
  result?: LoadedArtwork;
  bytes: number;
  cacheable: boolean;
}

/**
 * One scheduler serves the library, every story and scene previews. Foreground
 * work preempts speculation; paused leases resume without becoming load errors.
 * Same-origin requests are abortable and their blob URL is also the display URL,
 * so rendering a private no-store image cannot download it a second time.
 */
export function createArtworkLoader(options: ArtworkLoaderOptions = {}) {
  const createImage = options.createImage ?? (() => new Image());
  const getNetworkInfo = options.getNetworkInfo ?? browserNetworkInfo;
  const getBaseUrl = options.getBaseUrl ?? (() => globalThis.document?.baseURI);
  const fetchImage = options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const createObjectURL = options.createObjectURL ?? (blob => URL.createObjectURL(blob));
  const revokeObjectURL = options.revokeObjectURL ?? (url => URL.revokeObjectURL(url));
  const entries = new Map<string, Entry>();
  let sequence = 0;
  let touched = 0;
  let retainedBytes = 0;
  let pumping = false;
  let pumpAgain = false;

  function policy() {
    const info = getNetworkInfo();
    const verySlow = ['slow-2g', '2g'].includes(info.effectiveType ?? '')
      || (!!info.downlink && info.downlink < 0.5);
    const slow = verySlow || info.effectiveType === '3g'
      || (!!info.downlink && info.downlink < 1.5);
    const memory = info.deviceMemory ?? 8;
    return {
      concurrent: Math.max(1, Math.min(options.maxConcurrent ?? 4, verySlow ? 1 : slow ? 2 : info.effectiveType === '4g' ? 4 : 3)),
      speculate: !info.saveData && !verySlow,
      bytes: Math.max(0, Math.min(options.maxDecodedBytes ?? 32 * MIB, memory <= 2 ? 12 * MIB : memory <= 4 ? 24 * MIB : 32 * MIB)),
      cacheEntries: Math.max(0, options.maxCacheEntries ?? 48),
    };
  }

  function priority(entry: Entry): ArtworkPriority {
    let best: ArtworkPriority = 'prefetch';
    for (const consumer of entry.consumers) {
      if (ranks[consumer.priority] < ranks[best]) best = consumer.priority;
    }
    return best;
  }

  function disposeAttempt(attempt: Attempt) {
    if (attempt.timer) clearTimeout(attempt.timer);
    attempt.controller?.abort();
    if (attempt.image) {
      attempt.image.onload = null;
      attempt.image.onerror = null;
      attempt.image.removeAttribute('src');
    }
    if (attempt.objectUrl) revokeObjectURL(attempt.objectUrl);
  }

  function remove(entry: Entry) {
    if (entries.get(entry.key) !== entry) return;
    entries.delete(entry.key);
    retainedBytes -= entry.bytes;
    entry.bytes = 0;
    const attempt = entry.attempt;
    entry.attempt = undefined;
    if (attempt) disposeAttempt(attempt);
  }

  function trimCache() {
    const limits = policy();
    const ready = [...entries.values()].filter(entry => entry.state === 'ready');
    let readyCount = ready.length;
    for (const entry of ready.sort((a, b) => a.touched - b.touched)) {
      // A displayed blob must stay valid until its final UI consumer releases it.
      if (entry.consumers.size) continue;
      if (!entry.cacheable || retainedBytes > limits.bytes || readyCount > limits.cacheEntries) {
        remove(entry);
        readyCount--;
      }
    }
  }

  function active(entry: Entry, attempt: Attempt) {
    return entries.get(entry.key) === entry && entry.attempt === attempt && entry.state === 'loading';
  }

  function fail(entry: Entry, attempt: Attempt, error: unknown) {
    if (!active(entry, attempt)) return;
    remove(entry);
    const failure = error instanceof Error ? error : new Error('Artwork could not be loaded');
    for (const consumer of entry.consumers) consumer.reject(failure);
    entry.consumers.clear();
    pump();
  }

  function finish(entry: Entry, attempt: Attempt, image: ArtworkImage, displaySource: string) {
    if (!active(entry, attempt)) return;
    if (!image.naturalWidth || !image.naturalHeight) {
      fail(entry, attempt, new Error('Artwork has no image dimensions'));
      return;
    }
    if (attempt.timer) clearTimeout(attempt.timer);
    image.onload = null;
    image.onerror = null;
    entry.state = 'ready';
    entry.result = { width: image.naturalWidth, height: image.naturalHeight, displaySource, cacheable: entry.cacheable };
    entry.bytes = image.naturalWidth * image.naturalHeight * 4 + attempt.encodedBytes;
    retainedBytes += entry.bytes;
    entry.touched = ++touched;
    for (const consumer of entry.consumers) consumer.resolve(entry.result);
    trimCache();
    pump();
  }

  function decode(entry: Entry, attempt: Attempt, displaySource: string) {
    if (!active(entry, attempt)) return;
    const image = createImage();
    attempt.image = image;
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.fetchPriority = priority(entry) === 'critical' ? 'high' : priority(entry) === 'prefetch' ? 'low' : 'auto';
    image.onload = () => {
      if (!active(entry, attempt)) return;
      Promise.resolve().then(() => image.decode?.()).then(
        () => finish(entry, attempt, image, displaySource),
        error => fail(entry, attempt, error),
      );
    };
    image.onerror = () => fail(entry, attempt, new Error('Artwork could not be loaded'));
    image.src = displaySource;
  }

  function canFetch(source: string) {
    const base = getBaseUrl();
    if (!base) return false;
    try {
      const url = new URL(source, base);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === new URL(base).origin;
    } catch { return false; }
  }

  function start(entry: Entry) {
    entry.state = 'loading';
    const attempt: Attempt = { encodedBytes: 0 };
    entry.attempt = attempt;
    const sameOrigin = canFetch(entry.source);
    const timeout = options.requestTimeoutMs ?? (sameOrigin ? 30_000 : 120_000);
    attempt.resetTimeout = () => {
      if (attempt.timer) clearTimeout(attempt.timer);
      if (timeout > 0) attempt.timer = setTimeout(() => fail(entry, attempt, new Error('Artwork request timed out')), timeout);
    };
    attempt.resetTimeout();
    try {
      if (!sameOrigin) {
        decode(entry, attempt, entry.source);
        return;
      }
      const controller = new AbortController();
      attempt.controller = controller;
      const init: RequestInit & { priority: 'high' | 'low' | 'auto' } = {
        signal: controller.signal, credentials: 'same-origin', referrerPolicy: 'no-referrer',
        priority: priority(entry) === 'critical' ? 'high' : priority(entry) === 'prefetch' ? 'low' : 'auto',
      };
      void fetchImage(entry.source, init).then(async response => {
        if (!active(entry, attempt)) return;
        if (!response.ok) throw new Error(`Artwork request failed (${response.status})`);
        // Keep private artwork only for its active display lifetime.
        entry.cacheable = !/\b(?:private|no-store)\b/i.test(response.headers.get('cache-control') ?? '');
        attempt.resetTimeout?.();
        // A large original can legitimately take minutes on a weak connection.
        // Abort a stalled stream, not a transfer that is still making progress.
        const body = response.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            if (active(entry, attempt)) attempt.resetTimeout?.();
            controller.enqueue(chunk);
          },
        }));
        const blob = body
          ? await new Response(body, { headers: { 'Content-Type': response.headers.get('content-type') ?? '' } }).blob()
          : await response.blob();
        if (!active(entry, attempt)) return;
        attempt.resetTimeout?.();
        attempt.encodedBytes = blob.size;
        attempt.objectUrl = createObjectURL(blob);
        decode(entry, attempt, attempt.objectUrl);
      }).catch(error => fail(entry, attempt, error));
    } catch (error) { fail(entry, attempt, error); }
  }

  function pause(entry: Entry) {
    const attempt = entry.attempt;
    entry.attempt = undefined;
    entry.state = 'queued';
    if (attempt) disposeAttempt(attempt);
  }

  function pump() {
    if (pumping) { pumpAgain = true; return; }
    pumping = true;
    do {
      pumpAgain = false;
      const limits = policy();
      const pending = () => [...entries.values()].filter(entry => entry.state !== 'ready');
      const running = () => pending().filter(entry => entry.state === 'loading');
      const critical = pending().some(entry => priority(entry) === 'critical');
      const foreground = pending().some(entry => priority(entry) !== 'prefetch');
      // Free slots do not mean spare bandwidth. Give the current frame all
      // available bandwidth through decoding before covers/references resume.
      for (const entry of running()) {
        const kind = priority(entry);
        if ((critical && kind !== 'critical') || (kind === 'prefetch' && (foreground || !limits.speculate))) pause(entry);
      }
      while (running().length > limits.concurrent) {
        const victim = running().sort((a, b) => ranks[priority(b)] - ranks[priority(a)] || b.sequence - a.sequence)[0];
        pause(victim);
      }
      const queued = pending().filter(entry => entry.state === 'queued')
        .sort((a, b) => ranks[priority(a)] - ranks[priority(b)] || a.sequence - b.sequence);
      for (const entry of queued) {
        const kind = priority(entry);
        if (critical && kind !== 'critical') continue;
        if (kind === 'prefetch' && (!limits.speculate || foreground || running().some(task => priority(task) === 'prefetch'))) continue;
        if (running().length >= limits.concurrent) {
          const victim = running().filter(task => ranks[priority(task)] > ranks[kind])
            .sort((a, b) => ranks[priority(b)] - ranks[priority(a)] || b.sequence - a.sequence)[0];
          if (!victim) continue;
          pause(victim);
          // It was already running when this queued snapshot was made. Resume
          // it on the next pump after the foreground request has completed.
        }
        start(entry);
      }
    } while (pumpAgain);
    pumping = false;
  }

  function acquire(source: string, { priority: requestedPriority = 'visible' }: { priority?: ArtworkPriority } = {}): ArtworkLease {
    let key = source;
    try { if (getBaseUrl()) key = new URL(source, getBaseUrl()).href; } catch { /* Image reports invalid URLs normally. */ }
    let entry = entries.get(key);
    if (!entry) {
      entry = { key, source, state: 'queued', consumers: new Set(), sequence: ++sequence, touched: ++touched, bytes: 0, cacheable: true };
      entries.set(key, entry);
    }
    const current = entry;
    let resolve!: Consumer['resolve'];
    let reject!: Consumer['reject'];
    const promise = new Promise<LoadedArtwork>((yes, no) => { resolve = yes; reject = no; });
    // Fire-and-forget prefetch and effect cleanups must never cause an unhandled
    // rejection. The original promise remains rejected for interested callers.
    void promise.catch(() => {});
    const consumer: Consumer = { priority: requestedPriority, resolve, reject };
    current.consumers.add(consumer);
    current.touched = ++touched;
    if (current.result) resolve(current.result);
    if (current.attempt?.image) current.attempt.image.fetchPriority = priority(current) === 'critical' ? 'high' : priority(current) === 'prefetch' ? 'low' : 'auto';
    pump();
    let released = false;
    return {
      promise,
      release() {
        if (released) return;
        released = true;
        current.consumers.delete(consumer);
        reject(abortError());
        if (!current.consumers.size && current.state !== 'ready') remove(current);
        trimCache();
        pump();
      },
      setPriority(next) {
        if (released) return;
        consumer.priority = next;
        if (current.attempt?.image) current.attempt.image.fetchPriority = priority(current) === 'critical' ? 'high' : priority(current) === 'prefetch' ? 'low' : 'auto';
        pump();
      },
    };
  }

  function reset() {
    for (const entry of entries.values()) {
      remove(entry);
      for (const consumer of entry.consumers) consumer.reject(abortError());
      entry.consumers.clear();
    }
    retainedBytes = 0;
  }

  return {
    acquire,
    reset,
    refreshPolicy() { trimCache(); pump(); },
    snapshot() {
      return {
        queued: [...entries.values()].filter(entry => entry.state === 'queued').length,
        loading: [...entries.values()].filter(entry => entry.state === 'loading').length,
        ready: [...entries.values()].filter(entry => entry.state === 'ready').length,
        retainedBytes,
      };
    },
  };
}

export const artworkLoader = createArtworkLoader();

const connection = (globalThis.navigator as (Navigator & { connection?: EventTarget }) | undefined)?.connection;
connection?.addEventListener('change', () => artworkLoader.refreshPolicy());
