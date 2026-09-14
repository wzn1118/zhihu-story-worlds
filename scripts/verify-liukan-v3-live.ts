import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type ReadingNote = {
  id: string;
  parentNoteId?: string;
  model: string;
  source: string;
  sections: Array<{ evidence: Array<{ postId: string; quote: string }> }>;
};
type Inbox = { posts: Array<{ id: string; candidate: { excerpt: string } }> };

const base = process.argv.find(value => value.startsWith('--base='))?.slice(7) ?? 'http://127.0.0.1:4191';
const output = resolve('output/liukan-reading/v3-live');
const question = '上一页把亲属身份的可信度放在动机上比较。请只根据 MAIA 那篇保存的原文，判断林铮反复查看账号后立刻删除好友最明确的动机；每条 evidence.quote 必须从原文连续复制，保留原有称呼和标点，不要改成代词。';
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const receipt: Record<string, unknown> = { base, startedAt: new Date().toISOString(), question, requests: [], errors: [] };

async function contextFor(viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.addInitScript(() => localStorage.setItem('redleaf.liukan.introduction.v1', JSON.stringify({ seen: true })));
  return context;
}

async function openActivity(page: import('playwright').Page) {
  await page.getByRole('button', { name: '打开刘看山陪伴面板', exact: true }).click();
  await page.getByRole('button', { name: '同行记录', exact: true }).click();
  await page.locator('.lad-project-card').first().waitFor({ timeout: 30000 });
}

try {
  const desktop = await contextFor({ width: 1440, height: 1000 });
  const page = await desktop.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => (receipt.errors as string[]).push(error.message));
  page.on('request', request => {
    if (request.url().includes('/api/liukan/reading')) (receipt.requests as unknown[]).push({ method: request.method(), path: new URL(request.url()).pathname });
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '打开刘看山陪伴面板', exact: true }).click();
  await page.getByRole('button', { name: '阅读手记', exact: true }).click();
  await page.locator('.lrd-skill').first().waitFor({ timeout: 30000 });
  const readingIndex = await (await desktop.request.get(`${base}/api/liukan/reading`)).json() as { skills: Array<{ id: string }>; notes: ReadingNote[] };
  const ids = readingIndex.skills.map(skill => skill.id);
  for (const required of ['relationships', 'foreshadowing', 'playtest-review']) {
    if (!ids.includes(required)) throw new Error(`Missing skill ${required}`);
  }
  const readingButtons = await page.locator('.lrd-skill').count();
  await page.screenshot({ path: resolve(output, 'reading-capabilities-1440.png'), fullPage: true });

  await page.getByRole('button', { name: /已写手记/ }).click();
  const singleSourceNote = page.locator('.lrd-history-note').filter({ hasText: '晓晓的消息，还有哪些问号' }).first();
  await (await singleSourceNote.count() ? singleSourceNote : page.locator('.lrd-history-note').filter({ hasText: '事情的先后顺序' }).first()).click();
  await page.locator('.lrd-paper').waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: '继续聊这一页', exact: true }).click();
  await page.locator('.lrd-compose-form textarea').fill(question);
  const beforeRun = (receipt.requests as Array<{ method: string }>).filter(row => row.method === 'POST').length;
  const started = Date.now();
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/liukan/reading/run') && response.request().method() === 'POST', { timeout: 220000 });
  await page.locator('.lrd-run').click();
  const response = await responsePromise;
  const result = await response.json() as ReadingNote & { error?: { code?: string; message?: string } };
  receipt.ask = { status: response.status(), durationMs: Date.now() - started, noteId: result.id, parentNoteId: result.parentNoteId, model: result.model, source: result.source, sections: result.sections?.length ?? 0, error: result.error };
  if (!response.ok) throw new Error(`Reading response ${response.status()}: ${result.error?.code ?? 'unknown'}`);
  if (!result.parentNoteId || result.model !== 'gpt-6-astra' || result.source !== 'relay') throw new Error('Continuation did not retain a real relay receipt.');
  const inbox = await (await desktop.request.get(`${base}/api/liukan/inbox`)).json() as Inbox;
  for (const evidence of result.sections.flatMap(section => section.evidence)) {
    const post = inbox.posts.find(item => item.id === evidence.postId);
    if (!post?.candidate.excerpt.includes(evidence.quote)) throw new Error(`Non-verbatim evidence for ${evidence.postId}`);
  }
  if ((receipt.requests as Array<{ method: string }>).filter(row => row.method === 'POST').length !== beforeRun + 1) throw new Error('Opening or reading made an unexpected model submission.');
  await page.locator('.lrd-paper').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, 'continued-ask-1440.png'), fullPage: true });

  await page.getByRole('button', { name: '关闭阅读手记', exact: true }).click();
  await openActivity(page);
  const projects = await page.locator('.lad-project-card').count();
  await page.screenshot({ path: resolve(output, 'activity-projects-1440.png'), fullPage: true });
  receipt.desktop = { pages: desktop.pages().length, readingButtons, skillCount: ids.length, projects };
  await desktop.close();

  const mobile = await contextFor({ width: 390, height: 844 });
  const mobilePage = await mobile.newPage();
  mobilePage.setDefaultTimeout(30000);
  mobilePage.on('pageerror', error => (receipt.errors as string[]).push(error.message));
  await mobilePage.goto(base, { waitUntil: 'domcontentloaded' });
  await openActivity(mobilePage);
  await mobilePage.locator('.lad-mobile-tabs button').filter({ hasText: '关卡回忆' }).click({ force: true });
  await mobilePage.locator('.lad-memory-card').first().waitFor({ timeout: 30000 });
  await mobilePage.screenshot({ path: resolve(output, 'activity-memories-390.png'), fullPage: true });
  receipt.mobile = { pages: mobile.pages().length, memories: await mobilePage.locator('.lad-memory-card').count() };
  await mobile.close();
  receipt.finishedAt = new Date().toISOString();
  if ((receipt.errors as string[]).length) throw new Error(`Page errors: ${(receipt.errors as string[]).join(' | ')}`);
} catch (error) {
  receipt.failure = error instanceof Error ? error.message : String(error);
  receipt.finishedAt = new Date().toISOString();
  process.exitCode = 1;
} finally {
  await writeFile(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  await browser.close();
}
