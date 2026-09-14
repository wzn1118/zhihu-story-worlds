import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import type { LiukanInboxPost } from '../shared/liukan-inbox';
import type { LiukanReadingNote } from '../shared/liukan-reading';

const base = process.env.LIUKAN_AUTH_UI_URL ?? 'http://127.0.0.1:18475';
const output = resolve(process.env.LIUKAN_AUTH_OUTPUT ?? 'output/liukan-auth');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const authentication = { required: true, provider: 'zhihu', configured: true, loginUrl: '/api/oauth/start', browserAvailable: false };
const savedAt = '2026-09-14T08:00:00.000Z';
let accountId: string | null = 'alice';
let upstreamUnauthorized = false;
let accountChangePending = false;
const calls: Array<{ path: string; account: string | undefined; status: number }> = [];
const errors: string[] = [];

function postFor(id: string): LiukanInboxPost {
  return {
    id: `${id}-post`, learnedAt: savedAt,
    candidate: {
      id: `${id}-candidate`, title: `${id} 保存的故事`, author: `${id} 的作者`,
      excerpt: `${id} 的故事里，门口留着一封未寄出的信。`, characters: 25, query: '',
      origin: { kind: 'zhihu-answer', sourceUrl: 'https://www.zhihu.com/question/12345/answer/67890', workId: '67890', fetchedAt: savedAt, contentScope: 'search-excerpt' },
    },
  };
}

function noteFor(id: string): LiukanReadingNote {
  const post = postFor(id);
  return {
    id: `${id}-note`, skill: 'recap', title: `${id} 保存的阅读手记`, summary: `${id} 的阅读总结`,
    sections: [{ heading: '故事里发生了什么', body: `${id} 想起了信里的约定。`, evidence: [{ postId: post.id, quote: '门口留着一封未寄出的信' }] }],
    sources: [{ postId: post.id, title: post.candidate.title, author: post.candidate.author, sourceUrl: post.candidate.origin.sourceUrl, sourceHash: `${id}-source-hash`, contentScope: 'search-excerpt', complete: true, current: true }],
    invented: false, model: 'mock', source: 'relay', createdAt: savedAt,
  };
}

