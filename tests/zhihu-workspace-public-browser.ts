import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.OAUTH_UI_URL ?? 'http://127.0.0.1:18475';
const output = 'output/oauth-ui';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const account = { id: 'isolated-browser-reader', provider: 'zhihu', name: '测试读者' };
    const posts = [1, 2].map(n => ({ id: String(n).repeat(32), title: `可拖动的知乎故事 ${n}`, author: '测试作者', sourceUrl: `https://www.zhihu.com/question/12345678/answer/8765432${n}`, excerpt: `第 ${n} 篇故事里，楼道灯亮了，门边留着一把钥匙。`, characters: 30, visibleScope: 'expanded' }));
    const frame = { status: 'ready', frameId: 'frame-current-account', url: 'https://www.zhihu.com/', title: '知乎', width: 1100, height: 650, posts, capturedAt: new Date().toISOString(), document: { id: 'current-document', width: 1100, height: 650, scrollY: 0, html: '<!doctype html><html><body><h1>知乎</h1><article><h2>这里是可选中文字的原网页</h2><p>楼道灯亮了，门边留着一把钥匙。</p></article></body></html>' } };
    let opened = false;
    const captured: string[] = [], errors: string[] = [];
    const candidates = posts.map(post => ({ id: post.id, title: post.title, author: post.author, excerpt: post.excerpt, characters: post.characters, query: '', origin: { sourceUrl: post.sourceUrl, workId: post.sourceUrl.split('/').at(-1), kind: 'zhihu-answer', contentScope: 'webpage-selection', fetchedAt: new Date().toISOString() } }));
    await context.addInitScript(id => localStorage.setItem(`redleaf.account.v1:${id}:redleaf.liukan.introduction.v1`, JSON.stringify({ seen: true })), account.id);
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me') return route.fulfill({ json: { user: account, authentication: { required: true, provider: 'zhihu', configured: true, browserAvailable: true, loginUrl: '/api/oauth/start' } } });
      assert.equal(route.request().headers()['x-redleaf-account'], account.id, `${path} must bind the UI account`);
      if (path === '/api/stories') return route.fulfill({ json: { stories: [], source: 'cache' } });
      if (path === '/api/workshop/projects') return route.fulfill({ json: { projects: [], capabilities: { creativeConfigEditable: false } } });
      if (path === '/api/workshop/discovery') return route.fulfill({ json: { candidates: [] } });
      if (path === '/api/liukan/memories') return route.fulfill({ json: { memories: [] } });
      if (path === '/api/zhihu-browser/frame') return route.fulfill({ json: opened ? frame : { ...frame, status: 'closed', document: undefined, posts: [] } });
      if (path === '/api/zhihu-browser/open') { opened = true; return route.fulfill({ json: frame }); }
      if (path === '/api/zhihu-browser/capture') {
        const body = route.request().postDataJSON(); assert.equal(body.frameId, frame.frameId); captured.push(body.postId);
        return route.fulfill({ json: candidates.find(item => item.id === body.postId) });
      }
      if (path === '/api/liukan/inbox') {
        if (route.request().method() === 'GET') return route.fulfill({ json: { posts: [] } });
        const candidate = candidates.find(item => item.id === route.request().postDataJSON().candidateId);
        return route.fulfill({ json: { id: candidate!.id, candidate, receivedAt: new Date().toISOString() } });
      }
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const skipIntro = page.getByRole('button', { name: /跳过开篇/ });
    await skipIntro.waitFor({ state: 'visible', timeout: 2500 }).catch(() => undefined);
    if (await skipIntro.isVisible()) await skipIntro.click();
    await page.getByRole('button', { name: '新故事工作台', exact: true }).click();
    assert.equal(await page.getByText('配置创作中转站', { exact: true }).count(), 0);
    await page.locator('[data-tour="workshop-zhihu-browser"]').click();
    await page.getByRole('tab', { name: '知乎网页', exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: '知乎网页', exact: true }).getAttribute('aria-selected'), 'true');
    await page.frameLocator('iframe[title="知乎原网页，可直接选字和拖给刘看山"]').getByRole('heading', { name: '这里是可选中文字的原网页' }).waitFor();
    const cards = page.locator('.zhw-native-posts article[draggable="true"]');
    assert.equal(await cards.count(), 2);
    if (width === 1280) await cards.first().dragTo(page.locator('.liukan-pet'));
    else await cards.first().getByRole('button', { name: '交给看山' }).click();
    await page.locator('.liukan-source-preview').waitFor();
    assert.equal(captured[0], posts[0].id);
    await page.getByRole('button', { name: '收起刘看山陪伴面板', exact: true }).press('Enter');
    await cards.last().getByRole('button', { name: '交给看山' }).click();
    await page.locator('.liukan-post h3').filter({ hasText: posts[1].title }).waitFor();
    assert.deepEqual(captured, posts.map(post => post.id));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/restored-web-${width}.png` });
    await context.close();
  }
  console.log(JSON.stringify({ ok: true, scenarios: ['public-live-page-tab', 'selectable-page', 'draggable-answer-list', 'drag-to-liukan', 'mobile-feed-button', 'account-bound-requests'] }));
} finally { await browser.close(); }
