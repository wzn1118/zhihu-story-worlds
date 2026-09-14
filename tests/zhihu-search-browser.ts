import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium, type Route } from 'playwright';
import { createServer } from 'vite';

// Run with `npx tsx tests/zhihu-search-browser.ts`; every API response is local.
const fixture = `<!doctype html><html><body><div id="root"></div><script type="module">
  import { createElement } from 'react';
  import { createRoot } from 'react-dom/client';
  import { configureAccountStorage } from '/src/account-storage.ts';
  import { ZhihuWorkspace } from '/src/ZhihuWorkspace.tsx';
  import { ZhihuDiscovery } from '/src/ZhihuDiscovery.tsx';
  configureAccountStorage({ provider: 'zhihu' }, 'search-test-account');
  const discovery = new URLSearchParams(location.search).has('discovery');
  createRoot(document.getElementById('root')).render(createElement(
    discovery ? ZhihuDiscovery : ZhihuWorkspace,
    discovery ? { projects: [], onProject: () => {} } : { browserAvailable: false, onClose: () => {} }
  ));
</script></body></html>`;
const server = await createServer({
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'zhihu-search-browser-fixture',
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/__zhihu-search-test')) return next();
        response.setHeader('content-type', 'text/html');
        response.end(await vite.transformIndexHtml(request.url, fixture));
      });
    },
  }],
});
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ?? (existsSync(chromium.executablePath()) ? undefined : existsSync('/snap/bin/chromium') ? '/snap/bin/chromium' : undefined);
const candidate = {
  id: 'saved-story', title: '已保存的知乎故事', author: '测试作者', excerpt: '搜索失败时仍然可以阅读的原有节选。', characters: 21,
  query: '', origin: { kind: 'zhihu-answer', contentScope: 'search-excerpt', sourceUrl: 'https://www.zhihu.com/question/12345/answer/67890' },
};
const replacement = { ...candidate, id: 'new-story', title: '重新搜索得到的故事' };
const cases = [
  { name: 'html-502', status: 502, contentType: 'text/html', body: '<!DOCTYPE html><title>Bad Gateway</title>', message: '服务暂时不可用（502），请稍后重试。' },
  { name: 'html-404', status: 404, contentType: 'text/html', body: '<!DOCTYPE html><title>Not Found</title>', message: '请求未完成（404），请刷新页面后重试。' },
  { name: 'html-200', status: 200, contentType: 'text/html', body: '<!DOCTYPE html><div id="root"></div>', message: '服务返回了异常内容，请刷新页面后重试。' },
  { name: 'malformed-json', status: 200, contentType: 'application/json', body: '{"candidates":', message: '服务返回了异常内容，请刷新页面后重试。' },
  { name: 'html-401', status: 401, contentType: 'text/html', body: '<html>Unauthorized</html>', message: '登录状态已失效，请重新登录后再试。' },
  { name: 'html-504', status: 504, contentType: 'text/html', body: '<html>Gateway Timeout</html>', message: '请求超时，请稍后重试。' },
  { name: 'json-api-error', status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SEARCH_QUERY_INVALID', message: '请输入至少两个字的搜索关键词。' } }), message: '请输入至少两个字的搜索关键词。' },
  { name: 'json-auth-error', status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ACCOUNT_CHANGED', message: '当前登录账号已变化，请刷新页面后继续。' } }), message: '当前登录账号已变化，请刷新页面后继续。' },
];

await server.listen();
const address = server.httpServer!.address();
assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const reader of ['workspace', 'discovery'] as const) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const pageErrors: string[] = [], requests: { method: string; headers: Record<string, string>; body: unknown }[] = [];
    let responseMode: typeof cases[number] | 'network-error' | 'timeout' | 'success' = cases[0];
    let heldRoute: Route | undefined;
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.clock.install();
    await context.route('**/api/**', async route => {
      const request = route.request();
      assert.equal(new URL(request.url()).pathname, '/api/workshop/discovery');
      requests.push({ method: request.method(), headers: request.headers(), body: request.postDataJSON() });
      if (request.method() === 'GET') return route.fulfill({ json: { candidates: [candidate], cached: true } });
      if (responseMode === 'network-error') return route.abort('connectionrefused');
      if (responseMode === 'timeout') { heldRoute = route; return; }
      if (responseMode === 'success') return route.fulfill({ json: { candidates: [replacement], cached: false } });
      const { status, contentType, body } = responseMode;
      return route.fulfill({ status, contentType, body });
    });
    await page.goto(`http://127.0.0.1:${address.port}/__zhihu-search-test${reader === 'discovery' ? '?discovery' : ''}`);
    const search = page.getByRole('button', { name: '搜索', exact: true });
    const originalText = page.getByTestId(reader === 'workspace' ? 'zhw-source-text' : 'discovered-source-text');
    await page.locator(reader === 'workspace' ? '.zhw-post-open' : '.discovery-result').click();
    assert.equal(await originalText.textContent(), candidate.excerpt);
    await page.getByLabel(reader === 'workspace' ? '在知乎搜索回答' : '搜索新的知乎故事', { exact: true }).fill('悬疑故事 已完结');

    for (const scenario of [...cases, { name: 'network-error', message: '暂时无法连接服务，请检查网络后重试。' }, { name: 'timeout', message: '请求超时，请稍后重试。' }]) {
      responseMode = 'status' in scenario ? scenario : scenario.name as 'network-error' | 'timeout';
      const before = requests.length;
      const sent = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/api/workshop/discovery'));
      await search.click();
      await sent;
      if (responseMode === 'timeout') {
        assert.equal(await search.isDisabled(), true);
        await page.clock.fastForward(60_001);
      }
      const alert = page.getByRole('alert');
      await alert.filter({ hasText: scenario.message }).waitFor();
      assert.equal((await alert.textContent())?.includes('Unexpected token'), false);
      assert.equal(await originalText.textContent(), candidate.excerpt, `${reader}/${scenario.name} retains the current reading`);
      assert.equal(await search.isEnabled(), true);
      if (heldRoute) { await heldRoute.abort().catch(() => {}); heldRoute = undefined; }
      // Advance past the deadline to prove failures never silently replay a search.
      await page.clock.fastForward(65_000);
      assert.equal(requests.length, before + 1, `${reader}/${scenario.name} requires a manual retry`);
    }

    responseMode = 'success';
    await page.getByRole('button', { name: reader === 'workspace' ? '重新搜索' : '搜索', exact: true }).click();
    await page.getByText(replacement.title, { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.equal(await originalText.count(), 0, 'successful retry returns to the results list');
    assert.equal(await page.getByText(candidate.title, { exact: true }).count(), 0);
    assert.equal(requests.filter(request => request.method === 'GET').length, 1);
    assert.equal(requests.filter(request => request.method === 'POST').length, cases.length + 3);
    for (const request of requests) {
      assert.equal(request.headers['x-redleaf-account'], 'search-test-account', 'account isolation header is retained');
      assert.equal(request.headers.accept, 'application/json');
      if (request.method === 'POST') {
        assert.equal(request.headers['content-type'], 'application/json');
        assert.deepEqual(request.body, { query: '悬疑故事 已完结' });
      } else assert.equal(request.body, null);
    }
    assert.deepEqual(pageErrors, []);
    await context.close();
  }
  console.log(JSON.stringify({ ok: true, readers: ['workspace', 'discovery'], scenarios: [...cases.map(item => item.name), 'network-error', 'timeout', 'manual-retry-recovery', 'account-header-and-json-body'] }));
} finally { await browser.close(); await server.close(); }
