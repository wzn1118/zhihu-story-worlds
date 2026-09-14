import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { authoredWorlds } from '../content/worlds.ts';
import { defaultSettings, storageKeys } from '../src/game.ts';
import type { GameWorld } from '../shared/types.ts';
import type { ArtBatch } from '../shared/production.ts';

// This verifier only reads the running preview; all writes stay in its evidence directory.
const base = process.env.APPROVED_ART_URL ?? 'http://127.0.0.1:4183';
const root = resolve('output/playwright/approved-art-integration');
const output = resolve(root, new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const targetIds = ['happy-home', 'ming-whisper', 'score-room', 'black-flood', 'harvest-box', 'double-pursuit'];
const report: any = {
  schemaVersion: 2, startedAt: new Date().toISOString(), base, output, status: 'running',
  scope: 'Six approved portraits and double-pursuit/window scene; real GET APIs and real browser clicks at reading and choice phases',
  previousReport: resolve(root, '2026-09-10T04-30-29-895Z/verification.json'), previousReportsPreserved: true,
  textModeScope: 'The current UI has no separate text-only switch. Verify real paragraph reading and fully exposed choices, including mobile.',
  fixturesUsed: false, apiMocksUsed: false, serviceRestarts: 0, generationLaunched: false,
  paidRequests: 0, productionWrites: 0, worlds: [], assets: [], visits: [], clicks: [],
  pageErrors: [], consoleErrors: [], failedRequests: [], httpErrors: [], nonGetAttempts: [],
  actualNonGetRequests: [], apiReads: [], browserWorldResponses: [], browserManifestResponses: [], findings: [], historicalBackgroundIssues: [],
  visualReview: { status: 'pending-human-image-inspection', screenshots: [] },
};
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
async function persist() {
  report.updatedAt = new Date().toISOString();
  await writeFile(resolve(output, 'verification.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(root, 'latest.json'), JSON.stringify({ report: resolve(output, 'verification.json'), status: report.status, updatedAt: report.updatedAt, findings: report.findings }, null, 2));
}
async function getJson(path: string, expected = 200) {
  const start = Date.now();
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(45000) });
  const text = await response.text();
  report.apiReads.push({ url: response.url, method: 'GET', status: response.status, elapsedMs: Date.now() - start, sha256: sha(text) });
  assert.equal(response.status, expected, path);
  return JSON.parse(text);
}
async function state(page: Page) { return JSON.parse(await page.evaluate(() => window.render_game_to_text!())); }
async function decisions(page: Page, worldId: string, viewport: string) {
  for (let i = 0; i < 90; i++) {
    const s = await state(page);
    if (s.mode === 'ending' || s.choices?.length) return s;
    const next = page.locator('button.dialogue-next');
    if (await next.isVisible()) {
      const label = await next.innerText();
      await next.click();
      report.clicks.push({ viewport, worldId, kind: 'dialogue', nodeId: s.nodeId, paragraph: s.paragraph, label });
    }
    await page.waitForTimeout(60);
  }
  throw new Error(`${worldId}: choices did not become available`);
}
const targets: Record<string, { nodeId: string; characterId?: string; path: string[] }[]> = {
  'happy-home': [{ nodeId: 'arrival', characterId: 'hong', path: [] }, { nodeId: 'door', characterId: 'player', path: [] }],
  'ming-whisper': [{ nodeId: 'queen_aid', characterId: 'queen', path: [] }],
  'score-room': [{ nodeId: 'diagnosis', characterId: 'li', path: [] }],
  'black-flood': [{ nodeId: 'selection', characterId: 'changying', path: [] }],
  'harvest-box': [{ nodeId: 'separation', characterId: 'chen', path: [] }],
  'double-pursuit': [{ nodeId: 'window', path: [] }],
};

// Compute a bounded graph path only as a click plan; the real UI must offer every choice.
function route(world: GameWorld, target: string): string[] {
  const queue = [{ nodeId: world.startNodeId, path: [] as string[] }];
  const seen = new Set<string>();
  for (const entry of queue) {
    if (entry.nodeId === target) return entry.path;
    if (seen.has(entry.nodeId)) continue;
    seen.add(entry.nodeId);
    for (const choice of world.nodes[entry.nodeId].choices) queue.push({ nodeId: choice.nextNodeId, path: [...entry.path, choice.id] });
  }
  throw new Error(`${world.id}/${target}: no graph path`);
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let currentPage: Page | undefined;
try {
  const collectionResponse = await fetch(new URL('/api/worlds', base), { signal: AbortSignal.timeout(15000) });
  report.collectionEndpoint = { url: collectionResponse.url, status: collectionResponse.status, body: await collectionResponse.text(), actualWorldRoute: '/api/worlds/{storyId}' };
  const worlds = new Map<string, GameWorld>();
  for (const id of targetIds) {
    const authored = authoredWorlds.find(world => world.id === id);
    assert.ok(authored, `${id} must be exported through content/worlds.ts`);
    const world = await getJson(`/api/worlds/${authored.storyId}`) as GameWorld;
    assert.equal(world.id, id);
    worlds.set(id, world);
    await writeFile(resolve(output, `${id}.world.json`), JSON.stringify(world, null, 2));
    report.worlds.push({ id, storyId: authored.storyId, title: world.title, version: world.version, source: world.source, startNodeId: world.startNodeId,
      approvedCharacters: world.characters.filter(c => c.portrait?.startsWith('/generated-art/')).map(c => ({ id: c.id, name: c.name, url: c.portrait })),
      nodeCount: Object.keys(world.nodes).length, mappedNodes: Object.values(world.nodes).filter(n => n.character || n.speaker).map(n => ({ nodeId: n.id, speaker: n.speaker ?? null, character: n.character ?? null })) });
  }
  const batches = (await getJson('/api/art/batches')).batches as ArtBatch[];
  await mkdir(resolve(output, 'original-png'), { recursive: true });
  for (const world of worlds.values()) for (const entry of [
    ...world.characters.filter(c => c.portrait?.startsWith('/generated-art/')).map(character => ({ kind: 'character', character, nodeId: null, url: character.portrait! })),
    ...(world.id === 'double-pursuit' ? [{ kind: 'scene', character: null, nodeId: 'window', url: world.nodes.window.background }] : []),
  ]) {
    const { url, character } = entry;
    const response = await fetch(new URL(url, base), { signal: AbortSignal.timeout(45000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const job = batches.filter(b => b.worldId === world.id).flatMap(b => b.jobs).find(j => j.asset?.url === url);
    assert.equal(response.status, 200, url);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const actualSha256 = sha(bytes);
    const localBytes = await readFile(resolve('public', `.${url}`));
    const rawPath = resolve(output, 'original-png', basename(url));
    await writeFile(rawPath, bytes);
    const evidence = { kind: entry.kind, worldId: world.id, nodeId: entry.nodeId, characterId: character?.id ?? null, characterName: character?.name ?? null, url, absoluteUrl: response.url, status: response.status,
      contentType: response.headers.get('content-type'), bytes: bytes.length, sha256: actualSha256, localSha256: sha(localBytes),
      expectedSha256: job?.asset?.sha256 ?? null, shaMatchesPublishedJob: job?.asset?.sha256 === actualSha256, shaMatchesLocalOriginal: sha(localBytes) === actualSha256,
      pngWidth: bytes.readUInt32BE(16), pngHeight: bytes.readUInt32BE(20), rawPath, job: job ? { id: job.id, state: job.state, stale: job.stale, assetKind: job.assetKind, review: job.review, asset: job.asset } : null };
    report.assets.push(evidence);
    assert.ok(evidence.shaMatchesPublishedJob && evidence.shaMatchesLocalOriginal, `${url}: SHA mismatch`);
  }
  assert.equal(report.assets.filter((a: any) => a.kind === 'character').length, 6, 'Expected six current character mother images');
  assert.equal(report.assets.filter((a: any) => a.kind === 'scene').length, 1, 'Expected the approved window scene');
  report.assetValidationPassed = true;
  const missing = report.worlds.filter((w: any) => w.approvedCharacters.length && !w.mappedNodes.length);
  if (missing.length) report.findings.push({ severity: 'P1', code: 'CHARACTER_MAPPING_MISSING', worlds: missing.map((w: any) => w.id), description: 'Live APIs contain character portraits, but nodes contain neither character nor speaker; the current renderer cannot select those characters.' });
  await persist();
  console.log(JSON.stringify({ phase: 'api-and-sha-complete', assets: report.assets.length, missingMappingWorlds: missing.map((w: any) => w.id), output }));

  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/10847/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe', headless: true });
  const decodeContext = await browser.newContext();
  await decodeContext.route('**/*', async r => { if (r.request().method() === 'GET') await r.continue(); else { report.nonGetAttempts.push({ phase: 'decode', method: r.request().method(), url: r.request().url(), blocked: true }); await r.abort(); } });
  const decodePage = await decodeContext.newPage();
  for (const asset of report.assets) {
    await decodePage.goto(asset.absoluteUrl, { waitUntil: 'load' });
    const decoded = await decodePage.locator('img').evaluate(async (img: HTMLImageElement) => { await img.decode(); return { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, complete: img.complete, currentSrc: img.currentSrc }; });
    asset.browserDecode = decoded;
    assert.equal(decoded.naturalWidth, asset.pngWidth); assert.equal(decoded.naturalHeight, asset.pngHeight);
  }
  await decodeContext.close();
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    for (const world of worlds.values()) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile', serviceWorkers: 'block' });
      context.setDefaultTimeout(30000);
      await context.route('**/*', async r => {
        if (r.request().method() === 'GET') return r.continue();
        report.nonGetAttempts.push({ viewport: viewport.name, worldId: world.id, method: r.request().method(), url: r.request().url(), blocked: true });
        await r.abort('blockedbyclient');
      });
      // Only isolated browser preferences are seeded; no game state or story is injected.
      await context.addInitScript(({ keys, settings }) => { localStorage.setItem(keys.onboarding, 'true'); localStorage.setItem(keys.settings, JSON.stringify(settings)); }, { keys: storageKeys, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
      const page = await context.newPage(); currentPage = page;
      const scope = { viewport: viewport.name, worldId: world.id };
      const pendingResponses: Promise<void>[] = [];
      page.on('pageerror', e => report.pageErrors.push({ ...scope, message: e.message }));
      page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push({ ...scope, message: m.text() }); });
      page.on('requestfailed', r => report.failedRequests.push({ ...scope, url: r.url(), method: r.method(), failure: r.failure() }));
      page.on('response', r => {
        if (r.status() >= 400) report.httpErrors.push({ ...scope, url: r.url(), status: r.status() });
        if (r.request().method() !== 'GET') report.actualNonGetRequests.push({ ...scope, url: r.url(), method: r.request().method(), status: r.status() });
        if (r.url().includes('/api/worlds/')) pendingResponses.push((async () => {
          const text = await r.text(); const live = JSON.parse(text);
          report.browserWorldResponses.push({ ...scope, url: r.url(), status: r.status(), sha256: sha(text), targetNodes: targets[world.id].map(t => ({ nodeId: t.nodeId, character: live.nodes?.[t.nodeId]?.character ?? null, background: live.nodes?.[t.nodeId]?.background ?? null })) });
          await writeFile(resolve(output, `${viewport.name}-${world.id}-browser-world.json`), text);
        })().catch(e => { report.findings.push({ code: 'BROWSER_RESPONSE_CAPTURE_ERROR', error: String(e), ...scope }); }));
        if (r.url().includes('/generated-art/production-manifest.json')) pendingResponses.push((async () => {
          const text = await r.text();
          report.browserManifestResponses.push({ ...scope, url: r.url(), status: r.status(), sha256: sha(text), path: resolve(output, `${viewport.name}-${world.id}-manifest.json`) });
          await writeFile(resolve(output, `${viewport.name}-${world.id}-manifest.json`), text);
        })().catch(e => { report.findings.push({ code: 'MANIFEST_RESPONSE_CAPTURE_ERROR', error: String(e), ...scope }); }));
      });
      try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
        await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).stories?.some((s: any) => s.id === id), world.storyId);
        const libraryState = await state(page);
        const cardTitle = libraryState.stories.find((s: any) => s.id === world.storyId).title;
        const card = page.locator('.story-card').filter({ has: page.getByRole('heading', { name: cardTitle, exact: true }) });
        await card.getByRole('button', { name: '玩改编', exact: true }).click();
        report.clicks.push({ ...scope, kind: 'story-card', label: `${world.title} / 玩改编` });
        await page.getByRole('button', { name: '开始故事', exact: true }).click();
        report.clicks.push({ ...scope, kind: 'start', label: '开始故事' });
        await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).worldId === id, world.id);
        const plannedTargets = targets[world.id];
        let travelled: string[] = [];
        for (const target of plannedTargets) {
          const fullPath = route(world, target.nodeId); target.path = fullPath;
          assert.deepEqual(fullPath.slice(0, travelled.length), travelled, 'Targets must share an actually clicked path');
          for (const choiceId of fullPath.slice(travelled.length)) {
            const s = await decisions(page, world.id, viewport.name);
            const index = s.choices.findIndex((c: any) => c.id === choiceId);
            assert.ok(index >= 0, `${world.id}/${s.nodeId}: UI did not offer ${choiceId}`);
            const choice = world.nodes[s.nodeId].choices.find(c => c.id === choiceId)!;
            await page.locator('.choice-button').nth(index).click();
            report.clicks.push({ ...scope, kind: 'choice', fromNode: s.nodeId, choiceId, label: choice.text, toNode: choice.nextNodeId });
            await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, choice.nextNodeId);
            travelled.push(choiceId);
          }
          for (const phase of ['reading', 'choices']) {
          if (phase === 'choices') await decisions(page, world.id, viewport.name);
          await page.locator('img').evaluateAll(async imgs => { await Promise.all(imgs.map(img => (img as HTMLImageElement).decode().catch(() => {}))); });
          await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text!()); return s.visuals?.backgroundState.status !== 'loading' && s.visuals?.character?.status !== 'loading'; });
          await page.evaluate(() => { scrollTo(0, 0); return document.fonts.ready; });
          await page.waitForTimeout(180);
          const current = await state(page);
          const images = await page.locator('img').evaluateAll(imgs => imgs.map(element => { const img = element as HTMLImageElement; return { className: img.className, alt: img.alt, src: img.getAttribute('src'), currentSrc: img.currentSrc, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, complete: img.complete, state: img.dataset.artState ?? null, rect: img.getBoundingClientRect().toJSON(), display: getComputedStyle(img).display, visibility: getComputedStyle(img).visibility }; }));
          const screenshot = resolve(output, `${viewport.name}-${world.id}-${target.nodeId}-${phase}.png`);
          await page.screenshot({ path: screenshot, animations: 'disabled' });
          const fullPageScreenshot = resolve(output, `${viewport.name}-${world.id}-${target.nodeId}-${phase}-full.png`);
          await page.screenshot({ path: fullPageScreenshot, fullPage: true, animations: 'disabled' });
          const asset = report.assets.find((a: any) => a.worldId === world.id && (target.characterId ? a.characterId === target.characterId : a.nodeId === target.nodeId));
          const portrait = images.find(img => img.className.includes('character-portrait'));
          const matched = target.characterId ? portrait : images.find(img => img.className.includes('scene-image'));
          const visit = { ...scope, phase, kind: target.characterId ? 'character' : 'scene', dimensions: { width: viewport.width, height: viewport.height }, nodeId: target.nodeId, expectedCharacterId: target.characterId ?? null, expectedCharacterName: asset?.characterName, expectedUrl: asset?.url,
            path: [...travelled], current, images, portraitVisible: Boolean(portrait && portrait.naturalWidth > 0 && portrait.rect.width > 0 && portrait.rect.height > 0 && portrait.display !== 'none' && portrait.visibility !== 'hidden'),
            expectedPortraitMatches: Boolean(target.characterId && portrait?.src === asset?.url),
            expectedArtLoaded: Boolean(matched && matched.src === asset?.url && matched.naturalWidth === asset?.pngWidth && matched.naturalHeight === asset?.pngHeight && matched.complete && matched.state === 'ready'),
            expectedArtVisible: Boolean(matched && matched.naturalWidth > 0 && matched.rect.width > 0 && matched.rect.height > 0 && matched.display !== 'none' && matched.visibility !== 'hidden' && matched.rect.bottom > 0 && matched.rect.top < viewport.height && matched.rect.right > 0 && matched.rect.left < viewport.width),
            apiSnapshot: { character: world.nodes[target.nodeId].character ?? null, background: world.nodes[target.nodeId].background },
            apiRuntimeBackgroundMatches: current.visuals.background === world.nodes[target.nodeId].background,
            screenshot, fullPageScreenshot,
            overflow: await page.evaluate(() => ({ viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth, viewportHeight: innerHeight, scrollHeight: document.documentElement.scrollHeight })) };
          report.visits.push(visit);
          console.log(JSON.stringify({ phase: 'browser-visit', ...scope, nodeId: target.nodeId, capturePhase: phase, expectedArtLoaded: visit.expectedArtLoaded, expectedArtVisible: visit.expectedArtVisible, apiRuntimeBackgroundMatches: visit.apiRuntimeBackgroundMatches, screenshot }));
          await persist();
          }
        }
      } catch (error) {
        const screenshot = resolve(output, `${viewport.name}-${world.id}-failure.png`);
        await page.screenshot({ path: screenshot, timeout: 10000 }).catch(() => {});
        report.findings.push({ severity: 'P1', code: 'BROWSER_ROUTE_FAILED', ...scope, error: String(error), screenshot });
        await persist();
      } finally { await Promise.allSettled(pendingResponses); await context.close(); }
    }
  }
  const missingArt = report.visits.filter((v: any) => !v.expectedArtLoaded || !v.expectedArtVisible);
  report.findings.push(...missingArt.map((v: any) => ({ severity: 'P1', code: 'APPROVED_ART_NOT_DISPLAYED', worldId: v.worldId, viewport: v.viewport, phase: v.phase, nodeId: v.nodeId, characterId: v.expectedCharacterId, characterName: v.expectedCharacterName, expectedUrl: v.expectedUrl, actualCharacter: v.current.visuals?.character ?? null, screenshot: v.screenshot, path: v.path })));
  report.findings.push(...report.visits.filter((v: any) => !v.apiRuntimeBackgroundMatches).map((v: any) => ({ severity: 'P1', code: 'API_RUNTIME_BACKGROUND_MISMATCH', worldId: v.worldId, nodeId: v.nodeId, viewport: v.viewport, phase: v.phase, apiBackground: v.apiSnapshot.background, runtimeBackground: v.current.visuals.background, screenshot: v.screenshot })));
  for (const url of [...new Set<string>(report.visits.filter((v: any) => v.current.visuals.backgroundState.status === 'unavailable').map((v: any) => v.current.visuals.background))]) {
    const response = await fetch(new URL(url, base), { signal: AbortSignal.timeout(15000) }); const bytes = Buffer.from(await response.arrayBuffer());
    report.historicalBackgroundIssues.push({ url, status: response.status, contentType: response.headers.get('content-type'), bytes: bytes.length, sha256: sha(bytes), signature: bytes.subarray(0, 16).toString('hex'), affectedVisits: report.visits.filter((v: any) => v.current.visuals.background === url).map((v: any) => ({ worldId: v.worldId, nodeId: v.nodeId, viewport: v.viewport, phase: v.phase })) });
  }
  if (report.visits.length !== 28) report.findings.push({ severity: 'P1', code: 'INCOMPLETE_TARGET_COVERAGE', expected: 28, actual: report.visits.length });
  report.completedAt = new Date().toISOString();
  report.summary = { validatedOriginalPngs: report.assets.length, motherImages: report.assets.filter((a: any) => a.kind === 'character').length, approvedScenes: report.assets.filter((a: any) => a.kind === 'scene').length, storiesVisited: new Set(report.visits.map((v: any) => v.worldId)).size, viewportVisits: report.visits.length, visiblePortraitVisits: report.visits.filter((v: any) => v.portraitVisible).length, expectedPortraitMatches: report.visits.filter((v: any) => v.expectedPortraitMatches).length, loadedAndVisibleArtVisits: report.visits.filter((v: any) => v.expectedArtLoaded && v.expectedArtVisible).length, pageErrors: report.pageErrors.length, nonGetAttempts: report.nonGetAttempts.length, actualNonGetRequests: report.actualNonGetRequests.length };
  report.status = report.findings.some((f: any) => f.severity === 'P1') || report.pageErrors.length || report.actualNonGetRequests.length ? 'failed-integration' : 'awaiting-visual-review';
} catch (error) {
  report.status = 'verification-error'; report.error = String(error);
  await currentPage?.screenshot({ path: resolve(output, 'failure.png'), timeout: 10000 }).catch(() => {});
} finally { await browser?.close(); await persist(); }
console.log(JSON.stringify({ status: report.status, report: resolve(output, 'verification.json'), summary: report.summary }, null, 2));
if (report.status === 'verification-error') process.exitCode = 1;
