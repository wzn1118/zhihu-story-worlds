import { accountFetch } from './account-storage';

export class ZhihuRequestError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); }
}

function responseError(status: number): string {
  if (status === 401) return '登录状态已失效，请重新登录后再试。';
  if (status === 403) return '当前账号无权执行此操作，请确认登录账号后再试。';
  if (status === 408 || status === 504) return '请求超时，请稍后重试。';
  if (status === 429) return '请求过于频繁，请稍后重试。';
  if (status >= 500) return `服务暂时不可用（${status}），请稍后重试。`;
  if (status >= 400) return `请求未完成（${status}），请刷新页面后重试。`;
  return '服务返回了异常内容，请刷新页面后重试。';
}

/** Both Zhihu readers use the same account-bound API and may receive proxy error pages. */
export async function requestZhihuJson<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  // Allow the server's 45-second search deadline to return its specific error.
  // Import/generation requests have their own longer server deadlines.
  const deadline = path === '/api/workshop/discovery' ? 60_000
    : path === '/api/zhihu-browser/open' ? 65_000
    : path === '/api/zhihu-browser/frame' ? 25_000
    : path.startsWith('/api/zhihu-browser/') ? 45_000
    : path.startsWith('/api/zhihu/questions/') ? 40_000 : undefined;
  const timeout = deadline === undefined ? undefined : window.setTimeout(() => controller.abort(), deadline);
  try {
    const response = await accountFetch(path, {
      signal: controller.signal,
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new ZhihuRequestError(responseError(response.status), 'INVALID_RESPONSE', response.status); }
    if (!response.ok) {
      const message = data?.error?.message;
      const code = typeof data?.error?.code === 'string' ? data.error.code : 'HTTP_ERROR';
      throw new ZhihuRequestError(typeof message === 'string' && message.trim() ? message : responseError(response.status), code, response.status);
    }
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new ZhihuRequestError(path.startsWith('/api/zhihu-browser/') ? '请求超时，请重新连接后查看当前页面。' : '请求超时，请稍后重试。', 'REQUEST_TIMEOUT', 408);
    if (error instanceof TypeError) throw new ZhihuRequestError('暂时无法连接服务，请检查网络后重试。', 'NETWORK_ERROR', 0);
    throw error;
  } finally { if (timeout !== undefined) window.clearTimeout(timeout); }
}
