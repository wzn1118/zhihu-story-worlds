import assert from 'node:assert/strict';
import test from 'node:test';
import { accountFetch, accountLocalStorage, accountSessionStorage, accountStorageKey, configureAccountStorage } from '../src/account-storage';
import { defaultSettings, readStorage, storageKeys, writeStorage } from '../src/game';
import { rememberLiukanTour, shouldShowLiukanTour } from '../src/liukan-tour';

function memoryStorage() {
  const entries = new Map<string, string>();
  return { entries, getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
}

test('two verified accounts retain separate saves, drafts, preferences and reading retries in one browser', () => {
  const local = memoryStorage(), session = memoryStorage();
  const priorLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const priorSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
  try {
    local.setItem(storageKeys.favorites, JSON.stringify(['legacy-story']));
    local.setItem('redleaf.workshop.input.v1', JSON.stringify({ title: 'local draft', text: 'local private text' }));
    configureAccountStorage({ provider: 'zhihu' }, null);
    assert.equal(accountStorageKey(storageKeys.favorites), null);
    assert.deepEqual(readStorage(storageKeys.favorites, []), []);
    assert.equal(writeStorage(storageKeys.favorites, ['unauthenticated-story']), false);

    configureAccountStorage({ provider: 'zhihu' }, 'zhihu:alice');
    assert.deepEqual(readStorage(storageKeys.favorites, []), [], 'do not import shared browser saves into the first account');
    assert.equal(accountLocalStorage.getItem('redleaf.workshop.input.v1'), null);
    assert.equal(shouldShowLiukanTour(), true);
    writeStorage(storageKeys.favorites, ['alice-story']);
    writeStorage(storageKeys.settings, { ...defaultSettings, textSize: 22 });
    writeStorage(storageKeys.notes, { 'alice-story': 'private note A' });
    accountLocalStorage.setItem('redleaf.workshop.input.v1', JSON.stringify({ title: 'Alice draft', text: 'A private text' }));
    accountLocalStorage.setItem('redleaf.redrain.v1', 'Alice checkpoint');
    accountSessionStorage.setItem('redleaf:liukan-reading-requests:v1', 'Alice retry');
    rememberLiukanTour('later');

    configureAccountStorage({ provider: 'zhihu' }, 'zhihu:bob');
    assert.deepEqual(readStorage(storageKeys.favorites, []), []);
    assert.deepEqual(readStorage(storageKeys.notes, {}), {});
    assert.deepEqual(readStorage(storageKeys.settings, defaultSettings), defaultSettings);
    assert.equal(accountLocalStorage.getItem('redleaf.workshop.input.v1'), null);
    assert.equal(accountLocalStorage.getItem('redleaf.redrain.v1'), null);
    assert.equal(accountSessionStorage.getItem('redleaf:liukan-reading-requests:v1'), null);
    assert.equal(shouldShowLiukanTour(), true);
    writeStorage(storageKeys.favorites, ['bob-story']);
    accountLocalStorage.setItem('redleaf.workshop.input.v1', 'Bob draft');
    accountSessionStorage.setItem('redleaf:liukan-reading-requests:v1', 'Bob retry');

    configureAccountStorage({ provider: 'zhihu' }, 'zhihu:alice');
    assert.deepEqual(readStorage(storageKeys.favorites, []), ['alice-story']);
    assert.deepEqual(readStorage(storageKeys.notes, {}), { 'alice-story': 'private note A' });
    assert.equal(readStorage(storageKeys.settings, defaultSettings).textSize, 22);
    assert.match(accountLocalStorage.getItem('redleaf.workshop.input.v1')!, /A private text/);
    assert.equal(accountLocalStorage.getItem('redleaf.redrain.v1'), 'Alice checkpoint');
    assert.equal(accountSessionStorage.getItem('redleaf:liukan-reading-requests:v1'), 'Alice retry');
    assert.equal(shouldShowLiukanTour(), false);

    configureAccountStorage({ provider: 'zhihu' }, null);
    assert.equal(accountLocalStorage.getItem('redleaf.workshop.input.v1'), null);
    configureAccountStorage({ provider: 'local' }, null);
    assert.deepEqual(readStorage(storageKeys.favorites, []), ['legacy-story'], 'local mode retains existing data');
    assert.match(accountLocalStorage.getItem('redleaf.workshop.input.v1')!, /local private text/);
    assert.equal(local.entries.has(storageKeys.settings), false, 'account preferences never overwrite local defaults');
  } finally {
    if (priorLocal) Object.defineProperty(globalThis, 'localStorage', priorLocal); else Reflect.deleteProperty(globalThis, 'localStorage');
    if (priorSession) Object.defineProperty(globalThis, 'sessionStorage', priorSession); else Reflect.deleteProperty(globalThis, 'sessionStorage');
    configureAccountStorage({ provider: 'zhihu' }, null);
  }
});

test('account identifiers cannot alias through delimiters or URL encoding', () => {
  const keys = new Set<string>();
  for (const id of ['a:b', 'a%3Ab', 'a/b', 'a%2Fb', 'a', 'a:']) {
    configureAccountStorage({ provider: 'zhihu' }, id);
    keys.add(accountStorageKey('redleaf.notes.v1')!);
  }
  assert.equal(keys.size, 6);
  configureAccountStorage({ provider: 'zhihu' }, null);
});

test('workspace requests bind to the verified account without sending identity to external sites', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { value: { origin: 'https://redleaf.example' }, configurable: true });
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => { calls.push({ input, init }); return Response.json({}); });
  try {
    configureAccountStorage({ provider: 'zhihu' }, 'alice');
    await accountFetch('/api/liukan/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(new Headers(calls[0].init?.headers).get('X-Redleaf-Account'), 'alice');
    assert.equal(new Headers(calls[0].init?.headers).get('Content-Type'), 'application/json');
    await accountFetch('https://other.example/api/liukan/inbox');
    await accountFetch('/api/auth/me');
    await accountFetch('/api/oauth/status');
    for (const call of calls.slice(1)) assert.equal(new Headers(call.init?.headers).get('X-Redleaf-Account'), null);
    configureAccountStorage({ provider: 'local' }, null);
    await accountFetch('/api/liukan/inbox');
    assert.equal(new Headers(calls.at(-1)?.init?.headers).get('X-Redleaf-Account'), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'location', previous); else Reflect.deleteProperty(globalThis, 'location');
    configureAccountStorage({ provider: 'zhihu' }, null);
  }
});
