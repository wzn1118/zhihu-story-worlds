import assert from 'node:assert/strict';
import test from 'node:test';
import { zhihuBrowserAccessIssue } from '../server/zhihu-browser-access.ts';

test('Zhihu 40362 JSON is a terminal refusal, including the Chromium viewer prefix', () => {
  for (const prefix of ['', 'Pretty-print\n']) {
    assert.deepEqual(zhihuBrowserAccessIssue(403, prefix + JSON.stringify({ error: { message: '您当前请求存在异常', code: 40362 } }), false), { kind: 'request-denied', code: 40362 });
  }
  assert.deepEqual(zhihuBrowserAccessIssue(200, '{"error":{"code":40362}}', false), { kind: 'request-denied', code: 40362 });
  assert.deepEqual(zhihuBrowserAccessIssue(429, 'Too Many Requests', false), { kind: 'request-denied' });
});

test('visible verification remains interactive and article quotations do not become refusals', () => {
  assert.deepEqual(zhihuBrowserAccessIssue(403, '安全验证', true), { kind: 'verification' });
  assert.equal(zhihuBrowserAccessIssue(403, '正在检查浏览器，即将跳转到安全验证。', false), undefined);
  assert.equal(zhihuBrowserAccessIssue(200, '文章解释：{"error":{"code":40362}}，这是一个例子。', false), undefined);
  assert.equal(zhihuBrowserAccessIssue(200, '文章解释：{"error":{"code":40362}}', false), undefined);
  assert.equal(zhihuBrowserAccessIssue(200, '403 Forbidden Army', false), undefined);
  assert.equal(zhihuBrowserAccessIssue(200, '{"data":{"code":40362}}', false), undefined);
});
