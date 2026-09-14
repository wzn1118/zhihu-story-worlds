import { createSnapshot, validateSnapshot } from './platform-state.js';

const query = new URLSearchParams(location.search);
export const EMBEDDED = query.get('embedded') === '1' && window.parent !== window;
const sessionId = query.get('session');
const CHANNEL = 'redleaf:redrain:v1';

export function createRedleafBridge(hooks) {
  let restored = !EMBEDDED;
  let paused = EMBEDDED;
  let sequence = 0;
  let timeout = 0;
  const pending = new Map();
  const send = (type, payload = {}) => {
    if (!EMBEDDED) return;
    window.parent.postMessage({ channel: CHANNEL, sessionId, type, ...payload }, location.origin);
  };
  const report = error => {
    const message = error instanceof Error ? error.message : String(error);
    hooks.error(message);
    send('error', { message });
  };
  const checkpoint = (notify = false, suppliedRequestId = null) => {
    if (!EMBEDDED || !restored) return null;
    try {
      const snapshot = createSnapshot(hooks.getState(), hooks.getEndings());
      const requestId = suppliedRequestId || `${sessionId}:${++sequence}`;
      pending.set(requestId, { notify });
      send('checkpoint', { requestId, save: snapshot });
      return requestId;
    } catch (error) {
      report(error);
      return null;
    }
  };
  const setPaused = value => {
    if (paused === value) return;
    paused = value;
    document.body.classList.toggle('redleaf-paused', paused);
    if (paused) hooks.pause();
    else hooks.resume?.();
  };
  const onMessage = event => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.channel !== CHANNEL || message.sessionId !== sessionId) return;
    try {
      if (message.type === 'restore' && !restored) {
        const snapshot = message.save === null ? null : validateSnapshot(message.save);
        hooks.restore(snapshot);
        hooks.settings(message.settings);
        restored = true;
        window.clearTimeout(timeout);
        document.body.classList.remove('redleaf-waiting');
        setPaused(false);
        hooks.start();
        checkpoint();
        send('restored');
      } else if (message.type === 'saved') {
        const request = pending.get(message.requestId);
        if (!request) return;
        pending.delete(message.requestId);
        if (message.ok !== true) {
          setPaused(false);
          hooks.error(message.error || '存档没有写入成功，请再次保存');
        }
        else if (request.notify) hooks.error('进度已保存到赤页');
      } else if (message.type === 'command' && restored) {
        if (message.command === 'save') checkpoint(true);
        else if (message.command === 'exit') {
          const requestId = checkpoint();
          if (requestId) { setPaused(true); send('exit', { requestId }); }
        } else if (message.command === 'pause') setPaused(true);
        else if (message.command === 'resume') setPaused(false);
        else hooks.command(message.command);
      } else if (message.type === 'settings' && restored) {
        hooks.settings(message.settings);
        if (typeof message.paused === 'boolean') setPaused(message.paused);
      } else if (message.type === 'snapshot' && restored) {
        checkpoint(false, typeof message.requestId === 'string' ? message.requestId : null);
      }
    } catch (error) { report(error); }
  };
  return {
    get restored() { return restored; },
    get paused() { return paused; },
    checkpoint,
    start() {
      if (!EMBEDDED) { hooks.start(); return; }
      document.body.classList.add('redleaf-embedded', 'redleaf-waiting');
      for (const eventName of ['click', 'keydown', 'pointerdown', 'touchstart']) {
        document.addEventListener(eventName, event => {
          if (!paused) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        }, { capture: true, passive: false });
      }
      window.get_redleaf_snapshot = () => restored ? createSnapshot(hooks.getState(), hooks.getEndings()) : null;
      window.addEventListener('message', onMessage);
      window.addEventListener('pagehide', () => { checkpoint(); hooks.pause(); });
      if (!sessionId) { report(new Error('会话标识缺失，请返回书库重新打开')); return; }
      send('ready');
      timeout = window.setTimeout(() => {
        if (!restored) report(new Error('尚未收到阅读进度，请返回书库重试'));
      }, 15000);
    }
  };
}
