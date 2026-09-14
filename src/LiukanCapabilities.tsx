import { accountFetch } from './account-storage';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, ChevronLeft, LoaderCircle, Search, Send, Settings2 } from 'lucide-react';
import { LIUKAN_ABILITIES, type LiukanAbilityId, type LiukanAbilityRequest, type LiukanAbilityResult, type LiukanConfigInput, type LiukanGeneralChatResponse, type LiukanPublicConfig } from '../shared/liukan-capabilities';
import { LIUKAN_POST_MIME } from '../shared/liukan-inbox';
import './LiukanCapabilities.css';

function isZhihuSource(url: string) { try { const value = new URL(url); return value.protocol === 'https:' && !value.username && !value.password && !value.port && ['www.zhihu.com', 'zhihu.com', 'zhuanlan.zhihu.com'].includes(value.hostname); } catch { return false; } }
export interface LiukanCapabilitiesProps { onClose?: () => void; onOpenSource?: (url: string) => void; onReadingDesk?: () => void; onActivityDesk?: () => void }
async function api<T>(path: string, input?: unknown): Promise<T> {
  const response = await accountFetch(`/api/liukan/${path}`, { ...(input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || '看山这次没有收到回复，请稍后再试。');
  return data;
}
export function LiukanCapabilities({ onClose, onOpenSource, onReadingDesk, onActivityDesk }: LiukanCapabilitiesProps) {
  const [tab, setTab] = useState<'chat' | 'tools' | 'settings'>('chat');
  const [config, setConfig] = useState<LiukanPublicConfig | null>(null);
  const [transport, setTransport] = useState<'zhihu' | 'relay'>('zhihu');
  const [zhidaModel, setZhidaModel] = useState('zhida-fast-1p5');
  const [endpoint, setEndpoint] = useState(''); const [model, setModel] = useState(''); const [key, setKey] = useState('');
  const [protocol, setProtocol] = useState<'responses' | 'chat-completions'>('chat-completions');
  const [reasoning, setReasoning] = useState('');
  const [availableAbilities, setAvailableAbilities] = useState<Array<typeof LIUKAN_ABILITIES[number]>>([]);
  const [abilitiesLoaded, setAbilitiesLoaded] = useState(false);
  const [ability, setAbility] = useState<LiukanAbilityId>('search-zhihu');
  const [query, setQuery] = useState(''); const [baseId, setBaseId] = useState(''); const [collectionId, setCollectionId] = useState('');
  const [privateAccess, setPrivateAccess] = useState(false);
  const [result, setResult] = useState<LiukanAbilityResult | null>(null);
  const [question, setQuestion] = useState(''); const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const selected = LIUKAN_ABILITIES.find(row => row.id === ability)!;
  const acceptConfig = (next: LiukanPublicConfig) => { setConfig(next); setTransport(next.transport); if (next.transport === 'zhihu') setZhidaModel(next.model); setEndpoint(next.relay?.endpoint ?? ''); setModel(next.relay?.model ?? ''); setProtocol(next.relay?.protocol ?? 'chat-completions'); setReasoning(next.relay?.reasoning ?? ''); setKey(''); };
  useEffect(() => { let current = true; api<LiukanPublicConfig>('config').then(value => { if (current) acceptConfig(value); }).catch(value => { if (current) setError(value.message); }); return () => { current = false; }; }, []);
  useEffect(() => {
    const root = document.querySelector('.liukan-capabilities');
    if (!root) return;
    const wire = () => root.querySelectorAll<HTMLElement>('.liukan-cap-results article').forEach(card => {
      if (card.dataset.dragReady === 'true') return;
      const index = [...card.parentElement!.querySelectorAll('article')].indexOf(card);
      const item = result?.items[index];
      if (!item?.id) return;
      card.dataset.dragReady = 'true'; card.draggable = true;
      card.addEventListener('dragstart', event => { const transfer = (event as DragEvent).dataTransfer; transfer?.setData(LIUKAN_POST_MIME, JSON.stringify({ candidateId: item.id })); if (transfer) transfer.effectAllowed = 'copy'; });
    });
    wire(); const observer = new MutationObserver(wire); observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [result]);
  useEffect(() => {
    let current = true;
    api<{ abilities: Array<{ id: string }> }>('capabilities').then(value => {
      if (!current) return;
      const ids = new Set(value.abilities.map(item => item.id));
      const available = LIUKAN_ABILITIES.filter(item => ids.has(item.id));
      setAvailableAbilities(available); setAbilitiesLoaded(true);
      if (available.length) setAbility(available[0].id);
    }).catch(value => { if (current) { setAbilitiesLoaded(true); setError(value.message); } });
    return () => { current = false; };
  }, []);
  const changeTab = (next: typeof tab) => { setTab(next); setError(''); setNotice(''); };
  async function save(useWorkshopRelay = false) {
    if (busy || config?.editable === false) return; setBusy(true); setError(''); setNotice('');
    const input: LiukanConfigInput = useWorkshopRelay ? { transport: 'relay', useWorkshopRelay: true } : { transport, model: zhidaModel, ...(transport === 'relay' ? { relay: { endpoint, model, protocol, reasoning: reasoning || undefined, apiKey: key || undefined } } : {}) };
    try { acceptConfig(await api<LiukanPublicConfig>('config', input)); setNotice('已保存，下条消息就用这个配置。'); } catch (value) { setError((value as Error).message); } finally { setBusy(false); }
  }
  async function run(page?: { nextOffset?: number; nextCursor?: string }) {
    if (busy || !availableAbilities.some(item => item.id === ability)) return; setBusy(true); setError(''); setNotice('');
    const request: LiukanAbilityRequest = { ability, query: ['query', 'knowledge'].includes(selected.input) ? query : undefined, limit: 30, requestId: crypto.randomUUID(), confirmPrivateAccess: privateAccess, baseId: baseId || undefined, collectionId: collectionId || undefined, ...(page?.nextOffset !== undefined ? { offset: page.nextOffset } : {}), ...(page?.nextCursor ? { cursor: page.nextCursor } : {}) };
    try { setResult(await api<LiukanAbilityResult>('capabilities/run', request)); } catch (value) { setError((value as Error).message); } finally { setBusy(false); }
  }
  async function chat(event: React.FormEvent) {
    event.preventDefault(); if (!question.trim() || busy) return;
    const text = question.trim(); setQuestion(''); setBusy(true); setError('');
    const history = messages.slice(-6).map(row => ({ ...row, content: row.content.slice(0, 2000) })); setMessages(previous => [...previous, { role: 'user', content: text }]);
    try { const reply = await api<LiukanGeneralChatResponse>('general-chat', { question: text, conversation: history, requestId: crypto.randomUUID() }); setMessages(previous => [...previous, { role: 'assistant', content: reply.answer }]); }
    catch (value) { setError((value as Error).message); setQuestion(text); } finally { setBusy(false); }
  }
  return <section className="liukan-capabilities" aria-label="看山的能力" data-guide="liukan-capabilities">
    <header className="liukan-cap-header"><div><span>和看山一起</span><strong>从一个问题开始</strong></div>{onClose && <button type="button" onClick={onClose} aria-label="返回看山"><ChevronLeft size={18} /></button>}</header>
    <nav className="liukan-cap-tabs" aria-label="看山能力分类">{([['chat', '聊一聊'], ['tools', '找资料'], ['settings', '对话设置']] as const).filter(([id]) => id !== 'settings' || config?.editable === true).map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => changeTab(id)}>{label}</button>)}</nav>
    {tab === 'chat' && <div className="liukan-cap-chat">
      {onActivityDesk && <button type="button" className="liukan-cap-reading-entry" onClick={onActivityDesk}><span>新本领 · 同行记录</span><strong>看看故事走到哪了<ArrowUpRight size={16} /></strong><small>制作中的游戏、真实美术进度和走过的关卡，放在一页里。</small></button>}{onReadingDesk && <button type="button" className="liukan-cap-reading-entry" onClick={onReadingDesk}><span>新本领 · 阅读手记</span><strong>一起把故事读透<ArrowUpRight size={16} /></strong><small>梳理人物和伏笔，比较不同回答，把改编点子写下来。</small></button>}
      <div className="liukan-cap-chatlog" role="log" aria-live="polite">{!messages.length && <div className="liukan-cap-welcome"><img src="/assets/liukan/greeting.gif" alt="刘看山向你打招呼" width="80" height="80" /><p>想先玩一段故事，还是把自己的点子做成游戏？<br />有哪里拿不准，跟我说说。</p></div>}{messages.map((row, index) => <p className={`liukan-cap-message is-${row.role}`} key={index}>{row.content}</p>)}{busy && <p className="liukan-cap-thinking"><LoaderCircle size={14} /> 看山正在想……</p>}</div>
      <form onSubmit={chat} className="liukan-cap-compose"><label className="liukan-cap-sr" htmlFor="liukan-general-question">和看山聊聊</label><textarea id="liukan-general-question" maxLength={1000} rows={2} value={question} onChange={event => setQuestion(event.target.value)} placeholder="怎么开始做我的第一个游戏？" /><button type="submit" disabled={busy || !question.trim()} aria-label="发送给看山"><Send size={17} /></button></form>
      <small className="liukan-cap-provider">{config?.editable === false ? '看山已连接' : config?.transport === 'relay' ? `当前中转 · ${config.model}` : `知乎直答 · ${config?.model ?? '正在读取配置'}`}</small>
    </div>}
    {tab === 'tools' && <div className="liukan-cap-tools">
      {!availableAbilities.length && <p>{abilitiesLoaded ? '资料检索暂未开放，仍可使用聊天和阅读手记。' : '正在读取可用能力…'}</p>}
      {availableAbilities.length > 0 && <>
      <label>让看山帮你<select disabled={busy} value={ability} onChange={event => { setAbility(event.target.value as LiukanAbilityId); setPrivateAccess(false); setResult(null); setError(''); }}>{availableAbilities.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
      <p className="liukan-cap-hint">{selected.description}</p>
      {['query', 'knowledge'].includes(selected.input) && <label>想找什么<input disabled={busy} value={query} onChange={event => setQuery(event.target.value)} maxLength={1000} placeholder="例如：有哪些让人后背发凉的短故事" /></label>}
      {['base', 'knowledge'].includes(selected.input) && <label>知识库编号{selected.input === 'knowledge' ? '（留空检索个人库）' : ''}<input disabled={busy} value={baseId} onChange={event => setBaseId(event.target.value)} inputMode="numeric" placeholder="从“我的知识库”选择" /></label>}
      {selected.input === 'collection' && <label>收藏夹编号<input disabled={busy} value={collectionId} onChange={event => setCollectionId(event.target.value)} inputMode="numeric" placeholder="从“我的收藏夹”选择" /></label>}
      {selected.private && <label className="liukan-cap-consent"><input type="checkbox" disabled={busy} checked={privateAccess} onChange={event => setPrivateAccess(event.target.checked)} />读取本机已配置知乎账号的这一页资料</label>}
      <button className="liukan-cap-primary" type="button" onClick={() => void run()} disabled={busy || (selected.private && !privateAccess)}>{busy ? <LoaderCircle size={15} /> : <Search size={15} />}{busy ? '正在查找' : selected.title}</button>
      {result && result.ability === ability && <div className="liukan-cap-results" aria-live="polite"><p className="liukan-cap-hint">{result.note}</p>{!result.items.length && <p>这次没有找到内容，换个词试试。</p>}{result.items.map((item, index) => <article key={`${item.id ?? index}-${item.title}`}><span className="liukan-cap-result-number">{String(index + 1).padStart(2, '0')}</span><div><h4>{item.title}</h4>{item.author && <small>{item.author}</small>}<p>{item.text}</p>{item.url && isZhihuSource(item.url) && onOpenSource && <button type="button" onClick={() => onOpenSource(item.url!)}>阅读来源<ArrowUpRight size={13} /></button>}{item.url && !isZhihuSource(item.url) && <div className="liukan-external-source"><small>外部来源</small><input aria-label="来源网址" readOnly value={item.url} onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void navigator.clipboard.writeText(item.url!).then(() => setNotice('已复制来源网址。')).catch(() => setNotice('选中上方网址即可复制。'))}>复制网址</button></div>}{item.kind && item.id && <button type="button" onClick={() => { if (item.kind === 'collection') { setCollectionId(item.id!); setAbility('favorites-items'); } else { setBaseId(item.id!); setAbility('knowledge-items'); } setPrivateAccess(false); setResult(null); }}>选择这个{item.kind === 'collection' ? '收藏夹' : '知识库'}</button>}</div></article>)}{result.ability === ability && (result.nextOffset !== undefined || result.nextCursor) && <button type="button" disabled={busy} onClick={() => void run(result)}>再看一页</button>}</div>}
      </>}
    </div>}
    {tab === 'settings' && config?.editable === true && <div className="liukan-cap-settings" data-guide="liukan-relay-settings">
      <div className="liukan-cap-settings-title"><Settings2 size={20} /><p>给看山选择对话模型<small>游戏生成仍使用工作台原来的配置</small></p></div>
      <label>对话方式<select value={transport} onChange={event => setTransport(event.target.value as typeof transport)}><option value="zhihu">知乎直答</option><option value="relay">自定义中转站</option></select></label>
      {transport === 'zhihu' ? <label>直答模型<select value={zhidaModel} onChange={event => setZhidaModel(event.target.value)}><option value="zhida-fast-1p5">快速回答</option><option value="zhida-thinking-1p5">深度思考</option><option value="zhida-agent">智能检索</option></select></label> : <>
        <label>中转地址<input value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="https://你的中转站/v1" autoComplete="off" /></label>
        <div className="liukan-cap-fields"><label>协议<select value={protocol} onChange={event => setProtocol(event.target.value as typeof protocol)}><option value="chat-completions">Chat Completions</option><option value="responses">Responses</option></select></label><label>模型<input value={model} onChange={event => setModel(event.target.value)} placeholder="填写模型名称" autoComplete="off" /></label></div>
        <label>API Key<input type="password" value={key} onChange={event => setKey(event.target.value)} placeholder={config?.relay?.hasKey ? '已保存，留空保持原密钥' : '仅保存在本机服务端'} autoComplete="new-password" /></label>
        <label>推理强度<select value={reasoning} onChange={event => setReasoning(event.target.value)}><option value="">使用中转默认</option>{['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(value => <option key={value}>{value}</option>)}</select></label>
      </>}
      <button className="liukan-cap-primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle size={15} /> : <Check size={15} />}保存看山配置</button>
      <button className="liukan-cap-secondary" type="button" disabled={busy} onClick={() => void save(true)}>复制工作台的中转配置给看山</button>
    </div>}
    {error && <p className="liukan-cap-error" role="alert">{error}</p>}{notice && <p className="liukan-cap-notice" role="status"><Check size={14} />{notice}</p>}
  </section>;
}
