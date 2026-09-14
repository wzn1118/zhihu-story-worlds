import type { GameWorld } from './types';
import type { SourceScope } from './workshop';
import { originalStoryLinks } from './original-links';

export const zhihuStoryApi = 'https://api.zhihu.com/km-indep-home/hackathon/v2/story/';

export function zhihuImage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === 'zhimg.com' || url.hostname.endsWith('.zhimg.com'))) return url.href;
  } catch { /* Optional upstream image metadata. */ }
  return undefined;
}

export const sourceScopeLabel = (scope: SourceScope) => scope === 'zhihu-excerpt' ? '知乎原作节选' : scope === 'original-seed' ? '原创种子' : '用户导入';
export const isZhihuWorld = (world: GameWorld) => Boolean(world.source.origin) || world.adaptation.scope === 'based-on-api-excerpt';
export const worldSourceLabel = (world: GameWorld) => isZhihuWorld(world) ? '知乎原作' : world.adaptation.scope === 'original-seed' ? '原创种子' : '导入原文';

export interface OriginalSourceReference {
  id?: string;
  title: string;
  author?: string;
  sourceUrl?: string;
  originalUrl?: string;
  url?: string;
  origin?: { workId: string; sourceUrl: string; originalUrl?: string };
}

export function originalWorkUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
    const answer = url.hostname === 'www.zhihu.com' && /^\/question\/\d{5,24}\/answer\/\d{5,24}\/?$/.test(url.pathname);
    const article = url.hostname === 'zhuanlan.zhihu.com' && /^\/p\/\d{5,24}\/?$/.test(url.pathname);
    const book = url.hostname === 'www.zhihu.com' && /^\/market\/paid_column\/\d{5,24}(?:\/section\/\d{5,24})?\/?$/.test(url.pathname);
    if (answer || article || book) return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  } catch { /* Missing optional source metadata. */ }
  return undefined;
}

export function sourceReadingUrl(source: OriginalSourceReference): string | undefined {
  for (const value of [source.originalUrl, source.origin?.originalUrl, source.origin?.sourceUrl, source.sourceUrl, source.url]) {
    const direct = originalWorkUrl(value);
    if (direct) return direct;
  }
  const apiId = [source.sourceUrl, source.url, source.origin?.sourceUrl].find(value => value?.startsWith(zhihuStoryApi))?.slice(zhihuStoryApi.length);
  const id = source.origin?.workId ?? apiId ?? source.id;
  return id ? originalWorkUrl(originalStoryLinks[id]) : undefined;
}

export function sourceSearchUrl(source: OriginalSourceReference): string {
  return `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(`${source.title} ${source.author ?? ''}`.trim())}`;
}
