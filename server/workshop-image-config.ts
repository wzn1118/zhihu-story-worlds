import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
let cached: { until: number; value: { configured: boolean; endpoint?: string; model?: string } } | undefined;
let pending: Promise<{ configured: boolean; endpoint?: string; model?: string }> | undefined;
export async function workshopImageConfigStatus() {
  if (cached && cached.until > Date.now()) return cached.value;
  return pending ??= (async () => {
    let value: { configured: boolean; endpoint?: string; model?: string } = { configured: false };
    try {
      // The config helper deliberately exposes only redacted metadata.
      const result = await execute('python', ['E:/CodexHome/skills/openqi-imagegen/scripts/configure_openqi.py', '--config', 'E:/CodexHome/openqi-imagegen.env', 'status'], { windowsHide: true, timeout: 10_000, maxBuffer: 16_384 });
      const status = JSON.parse(result.stdout);
      const url = new URL(status.base_url);
      if (!url.username && !url.password && !url.search && !url.hash && ['https:', 'http:'].includes(url.protocol)) value = { configured: status.configured === true, endpoint: url.href, model: status.image_model };
    } catch { /* A missing client is shown as unconfigured. */ }
    cached = { until: Date.now() + 30_000, value };
    return value;
  })().finally(() => { pending = undefined; });
}
