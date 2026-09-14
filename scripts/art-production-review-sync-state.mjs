import { spawn } from 'node:child_process';

export function runReviewSync(command, args, options, onStart = () => {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { ...options, windowsHide: true, stdio: 'ignore' });
    child.once('error', error => resolve({ ok: false, code: 'SYNC_SPAWN_FAILED',
      systemCode: /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'UNKNOWN' }));
    child.once('exit', (exitCode, signal) => resolve({ ok: exitCode === 0 && !signal,
      exitCode, signal, code: exitCode === 0 && !signal ? 'SYNC_SUCCEEDED' : 'SYNC_PROCESS_FAILED' }));
    if (child.pid) onStart(child.pid);
  });
}

export function createReviewSyncState({ sync, now = Date.now, retryMs = 30_000, maxRetryMs = 300_000 }) {
  let acknowledgedMarker;
  let running = false;
  let failures = 0;
  let retryAt = 0;
  return {
    async tick(marker) {
      if (running || marker === acknowledgedMarker || now() < retryAt) return { event: 'SYNC_SKIPPED' };
      running = true;
      try {
        let result;
        try { result = await sync(); }
        catch { result = { ok: false, code: 'SYNC_EXECUTION_FAILED' }; }
        if (result.ok) {
          // Only a successful import acknowledges the observed files. A change during
          // this import remains a different marker and will be picked up next time.
          acknowledgedMarker = marker;
          failures = 0;
          retryAt = 0;
          return { event: 'SYNC_FINISHED', ...result };
        }
        failures++;
        retryAt = now() + Math.min(maxRetryMs, retryMs * 2 ** Math.min(failures - 1, 10));
        return { event: 'SYNC_FAILED', ...result, failures, retryAt };
      } finally { running = false; }
    },
  };
}
