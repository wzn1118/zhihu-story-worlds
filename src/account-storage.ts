import { sessionFetch } from './auth-session';

/** Browser data belongs to the verified account, never to whichever user logged in first. */
type StorageScope = { kind: 'pending' } | { kind: 'local' } | { kind: 'account'; id: string };
export type AccountStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

let scope: StorageScope = { kind: 'pending' };
const listeners = new Set<() => void>();

export function configureAccountStorage(authentication: { provider: 'local' | 'zhihu' }, accountId: string | null): void {
  scope = authentication.provider === 'zhihu'
    ? accountId ? { kind: 'account', id: accountId } : { kind: 'pending' }
    : { kind: 'local' };
  listeners.forEach(listener => listener());
}

export function accountStorageKey(key: string): string | null {
  if (scope.kind === 'pending') return null;
  return scope.kind === 'local' ? key : `redleaf.account.v1:${encodeURIComponent(scope.id)}:${key}`;
}

export function subscribeAccountStorage(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function scopedStorage(storage: () => AccountStorage): AccountStorage {
  return {
    getItem(key) {
      const scoped = accountStorageKey(key);
      return scoped === null ? null : storage().getItem(scoped);
    },
    setItem(key, value) {
      const scoped = accountStorageKey(key);
      if (scoped === null) throw new Error('登录状态尚未确认，进度未写入。');
      storage().setItem(scoped, value);
    },
    removeItem(key) {
      const scoped = accountStorageKey(key);
      if (scoped !== null) storage().removeItem(scoped);
    },
  };
}

export const accountLocalStorage = scopedStorage(() => localStorage);
export const accountSessionStorage = scopedStorage(() => sessionStorage);

/** Reject a stale tab's requests after the shared login cookie changes accounts. */
export function accountFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (scope.kind !== 'account' || typeof location === 'undefined') return sessionFetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/') || /^\/api\/(auth|oauth)(\/|$)/.test(url.pathname)) return sessionFetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set('X-Redleaf-Account', scope.id);
  return sessionFetch(input, { ...init, headers });
}
