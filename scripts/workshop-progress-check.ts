import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { originalSeed, type WorkshopProject } from '../shared/workshop.ts';

const base = process.env.WORKSHOP_URL ?? 'http://127.0.0.1:4173';
const output = resolve('output/playwright/story-workshop', `progress-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.WORKSHOP_BROWSER ?? 'msedge', headless: true });
const evidence: unknown[] = [], errors: string[] = [];
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.getByRole('button', { name: /新故事工作台/ }).click();
    await page.locator('.workshop-project').filter({ hasText: originalSeed.title }).click();
    await page.locator('.workshop-editorial-status').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: resolve(output, `${viewport.name}-workshop.png`), fullPage: true });
    await page.locator('.workshop-detail').screenshot({ path: resolve(output, `${viewport.name}-production-detail.png`) });
    const { projects, capabilities } = await (await fetch(`${base}/api/workshop/projects`)).json() as { projects: WorkshopProject[]; capabilities?: unknown };
    const project = projects.find(p => p.scope === 'original-seed' && p.title === originalSeed.title)!;
    assert.ok(project); evidence.push({ viewport, project, capabilities });
    await writeFile(resolve(output, `${viewport.name}.aria.txt`), await page.locator('body').ariaSnapshot());
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'observation.json'), JSON.stringify({ at: new Date().toISOString(), observationOnly: true, errors, evidence }, null, 2));
  console.log(JSON.stringify({ output, errors, viewports: evidence.length }));
} finally { await browser.close(); }
