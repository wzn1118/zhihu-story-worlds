import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { creativeFailureReason, runCreative } from '../server/workshop-creative.ts';

test('billing failures are distinguished from their transport HTTP status', () => {
  for (const message of ['HTTP 403: insufficient_balance', '403 Insufficient credits', '402 Payment Required', '余额不足']) {
    assert.equal(creativeFailureReason(message), '上游计费或额度状态未就绪');
  }
});

test('rate, authentication, schema, service and stream errors have bounded public categories', () => {
  for (const [message, expected] of [
    ['429 rate limit exceeded', '上游限流'],
    ['401 authentication failed', '认证或访问被上游拒绝'],
    ['403 Forbidden', '认证或访问被上游拒绝'],
    ['invalid JSON schema', '上游结构化输出或配置校验失败'],
    ['503 Service Unavailable', '上游服务暂不可用'],
    ['502 Bad Gateway', '上游服务暂不可用'],
    ['stream disconnected before completion', '连接或流式响应中断'],
    ['network timeout', '连接或流式响应中断'],
  ]) assert.equal(creativeFailureReason(message), expected);
});

test('the public category never echoes unknown response bodies, URLs or tokens', () => {
  const text = 'opaque test response https://example.invalid/?token=TEST_PRIVATE_VALUE';
  const category = creativeFailureReason(text);
  assert.equal(category, '创作进程异常退出');
  assert.ok(!category.includes('TEST_PRIVATE_VALUE'));
  assert.ok(!category.includes('example.invalid'));
  assert.equal(creativeFailureReason('opaque request id 14031'), '创作进程异常退出');
});

test('an actual failed test subprocess persists categories without raw response contents', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'workshop-error-receipt-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const previous = process.env.WORKSHOP_CODEX_BIN;
  context.after(() => { if (previous === undefined) delete process.env.WORKSHOP_CODEX_BIN; else process.env.WORKSHOP_CODEX_BIN = previous; });
  // Node runs this test-only script as its "exec" argument, never a creative model.
  await writeFile(join(directory, 'exec'), `process.stdin.resume(); process.stdin.on('end', () => {
    process.stdout.write(JSON.stringify({type:'error',message:'HTTP 403 insufficient_balance TEST_PRIVATE_BODY'})+'\\n');
    process.exitCode=1;
  });`);
  process.env.WORKSHOP_CODEX_BIN = process.execPath;
  await assert.rejects(runCreative(directory, 'test-failure', { type: 'object', properties: {}, required: [], additionalProperties: false }, 'Automated test input only.'), /上游计费或额度状态未就绪/);
  const raw = await readFile(join(directory, 'test-failure.receipt.json'), 'utf8');
  const receipt = JSON.parse(raw);
  assert.equal(receipt.exitCode, 1);
  assert.equal(receipt.lastErrorCategory, '上游计费或额度状态未就绪');
  assert.equal(receipt.failureReason, '上游计费或额度状态未就绪');
  assert.ok(!raw.includes('TEST_PRIVATE_BODY'));
  assert.ok(!raw.includes('insufficient_balance'));
});
