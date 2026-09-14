import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { ZhihuFavoriteItem, ZhihuFavoriteList } from '../shared/zhihu-favorites';
import type { GenerationOptions, ImportedSource, WorkshopProject } from '../shared/workshop';

// Every API request is intercepted. These fixtures never read real favorites or
// start a generation worker, even when the UI's generation button is exercised.
const base = process.env.FAVORITES_UI_URL ?? 'http://127.0.0.1:18475';
const output = process.env.FAVORITES_UI_OUTPUT ?? 'output/favorites-integration';
const account = { id: 'favorites-browser-reader', provider: 'zhihu', name: '收藏测试读者' };
const authorized = { configured: true, authorized: true, identityVerified: true, userDataConfigured: true };
const normalOptions: GenerationOptions = { mode: 'fast', adaptation: 'inspiration', images: 'none' };
const longOptions: GenerationOptions = { mode: 'full', adaptation: 'faithful', images: 'gpt6' };
const timestamp = '2026-09-14T08:00:00.000Z';
const largeOffset = '9223372036854775806';
const summary = '海边旧书店每天会收到一封没有寄件人的信。信中写着第二天将要发生的事。\n\n我原本以为这是一场恶作剧，直到母亲失踪前留下的银色钥匙出现在信封里。信纸背面写着一个从未听说过的地名，以及属于我的笔迹。\n\n摘要中的 <script> 标签只是文字，原作的换行和标点也应保留。';
const favorite = (id: string, title: string, url: string, extra: Partial<ZhihuFavoriteItem> = {}): ZhihuFavoriteItem => ({
  id, title, author: '海边写信的人', summary, url, contentType: 'answer', characters: summary.length, importable: true, ...extra,
});
const recent: ZhihuFavoriteItem[] = [
  favorite('fav_saved', '来自明天的信', 'https://www.zhihu.com/question/12345678/answer/87654321'),
  favorite('fav_generated', '收信人离开之后', 'https://zhuanlan.zhihu.com/p/87654322', { contentType: 'article' }),
  favorite('fav_short', '只有一把钥匙的线索', 'https://www.zhihu.com/question/12345678/answer/87654323', {
    summary: '信封里只有一把银色钥匙。', characters: 12, importable: false, unavailableReason: '收藏摘要不足 80 字，请补充正文后再使用。',
  }),
  favorite('fav_question', '尚未回答的问题', 'https://www.zhihu.com/question/12345679', {
    contentType: 'question', importable: false, unavailableReason: '目前仅支持回答和文章摘要生成。',
  }),
];
const folder: ZhihuFavoriteList = { id: '9223372036854775805', title: '旧书店与未寄出的信', description: '保留下来，留给下一个故事。', url: 'https://www.zhihu.com/collection/9223372036854775805' };
const olderFavorite = favorite('fav_older', '旧船票背面的地址', 'https://www.zhihu.com/question/12345678/answer/87654324');

type ScenarioState = {
  oauth: typeof authorized;
  recent: ZhihuFavoriteItem[];
  folders: ZhihuFavoriteList[];
  recentError?: { status: number; message: string };
  importError?: { status: number; message: string };
  folderEmpty?: boolean;
  projects: WorkshopProject[];
  sources: Map<string, ImportedSource>;
  calls: { path: string; method: string; offset: string | null }[];
  imports: { itemId: string; generate: boolean; generationOptions: GenerationOptions }[];
  manualImports: (ImportedSource & { generationOptions: GenerationOptions })[];
  violations: string[];
  pageErrors: string[];
  navigations: string[];
  viteUpdates: string[];
};
const browser = await chromium.launch({ headless: true });
const report: { scenario: string; width: number; screenshots: string[]; requestCount: number; navigations: string[]; viteUpdates: string[] }[] = [];
await mkdir(output, { recursive: true });

