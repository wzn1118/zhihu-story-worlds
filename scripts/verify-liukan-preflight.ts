import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.argv.find(arg => arg.startsWith('--base='))?.slice(7) ?? 'http://127.0.0.1:4183';
const output = resolve('output/liukan-preflight');
await mkdir(output, { recursive: true });

interface Receipt {
  viewport: { width: number; height: number };
  title: string;
  confirmed: string;
  items: string[];
  requests: Array<{ method: string; path: string; status: number }>;
  errors: string[];
  pages: number;
}

async function verify(viewport: { width: number; height: number }, screenshot: string) {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => localStorage.setItem('redleaf.liukan.introduction.v1', JSON.stringify({ seen: true })));
  const page = await context.newPage();
  page.setDefaultTimeout(18_000);
  const errors: string[] = [];
  const requests: Receipt['requests'] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname === '/api/workshop/projects' || url.pathname === '/api/liukan/memories') requests.push({ method: response.request().method(), path: url.pathname, status: response.status() });
  });
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '打开刘看山陪伴面板', exact: true }).click();
    await page.getByRole('button', { name: '同行记录', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '刘看山活动记录' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '开工检查', exact: true }).click();
    const checklist = page.locator('.lad-preflight');
    await checklist.waitFor();
    const projectSelect = page.getByRole('combobox', { name: '选择检查的故事' });
    if (await projectSelect.count()) {
      const options = await projectSelect.locator('option').count();
      if (options > 1) await projectSelect.selectOption({ index: 1 });
    }
    await page.screenshot({ path: resolve(output, screenshot), fullPage: false });
    const receipt: Receipt = {
      viewport,
      title: (await page.locator('.lad-preflight-project h4').textContent())?.trim() ?? '',
      confirmed: (await page.locator('.lad-preflight-project > strong').textContent())?.trim() ?? '0',
      items: (await page.locator('.lad-preflight-list h4').allTextContents()).map(value => value.trim()),
      requests,
      errors,
      pages: context.pages().length,
    };
    if (!receipt.items.length) throw new Error('Preflight did not render any checklist items.');
    if (!requests.some(request => request.method === 'GET' && request.path === '/api/workshop/projects' && request.status === 200)) throw new Error('Project GET was not observed.');
    if (!requests.some(request => request.method === 'GET' && request.path === '/api/liukan/memories' && request.status === 200)) throw new Error('Memory GET was not observed.');
    if (errors.length || receipt.pages !== 1) throw new Error(JSON.stringify({ errors, pages: receipt.pages }));
    return receipt;
  } finally {
    await context.close();
    await browser.close();
  }
}

const desktop = await verify({ width: 1440, height: 1000 }, 'preflight-1440.png');
const mobile = await verify({ width: 390, height: 844 }, 'preflight-390.png');
await writeFile(resolve(output, 'receipt.json'), JSON.stringify({ base, desktop, mobile }, null, 2));
console.log(JSON.stringify({ base, desktop: { title: desktop.title, confirmed: desktop.confirmed, items: desktop.items.length }, mobile: { title: mobile.title, confirmed: mobile.confirmed, items: mobile.items.length } }));
