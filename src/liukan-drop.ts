import { LIUKAN_POST_MIME } from '../shared/liukan-inbox';
import { ZHIHU_BROWSER_POST_MIME } from '../shared/zhihu-browser';

export const LIUKAN_FEED_EVENT = 'redleaf:feed-post';
export type LiukanDrop = { kind: 'candidate'; candidateId: string } | { kind: 'browser'; postId: string; frameId: string };
export interface LiukanDragData { types: readonly string[]; getData: (type: string) => string }
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);

export function isLiukanDrag(types: readonly string[]) {
  return types.includes(LIUKAN_POST_MIME) || types.includes(ZHIHU_BROWSER_POST_MIME);
}

export function parseLiukanFeed(value: unknown): LiukanDrop | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.kind === 'browser') return validId(row.postId) && validId(row.frameId) ? { kind: 'browser', postId: row.postId, frameId: row.frameId } : null;
  return validId(row.candidateId) ? { kind: 'candidate', candidateId: row.candidateId } : null;
}

/** Only identifiers cross the drop boundary. The server supplies the actual source text. */
export function parseLiukanDrop(data: LiukanDragData): LiukanDrop | null {
  const type = data.types.includes(ZHIHU_BROWSER_POST_MIME) ? ZHIHU_BROWSER_POST_MIME : data.types.includes(LIUKAN_POST_MIME) ? LIUKAN_POST_MIME : null;
  if (!type) return null;
  const raw = data.getData(type);
  if (raw.length > 2048) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (type === LIUKAN_POST_MIME) {
      const candidate = parseLiukanFeed(parsed);
      return candidate?.kind === 'candidate' ? candidate : null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const row = parsed as Record<string, unknown>;
    return validId(row.postId) && validId(row.frameId) ? { kind: 'browser', postId: row.postId, frameId: row.frameId } : null;
  } catch { return null; }
}
