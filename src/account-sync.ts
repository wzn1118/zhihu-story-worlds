/** A notification contains no account data; other tabs must ask the server who is signed in. */
const ACCOUNT_CHANGE_KEY = 'redleaf.auth-change.v1';
const ACCOUNT_RECHECK_EVENT = 'redleaf:account-recheck';

/** A protected API rejected the session; verify it before keeping the workspace open. */
export function requestAccountRecheck(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_RECHECK_EVENT));
}

export function announceAccountChange(): void {
  try { localStorage.setItem(ACCOUNT_CHANGE_KEY, crypto.randomUUID()); }
  catch { /* Focus/pageshow still recheck the session when storage is unavailable. */ }
}

export function watchAccountChanges(recheck: () => void): () => void {
  const onFocus = () => recheck();
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) recheck(); };
  const onVisibility = () => { if (document.visibilityState === 'visible') recheck(); };
  const onStorage = (event: StorageEvent) => { if (event.key === ACCOUNT_CHANGE_KEY) recheck(); };
  window.addEventListener('focus', onFocus);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('storage', onStorage);
  window.addEventListener(ACCOUNT_RECHECK_EVENT, recheck);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(ACCOUNT_RECHECK_EVENT, recheck);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
