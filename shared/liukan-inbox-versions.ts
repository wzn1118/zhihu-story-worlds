import type { LiukanInboxPost } from './liukan-inbox';
import { canonicalZhihuSource } from './zhihu-discovery';

/** One answer stays one reading, even when its captured text or question URL changes. */
export function sameAnswerKey(post: LiukanInboxPost): string {
  try {
    const source = canonicalZhihuSource(post.candidate.origin.sourceUrl);
    return `${source.kind}:${source.workId}`;
  } catch { return `record:${post.id}`; }
}

function expanded(post: LiukanInboxPost) {
  return post.candidate.origin.contentScope === 'webpage-selection' && post.candidate.origin.webpageScope === 'expanded';
}

function comparableText(post: LiukanInboxPost) {
  let text = post.candidate.excerpt.trim();
  // Older collapsed Zhihu cards included an author prefix which the expanded
  // RichText omits. This normalization is for comparison only: never edit prose.
  for (const prefix of [`${post.candidate.author}：`, `${post.candidate.author}:`]) {
    if (text.startsWith(prefix)) { text = text.slice(prefix.length).trim(); break; }
  }
  return text.replace(/(?:\.{3,}|…+)\s*$/, '').replace(/\s+/g, '');
}

function provenance(post: LiukanInboxPost) {
  const origin = post.candidate.origin;
  if (origin.contentScope !== 'webpage-selection') return 0;
  return origin.webpageScope === 'excerpt' || /(?:\.{3,}|…+)\s*$/.test(post.candidate.excerpt) ? 1 : 2;
}

/** Select a display version without changing immutable source IDs or saved notes. */
export function preferredInboxPost(a: LiukanInboxPost, b: LiukanInboxPost): LiukanInboxPost {
  if (sameAnswerKey(a) !== sameAnswerKey(b)) throw new Error('Cannot merge different answers');
  if (a.id === b.id) return a;
  if (expanded(a) !== expanded(b)) return expanded(a) ? a : b;
  if (!expanded(a)) {
    const aText = comparableText(a), bText = comparableText(b);
    // Recognize old short/expanded duplicates even before page scope was saved.
    // A later excerpt must not replace already saved continuation paragraphs.
    if (aText && bText && aText !== bText) {
      if (bText.startsWith(aText)) return b;
      if (aText.startsWith(bText)) return a;
    }
    if (provenance(a) !== provenance(b)) return provenance(a) > provenance(b) ? a : b;
  }
  // Two fully expanded snapshots can represent an author's edit, including a
  // shorter revision. Keep the latest observed version rather than most words.
  const order = a.candidate.origin.fetchedAt.localeCompare(b.candidate.origin.fetchedAt)
    || a.learnedAt.localeCompare(b.learnedAt) || a.id.localeCompare(b.id);
  return order >= 0 ? a : b;
}

export function uniqueInboxPosts(posts: readonly LiukanInboxPost[]): LiukanInboxPost[] {
  const sources = new Map<string, LiukanInboxPost>();
  for (const post of posts) {
    const key = sameAnswerKey(post), previous = sources.get(key);
    sources.set(key, previous ? preferredInboxPost(previous, post) : post);
  }
  return [...sources.values()].sort((a, b) => b.learnedAt.localeCompare(a.learnedAt) || a.id.localeCompare(b.id));
}
