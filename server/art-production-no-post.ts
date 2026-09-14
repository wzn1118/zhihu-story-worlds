import { createHash } from 'node:crypto';
import { lstat, open, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

interface NoPostJob {
  id: string; state: string; errorCode?: string; asset?: unknown; recoveryAvailable: boolean;
  paidAttempts: number; recoveryAttempts: number; childPid?: number; workerPid?: number;
  sourceHash: string; promptHash: string; prompt: string;
}
interface NoPostReceipt {
  schemaVersion: 1; kind: 'art-no-post-resolution'; batchId: string; jobId: string;
  resultSha256: string; requestSha256: string; promptSha256: string;
  beforeState: string; beforeErrorCode?: string; paidAttempts: 1; recoveryAttempts: 0; resolvedAt: string;
}

export class NoPostEvidenceError extends Error {
  constructor(public code: string) { super(code); }
}

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const fail = (code: string): never => { throw new NoPostEvidenceError(code); };
const validHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const receiptName = 'no-post-resolution.json';
function object(bytes: Buffer, code: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* All malformed evidence uses a safe error code. */ }
  return fail(code);
}
async function readRegular(file: string, missingCode: string): Promise<Buffer> {
  const info = await lstat(file).catch(error => {
    if (error.code === 'ENOENT') fail(missingCode);
    throw error;
  });
  if (info.isSymbolicLink() || !info.isFile()) fail('ART_NO_POST_SYMLINK_OR_NONFILE');
  return readFile(file);
}
async function validateDirectory(directory: string): Promise<void> {
  // Check ancestors too: a regular proof file inside a linked job directory is not evidence.
  for (let current = path.resolve(directory); ; current = path.dirname(current)) {
    const info = await lstat(current).catch(error => {
      if (error.code === 'ENOENT') fail('ART_NO_POST_EVIDENCE_MISSING');
      throw error;
    });
    if (info.isSymbolicLink() || !info.isDirectory()) fail('ART_NO_POST_SYMLINK_OR_NONFILE');
    if (path.dirname(current) === current) break;
  }
  const allowed = new Set(['result.json', 'request.json', 'prompt.txt', receiptName]);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) fail('ART_NO_POST_SYMLINK_OR_NONFILE');
    if (!entry.isFile() || !allowed.has(entry.name)) fail('ART_NO_POST_ARTIFACT_PRESENT');
  }
}

/** Called only under the service's cross-process state transaction; never executes a client. */
export async function validateNoPostEvidence(input: {
  job: NoPostJob; batchId: string; directory: string; publicAssetPath: string; evidenceSha256: string;
  isAlive: (pid?: number) => boolean;
}): Promise<NoPostReceipt> {
  try {
    const { job, batchId, directory, evidenceSha256, isAlive } = input;
    if (!validHash(evidenceSha256)) fail('ART_NO_POST_EVIDENCE_HASH_INVALID');
    if (!/^scene_[a-f0-9]{28}$/.test(job.id) || path.basename(directory) !== job.id)
      fail('ART_NO_POST_JOB_ID_INVALID');
    if (!['unknown_outcome', 'failed'].includes(job.state)) fail('ART_NO_POST_TARGET_STATE_INVALID');
    if (job.asset !== undefined || job.recoveryAvailable !== false || job.paidAttempts !== 1 || job.recoveryAttempts !== 0)
      fail('ART_NO_POST_TARGET_NOT_UNSUBMITTED');
    if (isAlive(job.childPid) || isAlive(job.workerPid)) fail('ART_NO_POST_JOB_ACTIVE');
    await validateDirectory(directory);
    const publicAsset = await lstat(input.publicAssetPath).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (publicAsset) fail('ART_NO_POST_ARTIFACT_PRESENT');

    const resultBytes = await readRegular(path.join(directory, 'result.json'), 'ART_NO_POST_RESULT_MISSING');
    if (sha256(resultBytes) !== evidenceSha256) fail('ART_NO_POST_EVIDENCE_HASH_MISMATCH');
    const result = object(resultBytes, 'ART_NO_POST_RESULT_INVALID');
    if (Object.keys(result).length !== 3 || result.state !== 'failed'
      || result.errorCode !== 'DISPATCH_NOT_CONFIRMED_NO_POST' || result.recoveryAvailable !== false)
      fail('ART_NO_POST_RESULT_NOT_CONFIRMED');
    const requestBytes = await readRegular(path.join(directory, 'request.json'), 'ART_NO_POST_REQUEST_MISSING');
    const promptBytes = await readRegular(path.join(directory, 'prompt.txt'), 'ART_NO_POST_PROMPT_MISSING');
    const request = object(requestBytes, 'ART_NO_POST_REQUEST_INVALID');
    if (!validHash(job.sourceHash) || !validHash(job.promptHash) || request.sourceHash !== job.sourceHash
      || request.promptHash !== job.promptHash || sha256(promptBytes) !== job.promptHash
      || promptBytes.toString('utf8') !== job.prompt) fail('ART_NO_POST_REQUEST_PROMPT_MISMATCH');

    const receipt: NoPostReceipt = {
      schemaVersion: 1, kind: 'art-no-post-resolution', batchId, jobId: job.id,
      resultSha256: evidenceSha256, requestSha256: sha256(requestBytes), promptSha256: sha256(promptBytes),
      beforeState: job.state, ...(job.errorCode ? { beforeErrorCode: job.errorCode } : {}),
      paidAttempts: 1, recoveryAttempts: 0, resolvedAt: new Date().toISOString(),
    };
    const file = path.join(directory, receiptName);
    const handle = await open(file, 'wx', 0o600).catch(error => {
      if (error.code === 'EEXIST') return null;
      throw error;
    });
    if (!handle) {
      const saved = object(await readRegular(file, 'ART_NO_POST_RECEIPT_INVALID'), 'ART_NO_POST_RECEIPT_INVALID');
      const alreadyResolved = job.state === 'failed' && job.errorCode === 'DISPATCH_NOT_CONFIRMED_NO_POST';
      if (saved.schemaVersion !== 1 || saved.kind !== receipt.kind || saved.batchId !== batchId || saved.jobId !== job.id
        || saved.resultSha256 !== evidenceSha256 || saved.requestSha256 !== receipt.requestSha256
        || saved.promptSha256 !== receipt.promptSha256 || saved.paidAttempts !== 1 || saved.recoveryAttempts !== 0
        || !['unknown_outcome', 'failed'].includes(String(saved.beforeState))
        || typeof saved.resolvedAt !== 'string' || !Number.isFinite(Date.parse(saved.resolvedAt))
        || (!alreadyResolved && (saved.beforeState !== job.state || saved.beforeErrorCode !== job.errorCode)))
        fail('ART_NO_POST_RECEIPT_MISMATCH');
      return saved as unknown as NoPostReceipt;
    }
    // A failed write leaves the job unchanged and the receipt for explicit inspection.
    // Never delete or overwrite a partial receipt to make a later attempt succeed.
    try { await handle.writeFile(JSON.stringify(receipt, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    return receipt;
  } catch (error) {
    if (error instanceof NoPostEvidenceError) throw error;
    throw new NoPostEvidenceError('ART_NO_POST_EVIDENCE_IO');
  }
}
