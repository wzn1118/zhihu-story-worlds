const MIB = 1024 * 1024;

// Network Information is optional. With no useful hint, protect the visible
// current artwork by waiting before spending bandwidth on later pages.
export function getArtPreloadPolicy({
  saveData = false, effectiveType, downlink, measuredMbps, deviceMemory
} = {}, { maxUpcoming = 2, maxCached = 4, maxDecodedBytes = 24 * MIB } = {}) {
  const memory = Number(deviceMemory) || 8;
  const slow = ["slow-2g", "2g", "3g"].includes(effectiveType)
    || (downlink > 0 && downlink < 1.5)
    || (measuredMbps > 0 && measuredMbps < 1.5);
  const fast = effectiveType === "4g" || downlink >= 1.5 || measuredMbps >= 1.5;
  return {
    allowSpeculation: !saveData,
    deferSpeculation: slow || !fast,
    maxUpcoming: saveData ? 0 : Math.max(0, Math.min(maxUpcoming, memory <= 2 ? 1 : 2)),
    maxCached: Math.max(0, Math.min(maxCached, memory <= 2 ? 2 : memory <= 4 ? 3 : 4)),
    maxDecodedBytes: Math.max(0, Math.min(maxDecodedBytes, memory <= 1 ? 8 * MIB : memory <= 2 ? 12 * MIB : memory <= 4 ? 18 * MIB : 24 * MIB))
  };
}

function browserNetworkInfo() {
  const navigator = globalThis.navigator;
  const connection = navigator?.connection;
  return {
    saveData: connection?.saveData,
    effectiveType: connection?.effectiveType,
    downlink: connection?.downlink,
    deviceMemory: navigator?.deviceMemory
  };
}

function browserTransferMbps(source) {
  if (!globalThis.document || !globalThis.performance?.getEntriesByName) return null;
  const url = new URL(source, document.baseURI).href;
  const entry = performance.getEntriesByName(url).at(-1);
  // Cache hits have transferSize === 0 and are not network speed samples.
  const duration = entry && entry.responseEnd - entry.requestStart;
  return entry?.transferSize > 0 && duration >= 50
    ? entry.transferSize * 8 / duration / 1000 : null;
}

// Later pages are ordered by their next possible display time. Only consult the
// one known next chapter after a successful choice, and stop after two portraits.
export function collectPortraitLookahead({
  sceneIndex, pages, startIndex = 0, currentSource = null,
  outcome = null, pendingBadEnd = null, nextChapter = () => null,
  selectPortrait, sourcesFor, maxUpcoming = 2
}) {
  const seen = new Set([currentSource]);
  const upcoming = [];
  const limit = Math.max(0, Math.min(maxUpcoming, 2));
  const collect = (index, candidates) => {
    for (const page of candidates) {
      if (upcoming.length >= limit) break;
      const selection = selectPortrait(index, page);
      if (!selection.source || seen.has(selection.source)) continue;
      seen.add(selection.source);
      upcoming.push(sourcesFor(selection));
    }
  };
  collect(sceneIndex, pages.slice(startIndex));
  if (outcome && !pendingBadEnd && upcoming.length < limit) {
    const next = nextChapter();
    if (next) collect(next.sceneIndex, next.pages);
  }
  return upcoming;
}

