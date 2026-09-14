import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { originalSeed, type WorkshopProject } from '../shared/workshop.ts';
import type { GameWorld } from '../shared/types.ts';

const base = process.env.WORKSHOP_URL ?? 'http://127.0.0.1:4173';
const observeOnly = process.argv.includes('--observe-existing');
const acceptancePath = process.argv.find(arg => arg.startsWith('--acceptance='))?.slice('--acceptance='.length);
const legacySavePath = process.argv.find(arg => arg.startsWith('--legacy-save='))?.slice('--legacy-save='.length);
const legacySave = legacySavePath ? JSON.parse(await readFile(legacySavePath, 'utf8')).game as { storyId: string; worldId: string; worldVersion: string; nodeId: string } : null;
const acceptance = acceptancePath ? JSON.parse(await readFile(acceptancePath, 'utf8')) as { projectId: string; version: string; endings: { id: string; title: string; tone: string; path: string[] }[]; pressureCases?: { routeId: string; resourceId: string; minimum: number; nodeId: string; path: string[]; exitChoiceId: string; nextNodeId: string }[] } : null;
const output = resolve('output/playwright/story-workshop', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, { recursive: true });
const browserChannel = process.argv.find(arg => arg.startsWith('--browser='))?.slice('--browser='.length) ?? process.env.WORKSHOP_BROWSER ?? 'chrome';
const browser = await chromium.launch({ channel: browserChannel, headless: true, timeout: 30_000 });
const results: Record<string, unknown>[] = [];
const errors: string[] = [];
const snapshot = async (page: Page, name: string) => {
  await page.waitForTimeout(250);
  const dialog = await page.getByRole('dialog').count();
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: !dialog, animations: 'disabled' });
  await writeFile(resolve(output, `${name}.aria.txt`), await page.locator('body').ariaSnapshot(), 'utf8');
};
async function fit(page: Page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow'); }
async function showChoices(page: Page) {
  for (let n = 0; n < 40; n++) {
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
    if (state.mode === 'ending' || state.choices?.length) return state;
    const next = page.getByRole('button', { name: /^(显示全文|继续)$/ });
    if (await next.count()) await next.click();
    await page.waitForTimeout(150);
  }
  throw new Error('Choices did not appear');
}
async function assertPublishedStep(page: Page, state: { worldId: string; nodeId: string; text: string; choices: { id: string; text: string; hint?: string }[] }, world: GameWorld) {
  assert.equal(state.worldId, world.id);
  const node = world.nodes[state.nodeId];
  assert.equal(state.text, node.text.at(-1), 'The played paragraph is the approved paragraph, not an older copy overlay');
  assert.equal(await page.locator('.dialogue-text').textContent(), state.text);
  const expected = state.choices.map(choice => { const approved = node.choices.find(c => c.id === choice.id); assert.ok(approved); return { id: approved.id, text: approved.text, hint: approved.hint }; });
  assert.deepEqual(state.choices.map(({ id, text, hint }) => ({ id, text, hint })), expected);
  assert.deepEqual(await page.locator('.choice-button .choice-copy').evaluateAll(elements => elements.map(element => [...element.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(''))), expected.map(c => c.text));
  assert.deepEqual(await page.locator('.choice-button .choice-copy small:not(.choice-cost)').allTextContents(), expected.map(c => c.hint));
}
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.getByRole('button', { name: /新故事工作台/ }).click();
    let project: WorkshopProject;
    if (observeOnly) {
      const list = await (await fetch(`${base}/api/workshop/projects`)).json() as { projects: WorkshopProject[] };
      const existing = list.projects.find(p => p.scope === 'original-seed' && p.title === originalSeed.title);
      assert.ok(existing, 'An existing original sample is required in observation mode'); project = existing;
      await page.locator('.workshop-project').filter({ hasText: originalSeed.title }).click();
    } else {
      await page.getByRole('tab', { name: '粘贴或上传', exact: true }).click();
      await page.getByRole('button', { name: '填入原创悬疑种子' }).click();
      const imported = page.waitForResponse(r => r.url() === `${base}/api/workshop/projects` && r.request().method() === 'POST');
      await page.getByRole('button', { name: '入库并生成' }).click();
      project = await (await imported).json() as WorkshopProject;
    }
    await page.getByRole('button', { name: '读导入原文' }).waitFor();
    if (process.argv.includes('--resume-failed') && ['failed', 'interrupted'].includes(project.status)) {
      await snapshot(page, `${viewport.name}-actual-failure`);
      const resumed = page.waitForResponse(r => r.url() === `${base}/api/workshop/projects/${project.id}/generate` && r.request().method() === 'POST');
      await page.getByRole('button', { name: '从完成阶段续跑' }).click();
      const next = await (await resumed).json() as WorkshopProject;
      assert.equal(next.id, project.id); assert.equal(next.revision, project.revision); assert.equal(next.status, 'running');
      results.push({ viewport: viewport.name, resumedActualFailure: true, projectId: next.id, revision: next.revision, jobId: next.jobId, previousError: project.error });
      project = next;
      await snapshot(page, `${viewport.name}-resumed`);
    }
    await snapshot(page, `${viewport.name}-workshop`); await fit(page);
    await page.getByRole('button', { name: '读导入原文' }).click();
    await page.getByTestId('imported-source-text').waitFor();
    assert.equal(await page.getByTestId('imported-source-text').textContent(), originalSeed.text);
    assert.ok((await page.getByRole('dialog').innerText()).includes('原创种子'));
    await snapshot(page, `${viewport.name}-source`); await fit(page);
    await page.getByRole('searchbox', { name: '在导入原文中查找' }).fill('七秒');
    assert.ok(await page.locator('.imported-reader mark').count() >= 2);
    await page.getByRole('button', { name: '下一个匹配', exact: true }).click();
    assert.equal(await page.getByTestId('imported-source-text').textContent(), originalSeed.text);
    await page.getByRole('button', { name: '返回工作台', exact: true }).click();
    const actual = await (await fetch(`${base}/api/workshop/projects/${project.id}`)).json() as WorkshopProject;
    results.push({ viewport: viewport.name, projectId: project.id, sourceExact: true, generationTriggeredInBrowser: !observeOnly, status: actual.status, stage: actual.stage });
    if (actual.playable) {
      await page.getByRole('button', { name: /游玩 r/ }).click();
      const guide = page.getByRole('button', { name: '认识这个世界' });
      await guide.waitFor(); await guide.click();
      await snapshot(page, `${viewport.name}-introduction`);
      await page.getByRole('button', { name: '开始故事', exact: true }).click();
      await page.getByRole('button', { name: '阅读设置', exact: true }).click();
      await page.locator('#reduced-motion').check();
      await page.getByRole('button', { name: '完成', exact: true }).click();
      if (viewport.name === 'mobile') {
        const paragraph = page.locator('.dialogue-text');
        const overflowing = await paragraph.evaluate(element => element.scrollHeight > element.clientHeight);
        if (overflowing && await page.getByRole('button', { name: '继续', exact: true }).count()) {
          await paragraph.hover(); await page.mouse.wheel(0, 1000); await page.waitForTimeout(150);
          assert.ok(await paragraph.evaluate(element => element.scrollTop > 0), 'Long paragraph can be scrolled');
          await page.getByRole('button', { name: '继续', exact: true }).click();
          assert.equal(await paragraph.evaluate(element => element.scrollTop), 0, 'Next paragraph starts at the top');
          results.push({ viewport: viewport.name, longParagraphScroll: true, nextParagraphStartsAtTop: true });
        }
      }
      let state = await showChoices(page); assert.equal(state.choices.length, 3);
      await snapshot(page, `${viewport.name}-game-opening`); await fit(page);
      await page.locator('.choice-button').first().click();
      state = await showChoices(page);
      await snapshot(page, `${viewport.name}-game-route`); await fit(page);
      const nodeBefore = state.nodeId;
      await page.locator('.game-bottomline .source-reader-link').click();
      await page.getByTestId('imported-source-text').waitFor();
      assert.equal(await page.getByTestId('imported-source-text').textContent(), originalSeed.text);
      await page.getByRole('button', { name: '继续当前故事' }).click();
      assert.equal(JSON.parse(await page.evaluate(() => window.render_game_to_text!())).nodeId, nodeBefore);
      await page.getByRole('button', { name: '保存与载入', exact: true }).click();
      await page.getByRole('button', { name: '保存', exact: true }).first().click();
      await snapshot(page, `${viewport.name}-saves`);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出存档 01' }).click();
      const file = await download; const savePath = resolve(output, `${viewport.name}-portable-save.json`); await file.saveAs(savePath);
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await page.getByRole('button', { name: '返回书库', exact: true }).click();
      await page.getByRole('button', { name: /我的存档/ }).click();
      await page.getByRole('button', { name: '载入', exact: true }).nth(1).click();
      await page.waitForFunction(node => JSON.parse(window.render_game_to_text!()).nodeId === node, nodeBefore);
      results.push({ viewport: viewport.name, playable: true, introduction: true, choices: state.choices.length, savedNode: nodeBefore, sourceReturn: true, saveRestore: true, saveExport: savePath });
      if (acceptance) {
        assert.equal(acceptance.projectId, project.id); assert.equal(acceptance.version, actual.publishedVersion);
        const world = await (await fetch(`${base}/api/workshop/projects/${project.id}/world?version=${acceptance.version}`)).json() as GameWorld;
        const checkedScenes = new Set<string>();
        await page.getByRole('button', { name: '返回书库', exact: true }).click();
        await page.getByRole('button', { name: /新故事工作台/ }).click();
        await page.locator('.workshop-project').filter({ hasText: originalSeed.title }).click();
        await page.getByRole('button', { name: /游玩 r/ }).click();
        await page.getByRole('button', { name: '认识这个世界' }).click();
        for (const [index, ending] of acceptance.endings.entries()) {
          if (index) await page.getByRole('button', { name: '重新开始', exact: true }).click();
          await page.getByRole('button', { name: '开始故事', exact: true }).click();
          for (const choiceId of ending.path) {
            const state = await showChoices(page), choiceIndex = state.choices.findIndex((c: { id: string }) => c.id === choiceId);
            await assertPublishedStep(page, state, world); checkedScenes.add(state.nodeId);
            assert.ok(choiceIndex >= 0, `${state.nodeId}: expected enabled choice ${choiceId}`);
            const next = world.nodes[state.nodeId].choices.find(c => c.id === choiceId)!.nextNodeId;
            await page.locator('.choice-button').nth(choiceIndex).click();
            await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, next);
          }
          const final = await showChoices(page); assert.equal(final.mode, 'ending'); assert.equal(final.nodeId, ending.id);
          assert.equal(final.ending.tone, ending.tone);
          assert.equal(final.text, world.nodes[ending.id].text.join('\n\n'), 'Actual ending state contains the complete published ending prose');
          assert.equal(await page.locator('.ending-prose').textContent(), final.text, 'The visible ending contains the entire resolved prose');
          await snapshot(page, `${viewport.name}-ending-${ending.id}`); await fit(page);
          await page.getByRole('button', { name: '查看导入原文', exact: true }).click();
          await page.getByTestId('imported-source-text').waitFor();
          assert.equal(await page.getByTestId('imported-source-text').textContent(), originalSeed.text);
          await page.getByRole('button', { name: '继续当前故事' }).click();
          results.push({ viewport: viewport.name, actualEnding: ending.id, title: ending.title, tone: ending.tone, clickedChoices: ending.path.length, sourceReturnFromEnding: true });
        }
        for (const pressure of acceptance.pressureCases ?? []) {
          await page.getByRole('button', { name: '返回书库', exact: true }).first().click();
          await page.getByRole('button', { name: /新故事工作台/ }).click();
          await page.locator('.workshop-project').filter({ hasText: originalSeed.title }).click();
          await page.getByRole('button', { name: /游玩 r/ }).click();
          await page.getByRole('button', { name: '认识这个世界' }).click();
          await page.getByRole('button', { name: '开始故事', exact: true }).click();
          for (const choiceId of pressure.path) {
            const state = await showChoices(page), index = state.choices.findIndex((c: { id: string }) => c.id === choiceId);
            await assertPublishedStep(page, state, world); checkedScenes.add(state.nodeId);
            assert.ok(index >= 0, `Pressure path choice is genuinely available: ${choiceId}`);
            await page.locator('.choice-button').nth(index).click();
            await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, world.nodes[state.nodeId].choices.find(c => c.id === choiceId)!.nextNodeId);
          }
          const depleted = await showChoices(page);
          await assertPublishedStep(page, depleted, world); checkedScenes.add(depleted.nodeId);
          assert.equal(depleted.nodeId, pressure.nodeId); assert.equal(depleted.resources[pressure.resourceId], pressure.minimum);
          const exitIndex = depleted.choices.findIndex((c: { id: string }) => c.id === pressure.exitChoiceId); assert.ok(exitIndex >= 0);
          await snapshot(page, `${viewport.name}-depleted-${pressure.routeId}-${pressure.resourceId}`);
          await page.locator('.choice-button').nth(exitIndex).click();
          await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, pressure.nextNodeId);
          await showChoices(page); await fit(page);
          results.push({ viewport: viewport.name, realDepletedExit: true, ...pressure });
        }
        results.push({ viewport: viewport.name, publishedParagraphAndButtonFidelity: true, version: acceptance.version, checkedDecisionScenes: [...checkedScenes].sort() });
      }
      if (legacySave && legacySavePath) {
        assert.equal(legacySave.storyId, project.id);
        await page.getByRole('button', { name: '返回书库', exact: true }).first().click();
        await page.getByRole('button', { name: /我的存档/ }).click();
        await page.locator('input[type=file][aria-label="选择存档文件"]').setInputFiles(legacySavePath);
        await page.locator('#import-save-slot').selectOption('1');
        await snapshot(page, `${viewport.name}-legacy-save-preview`);
        await page.getByRole('button', { name: '导入到存档 02', exact: true }).click();
        await page.locator('.save-slot').nth(2).getByRole('button', { name: '载入', exact: true }).click();
        await page.waitForFunction(expected => { const state = JSON.parse(window.render_game_to_text!()); return state.worldId === expected.worldId && state.nodeId === expected.nodeId; }, legacySave);
        const oldState = await showChoices(page);
        assert.ok(oldState.choices.length, 'The actual older revision retains playable choices after import');
        await snapshot(page, `${viewport.name}-legacy-save-loaded`); await fit(page);
        await page.locator('.game-bottomline .source-reader-link').click();
        await page.getByTestId('imported-source-text').waitFor();
        assert.equal(await page.getByTestId('imported-source-text').textContent(), originalSeed.text);
        await page.getByRole('button', { name: '继续当前故事' }).click();
        await page.locator('.choice-button').first().click();
        await page.waitForFunction(previous => JSON.parse(window.render_game_to_text!()).nodeId !== previous, legacySave.nodeId);
        const continued = await showChoices(page); assert.equal(continued.worldId, legacySave.worldId);
        results.push({ viewport: viewport.name, actualLegacySaveImported: legacySavePath, oldVersion: legacySave.worldVersion, publishedDefault: actual.publishedVersion, oldWorldId: legacySave.worldId, continuedNode: continued.nodeId, sourceReturn: true });
      }
    }
    if (viewport.name === 'desktop') {
      if (actual.playable) await page.getByRole('button', { name: '返回书库', exact: true }).first().click();
      else await page.getByRole('button', { name: /故事书库/ }).click();
      await page.getByRole('button', { name: '读原作', exact: true }).first().click();
      await page.locator('.source-reader-prose').waitFor();
      assert.ok((await page.locator('.source-reader').innerText()).includes('知乎'));
      await snapshot(page, 'original-source-regression');
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await page.getByRole('button', { name: /新故事工作台/ }).click();
      await page.getByRole('tab', { name: '粘贴或上传', exact: true }).click();
      await page.getByRole('textbox', { name: '故事标题', exact: true }).fill('浏览器原文保真验证');
      await page.getByRole('textbox', { name: '原文作者', exact: true }).fill('工作台回归测试 · 非作品');
      const fileText = `\uFEFF  文件导入保真样例\r\n\r\n${originalSeed.text}\r\n  结尾保留空格  `;
      const sourcePath = resolve(output, 'import-fidelity-source.txt'); await writeFile(sourcePath, fileText, 'utf8');
      await page.locator('input[type=file][aria-label="导入故事文本文件"]').setInputFiles(sourcePath);
      const response = page.waitForResponse(r => r.url() === `${base}/api/workshop/projects` && r.request().method() === 'POST');
      await page.getByRole('button', { name: '仅保存原文' }).click();
      const importedProject = await (await response).json();
      await page.getByRole('button', { name: '读导入原文' }).click(); await page.getByTestId('imported-source-text').waitFor();
      assert.equal(await page.getByTestId('imported-source-text').textContent(), fileText);
      assert.equal((await (await fetch(`${base}/api/workshop/projects/${importedProject.id}/source`)).json()).text, fileText);
      results.push({ fileImport: true, preserved: 'BOM, CRLF, leading/trailing whitespace', projectId: importedProject.id });
      await page.getByRole('button', { name: '返回工作台', exact: true }).click();
      await page.getByRole('textbox', { name: '原文 / 节选', exact: true }).evaluate((element, text) => {
        const input = element as HTMLTextAreaElement; input.setSelectionRange(0, input.value.length);
        const data = new DataTransfer(); data.setData('text/plain', text);
        input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      }, fileText);
      const pastedResponse = page.waitForResponse(r => r.url() === `${base}/api/workshop/projects` && r.request().method() === 'POST');
      await page.getByRole('button', { name: '仅保存原文' }).click();
      assert.equal((await (await pastedResponse).json()).id, importedProject.id);
      results.push({ clipboardPreserved: true, idempotentWithFileImport: true });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ at: new Date().toISOString(), base, results, browserErrors: errors }, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
} catch (error) {
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ at: new Date().toISOString(), base, status: 'failed', completedSteps: results, browserErrors: errors, error: error instanceof Error ? error.message : String(error) }, null, 2));
  console.error(JSON.stringify({ output, status: 'failed' }));
  throw error;
} finally { await browser.close(); }
