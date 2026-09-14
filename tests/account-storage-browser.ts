import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ACCOUNT_UI_URL ?? 'http://127.0.0.1:18474';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
let accountId: string | null = null;
let sessionUnavailable = false;
const authentication = { required: true, provider: 'zhihu', configured: true, loginUrl: '/api/oauth/start', browserAvailable: false };
const errors: string[] = [];
await context.addInitScript(() => {
  // Existing anonymous data must not become the first OAuth account's data.
  localStorage.setItem('redleaf.ui-theme', 'zhihu');
  localStorage.setItem('redleaf.workshop.input.v1', JSON.stringify({ title: '旧浏览器私有草稿', author: '本机作者', text: '不属于任一知乎账号', scope: 'user-import' }));
  for (const id of ['alice', 'bob']) localStorage.setItem(`redleaf.account.v1:${id}:redleaf.liukan.introduction.v1`, JSON.stringify({ seen: true }));
});
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/me') return route.fulfill({ status: sessionUnavailable ? 503 : 200, json: { user: accountId ? { id: accountId, name: accountId, provider: 'zhihu' } : null, authentication } });
  if (path === '/api/auth/logout') { accountId = null; return route.fulfill({ status: 204 }); }
  if (path === '/api/stories') return route.fulfill({ json: { stories: [], source: 'cache', fetchedAt: new Date().toISOString() } });
  if (path === '/api/workshop/projects') return route.fulfill({ json: { projects: [], capabilities: {} } });
  if (path === '/api/workshop/discovery') return route.fulfill({ json: { candidates: [], cached: true } });
  if (path === '/api/liukan/inbox') return route.fulfill({ json: { posts: [] } });
  if (path === '/api/liukan/memories') return route.fulfill({ json: { memories: [] } });
  return route.fulfill({ json: {} });
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
async function openDraft() {
  await page.getByRole('button', { name: '新故事工作台', exact: true }).click();
  await page.getByRole('tab', { name: '粘贴或上传', exact: true }).click();
  await page.getByLabel('回答标题 · 可留空', { exact: true }).waitFor();
  assert.equal(await page.getByText('配置创作中转站', { exact: true }).count(), 0);
  assert.equal(await page.locator('input[type="password"]').count(), 0);
}
try {
  await page.goto(base);
  await page.getByRole('heading', { name: '用知乎登录赤页' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.uiTheme), 'archive');
  assert.equal(await page.locator('.library-shell').count(), 0);

  accountId = 'alice';
  await page.reload();
  await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.uiTheme), 'archive');
  await page.getByRole('button', { name: '切换到知乎蓝白', exact: true }).first().click();
  await openDraft();
  assert.equal(await page.getByLabel('回答标题 · 可留空', { exact: true }).inputValue(), '');
  await page.getByLabel('回答标题 · 可留空', { exact: true }).fill('Alice 的私有草稿');
  await page.getByLabel(/^回答正文 \/ 节选/).fill('Alice 的原文内容');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('heading', { name: '用知乎登录赤页' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.uiTheme), 'archive');

  accountId = 'bob';
  await page.reload();
  await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.uiTheme), 'archive');
  await openDraft();
  assert.equal(await page.getByLabel('回答标题 · 可留空', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel(/^回答正文 \/ 节选/).inputValue(), '');
  await page.getByLabel('回答标题 · 可留空', { exact: true }).fill('Bob 的私有草稿');

  accountId = 'alice';
  await page.reload();
  await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.uiTheme), 'zhihu');
  await openDraft();
  assert.equal(await page.getByLabel('回答标题 · 可留空', { exact: true }).inputValue(), 'Alice 的私有草稿');
  assert.equal(await page.getByLabel(/^回答正文 \/ 节选/).inputValue(), 'Alice 的原文内容');
  const stored = await page.evaluate(() => ({
    legacy: JSON.parse(localStorage.getItem('redleaf.workshop.input.v1')!),
    bob: JSON.parse(localStorage.getItem('redleaf.account.v1:bob:redleaf.workshop.input.v1')!),
  }));
  assert.equal(stored.legacy.title, '旧浏览器私有草稿');
  assert.equal(stored.bob.title, 'Bob 的私有草稿');

  accountId = 'bob';
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.waitForFunction(() => document.querySelector('.account-name')?.textContent === 'bob');
  await openDraft();
  assert.equal(await page.getByLabel('回答标题 · 可留空', { exact: true }).inputValue(), 'Bob 的私有草稿');
  accountId = 'alice';
  await page.evaluate(() => dispatchEvent(new FocusEvent('focus')));
  await page.waitForFunction(() => document.querySelector('.account-name')?.textContent === 'alice');

  const peer = await context.newPage();
  await peer.goto(base);
  await peer.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('heading', { name: '用知乎登录赤页' }).waitFor();
  assert.equal(await page.locator('.library-shell').count(), 0, 'another tab signing out clears the old workspace');
  await peer.close();

  accountId = 'alice';
  await page.reload();
  await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
  sessionUnavailable = true;
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.getByRole('heading', { name: '登录状态暂时无法读取' }).waitFor();
  assert.equal(await page.locator('.library-shell').count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, scenarios: ['no-legacy-inheritance', 'logout-clears-view', 'two-account-draft-isolation', 'per-account-theme', 'returning-account-restores-own-data', 'public-config-hidden', 'bfcache-account-check', 'focus-account-check', 'other-tab-logout', 'recheck-fails-closed'] }));
} finally { await context.close(); await browser.close(); }
