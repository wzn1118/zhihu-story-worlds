import assert from 'node:assert/strict';
import test from 'node:test';
import { completeImportedSource, readDroppedSource, sourceWithUrl } from '../src/workshop-input.ts';

test('a dropped plain answer preserves source bytes and supplies honest missing metadata', () => {
  const raw = '\uFEFF这是回答的首行\r\n\r\n  原有问题和世界设定保持原样。  ';
  const source = readDroppedSource(raw, '回答.txt', 'text/plain');
  assert.equal(source.text, raw);
  assert.equal(source.title, '回答');
  assert.equal(source.author, '作者未提供');
  assert.equal(source.scope, 'user-import');
  assert.equal(source.origin, undefined);
});

test('a JSON answer retains its author and exact source and resolves a concrete Zhihu URL', () => {
  const text = '  值班钟每天慢七秒。\r\n\r\n她接到自己的电话。  ';
  const source = readDroppedSource(JSON.stringify({ title: '第七秒', author: '作者甲', text, origin: { sourceUrl: 'https://www.zhihu.com/question/123/answer/456?utm_source=test' } }), 'answer.json');
  assert.equal(source.text, text);
  assert.equal(source.author, '作者甲');
  assert.equal(source.referenceUrl, 'https://www.zhihu.com/question/123/answer/456');
});

test('incomplete or invalid dropped answers produce a useful error instead of stringified garbage', () => {
  assert.throws(() => readDroppedSource('[{}]', 'answer.json'), /一篇回答/);
  assert.throws(() => readDroppedSource('{"text":{}}', 'answer.json'), /文字类型/);
  assert.throws(() => readDroppedSource('{', 'answer.json'), /JSON/);
  assert.throws(() => readDroppedSource('字'.repeat(120001), 'answer.txt'), /120,000/);
});

test('a source can omit metadata while invalid provenance is rejected', () => {
  const source = completeImportedSource({ title: '', author: '', text: '问题：海底站为何听见自己的电话？\n正文', scope: 'user-import' });
  assert.equal(source.title, '问题：海底站为何听见自己的电话？');
  assert.throws(() => sourceWithUrl(source, 'https://www.zhihu.com/question/123'), /具体回答/);
  assert.throws(() => sourceWithUrl(source, 'https://www.zhihu.com.evil.test/answer/123'), /HTTPS 知乎/);
  assert.equal(sourceWithUrl(source, '').origin, undefined);
});
