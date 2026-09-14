import assert from 'node:assert/strict';
import test from 'node:test';
import { runStoryCli } from '../scripts/story-commands.ts';
import { StorySourceError } from '../server/story-source.ts';
import type { StoryDetail, StoryListResponse } from '../shared/types.ts';

const firstId = '1831621186162937856';
const list: StoryListResponse = {
  source: 'cache', fetchedAt: '2026-09-05T19:00:00.000Z', warning: 'Upstream temporarily unavailable; cached source.',
  stories: [
    { id: firstId, title: '未来岛', author: '苏青瓷', description: '海岛上的信号', labels: ['科幻', '脑洞'], sourceUrl: `https://api.zhihu.com/story/${firstId}`, playable: true },
    { id: '2025684191967294692', title: '蓝血', author: '桃花先生', description: '不一样的常识', labels: ['悬疑'], sourceUrl: 'https://api.zhihu.com/story/2025684191967294692', playable: true },
    { id: '1747681485547843585', title: '另一座岛', author: '另一位作者', description: '科幻节选', labels: ['科幻'], sourceUrl: 'https://api.zhihu.com/story/1747681485547843585', playable: false },
  ],
};

function fixture() {
  const logs: string[] = [];
  const errors: string[] = [];
  const calls: string[] = [];
  const detail: StoryDetail = { ...list.stories[0], author: '苏青瓷', content: '真实来源提供的节选', introduction: '简介', source: 'live', fetchedAt: list.fetchedAt, contentScope: 'api-excerpt' };
  return {
    logs, errors, calls, detail,
    output: { log: (value: string) => logs.push(value), error: (value: string) => errors.push(value) },
    service: {
      list: async (refresh?: boolean) => { calls.push(`list:${refresh}`); return structuredClone(list); },
      detail: async (id: string, refresh?: boolean) => { calls.push(`get:${id}:${refresh}`); return detail; },
    },
  };
}

test('CLI help and invalid flags finish without source requests', async () => {
  const valid = fixture();
  assert.equal(await runStoryCli(['--help'], valid.service, valid.output), 0);
  assert.match(valid.logs[0], /not official zhihu-cli/);
  assert.deepEqual(valid.calls, []);
  for (const args of [[], ['wrong'], ['get'], ['list', 'extra'], ['get', firstId, '--genre', '科幻'], ['list', '--limit', '0'], ['list', '--limit', '1.5'], ['list', '--limit', '101'], ['list', '--unknown']]) {
    const invalid = fixture();
    assert.equal(await runStoryCli(args, invalid.service, invalid.output), 2);
    assert.equal(invalid.errors.length, 1);
    assert.deepEqual(invalid.calls, []);
  }
});

test('CLI filtering preserves source freshness and attribution and applies limits last', async () => {
  const data = fixture();
  assert.equal(await runStoryCli(['list', '--genre', '科幻', '--query', '苏青瓷', '--limit', '1'], data.service, data.output), 0);
  const result = JSON.parse(data.logs[0]) as StoryListResponse;
  assert.deepEqual(result.stories.map(story => story.id), [firstId]);
  assert.equal(result.source, list.source);
  assert.equal(result.fetchedAt, list.fetchedAt);
  assert.equal(result.warning, list.warning);
  assert.equal(result.stories[0].author, '苏青瓷');
  assert.deepEqual(data.calls, ['list:true']);
  assert.equal(list.stories.length, 3);
  const empty = fixture();
  assert.equal(await runStoryCli(['list', '--query', 'no match'], empty.service, empty.output), 0);
  assert.deepEqual(JSON.parse(empty.logs[0]).stories, []);
});

test('CLI get returns the actual detail and failures keep machine-readable exit behavior', async () => {
  const data = fixture();
  assert.equal(await runStoryCli(['get', firstId], data.service, data.output), 0);
  assert.deepEqual(JSON.parse(data.logs[0]), data.detail);
  assert.deepEqual(data.calls, [`get:${firstId}:true`]);
  for (const error of [new StorySourceError('UPSTREAM_HTTP_ERROR', '接口返回 HTTP 503。'), new Error('private network internals')]) {
    const failed = fixture();
    failed.service.list = async () => { throw error; };
    assert.equal(await runStoryCli(['list'], failed.service, failed.output), 1);
    assert.equal(failed.logs.length, 0);
    assert.doesNotMatch(failed.errors[0], /private network internals/);
    assert.equal(JSON.parse(failed.errors[0]).error.code, error instanceof StorySourceError ? error.code : 'INTERNAL_ERROR');
  }
});