// The two connection slots serve visible art first, with at most one extra
// request for decoration or lookahead. Slow links defer extras until visible
// art has decoded; Save-Data disables lookahead entirely.
export function createArtPreloader({
  createImage = () => new Image(),
  getNetworkInfo = browserNetworkInfo,
  measureTransferMbps = browserTransferMbps,
  maxUpcoming = 2,
  maxCached = 4,
  maxDecodedBytes = 24 * MIB
} = {}) {
  const tasks = new Map();
  const cache = new Map();
  const completedSpeculation = new Set();
  const owners = new Map();
  let currentSources = [];
  let upcomingSources = [];
  let visibleKeys = new Set();
  let priorities = new Map();
  const limits = { maxUpcoming, maxCached, maxDecodedBytes };
  let batchDepth = 0;
  let currentKey = null;
  let desiredKeys = [];
  let cachedBytes = 0;
  let measuredMbps;
  let policy = getArtPreloadPolicy(getNetworkInfo(), limits);

  function keyFor(sources) {
    return sources.length ? JSON.stringify(sources) : null;
  }

  function refreshPolicy() {
    policy = getArtPreloadPolicy({ measuredMbps, ...getNetworkInfo() }, limits);
  }

  function trimCache() {
    while (cache.size > policy.maxCached || cachedBytes > policy.maxDecodedBytes) {
      // Evict stale LRU entries first, then the most distant upcoming portrait.
      // This prevents a speculative completion from evicting the current/next art.
      const keys = [...cache.keys()];
      const oldest = keys.find(key => !desiredKeys.includes(key))
        ?? [...desiredKeys].reverse().find(key => !visibleKeys.has(key) && cache.has(key))
        ?? keys[0];
      cachedBytes -= cache.get(oldest).bytes;
      cache.delete(oldest);
    }
  }

  function remember(key, result) {
    const bytes = result.image.naturalWidth * result.image.naturalHeight * 4;
    if (bytes > policy.maxDecodedBytes || !policy.maxCached) return;
    const previous = cache.get(key);
    if (previous) cachedBytes -= previous.bytes;
    cache.delete(key);
    cache.set(key, { ...result, bytes });
    cachedBytes += bytes;
    trimCache();
  }

  function cached(key) {
    const result = cache.get(key);
    if (result) {
      cache.delete(key);
      cache.set(key, result);
    }
    return result;
  }

  function finish(task, result) {
    if (tasks.get(task.key) !== task) return;
    task.image.onload = null;
    task.image.onerror = null;
    tasks.delete(task.key);
    if (result) {
      const sample = measureTransferMbps(result.source);
      if (sample > 0 && Number.isFinite(sample)) {
        measuredMbps = measuredMbps ? measuredMbps * 0.65 + sample * 0.35 : sample;
      }
      refreshPolicy();
      remember(task.key, result);
    }
    // Avoid retry storms when a speculative image failed or did not fit in the
    // decoded cache. Promotion to current still retries it immediately.
    if (!visibleKeys.has(task.key)) completedSpeculation.add(task.key);
    for (const owner of owners.values()) {
      if (owner.key === task.key) { owner.result = result; owner.settled = true; }
    }
    task.resolve(result);
    pump();
  }

  function start(task) {
    task.running = true;
    const image = task.image;
    image.decoding = "async";
    const next = () => {
      if (tasks.get(task.key) !== task) return;
      const attempt = ++task.attempt;
      const source = task.sources[attempt];
      if (!source) return finish(task, null);
      image.onload = async () => {
        try { await image.decode(); }
        catch {
          if (tasks.get(task.key) === task && task.attempt === attempt) next();
          return;
        }
        if (tasks.get(task.key) !== task || task.attempt !== attempt) return;
        finish(task, { image, source });
      };
      image.onerror = () => {
        if (tasks.get(task.key) === task && task.attempt === attempt) next();
      };
      image.src = source;
    };
    next();
  }

  function pump() {
    if (batchDepth) return;
    // Both the background and speaker may be needed now. Give them the two
    // connection slots before props, icons, galleries, or speculative pages.
    const ordered = desiredKeys.map(key => tasks.get(key)).filter(Boolean);
    let running = ordered.filter(task => task.running).length;
    const urgent = ordered.filter(task => visibleKeys.has(task.key) && priorities.get(task.key) !== "low");
    for (const task of urgent) {
      if (!task.running && running < 2) { start(task); running += 1; }
    }
    if (urgent.some(task => tasks.has(task.key))) {
      if (policy.deferSpeculation || running >= 2) return;
    }
    const extras = ordered.filter(task => !visibleKeys.has(task.key) || priorities.get(task.key) === "low");
    if (extras.some(task => task.running)) return;
    const next = extras.find(task => !task.running && (visibleKeys.has(task.key) || policy.allowSpeculation));
    if (next && running < 2) start(next);
  }

  function cancel(task) {
    tasks.delete(task.key);
    task.image.onload = null;
    task.image.onerror = null;
    task.image.removeAttribute("src");
    task.resolve(null);
  }

  function reconcile() {
    refreshPolicy();
    const normalize = sources => [...new Set(sources.filter(Boolean))];
    const current = normalize(currentSources);
    currentKey = keyFor(current);
    const wanted = new Map();
    priorities = new Map();
    visibleKeys = new Set();
    if (currentKey) {
      wanted.set(currentKey, current);
      priorities.set(currentKey, "high");
      visibleKeys.add(currentKey);
    }
    for (const owner of owners.values()) {
      if (!owner.key) continue;
      wanted.set(owner.key, owner.sources);
      visibleKeys.add(owner.key);
      const previous = priorities.get(owner.key);
      if (previous !== "high" && (previous !== "auto" || owner.priority === "high")) priorities.set(owner.key, owner.priority);
    }
    let upcoming = 0;
    for (const sources of upcomingSources) {
      const unique = normalize(sources);
      const key = keyFor(unique);
      if (!key || wanted.has(key)) continue;
      if (upcoming++ >= policy.maxUpcoming) break;
      wanted.set(key, unique);
      priorities.set(key, "low");
    }
    const previousKeys = desiredKeys;
    desiredKeys = [...wanted.keys()];
    for (const key of completedSpeculation) {
      if (!wanted.has(key) || visibleKeys.has(key) || previousKeys.indexOf(key) > desiredKeys.indexOf(key)) {
        completedSpeculation.delete(key);
      }
    }
    trimCache();

    for (const [key, task] of tasks) {
      if (!wanted.has(key)) cancel(task);
    }
    // Newly visible art preempts only work that has no visible subscriber.
    const urgentPending = [...visibleKeys].filter(key => priorities.get(key) !== "low" && !cache.has(key)
      && ![...owners.values()].some(owner => owner.key === key && owner.result));
    const extraSlots = Math.max(0, 2 - Math.min(2, urgentPending.length));
    const speculativeSlots = policy.deferSpeculation && urgentPending.length ? 0 : Math.min(1, extraSlots);
    desiredKeys.map(key => tasks.get(key))
      .filter(task => task?.running && (!visibleKeys.has(task.key) || priorities.get(task.key) === "low"))
      .slice(speculativeSlots).forEach(task => {
        if (!visibleKeys.has(task.key)) { cancel(task); return; }
        // A visible decoration can pause for a new background without rejecting
        // its subscriber or falling back to a different image.
        task.image.onload = null;
        task.image.onerror = null;
        task.image.removeAttribute("src");
        task.running = false;
        task.attempt = -1;
      });
    const results = new Map();
    for (const [key, sources] of wanted) {
      const hit = [...owners.values()].find(owner => owner.key === key && owner.result)?.result || cached(key);
      if (hit) {
        results.set(key, Promise.resolve(hit));
        continue;
      }
      const subscribers = [...owners.values()].filter(owner => owner.key === key);
      if (key !== currentKey && subscribers.length && subscribers.every(owner => owner.settled)) {
        results.set(key, Promise.resolve(null));
        continue;
      }
      if (!visibleKeys.has(key) && completedSpeculation.has(key)) continue;
      let task = tasks.get(key);
      if (!task) {
        task = { key, sources, image: createImage(), running: false, attempt: -1 };
        task.promise = new Promise(resolve => { task.resolve = resolve; });
        tasks.set(key, task);
      }
      task.image.fetchPriority = priorities.get(key) || "low";
      results.set(key, task.promise);
    }
    pump();
    return results;
  }

  function schedule(current = [], upcoming = []) {
    currentSources = current;
    upcomingSources = upcoming;
    return reconcile().get(keyFor([...new Set(current.filter(Boolean))])) || Promise.resolve(null);
  }

  function retain(ownerId, sources, { priority = "auto" } = {}) {
    const normalized = [...new Set(sources.filter(Boolean))];
    const key = keyFor(normalized);
    const previous = owners.get(ownerId);
    owners.set(ownerId, { key, sources: normalized, priority, result: previous?.key === key ? previous.result : null,
      settled: previous?.key === key && previous.settled });
    return reconcile().get(key) || Promise.resolve(null);
  }

  function release(ownerId) {
    if (owners.delete(ownerId)) reconcile();
  }

  function batch(update) {
    batchDepth += 1;
    try { return update(); }
    finally { batchDepth -= 1; pump(); }
  }

  return { schedule, retain, release, batch };

}
