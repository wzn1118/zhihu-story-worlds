import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve('output/liukan-intelligence/web-feed');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors: string[] = [], events: { path: string; status: number }[] = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.request().method() === 'POST') events.push({ path: new URL(response.url()).pathname, status: response.status() });
});
try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:4180', { waitUntil: 'domcontentloaded' });
  await page.locator('.liukan-tour').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /新故事工作台/ }).click();
  await page.getByRole('button', { name: /去知乎选故事/ }).click();
  const embedded = page.frameLocator('iframe[title="知乎原网页，可直接选字和拖给刘看山"]');
  await embedded.locator('body').waitFor();
  console.log('embedded loaded');
  await page.waitForTimeout(1000);
  if (!(await embedded.locator('[data-redleaf-feed]').count())) {
    await embedded.getByText('阅读全文', { exact: false }).nth(1).click();
    await embedded.locator('[data-redleaf-feed]').first().waitFor();
  }
  console.log('expanded post available');
  const frameResponse = await context.request.get('http://127.0.0.1:4180/api/zhihu-browser/frame');
  const frame = await frameResponse.json();
  assert.equal(frame.status, 'ready'); assert.ok(frame.posts.length > 0);
  const title = frame.posts[0].title;
  // Wheel input remains inside the embedded document; no browser navigation.
  const iframeBox = (await page.locator('iframe').boundingBox())!;
  await page.mouse.move(iframeBox.x + 500, iframeBox.y + 350);
  await page.mouse.wheel(0, 460);
  await page.waitForTimeout(300);
  const handle = embedded.locator('[data-redleaf-feed]').first();
  const source = (await handle.boundingBox())!;
  const target = (await page.locator('.liukan-bubble').boundingBox())!;
  console.log(JSON.stringify({ source, target }));
  await page.screenshot({ path: resolve(output, 'before-drag.png') });
  const feeding = page.waitForResponse(response => /\/api\/liukan\/inbox$/.test(response.url()) && response.request().method() === 'POST', { timeout: 20000 }).then(response => ({ response }), error => ({ error }));
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 15, source.y + source.height / 2, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 24 });
  await page.mouse.up();
  const outcome = await feeding;
  if ('error' in outcome) throw outcome.error;
  const feedResponse = outcome.response;
  assert.ok(feedResponse.ok());
  const post = await feedResponse.json();
  assert.equal(post.candidate.title, title);
  assert.equal(post.candidate.origin.contentScope, 'webpage-selection');
  assert.equal(await page.locator('.liukan-post-kicker').innerText(), '知乎网页选取 · 已保存');
  await page.screenshot({ path: resolve(output, 'fed-desktop.png') });
  console.log('real webpage drag saved');
  await page.setViewportSize({ width: 390, height: 844 });
  const started = Date.now();
  await page.locator('#liukan-post-question').fill('这篇回答怎样解释天行者为什么会犹豫？只根据原文简短回答。');
  const answering = page.waitForResponse(response => /\/api\/liukan\/inbox\/[^/]+\/chat$/.test(response.url()), { timeout: 150000 });
  await page.getByRole('button', { name: '向刘看山提问原文' }).click();
  const response = await answering;
  const answer = await response.json();
  assert.equal(response.status(), 200);
  await page.locator('.liukan-message.is-assistant').last().waitFor();
  assert.ok((await page.locator('.liukan-message.is-assistant').last().innerText()).includes(answer.answer));
  await page.screenshot({ path: resolve(output, 'answered-mobile.png') });
  assert.equal(context.pages().length, 1); assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'passed', title, sourceScope: post.candidate.origin.contentScope, sourceUrl: post.candidate.origin.sourceUrl, characters: post.candidate.characters, postId: post.id, feedStatus: feedResponse.status(), answerStatus: response.status(), answerMs: Date.now() - started, provider: answer.source, model: answer.model, answer: answer.answer, pages: context.pages().length, errors, events }, null, 2));
  console.log(JSON.stringify({ status: 'passed', postId: post.id, output }));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ error: String(error), errors, events }, null, 2));
  throw error;
} finally { await context.close(); await browser.close(); }