await context.addInitScript(() => {
  for (const id of ['alice', 'bob']) {
    localStorage.setItem(`redleaf.account.v1:${id}:redleaf.liukan.introduction.v1`, JSON.stringify({ seen: true }));
  }
  localStorage.setItem('redleaf.liukan.introduction.v1', JSON.stringify({ seen: true }));
});
await context.route('**/api/**', async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const account = request.headers()['x-redleaf-account'];
  const fulfill = (status: number, json: unknown) => {
    calls.push({ path, account, status });
    return route.fulfill({ status, json });
  };
  if (path === '/api/auth/me') {
    accountChangePending = false;
    return fulfill(200, { user: accountId ? { id: accountId, name: accountId, provider: 'zhihu' } : null, authentication });
  }
  if (path === '/api/auth/logout') { accountId = null; calls.push({ path, account, status: 204 }); return route.fulfill({ status: 204 }); }
  if (path.startsWith('/api/liukan/')) {
    if (!accountId) return fulfill(401, { error: { code: 'AUTH_REQUIRED', message: '请先登录。' } });
    if (accountChangePending || (account && account !== accountId)) return fulfill(409, { error: { code: 'ACCOUNT_CHANGED', message: '当前登录账号已变化，请刷新页面后继续。' } });
    if (upstreamUnauthorized && path === '/api/liukan/reading') return fulfill(401, { error: { code: 'UPSTREAM_AUTH', message: '阅读服务暂时无法连接。' } });
    if (path === '/api/liukan/inbox') return fulfill(200, { posts: [postFor(accountId)] });
    if (path === '/api/liukan/memories') return fulfill(200, { memories: [] });
    if (path === '/api/liukan/reading') return fulfill(200, { skills: [{ id: 'recap', title: '故事回顾', description: '顺着原文总结故事', minSources: 1, maxSources: 1, invented: false }], notes: [noteFor(accountId)] });
    if (path === `/api/liukan/reading/${accountId}-note`) return fulfill(200, noteFor(accountId));
  }
  if (path === '/api/stories') return fulfill(200, { stories: [], source: 'cache', fetchedAt: savedAt });
  if (path === '/api/workshop/projects') return fulfill(200, { projects: [], capabilities: {} });
  if (path === '/api/workshop/discovery') return fulfill(200, { candidates: [], cached: true });
  throw new Error(`Unexpected mock API request: ${request.method()} ${path}`);
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', error => errors.push(error.message));
const dialog = page.getByRole('dialog', { name: '阅读手记', exact: true });
const authenticationCalls = () => calls.filter(call => call.path === '/api/auth/me').length;

async function openDesk() {
  await page.getByRole('button', { name: '打开刘看山陪伴面板', exact: true }).press('Enter');
  await page.getByRole('button', { name: '阅读手记', exact: true }).click();
}

async function assertSavedReading(id: string) {
  await dialog.waitFor();
  await dialog.locator('.lrd-source-select').filter({ hasText: `${id} 保存的故事` }).waitFor();
  await dialog.getByRole('button', { name: /^已写手记/ }).click();
  await dialog.locator('.lrd-history-note').filter({ hasText: `${id} 保存的阅读手记` }).click();
  await dialog.getByTestId('liukan-reading-note').getByRole('heading', { name: `${id} 保存的阅读手记`, exact: true }).waitFor();
  assert.equal(await dialog.getByRole('alert').count(), 0);
}

try {
  await page.goto(base);
  await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
  await page.getByRole('button', { name: '新故事工作台', exact: true }).click();
  await openDesk();
  await assertSavedReading('alice');
  await page.screenshot({ path: resolve(output, 'authenticated-reading.png') });
  await dialog.getByRole('button', { name: '关闭阅读手记', exact: true }).click();

  // Session expiry happens while this page stays focused. Only the protected API
  // response can tell the app that its already-rendered account is stale.
  const beforeExpiryChecks = authenticationCalls();
  const beforeExpiryCalls = calls.length;
  accountId = null;
  await openDesk();
  try {
    await page.getByRole('heading', { name: '用知乎登录赤页', exact: true }).waitFor();
  } catch (error) {
    const staleAlert = await dialog.getByRole('alert').textContent().catch(() => '');
    await page.screenshot({ path: resolve(output, 'expired-session-stuck.png') });
    console.error(JSON.stringify({ phase: 'session-expiry', staleAlert, authChecksBefore: beforeExpiryChecks, authChecksAfter: authenticationCalls(), protectedResponses: calls.slice(beforeExpiryCalls).filter(call => call.path.startsWith('/api/liukan/')), screenshot: resolve(output, 'expired-session-stuck.png') }));
    throw error;
  }
  assert.ok(authenticationCalls() > beforeExpiryChecks, 'a protected 401 rechecks the account without focus/visibility events');
  assert.ok(calls.slice(beforeExpiryCalls).some(call => call.path === '/api/liukan/reading' && call.status === 401));
  assert.equal(await dialog.count(), 0);
  assert.equal(await page.locator('.library-shell').count(), 0);
  assert.equal(await page.getByRole('link', { name: '使用知乎账号登录', exact: true }).getAttribute('href'), '/api/oauth/start');
  await page.screenshot({ path: resolve(output, 'expired-session-login.png') });

  // Mock a completed OAuth round trip without accessing the external provider.
  accountId = 'alice';
  await page.reload();
  await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
  await openDesk();
  await assertSavedReading('alice');
  await dialog.getByRole('button', { name: '关闭阅读手记', exact: true }).click();

  const beforeUpstreamChecks = authenticationCalls();
  upstreamUnauthorized = true;
  await openDesk();
  await dialog.getByRole('alert').filter({ hasText: '阅读服务暂时无法连接。' }).waitFor();
  assert.equal(authenticationCalls(), beforeUpstreamChecks, 'an upstream 401 must not invalidate the app login');
  assert.equal(await page.getByRole('heading', { name: '用知乎登录赤页', exact: true }).count(), 0);
  upstreamUnauthorized = false;
  await dialog.getByRole('button', { name: '重新打开', exact: true }).click();
  await assertSavedReading('alice');
  await dialog.getByRole('button', { name: '关闭阅读手记', exact: true }).click();

  const beforeSwitchChecks = authenticationCalls();
  const beforeSwitchCalls = calls.length;
  accountId = 'bob';
  accountChangePending = true;
  await openDesk();
  await page.waitForFunction(() => document.querySelector('.account-name')?.textContent === 'bob');
  assert.ok(authenticationCalls() > beforeSwitchChecks, 'a protected 409 rechecks the changed account');
  assert.ok(calls.slice(beforeSwitchCalls).some(call => call.status === 409));
  assert.equal(await dialog.count(), 0, 'the old account reading desk is unmounted');
  await openDesk();
  await assertSavedReading('bob');
  assert.equal(await dialog.getByText('alice 保存的阅读手记', { exact: true }).count(), 0);
  await dialog.getByRole('button', { name: /^看山的书袋/ }).click();
  assert.equal(await dialog.locator('.lrd-source-select').filter({ hasText: 'alice 保存的故事' }).count(), 0);
  await page.screenshot({ path: resolve(output, 'changed-account-reading.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, base, scenarios: ['authenticated-inbox-and-note', 'expired-session-without-focus-event', 'oauth-relogin-restores-saved-reading', 'upstream-401-keeps-login', 'account-changed-409-isolates-reading'], screenshots: output }));
} finally { await context.close(); await browser.close(); }
