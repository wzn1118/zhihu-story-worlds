import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Read-only anonymous diagnosis. Never open an account's persistent profile.
const profile = await mkdtemp(join(tmpdir(), 'redleaf-hotlist-anonymous-'));
const output = join(process.cwd(), 'output', 'hotlist-live-diagnostic.json');
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(), authenticated: false,
  browser: 'unmodified Playwright Chromium',
  limitation: 'Anonymous access cannot establish behavior for an authenticated Zhihu account.',
};
const browser = await chromium.launchPersistentContext(profile, {
  headless: true, viewport: { width: 1360, height: 900 }, locale: 'zh-CN',
  acceptDownloads: false,
});
try {
  const page = browser.pages()[0] || await browser.newPage();
  const navs: Array<{ url: string; status: number; method: string; initiator: string }> = [];
  let phase = 'hotlist';
  page.on('response', response => {
    const request = response.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      // Save no headers, cookies, tokens, or response data containing identity.
      const url = new URL(response.url());
      navs.push({ url: url.origin + url.pathname, status: response.status(), method: request.method(), initiator: phase });
    }
  });
  const result = await page.goto('https://www.zhihu.com/hot', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1800);
  report.hotlist = {
    httpStatus: result?.status(), url: new URL(page.url()).origin + new URL(page.url()).pathname,
    title: await page.title(),
    questionLinks: await page.locator('a[href*="/question/"]').count(),
    signInForm: await page.locator('input[name="username"], input[name="password"]').count() > 0,
  };
  const target = page.locator('a[href*="/question/"]').filter({ visible: true }).first();
  if (await target.count()) {
    const href = await target.getAttribute('href');
    const targetUrl = new URL(href!, page.url());
    if (targetUrl.hostname !== 'www.zhihu.com') throw new Error('Unexpected question host');
    report.target = targetUrl.origin + targetUrl.pathname;
    phase = 'natural-click';
    const popupPromise = browser.waitForEvent('page', { timeout: 7000 }).catch(() => null);
    await target.click({ timeout: 5000 });
    const popup = await popupPromise;
    const destination = popup ?? page;
    await destination.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
    await destination.waitForTimeout(1000);
    const pageStatus = async (p: typeof page) => p.evaluate(() => {
      let providerCode: number | undefined;
      try { providerCode = JSON.parse(document.body.innerText)?.error?.code; } catch {}
      return { url: location.origin + location.pathname, title: document.title,
        providerCode, signInForm: Boolean(document.querySelector('input[name="username"], input[name="password"]')),
        questionVisible: Boolean(document.querySelector('.QuestionHeader, .Question-main')),
        referrer: document.referrer ? new URL(document.referrer).origin + new URL(document.referrer).pathname : '',
      };
    });
    report.naturalClick = await pageStatus(destination);
    if (popup) await popup.close();
    phase = 'direct-goto';
    const direct = await page.goto(targetUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1000);
    report.directGoto = { ...await pageStatus(page), httpStatus: direct?.status() };
  } else {
    report.result = 'No visible public question link is available in the fresh anonymous hotlist page; no target requests were sent.';
  }
  report.navigations = navs;
} catch (error) {
  report.failure = error instanceof Error ? { name: error.name, message: error.message } : String(error);
} finally {
  await browser.close();
  await rm(profile, { recursive: true, force: true });
  await mkdir(join(process.cwd(), 'output'), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
