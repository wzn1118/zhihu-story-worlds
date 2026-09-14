import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, RefreshCw } from 'lucide-react';
import { accountFetch } from './account-storage';

type RelayProtocol = 'responses' | 'chat-completions';
type ProtocolChoice = 'auto' | RelayProtocol;
export interface WorkshopRelayInput { endpoint: string; apiKey: string; model: string; protocol: RelayProtocol }
interface RelayStatus { configured: boolean; endpoint?: string; model?: string; protocol?: string }
interface RelayEnvironment extends RelayStatus { images?: RelayStatus }
interface ModelDiscovery { endpoint: string; models: string[] }
interface ConnectionResult { endpoint: string; model: string; protocol: RelayProtocol; connected: true; latencyMs: number }
type DiscoveryState = { status: 'idle' | 'waiting' | 'loading' } | { status: 'ready'; result: ModelDiscovery } | { status: 'error'; message: string };
type ConnectionState = { status: 'idle' | 'checking' } | { status: 'connected'; result: ConnectionResult } | { status: 'error'; message: string };

// This comparison only enables the saved-key UI. The server independently checks
// that a stored key can be used with the requested endpoint.
function canonicalEndpoint(value: string | undefined): string {
  try {
    const url = new URL(value?.trim() ?? '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    let endpoint = url.href.replace(/\/+$/, '').replace(/\/(models|responses|chat\/completions)$/, '');
    if (new URL(endpoint).pathname === '/') endpoint += '/v1';
    return endpoint;
  } catch { return ''; }
}

async function requestRelay<T>(path: 'models' | 'check', body: unknown, signal: AbortSignal): Promise<T> {
  const response = await accountFetch(`/api/workshop/creative-config/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  let data: { error?: { message?: string } } & T;
  try { data = await response.json(); }
  catch { throw new Error('检测服务没有返回有效结果，请稍后重试。'); }
  if (!data || typeof data !== 'object') throw new Error('检测服务没有返回有效结果，请稍后重试。');
  if (!response.ok) throw new Error(data.error?.message || `检测失败（${response.status}），请检查地址和密钥。`);
  return data;
}

const protocolLabel = (protocol: RelayProtocol) => protocol === 'responses' ? 'Responses' : 'Chat Completions';
function initialModel(models: string[], savedModel: string | undefined): string {
  if (savedModel && models.includes(savedModel)) return savedModel;
  const specializedModel = /(?:^|[-/._])(?:embed(?:ding)?s?|rerank(?:er)?|image|dall-e|whisper|tts|audio|speech|transcri(?:be|ption)|sora|flux|stable-diffusion|sdxl)(?:$|[-/._\d])/i;
  const textModel = /(?:^|[-/._])(?:gpt|chatgpt|claude|gemini|deepseek|qwen|llama|mistral|mixtral|command|glm|ernie|kimi|grok|chat|text|o[1-9])(?:$|[-/._\d])/i;
  const candidates = models.filter(value => !specializedModel.test(value));
  return candidates.find(value => textModel.test(value)) ?? candidates[0] ?? models[0];
}

export function WorkshopRelaySettings({ busy, relay, environmentRelay, message, onSave, onClear, onUseEnvironment }: {
  busy: boolean;
  relay: RelayStatus;
  environmentRelay: RelayEnvironment;
  message: string;
  onSave: (config: WorkshopRelayInput) => Promise<boolean>;
  onClear: () => Promise<void>;
  onUseEnvironment: () => Promise<void>;
}) {
  const [endpoint, setEndpoint] = useState(relay.endpoint ?? '');
  const [apiKey, setApiKey] = useState('');
  const [protocol, setProtocol] = useState<ProtocolChoice>('auto');
  const [model, setModel] = useState(relay.model ?? '');
  const [active, setActive] = useState(false);
  const [discoveryAttempt, setDiscoveryAttempt] = useState(0);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [discovery, setDiscovery] = useState<DiscoveryState>({ status: 'idle' });
  const [connection, setConnection] = useState<ConnectionState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const discoveryRequest = useRef<AbortController | null>(null);
  const connectionRequest = useRef<AbortController | null>(null);
  const saveInFlight = useRef(false);
  const savedEndpoint = canonicalEndpoint(relay.endpoint);
  const canUseSavedKey = relay.configured && !!savedEndpoint && canonicalEndpoint(endpoint) === savedEndpoint;
  const credentialsReady = !!endpoint.trim() && (!!apiKey.trim() || canUseSavedKey);
  const disabled = busy || saving;

  useEffect(() => {
    if (!active) { setEndpoint(relay.endpoint ?? ''); setModel(relay.model ?? ''); }
  }, [active, relay.endpoint, relay.model]);

  const invalidateConnection = () => {
    connectionRequest.current?.abort();
    setConnection({ status: 'idle' });
  };
  const invalidateCredentials = () => {
    discoveryRequest.current?.abort();
    invalidateConnection();
    setDiscovery({ status: 'idle' });
    setModel('');
  };
  const editCredentials = (field: 'endpoint' | 'apiKey', value: string) => {
    invalidateCredentials();
    setActive(true);
    if (field === 'endpoint') setEndpoint(value); else setApiKey(value);
  };

  useEffect(() => {
    if (!active || !credentialsReady) return;
    const controller = new AbortController();
    discoveryRequest.current = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    setDiscovery({ status: 'waiting' });
    const debounce = setTimeout(() => {
      if (controller.signal.aborted) return;
      setDiscovery({ status: 'loading' });
      timeout = setTimeout(() => {
        if (controller.signal.aborted) return;
        timedOut = true; controller.abort();
        setDiscovery({ status: 'error', message: '获取模型超时，请检查中转站地址后重试。' });
      }, 35_000);
      void requestRelay<ModelDiscovery>('models', { endpoint: endpoint.trim(), apiKey: apiKey.trim() }, controller.signal)
        .then(result => {
          if (controller.signal.aborted) return;
          if (!result.endpoint || !Array.isArray(result.models) || !result.models.length || result.models.some(value => typeof value !== 'string' || !value.trim())) {
            throw new Error('没有检测到可用模型，请确认密钥具有模型访问权限后重试。');
          }
          setDiscovery({ status: 'ready', result });
          setModel(initialModel(result.models, relay.model));
        })
        .catch(error => {
          if (controller.signal.aborted || timedOut) return;
          setDiscovery({ status: 'error', message: error instanceof Error ? error.message : '获取模型失败，请重试。' });
        })
        .finally(() => clearTimeout(timeout));
    }, 700);
    return () => { clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
  }, [active, endpoint, apiKey, credentialsReady, discoveryAttempt]);

  useEffect(() => {
    if (!active || !credentialsReady || discovery.status !== 'ready' || !discovery.result.models.includes(model)) return;
    const controller = new AbortController();
    connectionRequest.current = controller;
    setConnection({ status: 'checking' });
    const timeout = setTimeout(() => {
      if (controller.signal.aborted) return;
      controller.abort();
      setConnection({ status: 'error', message: '连接检测超时，请重试或选择其他模型。' });
    }, 75_000);
    void requestRelay<ConnectionResult>('check', { endpoint: discovery.result.endpoint, apiKey: apiKey.trim(), model, protocol }, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.connected !== true || result.model !== model || !result.endpoint || !['responses', 'chat-completions'].includes(result.protocol)) {
          throw new Error('连接检测没有确认当前模型可用，请重试。');
        }
        setConnection({ status: 'connected', result });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setConnection({ status: 'error', message: error instanceof Error ? error.message : '连接失败，请重试或选择其他模型。' });
      })
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [active, credentialsReady, discovery, model, protocol, apiKey, checkAttempt]);

  const retryDiscovery = () => {
    invalidateCredentials(); setActive(true); setDiscoveryAttempt(value => value + 1);
  };
  const save = async () => {
    if (disabled || saveInFlight.current || connection.status !== 'connected' || !credentialsReady) return;
    saveInFlight.current = true; setSaving(true);
    try {
      const result = connection.result;
      if (await onSave({ endpoint: result.endpoint, apiKey: apiKey.trim(), model: result.model, protocol: result.protocol })) {
        invalidateCredentials(); setApiKey(''); setActive(false);
      }
    } finally { saveInFlight.current = false; setSaving(false); }
  };
  const checking = discovery.status === 'waiting' || discovery.status === 'loading' || connection.status === 'checking';
  const failed = discovery.status === 'error' || connection.status === 'error';
  const savedModel = !active && relay.configured ? relay.model : undefined;
  const models = discovery.status === 'ready' ? discovery.result.models : savedModel ? [savedModel] : [];
  const statusText = discovery.status === 'error' ? discovery.message
    : connection.status === 'error' ? connection.message
    : discovery.status === 'waiting' ? '准备自动获取模型…'
    : discovery.status === 'loading' ? '正在获取此密钥可访问的模型…'
    : connection.status === 'checking' ? `已发现 ${models.length} 个模型，正在检测 ${model} 的连接…`
    : connection.status === 'connected' ? `连接成功 · ${connection.result.model} · ${protocolLabel(connection.result.protocol)}${Number.isFinite(connection.result.latencyMs) ? ` · ${(connection.result.latencyMs / 1000).toFixed(1)} 秒` : ''}`
    : !active && relay.configured ? '已载入当前配置，点击“重新检测”可检查模型与连接。'
    : !endpoint.trim() ? '填写地址和 API 密钥后，将自动获取模型并检测连接。'
    : !credentialsReady ? '填写 API 密钥后自动检测。'
    : '选择模型后将自动检测连接。';

  return <div className="workshop-relay-settings" data-tour="workshop-relay">
    <p>填好文字中转站地址和密钥，自动获取模型并检测连接。密钥仅保存在服务端；插图使用单独的生图服务。</p>
    {environmentRelay.configured && <div className="relay-env-card">
      <b>检测到当前服务配置</b>
      <span>文字：{environmentRelay.model} · {environmentRelay.protocol}</span>
      <span>生图：{environmentRelay.images?.configured ? `${environmentRelay.images.model} · ${environmentRelay.images.endpoint}` : '未检测到生图通道'}</span>
      <button className="secondary-button" type="button" disabled={disabled} onClick={() => { invalidateCredentials(); setApiKey(''); setActive(false); void onUseEnvironment(); }}>接入当前配置</button>
    </div>}
    <label>中转站地址<input inputMode="url" value={endpoint} disabled={disabled} onChange={event => editCredentials('endpoint', event.target.value)} placeholder="https://relay.example/v1" autoComplete="url" spellCheck={false} /></label>
    <label>API 密钥<input type="password" value={apiKey} disabled={disabled} onChange={event => editCredentials('apiKey', event.target.value)} placeholder={canUseSavedKey ? '已保存密钥，留空可重新检测' : '填写后自动检测'} autoComplete="off" spellCheck={false} /></label>
    <div className="relay-detection-status" data-state={failed ? 'error' : connection.status === 'connected' ? 'connected' : checking ? 'loading' : 'idle'} role="status" aria-live="polite">
      {checking ? <LoaderCircle size={15} className="relay-detection-spinner" /> : connection.status === 'connected' ? <Check size={15} /> : null}
      <span>{statusText}</span>
    </div>
    <label>可用模型<select aria-label="可用模型" value={models.includes(model) ? model : ''} disabled={disabled || discovery.status !== 'ready'} onChange={event => { invalidateConnection(); setModel(event.target.value); }}>
      {!models.length && <option value="">{discovery.status === 'loading' || discovery.status === 'waiting' ? '正在自动获取…' : '等待检测模型'}</option>}
      {models.map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <label>连接协议<select aria-label="连接协议" value={protocol} disabled={disabled} onChange={event => { invalidateConnection(); setActive(true); setProtocol(event.target.value as ProtocolChoice); }}>
      <option value="auto">自动检测（推荐）</option><option value="responses">Responses</option><option value="chat-completions">Chat Completions</option>
    </select></label>
    <small className="relay-model-default">推理强度使用模型默认设置。</small>
    <div className="workshop-form-actions">
      <button className="secondary-button" type="button" disabled={disabled || connection.status !== 'connected' || !credentialsReady} onClick={() => void save()}>{saving ? '正在保存…' : '保存中转站'}</button>
      <button className="text-button" type="button" disabled={disabled || !credentialsReady || checking} onClick={() => {
        if (connection.status === 'error' && discovery.status === 'ready') { invalidateConnection(); setCheckAttempt(value => value + 1); }
        else retryDiscovery();
      }}><RefreshCw size={13} />{connection.status === 'error' ? '重试连接' : failed ? '重试检测' : '重新检测'}</button>
      {relay.configured && <button className="text-button" type="button" disabled={disabled} onClick={() => { invalidateCredentials(); setApiKey(''); setActive(false); void onClear(); }}>清除配置</button>}
    </div>
    {relay.configured && <small className="relay-configured">当前：{relay.model} · {relay.endpoint} · {relay.protocol}</small>}
    {message && <small className="relay-configured" role="status">{message}</small>}
  </div>;
}