function projectFixture(item: ZhihuFavoriteItem, generate: boolean, options: GenerationOptions, index: number): WorkshopProject {
  return {
    id: `import-00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    ownerId: account.id, title: item.title, author: item.author, scope: 'zhihu-excerpt', sourceHash: 'a'.repeat(64),
    origin: { sourceUrl: item.url, workId: item.url.split('/').at(-1)!, kind: item.contentType === 'article' ? 'zhihu-article' : 'zhihu-answer', contentScope: 'favorite-summary', fetchedAt: timestamp },
    createdAt: timestamp, updatedAt: timestamp, revision: generate ? 1 : 0,
    status: generate ? 'running' : 'idle', stage: generate ? 'outline' : 'imported', completedRoutes: 0,
    playable: false, attempts: generate ? 1 : 0, generationOptions: options,
    art: { status: options.images === 'none' ? 'disabled' : 'pending', approved: 0, total: 0 },
    events: [{ at: timestamp, stage: 'imported', message: '收藏摘要已保存。' }],
  };
}

async function setup(width: number): Promise<{ context: BrowserContext; page: Page; state: ScenarioState }> {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const state: ScenarioState = { oauth: { ...authorized }, recent: [...recent], folders: [folder], projects: [], sources: new Map(), calls: [], imports: [], manualImports: [], violations: [], pageErrors: [], navigations: [], viteUpdates: [] };
  await context.addInitScript(id => {
    sessionStorage.setItem('redleaf-opening-v1', 'seen');
    localStorage.setItem(`redleaf.account.v1:${id}:redleaf.liukan.introduction.v1`, JSON.stringify({ seen: true }));
  }, account.id);
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    state.calls.push({ path, method: request.method(), offset: url.searchParams.get('offset') });
    if (path === '/api/auth/me') return route.fulfill({ json: { user: account, authentication: { required: true, provider: 'zhihu', configured: true, browserAvailable: true, loginUrl: '/api/oauth/start' } } });
    if (!path.startsWith('/api/oauth/')) {
      if (request.headers()['x-redleaf-account'] !== account.id) state.violations.push(`${path}: missing verified account header`);
      if (request.headers().authorization) state.violations.push(`${path}: OAuth authorization leaked to the UI`);
    }
    if (path === '/api/oauth/status') return route.fulfill({ json: state.oauth });
    if (path === '/api/stories') return route.fulfill({ json: { stories: [], source: 'cache' } });
    if (path === '/api/workshop/projects' && request.method() === 'GET') return route.fulfill({ json: { projects: state.projects, capabilities: { creativeConfigEditable: false } } });
    if (path === '/api/workshop/discovery') return route.fulfill({ json: { candidates: [] } });
    if (path === '/api/liukan/memories') return route.fulfill({ json: { memories: [] } });
    if (path === '/api/liukan/inbox') return route.fulfill({ json: { posts: [] } });
    if (path === '/api/workshop/favorites/recent') {
      if (state.recentError) return route.fulfill({ status: state.recentError.status, json: { error: { code: 'FAVORITES_READ_FAILED', message: state.recentError.message } } });
      return route.fulfill({ json: { items: state.recent } });
    }
    if (path === '/api/workshop/favorites/lists') return route.fulfill({ json: { lists: state.folders } });
    if (path === `/api/workshop/favorites/lists/${folder.id}/items`) {
      if (state.folderEmpty) return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: url.searchParams.has('offset') ? { items: [recent[0], olderFavorite] } : { items: [recent[0]], nextOffset: largeOffset } });
    }
    if (path === '/api/workshop/favorites/import') {
      const body = request.postDataJSON();
      if (JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(['generate', 'generationOptions', 'itemId'])) state.violations.push('Favorite import sent fields beyond the item identifier and generation choices');
      if (/access.?token|refresh.?token|app.?key|app.?secret|oauth|authorization/i.test(request.postData() ?? '')) state.violations.push('Favorite import contains OAuth credentials');
      state.imports.push(body);
      if (state.importError) return route.fulfill({ status: state.importError.status, json: { error: { code: 'AUTHORIZATION_REQUIRED', message: state.importError.message } } });
      const item = [...recent, olderFavorite].find(row => row.id === body.itemId);
      if (!item) return route.fulfill({ status: 400, json: { error: { message: 'Unknown fixture favorite' } } });
      const project = projectFixture(item, body.generate, body.generationOptions, state.projects.length + 1);
      state.projects.push(project);
      state.sources.set(project.id, { title: item.title, author: item.author, text: item.summary, scope: 'zhihu-excerpt', origin: project.origin });
      return route.fulfill({ json: project });
    }
    if (path === '/api/workshop/projects' && request.method() === 'POST') {
      const body = request.postDataJSON(); state.manualImports.push(body);
      const project = { ...projectFixture(recent[2], false, body.generationOptions, state.projects.length + 1), scope: 'user-import' as const, origin: undefined };
      state.projects.push(project); state.sources.set(project.id, body);
      return route.fulfill({ json: project });
    }
    const detail = path.match(/^\/api\/workshop\/projects\/([^/]+)(\/source)?$/);
    if (detail) return route.fulfill({ json: detail[2] ? state.sources.get(detail[1]) : state.projects.find(project => project.id === detail[1]) });
    if (path.startsWith('/api/workshop/favorites/')) state.violations.push(`Unexpected favorites API ${request.method()} ${path}`);
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  page.on('pageerror', error => state.pageErrors.push(error.message));
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) state.navigations.push(frame.url()); });
  page.on('console', message => { if (/\[vite\].*(?:update|reload)/i.test(message.text())) state.viteUpdates.push(message.text()); });
  page.setDefaultTimeout(12_000);
  return { context, page, state };
}

async function openWorkshop(page: Page) {
  await page.goto(base);
  await page.getByRole('button', { name: '新故事工作台', exact: true }).click();
  await page.getByRole('tab', { name: '我的知乎收藏', exact: true }).waitFor();
}
async function openFavorites(page: Page) {
  await page.getByRole('tab', { name: '我的知乎收藏', exact: true }).click();
}
function favoritesCalls(state: ScenarioState) { return state.calls.filter(call => call.path.startsWith('/api/workshop/favorites/')); }
async function cleanPage(page: Page, state: ScenarioState) {
  assert.deepEqual(state.violations, [], 'All requests must remain account bound and credentials must stay on the server');
  assert.deepEqual(state.pageErrors, [], 'The UI must not throw browser errors');
  assert.equal(state.navigations.length, 1, 'The page must not reload during a scenario');
  assert.deepEqual(state.viteUpdates, [], 'Source files must remain stable during a browser scenario');
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  assert.ok(dimensions.scroll <= dimensions.viewport + 1, `Horizontal page overflow: ${dimensions.scroll}px > ${dimensions.viewport}px`);
}
async function recordFailure(page: Page, state: ScenarioState, name: string, error: unknown) {
  await page.screenshot({ path: `${output}/failure-${name}.png`, fullPage: true });
  await writeFile(`${output}/failure-${name}.json`, JSON.stringify({
    error: String(error), navigations: state.navigations, viteUpdates: state.viteUpdates,
    pageErrors: state.pageErrors, violations: state.violations, calls: state.calls,
    selectedTab: await page.locator('.source-mode-tabs [aria-selected="true"]').textContent().catch(() => null),
    selectedFavorite: await page.locator('.favorite-preview h3').textContent({ timeout: 100 }).catch(() => null),
  }, null, 2));
}
async function screenshot(page: Page, name: string) {
  const path = `${output}/${name}.png`;
  await page.locator('.source-mode-tabs').scrollIntoViewIfNeeded();
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  assert.ok(dimensions.scroll <= dimensions.viewport + 1, `${name} has horizontal overflow: ${dimensions.scroll}px > ${dimensions.viewport}px`);
  await page.screenshot({ path });
  return path;
}

try {
  for (const width of [1280, 390]) {
    const { context, page, state } = await setup(width);
    try {
      await openWorkshop(page);
      assert.equal(favoritesCalls(state).length, 0, 'Private favorites must load only when the user opens the tab');
      await openFavorites(page);
      const panel = page.getByRole('region', { name: '我的知乎收藏', exact: true });
      await panel.getByRole('button', { name: new RegExp(recent[0].title) }).waitFor();
      assert.ok(favoritesCalls(state).some(call => call.path.endsWith('/recent')));
      assert.equal(favoritesCalls(state).filter(call => call.path.endsWith('/lists')).length, 0, 'Folders must remain lazy');
      assert.equal(await panel.locator('.favorite-row').count(), recent.length);
      const screenshots = [await screenshot(page, `recent-${width}`)];

      await panel.getByRole('button', { name: new RegExp(recent[0].title) }).click();
      assert.equal(await panel.getByTestId('favorite-summary').textContent(), summary, 'Summary bytes and paragraph breaks must survive preview');
      assert.equal(await panel.getByRole('link', { name: '查看知乎原文' }).getAttribute('href'), recent[0].url);
      await panel.getByText('以下为知乎收藏接口提供的摘要，并非完整原作。', { exact: false }).waitFor();
      assert.equal(await panel.locator('script').count(), 0);
      screenshots.push(await screenshot(page, `summary-${width}`));
      await panel.getByRole('button', { name: '仅保存收藏素材', exact: true }).click();
      await page.locator('.workshop-detail h2').filter({ hasText: recent[0].title }).waitFor();
      assert.deepEqual(state.imports[0], { itemId: recent[0].id, generate: false, generationOptions: normalOptions });
      assert.equal(state.projects[0].status, 'idle');
      await panel.getByRole('button', { name: '查看改编项目', exact: false }).waitFor();
      await page.getByRole('button', { name: '读导入原文', exact: true }).click();
      assert.equal(await page.getByTestId('imported-source-text').textContent(), summary);
      await page.getByText('这是你从知乎收藏中选取的摘要，由知乎收藏接口提供，并非完整原作。', { exact: false }).waitFor();
      await page.getByRole('button', { name: '返回工作台', exact: false }).click();

      await page.getByRole('radio', { name: '沿原作扩展', exact: false }).check();
      await page.getByRole('radio', { name: 'GPT6 简单插图', exact: false }).check();
      await page.getByLabel('创作篇幅').selectOption('full');
      await panel.getByRole('button', { name: '近期收藏', exact: true }).click();
      await panel.getByRole('button', { name: new RegExp(recent[1].title) }).click();
      await panel.getByRole('button', { name: '用这条收藏生成长篇', exact: true }).click();
      await page.locator('.workshop-detail h2').filter({ hasText: recent[1].title }).waitFor();
      assert.deepEqual(state.imports[1], { itemId: recent[1].id, generate: true, generationOptions: longOptions });
      await page.getByText('长篇精修 · 保留原作设定 · GPT6 简单插图', { exact: true }).waitFor();
      assert.equal(state.projects[1].status, 'running');
      screenshots.push(await screenshot(page, `generated-${width}`));

      await panel.getByRole('button', { name: '我的收藏夹', exact: true }).click();
      await panel.getByRole('button', { name: new RegExp(folder.title) }).click();
      await panel.getByRole('button', { name: '加载更多收藏', exact: false }).waitFor();
      assert.equal(await panel.locator('.favorite-row').count(), 1);
      await panel.getByRole('button', { name: '加载更多收藏', exact: false }).click();
      await panel.getByRole('button', { name: new RegExp(olderFavorite.title) }).waitFor();
      assert.equal(await panel.locator('.favorite-row').count(), 2, 'The second folder page must append new items and deduplicate repeated items');
      assert.equal(await panel.getByRole('button', { name: '加载更多收藏', exact: false }).count(), 0);
      assert.equal(favoritesCalls(state).filter(call => call.path.endsWith('/items') && call.offset !== null).at(-1)?.offset, largeOffset, 'An int64 paging cursor must never become a rounded JavaScript number');
      screenshots.push(await screenshot(page, `folder-${width}`));
      await panel.getByRole('button', { name: '近期收藏', exact: true }).click();
      await panel.getByRole('button', { name: new RegExp(recent[3].title) }).click();
      assert.equal(await panel.getByRole('button', { name: '用这条收藏生成长篇', exact: true }).isDisabled(), true);
      assert.equal(await panel.getByRole('button', { name: '补充正文后使用', exact: false }).count(), 0, 'Unsupported question URLs cannot enter the answer/article supplement path');
      await panel.getByRole('button', { name: '返回收藏内容', exact: false }).click();
      await panel.getByRole('button', { name: new RegExp(recent[2].title) }).click();
      assert.equal(await panel.getByRole('button', { name: '仅保存收藏素材', exact: true }).isDisabled(), true);
      await panel.getByRole('button', { name: '补充正文后使用', exact: false }).click();
      assert.equal(await page.getByRole('tab', { name: '粘贴或上传', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.getByLabel('回答标题 · 可留空').inputValue(), recent[2].title);
      assert.equal(await page.getByLabel('原文作者 · 可留空').inputValue(), recent[2].author);
      assert.equal(await page.getByLabel('回答正文 / 节选').inputValue(), recent[2].summary);
      assert.equal(await page.getByLabel('知乎来源链接 · 可选').inputValue(), recent[2].url);
      const supplemented = `${recent[2].summary}\n\n${summary}`;
      await page.getByLabel('回答正文 / 节选').fill(supplemented);
      await page.getByRole('button', { name: '仅保存原文', exact: true }).click();
      await page.locator('.workshop-detail h2').filter({ hasText: recent[2].title }).waitFor();
      assert.equal(state.manualImports[0].text, supplemented);
      assert.equal(state.manualImports[0].referenceUrl, recent[2].url);
      assert.equal(state.manualImports[0].scope, 'user-import');
      assert.equal(state.imports.length, 2, 'Supplementing a short favorite must use the normal source import');
      await cleanPage(page, state);
      report.push({ scenario: 'recent-preview-save-generate-folders-pagination-supplement', width, screenshots, requestCount: state.calls.length, navigations: state.navigations, viteUpdates: state.viteUpdates });
    } catch (error) {
      await recordFailure(page, state, `happy-${width}`, error);
      throw error;
    } finally { await context.close(); }
  }

  const accessStates = [
    { name: 'oauth-unconfigured', oauth: { ...authorized, configured: false }, text: '知乎登录尚未配置，暂时无法读取个人收藏。', link: false },
    { name: 'favorites-unconfigured', oauth: { ...authorized, userDataConfigured: false }, text: '当前服务尚未开通收藏读取，请联系管理员完成配置后重试。', link: false },
    { name: 'authorization-needed', oauth: { ...authorized, authorized: false }, text: '用你的知乎账号授权后，即可在这里查看收藏。', link: true },
    { name: 'identity-unverified', oauth: { ...authorized, identityVerified: false }, text: '用你的知乎账号授权后，即可在这里查看收藏。', link: true },
  ];
  for (const scenario of accessStates) {
    const { context, page, state } = await setup(390);
    try {
      state.oauth = scenario.oauth;
      await openWorkshop(page); await openFavorites(page);
      await page.getByText(scenario.text, { exact: true }).waitFor();
      const link = page.getByRole('link', { name: '授权知乎并查看收藏', exact: false });
      assert.equal(await link.count(), scenario.link ? 1 : 0);
      if (scenario.link) assert.equal(await link.getAttribute('href'), '/api/oauth/start');
      assert.equal(favoritesCalls(state).length, 0, 'Unavailable OAuth must not trigger private data requests');
      await cleanPage(page, state);
      report.push({ scenario: scenario.name, width: 390, screenshots: [await screenshot(page, `${scenario.name}-390`)], requestCount: state.calls.length, navigations: state.navigations, viteUpdates: state.viteUpdates });
    } finally { await context.close(); }
  }

  for (const scenario of ['empty', 'retry', 'reauthorize-read', 'reauthorize-import'] as const) {
    const { context, page, state } = await setup(390);
    try {
      if (scenario === 'empty') state.recent = [];
      if (scenario === 'retry') state.recentError = { status: 503, message: '收藏服务暂时不可用，请稍后重试。' };
      if (scenario === 'reauthorize-read') state.recentError = { status: 401, message: '知乎授权已过期，请重新授权后查看收藏。' };
      if (scenario === 'reauthorize-import') state.importError = { status: 409, message: '登录账号已变化，请刷新后重新授权。' };
      await openWorkshop(page); await openFavorites(page);
      const panel = page.getByRole('region', { name: '我的知乎收藏', exact: true });
      if (scenario === 'empty') {
        await panel.getByText('近期没有可读取的收藏，可以去“我的收藏夹”看看。', { exact: true }).waitFor();
        state.folders = [];
        await panel.getByRole('button', { name: '我的收藏夹', exact: true }).click();
        await panel.getByText('暂时没有可读取的公开收藏夹。', { exact: true }).waitFor();
        state.folders = [folder]; state.folderEmpty = true;
        await panel.getByRole('button', { name: '刷新知乎收藏', exact: true }).click();
        await panel.getByRole('button', { name: new RegExp(folder.title) }).click();
        await panel.getByText('这个收藏夹暂无可读取的公开内容。', { exact: true }).waitFor();
      } else if (scenario === 'retry') {
        await panel.getByRole('alert').getByText(state.recentError!.message).waitFor();
        state.recentError = undefined;
        await panel.getByRole('button', { name: '重试', exact: false }).click();
        await panel.getByRole('button', { name: new RegExp(recent[0].title) }).waitFor();
        assert.equal(await panel.getByRole('alert').count(), 0);
      } else {
        if (scenario === 'reauthorize-import') {
          await panel.getByRole('button', { name: new RegExp(recent[0].title) }).click();
          await panel.getByRole('button', { name: '仅保存收藏素材', exact: true }).click();
        }
        await panel.getByRole('button', { name: '刷新登录状态', exact: true }).waitFor();
        assert.equal(await panel.locator('.favorite-row, .favorite-preview').count(), 0, 'Expired/stale accounts must clear previously loaded private content');
        assert.equal(state.projects.length, 0);
      }
      await cleanPage(page, state);
      report.push({ scenario, width: 390, screenshots: [await screenshot(page, `${scenario}-390`)], requestCount: state.calls.length, navigations: state.navigations, viteUpdates: state.viteUpdates });
    } catch (error) {
      await recordFailure(page, state, `${scenario}-390`, error);
      throw error;
    } finally { await context.close(); }
  }
  await writeFile(`${output}/browser-report.json`, `${JSON.stringify({ ok: true, base, mockedExternalData: true, scenarios: report }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, scenarios: report.length, report: `${output}/browser-report.json`, screenshots: report.flatMap(row => row.screenshots) }));
} finally { await browser.close(); }
