import assert from 'node:assert/strict';
import test from 'node:test';
import type { LiukanReadingNote } from '../shared/liukan-reading.ts';
import { readingFingerprint, readingNoteMarkdown } from '../src/liukan-reading-view.ts';

const note: LiukanReadingNote = {
  id: 'reading-current', skill: 'ask', title: '电话里的那句话', summary: '原文没有交代来电者的身份。',
  sections: [{ heading: '能确认的事', body: '电话响过，但对方没有开口。', evidence: [{ postId: 'post-a', quote: '电话又响了一次。\n她没有接。' }] }],
  sources: [{ postId: 'post-a', title: '夜里来电', author: '原作者', sourceUrl: 'https://www.zhihu.com/question/1/answer/2', sourceHash: 'source-hash', contentScope: 'webpage-selection', complete: true, current: true }],
  invented: false, model: 'configured-model', source: 'relay', createdAt: '2026-09-13T00:00:00.000Z',
};

test('standalone fingerprints preserve existing uncertain task keys', () => {
  const original = JSON.stringify({ skill: 'compare', postIds: ['a', 'b'], question: '这两篇有什么不同？' });
  assert.equal(readingFingerprint('compare', ['b', 'a'], ' 这两篇有什么不同？ '), original);
  assert.equal(readingFingerprint('compare', ['b', 'a'], '这两篇有什么不同？', undefined), original);
  assert.notEqual(readingFingerprint('compare', ['a', 'b'], '这两篇有什么不同？', 'reading-parent'), original);
  assert.notEqual(readingFingerprint('ask', ['a'], '为什么？', 'reading-a'), readingFingerprint('ask', ['a'], '为什么？', 'reading-b'));
});

test('continued Markdown preserves the question and parent relation separately from exact source quotes', () => {
  const markdown = readingNoteMarkdown({ ...note, parentNoteId: 'reading-parent', question: '上一页说她在躲谁，有原文依据吗？' }, { id: 'reading-parent', title: '先前关于电话的猜想' });
  assert.match(markdown, /续读自：先前关于电话的猜想/);
  assert.match(markdown, /前页编号：reading-parent/);
  assert.match(markdown, /前页是看山写的手记，仅作为讨论背景/);
  assert.match(markdown, /## 这次的问题\n\n上一页说她在躲谁，有原文依据吗？/);
  assert.ok(markdown.includes('> 电话又响了一次。\n> 她没有接。'));
  assert.match(markdown, /知乎网页选取；本次阅读覆盖全部已保存文字/);
  assert.ok(!markdown.includes('> 先前关于电话的猜想'));
});

test('older notes export without inventing a question or a parent and stale scope remains visible', () => {
  const markdown = readingNoteMarkdown({ ...note, skill: 'recap', sources: [{ ...note.sources[0], contentScope: 'search-excerpt', current: false, complete: false }] });
  assert.ok(!markdown.includes('续读自：'));
  assert.ok(!markdown.includes('## 这次的问题'));
  assert.match(markdown, /知乎搜索节选；本次阅读仅使用部分已保存文字；原文已变更/);
  const unknownParent = readingNoteMarkdown({ ...note, parentNoteId: 'reading-parent' }, { id: 'reading-other', title: '不相干的标题' });
  assert.match(unknownParent, /续读自：上一页阅读手记/);
  assert.ok(!unknownParent.includes('不相干的标题'));
});
