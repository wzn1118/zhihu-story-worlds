import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.WORKSHOP_URL ?? 'http://127.0.0.1:4173';
const output = resolve('output/playwright/zhihu-hot-search');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('redleaf.liukan.introduction.v1', JSON.stringify({ seen: true })));
const page = await context.newPage();
const calls: Array<{ path: string; status: number }> = [];
page.on('response', response => { if (response.url().includes('/api/')) calls.push({ path: new URL(response.url()).pathname, status: response.status() }); });
try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const entry = page.locator('button[data-tour="workshop-entry"]');
  await entry.dispatchEvent('click');
  const choose = page.locator('button').filter({ hasText: '去知乎选故事' });
  await choose.first().waitFor({ timeout: 10_000 });
  await choose.first().dispatchEvent('click');
  await page.getByRole('button', { name: '知乎网页', exact: true }).waitFor({ timeout: 10_000 });
  const searchTab = page.getByRole('button', { name: '知乎内容阅读', exact: true });
  await searchTab.click();
  const searchBox = page.getByRole('textbox', { name: '在知乎搜索回答', exact: true });
  await searchBox.fill('悬疑故事');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.locator('.zhw-reader-card').first().waitFor({ timeout: 30_000 });
  const resultCount = await page.locator('.zhw-reader-card').count();
  assert.ok(resultCount > 0, 'search should render at least one real candidate');
  await page.getByRole('button', { name: '知乎网页', exact: true }).click();
  await page.waitForTimeout(500);
  const iframe = page.locator('.zhw-live-page iframe');
  await iframe.waitFor({ timeout: 10_000 });
  const iframeContent = iframe.contentFrame();
  const hot = iframeContent.locator('a[href="https://www.zhihu.com/hot"]').first();
  await hot.waitFor({ timeout: 30_000 });
  await hot.click();
  await page.waitForTimeout(900);
  assert.match(await page.locator('.zhw-address input').inputValue(), /\/hot$/);
  await page.screenshot({ path: resolve(output, 'hot-search.png'), scale: 'css' });
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'passed', resultCount, url: await page.locator('.zhw-address input').inputValue(), calls }, null, 2));
  console.log(JSON.stringify({ status: 'passed', resultCount }));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), scale: 'css' }).catch(() => undefined);
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ status: 'failed', error: String(error), calls }, null, 2));
  console.error(JSON.stringify({ status: 'failed', error: String(error), calls }));
  process.exitCode = 1;
} finally { await context.close(); await browser.close(); }
