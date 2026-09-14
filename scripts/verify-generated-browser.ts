import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import type { GameWorld } from '../shared/types.ts';
import type { ImportedSource, WorkshopProject } from '../shared/workshop.ts';
import type { ArtBatch } from '../shared/production.ts';
import { parseSaveFile } from '../src/game.ts';
import { clueLabel } from '../src/clue-labels.ts';
import { choiceBlockers } from '../shared/choice-rules.ts';
import { costPressure, freeUnconditional, pressureKey, type PressureCase, type PressureCoverage } from './verify-generated-story.ts';

const acceptanceFile = process.argv[2];
if (!acceptanceFile) throw new Error('Pass the current real engine acceptance.json');
const acceptance = JSON.parse(await readFile(acceptanceFile, 'utf8')) as { projectId: string; version: string; editorial: unknown; sourceIdentitySha256: string; sourceEnvelopeSha256: string; sourceTextSha256: string; endings: { id: string; tone: string; path: string[] }[]; pressureCases: PressureCase[]; pressureCoverage: PressureCoverage[] };
assert.ok(acceptance.editorial, 'Requires editorially accepted real production');
const base = process.env.WORKSHOP_URL || 'http://127.0.0.1:4173';
const get = async <T>(path: string) => { const response = await fetch(`${base}${path}`); assert.ok(response.ok); return await response.json() as T; };
const world = await get<GameWorld>(`/api/workshop/projects/${acceptance.projectId}/world?version=${acceptance.version}`);
const source = await get<ImportedSource>(`/api/workshop/projects/${acceptance.projectId}/source`);
const project = await get<WorkshopProject>(`/api/workshop/projects/${acceptance.projectId}`);
assert.equal(project.id, acceptance.projectId);
assert.equal(project.playable, true, 'The library must expose this published game');
assert.equal(project.publishedVersion, acceptance.version, 'Library entry must open the accepted revision');
assert.equal(world.storyId, acceptance.projectId);
assert.equal(world.version, acceptance.version);
assert.equal(project.sourceHash, acceptance.sourceIdentitySha256);
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
assert.equal(sha256(source.text), acceptance.sourceTextSha256, 'Served source text must match engine acceptance');
assert.equal(sha256(JSON.stringify(source)), acceptance.sourceEnvelopeSha256, 'Served source attribution must match engine acceptance');
const expectedEndings = Object.values(world.nodes).filter(node => node.ending).map(node => node.id).sort();
assert.equal(new Set(acceptance.endings.map(ending => ending.id)).size, acceptance.endings.length, 'Ending paths must not repeat');
assert.deepEqual(acceptance.endings.map(ending => ending.id).sort(), expectedEndings, 'Every published ending needs a browser path');
assert.ok(Array.isArray(acceptance.pressureCases) && Array.isArray(acceptance.pressureCoverage), 'Regenerate engine acceptance with explicit pressure coverage');
const routeIds = world.nodes[world.startNodeId].choices.map(choice => {
  assert.ok(choice.id.startsWith('enter_'));
  return choice.id.slice('enter_'.length);
});
const expectedCoverage = routeIds.flatMap(routeId => (world.resources ?? []).map(resource => `${routeId}/${resource.id}`)).sort();
assert.deepEqual(acceptance.pressureCoverage.map(entry => `${entry.routeId}/${entry.resourceId}`).sort(), expectedCoverage);
assert.equal(new Set(acceptance.pressureCases.map(pressureKey)).size, acceptance.pressureCases.length, 'Pressure cases must not repeat');
for (const entry of acceptance.pressureCoverage) {
  const cases = acceptance.pressureCases.filter(item => item.routeId === entry.routeId && item.resourceId === entry.resourceId);
  const resource = world.resources!.find(item => item.id === entry.resourceId)!;
  assert.equal(entry.minimum, resource.min);
  assert.ok(typeof entry.minimumObserved === 'number' && entry.minimumObserved >= resource.min && entry.minimumObserved <= resource.max);
  assert.ok(typeof entry.minimumDecisionObserved === 'number' && entry.minimumDecisionObserved >= entry.minimumObserved && entry.minimumDecisionObserved <= resource.max);
  assert.equal(entry.caseCount, cases.length);
  assert.equal(entry.depletedDecisionReachable, cases.some(item => item.kind === 'depleted'));
  assert.equal(entry.affordabilityPressureReachable, cases.some(item => item.kind === 'unaffordable'));
  assert.equal(entry.status, cases.length ? 'cases-recorded' : 'no-pressure-reachable');
}
assert.equal(acceptance.pressureCoverage.reduce((total, entry) => total + entry.caseCount, 0), acceptance.pressureCases.length);
const art = project.art.batchId ? await get<ArtBatch>(`/api/art/batches/${project.art.batchId}`) : null;
if (art) assert.equal(art.worldVersion, acceptance.version);
assert.deepEqual(world.generated?.editorial, acceptance.editorial);
const output = resolve('output/playwright/generated-stories', `${acceptance.projectId}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results: Record<string, unknown>[] = [], errors: string[] = [];
async function state(page: Page) {
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  return JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
}
async function introduction(page: Page) {
  const guide = page.getByRole('dialog', { name: '翻开第一页之前', exact: true });
  const intro = page.getByRole('dialog', { name: '世界序章', exact: true });
  await guide.or(intro).waitFor({ state: 'visible' });
  if (await guide.isVisible()) {
    await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).modal === 'guide');
    assert.equal((await state(page)).modal, 'guide');
    await guide.getByRole('button', { name: '认识这个世界', exact: true }).click();
  }
  await intro.getByRole('heading', { name: world.title, exact: true }).waitFor();
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).modal === 'background');
  assert.equal((await state(page)).modal, 'background');
}
async function openBook(page: Page) {
  await page.locator(`.new-adaptation-list [data-project-id="${acceptance.projectId}"]`).getByRole('button', { name: '开始游戏', exact: true }).click();
  await introduction(page);
}
async function beginStory(page: Page) {
  await introduction(page);
  await page.getByRole('dialog', { name: '世界序章', exact: true }).getByRole('button', { name: '开始故事', exact: true }).click();
  await page.waitForFunction(id => window.render_game_to_text && JSON.parse(window.render_game_to_text()).nodeId === id, world.startNodeId);
  const current = await state(page);
  assert.equal(current.modal, null);
  assert.equal(current.worldId, world.id);
  assert.equal(current.world, world.title);
  assert.ok((await page.locator('.scene-time').innerText()).startsWith(`改编 ${world.version} /`), 'Actual UI must run the accepted version');
}
function saveState(current: Awaited<ReturnType<typeof state>>) {
  return { worldId: current.worldId, nodeId: current.nodeId, paragraph: current.paragraph, paragraphCount: current.paragraphCount,
    text: current.text, choiceCount: current.choiceCount, resources: current.resources, clues: current.clues, history: current.history,
    choices: current.choices.map((choice: { id: string }) => choice.id) };
}
async function loadSlot(page: Page, label: string, expected: ReturnType<typeof saveState>) {
  await page.locator('.save-slot').filter({ has: page.getByText(label, { exact: true }) }).getByRole('button', { name: '载入', exact: true }).click();
  await page.waitForFunction(id => window.render_game_to_text && JSON.parse(window.render_game_to_text()).nodeId === id, expected.nodeId);
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).textComplete === true);
  assert.equal((await state(page)).modal, null);
  assert.deepEqual(saveState(await state(page)), expected, 'Load restores the actual path, resource, clues and reading position without advancing it');
  assert.ok((await page.locator('.scene-time').innerText()).startsWith(`改编 ${world.version} /`));
}
async function choices(page: Page) {
  for (let count = 0; count < 40; count++) {
    const current = await state(page);
    if (current.mode === 'ending' || current.choices?.length) {
      assert.equal(await page.locator('.choice-button small:not(.choice-cost)').count(), 0,
        'Player-facing choices must not reveal result hints before the click');
      return current;
    }
    const next = page.getByRole('button', { name: /^(显示全文|继续)$/ });
    if (await next.count()) await next.click();
    await page.waitForTimeout(80);
  }
  throw new Error('Current scene did not reveal choices');
}
async function fit(page: Page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
  const reading = page.locator('.text-reading .game-stage');
  if (!await reading.count()) return;
  const layout = await reading.evaluate(stage => {
    const prose = stage.querySelector('.dialogue-panel')!.getBoundingClientRect();
    const choices = stage.querySelector('.choice-region')!.getBoundingClientRect();
    const bounds = stage.getBoundingClientRect();
    return { narrow: innerWidth <= 900, prose: { left: prose.left, right: prose.right, top: prose.top, bottom: prose.bottom },
      choices: { left: choices.left, right: choices.right, top: choices.top }, bounds: { left: bounds.left, right: bounds.right },
      overflowX: stage.scrollWidth - stage.clientWidth, overflowY: getComputedStyle(stage).overflowY };
  });
  assert.ok(layout.overflowX <= 1, 'Reading stage must not hide horizontal overflow');
  assert.equal(layout.overflowY, 'auto', 'Long choices remain reachable through the reading scroll area');
  for (const region of [layout.prose, layout.choices]) {
    assert.ok(region.left >= layout.bounds.left && region.right <= layout.bounds.right, 'Reading regions stay inside the stage');
  }
  if (layout.narrow) assert.ok(layout.prose.bottom <= layout.choices.top + 1, 'Mobile prose precedes choices without overlap');
  else {
    assert.ok(layout.prose.right < layout.choices.left, 'Desktop prose and choices have separate columns');
    assert.ok(Math.abs(layout.prose.top - layout.choices.top) <= 1, 'Desktop reading columns start together');
  }
}
async function followPath(page: Page, path: string[]) {
  for (const choiceId of path) {
    const before = await choices(page), offset = before.choices.findIndex((choice: { id: string }) => choice.id === choiceId);
    for (const [index, locked] of before.lockedChoices.entries()) {
      const choice = world.nodes[before.nodeId].choices.find(candidate => candidate.id === locked.id)!;
      assert.equal(await page.locator('.locked-choice small').nth(index).innerText(),
        choiceBlockers(choice, before, world.resources, clue => clueLabel(world.id, clue)).join('；'));
    }
    assert.equal(before.worldId, world.id);
    assert.ok(offset >= 0, `${before.nodeId}: ${choiceId} must really be enabled`);
    const next = world.nodes[before.nodeId].choices.find(choice => choice.id === choiceId)!.nextNodeId;
    await page.locator('.choice-button').nth(offset).click();
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, next);
    const after = await state(page);
    assert.equal(after.lastOutcome?.choiceId, choiceId, 'The real button must execute the requested choice, even when destinations coincide');
    assert.equal(after.choiceCount, before.choiceCount + 1);
    if (after.lastOutcome.clues.length) {
      const details = page.locator('.action-outcome');
      if (await details.getAttribute('open') === null) await details.locator('summary').click();
      assert.ok((await details.innerText()).includes(`新线索：${after.lastOutcome.clues.map((clue: string) => clueLabel(world.id, clue)).join('、')}`));
    }
  }
}
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    const book = page.locator(`.new-adaptation-list [data-project-id="${acceptance.projectId}"]`);
    if (art) await book.getByText(`原生4K画面 · ${art.progress.covered}/${art.progress.required} 审核通过`, { exact: true }).waitFor();
    await openBook(page);
    await page.screenshot({ path: resolve(output, `${viewport.name}-introduction.png`) });
    await beginStory(page);
    await page.getByRole('button', { name: '阅读设置', exact: true }).click();
    await page.locator('#reduced-motion').check(); await page.getByRole('button', { name: '完成', exact: true }).click();
    const opening = await choices(page); assert.equal(opening.choices.length, 3);
    await page.screenshot({ path: resolve(output, `${viewport.name}-opening.png`) }); await fit(page);
    const reading = page.locator('.text-reading .game-stage');
    if (await reading.count()) await reading.evaluate(stage => stage.scrollTo(0, stage.scrollHeight));
    await page.locator('.choice-button').first().click();
    const first = await choices(page); assert.ok(first.choices.length >= 2);
    await fit(page);
    if (await reading.count()) {
      await page.waitForFunction(() => document.querySelector('.text-reading .game-stage')?.scrollTop === 0);
      results.push({ viewport: viewport.name, textReadingLayout: true, nextSceneScrollReset: true });
    }
    const savedState = saveState(first);
    await page.screenshot({ path: resolve(output, `${viewport.name}-first-route.png`) });
    await page.locator('.game-bottomline .source-reader-link').click();
    assert.equal(await page.getByTestId('imported-source-text').textContent(), source.text);
    await page.screenshot({ path: resolve(output, `${viewport.name}-exact-source.png`) });
    await page.getByRole('button', { name: '继续当前故事' }).click(); assert.deepEqual(saveState(await state(page)), savedState);
    await page.getByRole('button', { name: '保存与载入', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).first().click();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出存档 01', exact: true }).click();
    const savePath = resolve(output, `${viewport.name}-save.json`); await (await download).saveAs(savePath);
    const exported = parseSaveFile(await readFile(savePath, 'utf8'));
    assert.equal(exported.storyId, acceptance.projectId); assert.equal(exported.worldId, world.id); assert.equal(exported.worldVersion, world.version);
    assert.equal(exported.nodeId, first.nodeId); assert.equal(exported.paragraphIndex + 1, first.paragraph);
    assert.deepEqual(exported.resources, first.resources); assert.deepEqual(exported.clues, first.clues);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '返回书库', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: /我的存档/ }).click();
    await loadSlot(page, '01', savedState);
    await page.getByRole('button', { name: '返回书库', exact: true }).click();
    await page.getByRole('button', { name: /我的存档/ }).click();
    await page.getByLabel('选择存档文件', { exact: true }).setInputFiles(savePath);
    const importDialog = page.getByRole('dialog', { name: '导入存档', exact: true });
    await importDialog.getByRole('heading', { name: world.title, exact: true }).waitFor();
    await importDialog.locator('#import-save-slot').selectOption('1');
    await importDialog.getByRole('button', { name: '导入到存档 02', exact: true }).click();
    await loadSlot(page, '02', savedState);
    results.push({ viewport: viewport.name, sourceExact: true, sourceReturn: true, saveRestore: true, persistedSaveRestore: true, exportedFileRestore: true, savePath });
    await page.getByRole('button', { name: '返回书库', exact: true }).click();
    await openBook(page);
    for (const [index, ending] of acceptance.endings.entries()) {
      if (index) await page.getByRole('button', { name: '重新开始', exact: true }).click();
      await beginStory(page);
      await followPath(page, ending.path);
      const final = await choices(page); assert.equal(final.mode, 'ending'); assert.equal(final.nodeId, ending.id); assert.equal(final.ending.tone, ending.tone);
      assert.equal(final.text, world.nodes[ending.id].text.join('\n\n')); assert.equal(await page.locator('.ending-prose').textContent(), final.text);
      await fit(page); await page.screenshot({ path: resolve(output, `${viewport.name}-${ending.id}.png`), fullPage: true });
      if (ending.id === 'return_with_luoli_13_signed') {
        const rawClues = [...final.clues];
        assert.ok(rawClues.includes('return_with_luoli_home_words'));
        assert.ok(!(await page.locator('body').innerText()).includes('return_with_luoli_'));
        await page.locator('.ending-actions').getByRole('button', { name: '回看剧情', exact: true }).click();
        await page.locator('#journal-tab-clues').click();
        assert.deepEqual(await page.locator('.clue-entry h3').allTextContents(), rawClues.map(clue => clueLabel(world.id, clue)));
        await page.screenshot({ path: resolve(output, `${viewport.name}-clue-journal.png`) });
        await page.locator('#journal-tab-history').click();
        assert.ok(!(await page.locator('#journal-panel').innerText()).includes('return_with_luoli_'));
        await page.screenshot({ path: resolve(output, `${viewport.name}-clue-history.png`) });
        await page.getByRole('button', { name: '关闭', exact: true }).click();
        assert.deepEqual((await state(page)).clues, rawClues, 'Display names must not rewrite game identities');
        results.push({ viewport: viewport.name, clueLabels: true, journalLabels: true, historyLabels: true, originalClueIdsPreserved: true });
      }
      await page.getByRole('button', { name: '阅读知乎原作节选', exact: true }).click();
      assert.equal(await page.getByTestId('imported-source-text').textContent(), source.text);
      await page.getByRole('button', { name: '继续当前故事' }).click(); assert.equal((await state(page)).nodeId, ending.id);
      results.push({ viewport: viewport.name, ending: ending.id, actualClicks: ending.path.length, fullEndingProse: true, sourceReturn: true });
      await writeFile(resolve(output, 'progress.json'), JSON.stringify(results, null, 2));
    }
    for (const entry of acceptance.pressureCoverage.filter(entry => entry.status === 'no-pressure-reachable')) {
      results.push({ viewport: viewport.name, routeId: entry.routeId, resourceId: entry.resourceId,
        pressureStatus: 'no-pressure-reachable', minimumObserved: entry.minimumObserved, minimumDecisionObserved: entry.minimumDecisionObserved });
    }
    for (const [index, pressure] of acceptance.pressureCases.entries()) {
      await page.getByRole('button', { name: '返回书库', exact: true }).first().click();
      await openBook(page);
      await beginStory(page);
      await followPath(page, pressure.path);
      const depleted = await choices(page);
      assert.equal(depleted.nodeId, pressure.nodeId); assert.equal(depleted.resources[pressure.resourceId], pressure.value);
      const node = world.nodes[pressure.nodeId], resource = world.resources!.find(item => item.id === pressure.resourceId)!;
      assert.equal(pressure.minimum, resource.min);
      if (pressure.kind === 'depleted') assert.equal(pressure.value, resource.min);
      else {
        assert.equal(pressure.kind, 'unaffordable');
        const costly = node.choices.find(choice => choice.id === pressure.costlyChoiceId);
        assert.ok(costly, 'The specifically recorded costly action must exist');
        assert.deepEqual(costPressure(costly, resource, depleted, world.resources ?? []), { cost: pressure.cost, requiredValue: pressure.requiredValue });
        assert.ok(!depleted.choices.some((choice: { id: string }) => choice.id === costly.id));
        const lockedIndex = depleted.lockedChoices.findIndex((choice: { id: string }) => choice.id === costly.id);
        assert.ok(lockedIndex >= 0, 'The costly action must actually be unavailable');
        const locked = page.locator('.locked-choice').nth(lockedIndex);
        assert.equal(await locked.getAttribute('aria-disabled'), 'true');
        assert.equal(await locked.locator('div').evaluate(element => Array.from(element.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('')), costly.text);
      }
      const exit = node.choices.find(choice => choice.id === pressure.exitChoiceId);
      assert.ok(exit && freeUnconditional(exit)); assert.equal(exit.nextNodeId, pressure.nextNodeId);
      await fit(page); await page.screenshot({ path: resolve(output, `${viewport.name}-pressure-${pressure.routeId}-${pressure.resourceId}-${index}.png`) });
      await followPath(page, [pressure.exitChoiceId]);
      assert.equal((await choices(page)).nodeId, pressure.nextNodeId);
      results.push({ viewport: viewport.name, actualPressureExit: true, actualDepletedExit: pressure.kind === 'depleted', costlyActionUnavailable: pressure.kind === 'unaffordable', ...pressure });
      await writeFile(resolve(output, 'progress.json'), JSON.stringify(results, null, 2));
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'passed', base, acceptanceFile, projectId: acceptance.projectId, version: acceptance.version, pressureCoverage: acceptance.pressureCoverage, results, errors }, null, 2));
  console.log(JSON.stringify({ output, status: 'passed', results }, null, 2));
} catch (error) {
  let index = 0;
  for (const context of browser.contexts()) for (const page of context.pages()) {
    const label = `failure-${index++}`;
    await page.screenshot({ path: resolve(output, `${label}.png`) }).catch(() => {});
    await page.locator('body').ariaSnapshot().then(snapshot => writeFile(resolve(output, `${label}.aria.txt`), snapshot)).catch(() => {});
  }
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ status: 'failed', base, results, errors, error: String(error) }, null, 2));
  console.log(output); throw error;
} finally { await browser.close(); }
