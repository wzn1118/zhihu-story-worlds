import { requestAccountRecheck } from './account-sync';

export type Account = { id: string; email?: string; name: string; avatarUrl?: string; provider?: 'zhihu' | 'local' };
export type AuthMode = 'login' | 'register';
export type Authentication = {
  required: boolean;
  provider: 'zhihu' | 'local';
  configured: boolean;
  loginUrl: string;
  browserAvailable: boolean;
};
export type AuthSession = { user: Account | null; authentication?: Authentication; error?: { code: string; message: string } };

/** Preserve the response for its caller while recovering an expired workspace session. */
export async function sessionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if ((response.status !== 401 && response.status !== 409) || typeof location === 'undefined') return response;
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/') || /^\/api\/(auth|oauth)(\/|$)/.test(url.pathname)) return response;
  const data = await response.clone().json().catch(() => null);
  if ((response.status === 401 && data?.error?.code === 'AUTH_REQUIRED') ||
      (response.status === 409 && data?.error?.code === 'ACCOUNT_CHANGED')) requestAccountRecheck();
  return response;
}

export async function readAuthSession(): Promise<AuthSession> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? '暂时无法检查登录状态，请稍后重试。');
  return { ...data, user: data.user ?? null };
}

export async function readAccount(): Promise<Account | null> {
  return (await readAuthSession()).user;
}

export async function logoutAccount(): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message ?? '暂时无法退出登录，请重试。');
  }
}

export async function authenticateAccount(mode: AuthMode, credentials: { email: string; name: string; password: string }): Promise<Account> {
  const response = await fetch(`/api/auth/${mode}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? '账号操作失败。');

  // A successful password check alone does not prove that the browser retained
  // the session cookie. Mount the workspace only after a cookie-backed request.
  const account = await readAccount();
  if (!account || account.id !== data.user?.id) {
    throw new Error('登录状态未能保存，请确认浏览器允许此网站使用 Cookie 后重试。');
  }
  return account;
}
