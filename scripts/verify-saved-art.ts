import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const folder = resolve('output/playwright/direct-art-integration');
const baseUrl = process.env.ART_GAME_URL ?? 'http://127.0.0.1:4174';
await mkdir(folder, { recursive: true });
const release = JSON.parse(await readFile('output/coordination/art-remake-12h-20260912/full64-direct/direct-delivery-publication.json', 'utf8'));
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Users/10847/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const results = await page.evaluate(async (release: any) => {
    const modulePath = '/src/published-art.ts';
    const { withPublishedArt } = await import(modulePath);
    const results = [];
    for (const entry of release.worlds) {
      const response = await fetch(`/api/worlds/${entry.storyId}`);
      if (!response.ok) throw new Error(`World HTTP ${response.status}: ${entry.worldId}`);
      const world = await withPublishedArt(await response.json());
      for (const row of entry.assets) {
        const image = new Image(); image.src = row.asset.url;
        let decoded = false;
        try { await image.decode(); decoded = image.naturalWidth === row.asset.width && image.naturalHeight === row.asset.height; } catch {}
        let targets: string[] = [];
        if (row.assetKind === 'scene') {
          if (world.nodes[row.nodeId]?.background === row.asset.url) targets = [row.nodeId];
        } else if (row.assetKind === 'cover') {
          if (world.cover === row.asset.url) targets = ['cover'];
        } else if (row.assetKind.startsWith('character-')) {
          const main = row.assetKind === 'character-anchor';
          const id = row.nodeId.slice((main ? '__art_character_' : '__art_reaction_').length);
          const character = [...world.characters, ...(world.artCharacters ?? [])].find(c => c.id === id);
          if (character?.portraits?.[main ? 'main' : 'reaction'] === row.asset.url) targets = [`character:${id}`];
        } else {
          targets = Object.keys(world.nodes).filter(id => world.nodes[id].background === row.asset.url
            || world.nodes[id].artSceneVariants?.some((v: any) => v.url === row.asset.url));
        }
        results.push({ worldId: world.id, jobId: row.sourceJobId, nodeId: row.nodeId,
          kind: row.assetKind, url: row.asset.url, decoded, targets, bound: targets.length > 0 });
      }
    }
    return results;
  }, release);
  const report = { at: new Date().toISOString(), total: results.length,
    bound: results.filter(r => r.bound).length, decoded: results.filter(r => r.decoded).length,
    failures: results.filter(r => !r.bound || !r.decoded), results };
  await writeFile(resolve(folder, 'runtime-verification.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: resolve(folder, 'game.png') });
  console.log(JSON.stringify({ ...report, results: undefined }));
} finally { await browser.close(); }
