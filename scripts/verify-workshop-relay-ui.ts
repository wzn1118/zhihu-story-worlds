import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Isolated component and mocked relay endpoints: no saved service keys or live models.
const output = resolve('output/playwright/workshop-relay');
await mkdir(output, { recursive: true });
await build({ entryPoints: ['tests/fixtures/workshop-relay-browser.tsx'], outdir: output, bundle: true, format: 'esm', jsx: 'automatic' });
const server = createServer(async (request, response) => {
  if (request.url === '/workshop-relay-browser.js') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(resolve(output, 'workshop-relay-browser.js'))); }
  else if (request.url === '/styles.css') { response.setHeader('content-type', 'text/css'); response.end(await readFile(resolve('src/styles.css'))); }
  else if (request.url === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{background:#111315;padding:24px}#root{max-width:620px;margin:auto}</style><div id="root"></div><script type="module" src="/workshop-relay-browser.js"></script></html>');
  } else response.writeHead(404).end();
});
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ headless: true, executablePath: process.env.WORKSHOP_TEST_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const requests: { path: string; body: Record<string, string> }[] = [];
const checks: string[] = [], errors: string[] = [];
let modelError = false, connectionError = false;
let slowKey = '', slowModel = '';
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/workshop/creative-config/**', async route => {
  const path = new URL(route.request().url()).pathname.split('/').at(-1)!;
  const body = route.request().postDataJSON() as Record<string, string>;
  requests.push({ path, body });
  const wait = body.apiKey === slowKey || path === 'check' && body.model === slowModel;
  const failed = path === 'models' ? modelError : connectionError;
  if (wait) await new Promise(done => setTimeout(done, 1700));
  const result = path === 'models' ? { endpoint: body.endpoint.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1', models: ['a-embedding', 'bge-m3', 'gpt-text', 'model-b', 'z-image'] }
    : { endpoint: body.endpoint, model: body.model, protocol: body.protocol === 'auto' ? 'chat-completions' : body.protocol, connected: true, latencyMs: 125 };
  await route.fulfill({ status: failed ? 401 : 200, contentType: 'application/json', body: JSON.stringify(failed ? { error: { code: 'authentication', message: '认证失败，请检查 API 密钥。' } } : result) }).catch(() => {});
});
const save = page.getByRole('button', { name: '保存中转站', exact: true });
const endpoint = page.getByLabel('中转站地址', { exact: true });
const key = page.getByLabel('API 密钥', { exact: true });
const models = page.getByLabel('可用模型', { exact: true });
const status = page.locator('.relay-detection-status');
const connected = () => page.waitForFunction(() => document.querySelector('.relay-detection-status')?.getAttribute('data-state') === 'connected');
try {
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
  await page.waitForFunction(() => Boolean((window as any).relayTest));
  await page.waitForTimeout(850);
  assert.equal(requests.length, 0);
  assert.equal(await endpoint.inputValue(), 'https://saved.example/v1');
  assert.equal(await models.inputValue(), 'saved-model');
  assert.equal(await save.isDisabled(), true);
  assert.equal(await page.getByLabel('模型名', { exact: true }).count(), 0);
  checks.push('Saved configuration is prefilled without requests or manual model input');

  await page.getByRole('button', { name: '重新检测', exact: true }).click();
  await connected();
  assert.equal(requests[0].body.apiKey, '');
  assert.equal(requests[1].body.protocol, 'auto');
  assert.equal(await save.isEnabled(), true);
  checks.push('Existing endpoint can detect with its server-stored key');

  const previousCalls = requests.length;
  await endpoint.fill('https://relay.example');
  assert.equal(await save.isDisabled(), true);
  assert.equal(await models.isDisabled(), true);
  await page.waitForTimeout(850);
  assert.equal(requests.length, previousCalls);
  await key.fill('test-key-one');
  await page.waitForTimeout(150);
  assert.equal(requests.length, previousCalls);
  await connected();
  assert.equal(requests.length, previousCalls + 2);
  assert.equal(await models.inputValue(), 'gpt-text');
  assert.deepEqual(await models.locator('option').allTextContents(), ['a-embedding', 'bge-m3', 'gpt-text', 'model-b', 'z-image']);
  assert.match(await status.innerText(), /Chat Completions/);
  checks.push('Credential edits invalidate save and debounce model discovery before real connection check');

  slowModel = 'model-b';
  await models.selectOption('model-b');
  await page.waitForFunction(() => document.querySelector('.relay-detection-status')?.getAttribute('data-state') === 'loading');
  assert.equal(await save.isDisabled(), true);
  await key.fill('test-key-two');
  await connected();
  assert.equal(await models.inputValue(), 'gpt-text');
  await page.waitForTimeout(1900);
  assert.match(await status.innerText(), /gpt-text/);
  assert.doesNotMatch(await status.innerText(), /model-b/);
  slowModel = '';
  checks.push('Late connection response cannot validate a newer credential or model selection');

  slowKey = 'test-key-slow';
  await key.fill(slowKey);
  await page.waitForTimeout(800);
  await key.fill('test-key-current');
  await connected();
  await page.waitForTimeout(1900);
  assert.equal(requests.filter(item => item.path === 'check' && item.body.apiKey === slowKey).length, 0);
  checks.push('Late discovery response cannot launch checks using stale credentials');

  connectionError = true;
  await models.selectOption('model-b');
  await page.waitForFunction(() => document.querySelector('.relay-detection-status')?.getAttribute('data-state') === 'error');
  assert.equal(await save.isDisabled(), true);
  const listsBeforeRetry = requests.filter(item => item.path === 'models').length;
  connectionError = false;
  await page.getByRole('button', { name: '重试连接', exact: true }).click();
  await connected();
  assert.equal(requests.filter(item => item.path === 'models').length, listsBeforeRetry);
  checks.push('Connection failure blocks save and retries the selected model');

  modelError = true;
  await key.fill('test-key-invalid');
  await page.waitForFunction(() => document.querySelector('.relay-detection-status')?.getAttribute('data-state') === 'error');
  assert.equal(await save.isDisabled(), true);
  assert.equal(await models.isDisabled(), true);
  modelError = false;
  await page.getByRole('button', { name: '重试检测', exact: true }).click();
  await connected();
  checks.push('Model discovery failure clears choices and retry recovers automatically');

  await page.getByLabel('连接协议', { exact: true }).selectOption('responses');
  await connected();
  assert.equal(requests.at(-1)?.body.protocol, 'responses');
  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
  const countBeforeSave = requests.length;
  await save.click();
  await page.getByText('中转站配置已保存，新的生成会使用它。', { exact: true }).waitFor();
  assert.equal(await key.inputValue(), '');
  await page.waitForTimeout(850);
  assert.equal(requests.length, countBeforeSave);
  const saved = await page.evaluate(() => (window as any).relayTest.saves);
  assert.deepEqual(Object.keys(saved[0]).sort(), ['apiKey', 'endpoint', 'model', 'protocol']);
  assert.equal(saved[0].protocol, 'responses');
  assert.equal(saved[0].endpoint, 'https://relay.example/v1');
  assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('test-key')), false);
  checks.push('Validated protocol and endpoint are saved without reasoning; key clears without new requests or browser storage');

  await page.getByRole('button', { name: '清除配置', exact: true }).click();
  assert.equal(await key.inputValue(), '');
  assert.equal(await endpoint.inputValue(), '');
  await page.getByRole('button', { name: '接入当前配置', exact: true }).click();
  assert.equal(await endpoint.inputValue(), 'https://saved.example/v1');
  assert.deepEqual(await page.evaluate(() => ({ clear: (window as any).relayTest.clearCalls, environment: (window as any).relayTest.environmentCalls })), { clear: 1, environment: 1 });
  checks.push('Clear and environment import controls remain available');

  await key.fill('test-key-unmount');
  const beforeUnmount = requests.length;
  await page.evaluate(() => (window as any).relayTest.unmount());
  await page.waitForTimeout(900);
  assert.equal(requests.length, beforeUnmount);
  assert.deepEqual(errors, []);
  checks.push('Unmount cancels pending discovery without browser errors');
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ checks, requests: requests.length, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, output }, null, 2));
} finally {
  await browser.close();
  await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
}
