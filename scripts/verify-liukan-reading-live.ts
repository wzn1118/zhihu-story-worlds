import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = 'http://127.0.0.1:4180';
const wanted = process.argv.find(arg => arg.startsWith('--skills='))?.slice(9).split(',') ?? ['recap'];
const mobile = process.argv.includes('--mobile');
const lane = process.argv.find(arg => arg.startsWith('--lane='))?.slice(7) ?? 'desktop';
const comparisonQuestion = process.argv.includes('--compare-technique') ? '对照两篇作者如何让读者相信或怀疑亲属身份，分析叙述视角和信息隐藏的手法，各找一句原话。' : '比较这两篇里亲属身份的说法，为什么可信或可疑；不要把两篇的人物当成同一个人。';
const output = resolve('output/liukan-reading', lane);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('redleaf.liukan.introduction.v1', JSON.stringify({ seen: true })));
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors: string[] = [], requests: Array<{ path: string; method: string }> = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().includes('/api/liukan/reading')) requests.push({ path: new URL(request.url()).pathname, method: request.method() }); });
const receipts: unknown[] = [];
const sources: Record<string, string> = { short: '《星球大战》', story: '有没有后劲很大的悬疑短篇故事' };
try {
  await page.goto(base);
  await page.getByRole('button', { name: '打开刘看山陪伴面板', exact: true }).click();
  await page.getByRole('button', { name: '阅读手记', exact: true }).click();
  await page.locator('.lrd-skill').nth(9).waitFor();
  const index = await (await context.request.get(base + '/api/liukan/reading')).json();
  if (requests.some(row => row.method === 'POST')) throw new Error('Opening notebook submitted a reading');
  for (const skill of wanted) {
    const spec = index.skills.find((item: { id: string }) => item.id === skill);
    if (!spec) throw new Error('Unknown skill ' + skill);
    await page.locator('.lrd-skills button').filter({ hasText: spec.title }).click();
    if (mobile) await page.locator('.lrd-mobile-nav button').filter({ hasText: '书袋与手记' }).click();
    await page.locator('.lrd-library-tabs button').filter({ hasText: '看山的书袋' }).click();
    // Select an actual saved answer through the visible source controls.
    if (skill === 'compare') {
      for (const selected of await page.locator('.lrd-source-select[aria-pressed="true"]').all()) await selected.click();
      await page.locator('.lrd-source-select').filter({ hasText: sources.short }).click();
      await page.locator('.lrd-source-select').filter({ hasText: sources.story }).click();
    } else await page.locator('.lrd-source-select').filter({ hasText: skill === 'recap' ? sources.short : sources.story }).click();
    if (mobile) await page.locator('.lrd-mobile-nav button').filter({ hasText: '一起细读' }).click();
    await page.locator('.lrd-compose-form textarea').fill(skill === 'compare' ? comparisonQuestion : '');
    const started = Date.now();
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/liukan/reading/run') && response.request().method() === 'POST', { timeout: 220000 });
    await page.locator('.lrd-run').click();
    console.log(JSON.stringify({ lane, skill, status: 'started' }));
    const response = await responsePromise;
    const result = await response.json();
    const receipt = { skill, status: response.status(), durationMs: Date.now() - started, result };
    receipts.push(receipt);
    await writeFile(resolve(output, 'results.json'), JSON.stringify({ receipts, errors, requests, pages: context.pages().length }, null, 2));
    if (!response.ok()) {
      await page.locator('.lrd-error').waitFor();
      await page.screenshot({ path: resolve(output, `${skill}-error.png`) });
      console.log(JSON.stringify({ lane, skill, status: response.status(), error: result.error }));
      continue;
    }
    await page.locator('.lrd-paper').waitFor();
    await page.locator('.lrd-paper').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, `${skill}-complete.png`) });
    console.log(JSON.stringify({ lane, skill, status: 'completed', durationMs: Date.now() - started, sections: result.sections.length, model: result.model, invented: result.invented }));
  }
  if (errors.length || context.pages().length !== 1) throw new Error(JSON.stringify({ errors, pages: context.pages().length }));
} finally {
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ receipts, errors, requests, pages: context.pages().length }, null, 2));
  await context.close(); await browser.close();
}
