import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export interface FormalReferenceDigest { sha256: string; bytes: number }
export type FormalReferenceDigestReader = (filename: string, expected?: FormalReferenceDigest) => Promise<FormalReferenceDigest>;

/** Create inside each sync invocation, including the invocation after review imports. */
export function createFormalReferenceDigestReader(): FormalReferenceDigestReader {
  const cache = new Map<string, { version: string; value: Promise<FormalReferenceDigest> }>();
  const fingerprint = (value: Awaited<ReturnType<typeof stat>>) =>
    JSON.stringify([value.dev, value.ino, value.size, value.mtimeMs, value.ctimeMs]);
  return async (filename, expected) => {
    // Include the exact caller path and integrity contract; never cache approval decisions.
    const key = JSON.stringify([filename, expected?.sha256 ?? null, expected?.bytes ?? null]);
    const before = fingerprint(await stat(filename));
    let entry = cache.get(key);
    if (!entry || entry.version !== before) {
      const value = (async () => {
        const bytes = await readFile(filename);
        const digest = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
        if (fingerprint(await stat(filename)) !== before) throw new Error('SHORT_REFERENCE_FILE_CHANGED_DURING_READ');
        return digest;
      })();
      entry = { version: before, value };
      cache.set(key, entry);
      void value.catch(() => { if (cache.get(key)?.value === value) cache.delete(key); });
    }
    const actual = await entry.value;
    if (expected && (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes))
      throw new Error('SHORT_ANCHOR_HASH_CHANGED');
    return actual;
  };
}
