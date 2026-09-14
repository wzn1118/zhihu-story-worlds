import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const runtime = JSON.parse(await readFile(resolve('output/art-imports/runtime-check.json'), 'utf8'));
  await page.goto(`http://127.0.0.1:4173${runtime.sample.url}`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const world = await fetch('/api/workshop/projects/import-0b3ce5e1-1f96-474d-871d-5e2a2a541713/world').then(r => r.json());
    const scenes = Object.values(world.nodes).filter(node => node.background.startsWith('/generated-art/workshop/'));
    const decoded = await Promise.all(scenes.map(node => new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => reject(new Error(`Image timeout: ${node.id}`)), 20000);
      image.onload = () => { clearTimeout(timer); resolve({ nodeId: node.id, url: node.background, width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = () => { clearTimeout(timer); reject(new Error(node.background)); };
      image.src = node.background;
    })));
    return { title: world.title, decoded };
  });
  if (result.decoded.length !== 47 || result.decoded.some(image => image.width < 1 || image.height < 1)) throw new Error('Incomplete browser decode');
  await page.screenshot({ path: resolve('output/art-imports/imported-scene.png') });
  await writeFile(resolve('output/art-imports/browser-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ title: result.title, browserDecoded: result.decoded.length }));
} finally { await browser.close(); }
