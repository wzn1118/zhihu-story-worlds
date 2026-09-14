import { readFileSync } from 'node:fs';

type RecordedExcerpt = {
  fetchedAt: string; contentSha256: string;
  data: { work_id: string; chapter_name: string; author_name: string; content: string };
};
const fixture = JSON.parse(readFileSync(new URL('./fixtures/zhihu-story-excerpts.json', import.meta.url), 'utf8')) as {
  stories: Record<string, RecordedExcerpt>;
};
export function recordedStoryExcerpt(storyId: string): RecordedExcerpt {
  const record = fixture.stories[storyId];
  if (!record) throw new Error(`Missing recorded source excerpt: ${storyId}`);
  return record;
}
