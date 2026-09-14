/** Live Catalog A acceptance. All progress is produced by UI clicks, never seeded.
 * Run: npx tsx scripts/catalog-a-browser-acceptance.ts [--audit-only] [--limit=1] [--failed=ending_a,ending_b] [--retry-from=DIR]
 * The path table is the authored handoff contract, not a substitute game engine.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import type { GameWorld } from '../shared/types.ts';
import { choose, startSession } from '../src/game.ts';

const base = process.env.CATALOG_A_URL ?? 'http://127.0.0.1:4173';
// Capture the actual display:swap rendering without waiting indefinitely for
// external fonts. This affects Playwright's wait only, not CSS or font requests.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const output = resolve('output/playwright/catalog-a-live', new Date().toISOString().replace(/[:.]/g, '-'));
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const write = async (file: string, data: unknown) => writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
const paths = [
  ['happy-home', '1747681485547843585', 'ending_erased', 'roster_restore relay_all', 'ending_roster', 'route_neighbors relay_mark relay_thread relay_test relay_wedge enter_roster_offer roster_preview roster_sell'],
  ['happy-home', '1747681485547843585', 'ending_broadcast', 'roof_pull_plug roof_depart', 'ending_off_air', 'route_roof roof_climb roof_trace roof_copy roof_anchor enter_roof_feed roof_preview_upload roof_complete_upload'],
  ['rotten-pilgrimage', '1617220591035113472', 'ending_false_court', 'sea_tear_roll sea_stay', 'ending_sea', 'route_sea sea_down sea_residents sea_ring sea_break_seal enter_sea_exchange sea_lend_names sea_finish_court'],
  ['rotten-pilgrimage', '1617220591035113472', 'ending_lost_gate', 'gate_retract_vouch gate_close', 'ending_heaven', 'route_heaven gate_show gate_screen gate_feed gate_prepare enter_gate_cargo gate_vouch_cargo gate_hide_cargo'],
  ['ming-whisper', '1654134122145320960', 'ending_impounded', 'canal_withdraw_seal canal_guard_family', 'ending_exile', 'route_family canal_pawn canal_ask_again canal_show_letter canal_share_space enter_canal_seal canal_try_forgery canal_stamp_forgery'],
  ['ming-whisper', '1654134122145320960', 'ending_broken_column', 'escort_correct_roll escort_stay', 'ending_field', 'route_escort escort_take_grain escort_detour escort_feed escort_kitchens enter_escort_muster escort_stage_muster escort_sign_false'],
  ['score-room', '2050600604976803918', 'ending_wrong_range', 'solo_cross_equality solo_keep_practice', 'ending_real', 'route_solo solo_try solo_correct solo_design solo_twentyfour enter_solo_shortcut solo_copy_old solo_submit_old'],
  ['score-room', '2050600604976803918', 'ending_broken_study', 'wen_correct_blame', 'ending_class', 'route_wen wen_compare wen_submit wen_rewrite wen_regular wen_apply enter_wen_blame wen_shift_blame wen_insist_blame'],
  ['online-heir', '1981680284933063553', 'ending_lost_project', 'project_admit_data project_stay_city', 'ending_career', 'route_project project_accept project_restore project_ask_distance project_finish enter_project_numbers project_send_draft project_hide_data'],
  ['online-heir', '1981680284933063553', 'ending_exposed_chat', 'dinner_delete_preview dinner_restart', 'ending_restart', 'route_dinner dinner_open dinner_truth dinner_return dinner_accept_host enter_dinner_screenshot dinner_preview_private dinner_post_private'],
  ['black-flood', '1775834953454288896', 'ending_broken_tide', 'river_wash_brand river_part', 'ending_sea', 'route_river river_follow river_trade river_refuse river_treat enter_river_brand river_test_brand river_seal_brand'],
  ['black-flood', '1775834953454288896', 'ending_lost_class', 'arena_restore_page arena_take_class', 'ending_teacher', 'route_arena arena_register arena_shield arena_disarm arena_lastward enter_arena_record arena_remove_page arena_insist_false'],
  ['radish-court', '1985108790006277782', 'ending_lost_convoy', 'frontier_unload_cart frontier_stay', 'ending_frontier', 'route_frontier frontier_chart frontier_permission frontier_ford frontier_join enter_frontier_marker frontier_test_loaded frontier_force_cart'],
  ['radish-court', '1985108790006277782', 'ending_closed_kitchen', 'market_revise_debt market_stay_public', 'ending_kitchen', 'route_kitchen market_start market_share_work market_accept_grain market_thin enter_market_pledge market_promise_five market_take_seed'],
  ['harvest-box', '1986486345988851330', 'ending_washed_harvest', 'sect_plug_cut sect_truce', 'ending_truce', 'route_sect sect_demand sect_remove_seal sect_reject_return sect_village enter_sect_sword sect_trial_cut sect_finish_cut'],
  ['harvest-box', '1986486345988851330', 'ending_lost_mill', 'mill_cancel_pledge mill_open', 'ending_mill', 'route_mill mill_inspect mill_clear mill_adjust mill_limit enter_mill_pledge mill_offer_deposit mill_ship_others'],
].map(([worldId, storyId, failed, alternative, avoided, failedPath]) => ({ worldId, storyId, failed, avoided, alternative: alternative.split(' '), path: failedPath.split(' ') }));
type Route = typeof paths[number];
type UIState = { mode: string; nodeId?: string; worldId?: string; text?: string; paragraph?: number; paragraphCount?: number; textComplete?: boolean; choiceCount?: number; resources?: Record<string, number>; clues?: string[]; resolve?: number; trust?: number; history?: { nodeId: string; choiceId?: string }[]; choices?: { id: string; text: string }[]; ending?: { title: string; tone: string }; [key: string]: unknown };
const state = async (page: Page) => JSON.parse(await page.evaluate(() => window.render_game_to_text!())) as UIState;
const stable = (s: UIState) => ({ worldId: s.worldId, nodeId: s.nodeId, text: s.text, paragraph: s.paragraph, resources: s.resources, clues: s.clues, resolve: s.resolve, trust: s.trust, history: s.history, choices: s.choices });

await mkdir(output, { recursive: true });
console.log(`CATALOG_A_OUTPUT=${output}`);
const worlds = new Map<string, GameWorld>();
const sourceTexts = new Map<string, string>();
const manifest: { worldId: string; storyId: string; version: string; sha256: string; bytes: number; fetchedAt: string; nodes: number; file: string }[] = [];
for (const { worldId, storyId } of paths.filter((r, i, all) => all.findIndex(x => x.worldId === r.worldId) === i)) {
  const response = await fetch(`${base}/api/worlds/${storyId}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  const world = JSON.parse(bytes.toString('utf8')) as GameWorld;
  assert.equal(world.id, worldId); assert.equal(world.version, '1.1.0'); assert.equal(Object.keys(world.nodes).length, 37);
  for (const route of paths.filter(r => r.worldId === worldId)) assert.equal(world.nodes[route.failed]?.ending?.tone, 'dark');
  const file = resolve(output, `served-${worldId}.json`);
  await writeFile(file, bytes);
  manifest.push({ worldId, storyId, version: world.version, sha256: sha(bytes), bytes: bytes.length, fetchedAt: new Date().toISOString(), nodes: Object.keys(world.nodes).length, file });
  worlds.set(worldId, world);
  const source = JSON.parse(await readFile(`.local/zhihu-cache/story-${storyId}.json`, 'utf8')).data;
  assert.equal(source.author_name, world.source.author);
  assert.equal(source.chapter_name, world.source.title);
  sourceTexts.set(worldId, source.content);
}
// Check the handoff's IDs and gates before opening browsers. The sessions here
// are discarded; browser progress below is still produced solely by UI actions.
for (const route of paths) {
  for (const variant of ['failed', 'avoided']) {
    const ids = variant === 'failed' ? route.path : [...route.path.slice(0, -1), ...route.alternative];
    let session = startSession(worlds.get(route.worldId)!);
    for (const id of ids) {
      const choice = session.choices.find(candidate => candidate.id === id);
      assert.ok(choice, `${route.worldId}/${session.node.id}: preflight rejected ${id}`);
      session = choose(session, choice);
    }
    assert.equal(session.node.id, variant === 'failed' ? route.failed : route.avoided);
  }
}
await write(resolve(output, 'served-manifest.json'), { base, started: new Date().toISOString(), worlds: manifest, paths });
await writeFile(resolve(output, 'copy-review.txt'), [...worlds.values()].map(w => `# ${w.id}\n${w.title}\n${w.subtitle}\n${w.introduction.join('\n')}\n身份：${JSON.stringify(w.player)}\n目标：${w.objective}\n${JSON.stringify(w.mechanics)}\n${JSON.stringify(w.resources)}\n${JSON.stringify(w.characters)}\n`).join('\n'), 'utf8');
console.log(JSON.stringify(manifest));
if (process.argv.includes('--audit-only')) process.exit(0);

const retryDirectory = process.argv.find(a => a.startsWith('--retry-from='))?.slice('--retry-from='.length);
const results: Record<string, unknown>[] = [];
if (retryDirectory) {
  assert.ok(!process.argv.some(a => a.startsWith('--limit=')), 'Retry a completed batch without --limit');
  const previous = JSON.parse(await readFile(resolve(retryDirectory, 'results.json'), 'utf8'));
  assert.ok(previous.finished, 'Wait for the previous batch to finish before retrying');
  for (const result of previous.results) {
    const currentHash = manifest.find(m => m.worldId === result.worldId)?.sha256;
    if (result.status === 'passed' && result.layoutIssues.length === 0 && result.errorCount === 0 && result.uiHash === currentHash) results.push(result);
  }
}
const carriedPasses = results.length;
const caseName = (test: { route: Route; viewport: string; variant: string }) => `${test.route.worldId}--${test.route.failed}--${test.viewport}--${test.variant}`;
const inherited = new Set(results.map(r => r.name));
// PowerShell may flatten an unquoted comma list into one whitespace-delimited
// argument, so accept either delimiter without weakening the endpoint allowlist.
const requestedFailures = new Set(process.argv.filter(argument => argument.startsWith('--failed=')).flatMap(argument => argument.slice('--failed='.length).split(/[\s,]+/)).filter(Boolean));
if (requestedFailures.size) {
  const unknown = [...requestedFailures].filter(id => !paths.some(route => route.failed === id));
  assert.deepEqual(unknown, [], `Unknown Catalog A failed ending filter: ${unknown.join(', ')}`);
  assert.ok(!retryDirectory, 'Use either --failed or --retry-from, not both');
}
const selectedPaths = paths.filter(route => !requestedFailures.size || requestedFailures.has(route.failed));
const cases = selectedPaths.flatMap(route => ['desktop', 'mobile'].flatMap(viewport => ['failed', 'avoided'].map(variant => ({ route, viewport, variant })))).filter(test => !inherited.has(caseName(test)));
const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.slice(8) ?? cases.length);
const planned = carriedPasses + Math.min(limit, cases.length);
const provenance = { retryFrom: retryDirectory ? resolve(retryDirectory) : null, carriedPasses, planned };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
// Every case has a separate storage namespace and browser context. No CDP attach.
async function runCase(test: typeof cases[number]) {
  const { route, viewport, variant } = test;
  const name = caseName(test);
  const dir = resolve(output, name); await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: viewport === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 960 }, isMobile: viewport === 'mobile', hasTouch: viewport === 'mobile', deviceScaleFactor: 1 });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const network: unknown[] = [], errors: string[] = [], layouts: unknown[] = [], steps: unknown[] = [], readText: unknown[] = [];
  const pending: Promise<void>[] = [];
  const world = worlds.get(route.worldId)!;
  const expectedHash = manifest.find(m => m.worldId === route.worldId)!.sha256;
  let uiHash = '';
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (!response.url().includes('/api/')) return;
    const p = (async () => {
      const body = await response.body();
      const record = { url: response.url(), method: response.request().method(), status: response.status(), sha256: sha(body), bytes: body.length };
      network.push(record);
      if (response.url() === `${base}/api/worlds/${route.storyId}`) { uiHash = record.sha256; await writeFile(resolve(dir, 'ui-world-response.json'), body); }
      if (response.url() === `${base}/api/stories/${route.storyId}`) await writeFile(resolve(dir, 'ui-source-response.json'), body);
    })().catch(error => { errors.push(`response capture: ${String(error)}`); });
    pending.push(p);
  });
  page.on('requestfailed', r => network.push({ url: r.url(), failed: r.failure(), method: r.method() }));
  const screenshot = async (label: string) => {
    await page.screenshot({ path: resolve(dir, `${label}.png`), fullPage: true, animations: 'disabled' });
    await write(resolve(dir, `${label}.fonts.json`), await page.evaluate(() => ({ status: document.fonts.status, faces: [...document.fonts].map(font => ({ family: font.family, weight: font.weight, status: font.status })) })));
    await writeFile(resolve(dir, `${label}.aria.txt`), await page.locator('body').ariaSnapshot(), 'utf8');
    await write(resolve(dir, `${label}.state.json`), await state(page));
  };
  const layout = async (label: string) => {
    // Keep nested browser helpers out of tsx's function-name transform.
    const check = await page.evaluate<{ issues: string[]; [key: string]: unknown }>(`(() => {
      const box = (selector) => { const el = document.querySelector(selector); if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }; };
      const footer = box('.game-bottomline'), dialogue = box('.dialogue-panel'), text = box('.dialogue-text'), choices = box('.choice-region'), ending = box('.ending-content'), endingViewport = box('.ending-view'), prose = box('.ending-prose'), stats = box('.ending-stats'), body = box('[role=dialog] .modal-body'), modalFooter = box('[role=dialog] .modal-footer');
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('horizontal-overflow');
      if (!document.querySelector('[role=dialog]')) {
        if (dialogue && footer && dialogue.bottom > footer.top + 1) issues.push('dialogue/footer-overlap');
        if (text && footer && text.bottom > footer.top + 1) issues.push('text/footer-overlap');
        if (choices && dialogue && choices.bottom > dialogue.top + 1) issues.push('choices/dialogue-overlap');
        if (ending && endingViewport && footer && Math.min(ending.bottom, endingViewport.bottom) > footer.top + 1) issues.push('ending/footer-overlap');
        if (prose && stats && prose.bottom > stats.top + 1) issues.push('ending-text/stats-overlap');
      }
      if (body && modalFooter && body.bottom > modalFooter.top + 1) issues.push('modal-text/footer-overlap');
      return { viewport: { width: innerWidth, height: innerHeight }, footer, dialogue, text, choices, ending, endingViewport, prose, stats, body, modalFooter, issues };
    })()`);
    layouts.push({ label, ...check });
  };
  const ready = async () => {
    for (let i = 0; i < 40; i++) {
      const s = await state(page);
      if (s.mode === 'ending') { assert.equal(await page.locator('.ending-prose').innerText(), s.text); await layout(`${s.nodeId}:ending`); readText.push({ nodeId: s.nodeId, text: s.text }); return s; }
      if (s.textComplete) { assert.equal(await page.locator('.dialogue-text').innerText(), s.text); await layout(`${s.nodeId}:paragraph-${s.paragraph}`); readText.push({ nodeId: s.nodeId, paragraph: s.paragraph, text: s.text }); }
      if (s.choices?.length) return s;
      const button = page.getByRole('button', { name: /^(显示全文|继续)$/ });
      if (await button.count()) await button.click();
      await page.waitForTimeout(35);
    }
    throw new Error(`No playable choices: ${JSON.stringify(await state(page))}`);
  };
  const clickChoice = async (id: string) => {
    const before = await ready();
    const index = before.choices?.findIndex(c => c.id === id) ?? -1;
    assert.ok(index >= 0, `${before.nodeId}: no enabled ${id}`);
    const expected = world.nodes[before.nodeId!].choices.find(c => c.id === id)!;
    // Locator comes from the freshly observed UI choice list, not hidden app state.
    const button = page.locator('.choice-button').nth(index);
    assert.ok((await button.innerText()).includes(expected.text));
    await button.click();
    await page.waitForFunction(nodeId => JSON.parse(window.render_game_to_text!()).nodeId === nodeId, expected.nextNodeId);
    const after = await ready();
    for (const resource of world.resources ?? []) assert.ok(after.resources![resource.id] >= resource.min && after.resources![resource.id] <= resource.max);
    steps.push({ choiceId: id, visibleText: expected.text, before: stable(before), after: stable(after) });
    return after;
  };
  const readerRoundtrip = async (label: string) => {
    const before = await ready();
    await page.locator('.game-bottomline .source-reader-link').click();
    await page.locator('.source-reader-prose').waitFor();
    const reader = await state(page);
    assert.equal(reader.mode, 'source-reader'); assert.equal(reader.storyId, route.storyId); assert.equal(reader.gamePaused, true);
    assert.equal(reader.text, sourceTexts.get(route.worldId)); assert.equal(reader.author, world.source.author);
    await layout(`${label}:reader`); await screenshot(`${label}-reader-top`);
    await page.locator('.source-reader-prose').hover(); await page.mouse.wheel(0, 10000); await page.waitForTimeout(80);
    await layout(`${label}:reader-bottom`); await screenshot(`${label}-reader-bottom`);
    await page.getByRole('button', { name: '继续当前故事', exact: true }).click();
    const after = await ready(); assert.deepEqual(stable(after), stable(before));
    await write(resolve(dir, `${label}-return.json`), { before: stable(before), after: stable(after), source: { storyId: reader.storyId, author: reader.author, contentScope: reader.contentScope, contentSha256: sha(String(reader.text)), length: String(reader.text).length } });
  };
  let status = 'passed', issue: string | null = null, final: UIState | null = null;
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: '搜索标题、作者或关键词' }).fill(world.source.title);
    const card = page.locator('.story-card').filter({ has: page.getByRole('heading', { name: world.source.title, exact: true }) });
    await card.waitFor(); await screenshot('01-story-selection');
    await card.getByRole('button', { name: '玩改编', exact: true }).click();
    await page.getByRole('dialog', { name: '翻开第一页之前' }).waitFor();
    // Exercise the actual tutorial, not the persisted skip flag.
    await page.getByRole('button', { name: /调查值班记录/ }).click();
    await page.getByRole('button', { name: '用两条线索核对日期' }).click();
    await layout('tutorial'); await screenshot('02-tutorial');
    await page.getByRole('button', { name: '认识这个世界', exact: true }).click();
    await page.getByRole('dialog', { name: '世界序章' }).waitFor();
    await layout('introduction-top'); await screenshot('03-introduction-top');
    await page.locator('.world-intro').hover(); await page.mouse.wheel(0, 10000); await page.waitForTimeout(100);
    await layout('introduction-bottom'); await screenshot('04-introduction-bottom');
    await page.getByRole('dialog', { name: '世界序章', exact: true }).getByRole('button', { name: /^(开始故事|以.*的身份醒来)$/ }).click();
    await page.getByRole('button', { name: '阅读设置', exact: true }).click();
    await page.getByLabel('减少动态效果', { exact: false }).check();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    const opening = await ready(); assert.equal(opening.nodeId, world.startNodeId);
    await Promise.all(pending); assert.equal(uiHash, expectedHash, 'UI must use the exact audited live world bytes');
    await screenshot('05-opening');
    const prefix = route.path.slice(0, -1);
    for (const id of prefix) await clickChoice(id);
    const decision = await ready();
    assert.ok(decision.choices!.some(c => c.id === route.path.at(-1)));
    assert.ok(decision.choices!.some(c => c.id === route.alternative[0]));
    await screenshot('06-last-decision');
    // Original reader is tested in every independently started case, at the risky choice.
    await readerRoundtrip('07-decision');
    const replayCase = route.failed === 'ending_erased' && variant === 'failed';
    if (replayCase) {
      await page.getByRole('button', { name: '保存与载入', exact: true }).click();
      await page.getByRole('button', { name: '保存', exact: true }).first().click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出存档 01', exact: true }).click();
      await (await download).saveAs(resolve(dir, 'decision-manual-save.json'));
      await screenshot('08-manual-save');
      await page.getByRole('button', { name: '关闭', exact: true }).click();
    }
    for (const id of variant === 'failed' ? [route.path.at(-1)!] : route.alternative) await clickChoice(id);
    final = await ready();
    assert.equal(final.mode, 'ending'); assert.equal(final.nodeId, variant === 'failed' ? route.failed : route.avoided);
    assert.equal(final.ending?.tone === 'dark', variant === 'failed');
    assert.ok(String(final.text).length > 100);
    await screenshot('09-ending');
    // The shared UI names this semantic landmark; retain the historical class
    // as a fallback while its presentation is being migrated.
    const endingSource = page.locator('.ending-source').or(page.getByRole('region', { name: '原作与这次改编', exact: true })).first();
    await endingSource.scrollIntoViewIfNeeded(); await layout('ending-bottom'); await screenshot('10-ending-bottom');
    await write(resolve(dir, 'terminal-auto-save.json'), await page.evaluate(() => JSON.parse(localStorage.getItem('redleaf.auto.v1')!)));
    if (replayCase) {
      const failed = final;
      // Real page reload, native manual-slot restore. Export is evidence only: never imported.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /我的存档/ }).click();
      await page.locator('.save-slot').nth(1).getByRole('button', { name: '载入', exact: true }).click();
      await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, decision.nodeId);
      assert.deepEqual(stable(await ready()), stable(decision));
      await screenshot('11-reloaded-manual-decision');
      for (const id of route.alternative) await clickChoice(id);
      const avoided = await ready(); assert.equal(avoided.nodeId, route.avoided);
      await screenshot('12-restored-avoided-ending'); await readerRoundtrip('13-ending');
      // Native rewind from failure can change the last decision too.
      await page.getByRole('button', { name: '保存与载入', exact: true }).click();
      await page.locator('.save-slot').nth(1).getByRole('button', { name: '载入', exact: true }).click();
      await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id && !JSON.parse(window.render_game_to_text!()).modal, decision.nodeId, { polling: 100 });
      await clickChoice(route.path.at(-1)!);
      await page.getByRole('button', { name: '重选上一步', exact: true }).click();
      await screenshot('14-rewind-confirmation');
      await page.getByRole('button', { name: '返回选择', exact: true }).click();
      await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id && !JSON.parse(window.render_game_to_text!()).modal, decision.nodeId, { polling: 100 });
      assert.deepEqual(stable(await ready()), stable(decision));
      for (const id of route.alternative) await clickChoice(id);
      assert.equal((await ready()).nodeId, route.avoided);
      // Ending collection must retain both routes across restore/rewind.
      const collection = await page.evaluate(() => JSON.parse(localStorage.getItem('redleaf.endings.v1')!)) as { nodeId: string }[];
      assert.ok(collection.some(e => e.nodeId === route.failed)); assert.ok(collection.some(e => e.nodeId === route.avoided));
      await page.getByRole('button', { name: /^(重新开始|翻开另一种可能)$/ }).click();
      await page.getByRole('dialog', { name: '世界序章', exact: true }).getByRole('button', { name: /^(开始故事|以.*的身份醒来)$/ }).click();
      await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id && !JSON.parse(window.render_game_to_text!()).modal, world.startNodeId, { polling: 100 });
      const restarted = await ready(); assert.equal(restarted.nodeId, world.startNodeId); assert.equal(restarted.choiceCount, 0);
      await screenshot('15-replay-opening');
      for (const id of [...prefix, ...route.alternative]) await clickChoice(id);
      assert.equal((await ready()).nodeId, route.avoided);
      await screenshot('16-replay-avoided-ending');
      await write(resolve(dir, 'replay-save-restore.json'), { failed: stable(failed), avoided: stable(avoided), restoredDecision: stable(decision), collection, manualRestoreAfterReload: true, rewind: true, replayFromOpening: true });
    }
    assert.equal(errors.length, 0, errors.join('\n'));
  } catch (error) {
    status = 'failed'; issue = error instanceof Error ? error.stack ?? error.message : String(error);
    try { await screenshot('FAILURE'); } catch { /* preserve earlier artifacts */ }
  } finally {
    await Promise.all(pending);
    await write(resolve(dir, 'steps.json'), steps); await write(resolve(dir, 'read-text.json'), readText);
    await write(resolve(dir, 'layout.json'), layouts); await write(resolve(dir, 'network.json'), network);
    await write(resolve(dir, 'errors.json'), errors);
    await context.storageState({ path: resolve(dir, 'browser-storage-state.json') });
    await context.tracing.stop({ path: resolve(dir, 'trace.zip') });
    await context.close();
  }
  const layoutIssues = layouts.filter((l: any) => l.issues.length);
  const result = { name, worldId: route.worldId, viewport, variant, status, issue, expectedEnding: variant === 'failed' ? route.failed : route.avoided, actualEnding: final?.nodeId, title: final?.ending?.title, tone: final?.ending?.tone, uiHash, expectedHash, layoutIssues, errorCount: errors.length, path: [...route.path.slice(0, -1), ...(variant === 'failed' ? [route.path.at(-1)!] : route.alternative)], dir };
  await write(resolve(dir, 'result.json'), result); results.push(result);
  console.log(`${status.toUpperCase()} ${name} -> ${final?.nodeId ?? '-'} (${layoutIssues.length} layout issues)${issue ? `\n${issue}` : ''}`);
  await write(resolve(output, 'results.json'), { base, output, completed: results.length, ...provenance, manifest, results });
}
try {
  // Two workers, fresh contexts per case; only GETs to existing public story APIs.
  let index = 0;
  await Promise.all([0, 1].map(async () => { while (index < Math.min(limit, cases.length)) await runCase(cases[index++]); }));
} finally { await browser.close(); }
// Write once more after both workers have stopped so the final file cannot be
// replaced by an earlier worker's in-flight progress snapshot.
await write(resolve(output, 'results.json'), { base, output, finished: new Date().toISOString(), completed: results.length, executedThisRun: results.length - carriedPasses, ...provenance, manifest, results });
console.log(`DONE ${results.length} cases (${results.length - carriedPasses} new, ${carriedPasses} inherited with identical live bytes). ${output}`);
if (results.some(r => r.status !== 'passed' || (r.layoutIssues as unknown[]).length)) process.exitCode = 1;
