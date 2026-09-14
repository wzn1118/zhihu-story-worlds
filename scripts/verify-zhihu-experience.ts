import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { defaultSettings, storageKeys } from '../src/game.ts';
import { explore } from '../tests/core-creative-support.ts';
import type { GameWorld, StoryDetail } from '../shared/types.ts';
import type { WorkshopProject } from '../shared/workshop.ts';

const base = process.env.WORKSHOP_URL ?? 'http://127.0.0.1:4173';
const output = resolve('output/playwright/zhihu-experience', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const id = '2025684191967294692';
const source = await (await fetch(`${base}/api/stories/${id}`)).json() as StoryDetail;
const world = await (await fetch(`${base}/api/worlds/${id}`)).json() as GameWorld;
const graph = explore(world);
const [endingId, path] = [...graph.nodes].filter(([id]) => world.nodes[id].ending).sort((a, b) => a[1].length - b[1].length)[0];
const browser = await chromium.launch({ executablePath: 'C:/Users/10847/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe', headless: true });
const results: unknown[] = [], errors: string[] = [];
let importedId: string | undefined;
let currentPage: Page | undefined;
console.log(`Evidence: ${output}`);
async function fit(page: Page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
}
async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage, animations: 'disabled' });
  await fit(page);
}
async function state(page: Page) { return JSON.parse(await page.evaluate(() => window.render_game_to_text!())); }
async function showChoices(page: Page) {
  for (let n = 0; n < 50; n++) {
    await page.waitForTimeout(80);
    const value = await state(page);
    if (value.mode === 'ending' || value.choices?.length) return value;
    const next = page.locator('button.dialogue-next');
    if (await next.isVisible()) await next.click();
  }
  throw new Error('Story did not reach its choices');
}
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    context.setDefaultTimeout(45000);
    await context.addInitScript(({ keys, settings }) => {
      localStorage.setItem(keys.onboarding, 'true');
      localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { keys: storageKeys, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
    const page = await context.newPage(); currentPage = page;
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '知乎故事书库。', exact: true }).waitFor();
    await page.locator('.featured-image[data-art-state="ready"]').waitFor();
    await shot(page, `${viewport.name}-library`);
    for (let index = 1; index < await page.locator('.feature-index').count(); index++) {
      const oldImage = await page.locator('.featured-image').getAttribute('src');
      await page.locator('.feature-index').nth(index).click();
      await page.waitForFunction(src => document.querySelector('.featured-image')?.getAttribute('src') !== src, oldImage);
      await page.locator('.featured-image[data-art-state="ready"]').waitFor();
      await shot(page, `${viewport.name}-feature-${index + 1}`);
    }
    await page.locator('.feature-index').first().click();
    await page.locator('.featured-image[data-art-state="ready"]').waitFor();
    assert.ok(await page.locator('.story-cover img[data-art-state="ready"]').count() >= 4);
    await page.locator('.collection-toolbar').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await shot(page, `${viewport.name}-books`);
    const card = page.locator('.story-card').filter({ has: page.getByRole('heading', { name: '蓝血', exact: true }) });
    await card.getByRole('button', { name: '读原作', exact: true }).click();
    await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text!()); return s.mode === 'source-reader' && !s.loading; });
    assert.equal((await state(page)).text, source.content);
    await page.locator('.source-reader-heading .author-avatar img').waitFor();
    await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>('.source-reader-heading .author-avatar img'); return img?.complete && img.naturalWidth > 0; });
    assert.ok(await page.locator('.source-reader-heading .author-avatar img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0));
    await shot(page, `${viewport.name}-source`);
    await page.getByRole('button', { name: '改编这篇', exact: true }).last().click();
    await page.getByTestId('selected-zhihu-source').waitFor();
    await page.getByRole('button', { name: '加入改编项目', exact: true }).waitFor();
    await shot(page, `${viewport.name}-selected-source`, true);
    const response = page.waitForResponse(r => r.url() === `${base}/api/workshop/from-zhihu` && r.request().method() === 'POST');
    await page.getByRole('button', { name: '加入改编项目', exact: true }).click();
    const imported = await response; assert.equal(imported.status(), 201);
    const project = await imported.json() as WorkshopProject;
    assert.equal(project.scope, 'zhihu-excerpt'); assert.equal(project.status, 'idle');
    assert.equal(project.origin?.workId, id);
    if (importedId) assert.equal(project.id, importedId); else importedId = project.id;
    const original = await (await fetch(`${base}/api/workshop/projects/${project.id}/source`)).json();
    assert.equal(original.text, source.content); assert.equal(original.author, source.author);
    await page.getByRole('button', { name: '开始生成', exact: true }).waitFor();
    await shot(page, `${viewport.name}-imported`, true);
    await page.getByRole('button', { name: '读导入原文', exact: true }).click();
    await page.getByTestId('imported-source-text').waitFor();
    assert.equal(await page.getByTestId('imported-source-text').textContent(), source.content);
    assert.equal(await page.locator('.imported-reader .zhihu-wordmark').textContent(), '知乎');
    await shot(page, `${viewport.name}-saved-source`);
    await page.getByRole('button', { name: '返回工作台', exact: true }).click();
    await page.getByRole('tab', { name: '粘贴或上传', exact: true }).click();
    await page.getByRole('textbox', { name: '故事标题', exact: true }).fill('暂存中的原稿');
    await page.getByRole('tab', { name: '从知乎选篇', exact: true }).click();
    await page.getByRole('button', { name: /换一篇/ }).click();
    await page.getByRole('textbox', { name: '查找要改编的知乎故事' }).fill('蓝血');
    assert.equal(await page.locator('.picker-book').count(), 1);
    await page.getByRole('tab', { name: '粘贴或上传', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '故事标题', exact: true }).inputValue(), '暂存中的原稿');
    await shot(page, `${viewport.name}-paste`);
    await page.getByRole('tab', { name: '发现新故事', exact: true }).click();
    await page.locator('.discovery-result').first().waitFor();
    await shot(page, `${viewport.name}-discovery`);
    await page.getByRole('button', { name: /知乎故事书库/ }).click();
    const sourceCard = page.locator('.story-card').filter({ has: page.getByRole('heading', { name: '蓝血', exact: true }) });
    await sourceCard.getByRole('button', { name: '玩改编', exact: true }).click();
    await page.getByRole('button', { name: '开始故事', exact: true }).click();
    for (const choiceId of path) {
      const value = await showChoices(page);
      const index = value.choices.findIndex((choice: { id: string }) => choice.id === choiceId);
      assert.ok(index >= 0, `Offered choice ${choiceId}`);
      await page.locator('.choice-button').nth(index).click();
      await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId !== id, value.nodeId);
    }
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, endingId);
    const ending = await state(page); assert.equal(ending.mode, 'ending');
    await page.locator('.ending-source-bridge').scrollIntoViewIfNeeded();
    assert.ok((await page.locator('.source-bridge-adaptation h3').innerText()).includes(ending.ending.title));
    await shot(page, `${viewport.name}-ending-source`);
    await page.getByRole('button', { name: '阅读知乎原作节选', exact: true }).click();
    await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text!()); return s.mode === 'source-reader' && !s.loading; });
    assert.equal((await state(page)).text, source.content);
    await page.getByRole('button', { name: '继续当前故事', exact: true }).click();
    assert.equal((await state(page)).nodeId, endingId);
    await page.getByRole('button', { name: '回看我的选择', exact: true }).click();
    assert.equal((await state(page)).journalTab, 'history');
    await shot(page, `${viewport.name}-choices`);
    results.push({ viewport, projectId: project.id, sourceExact: true, deduplicated: true, sourceReader: true, authorAvatarLoaded: true, pasteDraftRetained: true, endingId, path, endingSourceReturn: true, actualGameClicks: path.length });
    console.log(`${viewport.name}: library, import, source and actual ending flow passed`);
    await context.close();
  }
  for (const viewport of [{ name: 'wide', width: 1920, height: 1080 }, { name: 'small-mobile', width: 360, height: 720 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(); currentPage = page;
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.featured-image[data-art-state="ready"]').waitFor();
    await shot(page, `${viewport.name}-library`);
    await page.getByRole('button', { name: '新故事工作台', exact: true }).click();
    await page.locator('.discovery-result').first().waitFor();
    await shot(page, `${viewport.name}-discovery`);
    await page.getByRole('tab', { name: '从知乎选篇', exact: true }).click();
    await page.locator('.picker-book').first().waitFor();
    await shot(page, `${viewport.name}-picker`);
    results.push({ viewport, libraryFit: true, discoveryFit: true, pickerFit: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'passed', base, projectId: importedId, results, errors, generationStarted: false }, null, 2));
  console.log(JSON.stringify({ output, results: results.length, errors }, null, 2));
} catch (error) {
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'failed', error: String(error), results, errors }, null, 2));
  await currentPage?.screenshot({ path: resolve(output, 'failure.png'), timeout: 10000 }).catch(() => {});
  throw error;
} finally { await browser.close(); }
