import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ZhihuBrowserService } from '../server/zhihu-browser.ts';
import type { ZhihuBrowserChannel } from '../shared/zhihu-browser.ts';
import { ZhihuDiscoveryService } from '../server/zhihu-discovery.ts';

const output = resolve('output/playwright/zhihu-browser', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const results: unknown[] = [];
const selected = process.argv[2];
const selectedUrl = process.argv[3] === 'known-post' ? (await new ZhihuDiscoveryService().list()).candidates[0]?.origin.sourceUrl : process.argv[3];
const channels: ZhihuBrowserChannel[] = selected && ['chromium', 'msedge', 'chrome'].includes(selected) ? [selected as ZhihuBrowserChannel] : ['chromium', 'msedge', 'chrome'];
for (const channel of channels) {
  const service = new ZhihuBrowserService(undefined, resolve('.local/zhihu-browser-validation', channel));
  const started = performance.now();
  try {
    console.log(JSON.stringify({ phase: 'opening', channel, url: selectedUrl ?? 'https://www.zhihu.com/' }));
    const frame = await service.open({ channel, url: selectedUrl ?? 'https://www.zhihu.com/', width: 1100, height: 720 });
    if (frame.screenshot) await writeFile(resolve(output, `${channel}.jpg`), Buffer.from(frame.screenshot.split(',')[1], 'base64'));
    results.push({ channel, elapsedMs: Math.round(performance.now() - started), ...frame, screenshot: frame.screenshot ? `${channel}.jpg` : undefined });
    console.log(JSON.stringify({ channel, status: frame.status, title: frame.title, url: frame.url, httpStatus: frame.httpStatus, posts: frame.posts.length, elapsedMs: Math.round(performance.now() - started) }));
    if (process.argv.includes('exercise')) {
      let updated = await service.action({ kind: 'scroll', deltaY: 320 });
      updated = await service.action({ kind: 'key', key: 'Tab' });
      await writeFile(resolve(output, `${channel}-after-input.jpg`), Buffer.from(updated.screenshot!.split(',')[1], 'base64'));
      results.push({ channel, operation: 'scroll-and-tab', status: updated.status, url: updated.url, frameChanged: updated.frameId !== frame.frameId });
    }
  } catch (error) { results.push({ channel, error: error instanceof Error ? error.message : String(error) }); console.log(JSON.stringify({ channel, error: error instanceof Error ? error.message : String(error) })); }
  finally { await service.close(); console.log(JSON.stringify({ phase: 'closed', channel })); }
}
await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2), 'utf8');
console.log(JSON.stringify({ evidence: output }));
