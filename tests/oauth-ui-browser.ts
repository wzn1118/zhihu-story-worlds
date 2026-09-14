import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.OAUTH_UI_URL ?? 'http://127.0.0.1:18473';
const output = resolve('output/oauth-ui');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const authentication = { required: true, provider: 'zhihu', configured: true, loginUrl: '/api/oauth/start', browserAvailable: false };
const candidate = { id: 'a'.repeat(32), title: '测试知乎故事', author: '测试作者', excerpt: '这是一份用于验证阅读入口的知乎故事节选。', characters: 24, query: '', origin: { kind: 'zhihu-answer', sourceUrl: 'https://www.zhihu.com/question/12345/answer/67890', workId: '67890', fetchedAt: new Date().toISOString(), contentScope: 'search-excerpt' } };
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    let authenticated = false, configured = true, sessionError = '', sessionUnavailable = false;
    const calls: string[] = [], errors: string[] = [];
    await context.addInitScript(() => localStorage.setItem('redleaf.account.v1:zhihu-test-user:redleaf.liukan.introduction.v1', JSON.stringify({ seen: true })));
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      calls.push(path);
      if (path === '/api/auth/me') return route.fulfill({ status: sessionUnavailable ? 503 : 200, json: { user: authenticated ? { id: 'zhihu-test-user', name: '测试读者', provider: 'zhihu' } : null, authentication: { ...authentication, configured }, ...(sessionError ? { error: { code: 'TEST_ERROR', message: sessionError } } : {}) } });
      if (path === '/api/auth/logout') { authenticated = false; return route.fulfill({ status: 204 }); }
      if (path === '/api/stories') return route.fulfill({ json: { stories: [], source: 'cache', fetchedAt: new Date().toISOString() } });
      if (path === '/api/workshop/projects') return route.fulfill({ json: { projects: [], capabilities: {} } });
      if (path === '/api/workshop/discovery') return route.fulfill({ json: { candidates: [candidate], cached: true } });
      if (path === '/api/liukan/inbox') return route.fulfill({ json: { posts: [] } });
      if (path === '/api/liukan/memories') return route.fulfill({ json: { memories: [] } });
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('heading', { name: '用知乎登录赤页' }).waitFor();
    assert.equal(await page.locator('input[type="password"], input[type="email"]').count(), 0);
    assert.equal(await page.getByRole('link', { name: '使用知乎账号登录' }).getAttribute('href'), '/api/oauth/start');
    assert.equal(calls.some(path => path === '/api/stories'), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: resolve(output, `login-${width}.png`) });

    configured = false;
    await page.reload();
    await page.getByText('知乎登录暂未配置完成，请稍后重试。').waitFor();
    assert.equal(await page.getByRole('link', { name: '使用知乎账号登录' }).count(), 0);
    configured = true; sessionError = '授权状态已失效，请重新登录。';
    await page.reload();
    await page.getByRole('alert').filter({ hasText: sessionError }).waitFor();

    sessionUnavailable = true;
    await page.reload();
    await page.getByRole('heading', { name: '登录状态暂时无法读取' }).waitFor();
    assert.equal(await page.locator('.library-shell').count(), 0);
    sessionUnavailable = false; authenticated = true; sessionError = '';
    await page.reload();
    await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
    await page.getByRole('button', { name: '新故事工作台', exact: true }).click();
    await page.locator('[data-tour="workshop-zhihu-browser"]').click();
    await page.getByRole('heading', { name: candidate.title, exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: '知乎网页', exact: true }).count(), 0);
    await page.locator('.zhw-post-open').filter({ hasText: candidate.title }).click();
    const original = page.getByRole('link', { name: '在知乎查看原文' });
    await original.waitFor();
    assert.equal(await original.getAttribute('target'), '_blank');
    assert.equal(await original.getAttribute('href'), candidate.origin.sourceUrl);
    assert.equal(calls.some(path => path.startsWith('/api/zhihu-browser')), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: resolve(output, `reader-${width}.png`) });
    await page.getByRole('button', { name: '回到改编工作台' }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await page.getByRole('heading', { name: '用知乎登录赤页' }).waitFor();
    assert.ok(calls.includes('/api/auth/logout'));
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ ok: true, scenarios: ['oauth-login', 'configuration-error', 'authorization-error', 'session-error', 'reader-without-local-browser', 'logout'], screenshots: output }));
} finally { await browser.close(); }
