import assert from 'node:assert/strict';
import test from 'node:test';
import { LIUKAN_POST_MIME } from '../shared/liukan-inbox.ts';
import { ZHIHU_BROWSER_POST_MIME } from '../shared/zhihu-browser.ts';
import { isLiukanDrag, parseLiukanDrop, parseLiukanFeed } from '../src/liukan-drop.ts';

const transfer = (type: string, raw: unknown) => ({ types: [type], getData: () => typeof raw === 'string' ? raw : JSON.stringify(raw) });

test('candidate drops and touch feeds carry only a candidate identity', () => {
  const payload = { candidateId: 'candidate_123', title: 'Untrusted replacement', excerpt: 'Do not use this text' };
  assert.deepEqual(parseLiukanDrop(transfer(LIUKAN_POST_MIME, payload)), { kind: 'candidate', candidateId: 'candidate_123' });
  assert.deepEqual(parseLiukanFeed(payload), { kind: 'candidate', candidateId: 'candidate_123' });
});

test('live browser drops require both the post and the captured frame', () => {
  assert.deepEqual(parseLiukanDrop(transfer(ZHIHU_BROWSER_POST_MIME, { postId: 'post-321', frameId: 'frame-123' })), { kind: 'browser', postId: 'post-321', frameId: 'frame-123' });
  assert.equal(parseLiukanDrop(transfer(ZHIHU_BROWSER_POST_MIME, { postId: 'post-321' })), null);
});

test('click-to-feed opens the same browser capture path and ignores supplied source text', () => {
  assert.deepEqual(parseLiukanFeed({ kind: 'browser', postId: 'post-321', frameId: 'frame-123', excerpt: 'untrusted text' }), { kind: 'browser', postId: 'post-321', frameId: 'frame-123' });
  assert.equal(parseLiukanFeed({ kind: 'browser', postId: 'post-321', candidateId: 'candidate-123' }), null);
  assert.equal(parseLiukanFeed({ kind: 'browser', postId: '../source', frameId: 'frame-123' }), null);
  assert.equal(parseLiukanDrop(transfer(LIUKAN_POST_MIME, { kind: 'browser', postId: 'post-321', frameId: 'frame-123' })), null);
});

test('foreign, malformed and oversized drop payloads never become a saved source', () => {
  assert.equal(isLiukanDrag(['text/plain', 'Files']), false);
  assert.equal(parseLiukanDrop(transfer('text/plain', { candidateId: 'candidate_123' })), null);
  assert.equal(parseLiukanDrop(transfer(LIUKAN_POST_MIME, '{')), null);
  assert.equal(parseLiukanDrop(transfer(LIUKAN_POST_MIME, { candidateId: '../credential' })), null);
  assert.equal(parseLiukanDrop(transfer(LIUKAN_POST_MIME, 'x'.repeat(2049))), null);
  assert.equal(parseLiukanFeed(null), null);
});
