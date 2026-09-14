import type { ZhihuOrigin } from './types';

export interface ZhihuCandidate {
  id: string; title: string; author: string; excerpt: string; origin: ZhihuOrigin;
  sourceHash?: string;
  query: string; characters: number;
}
export interface ZhihuDiscoveryResult { candidates: ZhihuCandidate[]; query?: string; fetchedAt?: string; cached: boolean }

export function canonicalZhihuSource(value: unknown): { sourceUrl: string; workId: string; kind: 'zhihu-answer' | 'zhihu-article' } {
  if (typeof value !== 'string') throw new Error('Missing source URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Invalid source URL');
  const answer = url.hostname === 'www.zhihu.com' && /^\/question\/\d{5,24}\/answer\/(\d{5,24})\/?$/.exec(url.pathname);
  const article = url.hostname === 'zhuanlan.zhihu.com' && /^\/p\/(\d{5,24})\/?$/.exec(url.pathname);
  const match = answer || article;
  if (!match) throw new Error('Not a Zhihu answer or article');
  return { kind: answer ? 'zhihu-answer' : 'zhihu-article', workId: match[1], sourceUrl: `${url.origin}${url.pathname.replace(/\/$/, '')}` };
}
