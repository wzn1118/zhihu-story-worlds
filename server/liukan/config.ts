import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LiukanConfigInput, LiukanPublicConfig } from '../../shared/liukan-capabilities.ts';
import { configuredRelay, environmentRelay, normalizeRelayConfig, type RelayConfig } from '../workshop-relay-config.ts';
import { LiukanError } from './zhida.ts';

const models = ['zhida-fast-1p5', 'zhida-thinking-1p5', 'zhida-agent'];
export interface LiukanStoredConfig { transport: 'zhihu' | 'relay'; model: string; relay?: RelayConfig }
const defaultConfig: LiukanStoredConfig = { transport: 'zhihu', model: 'zhida-fast-1p5' };
export class LiukanConfigStore {
  private pending = Promise.resolve();
  constructor(private readonly path = resolve(process.env.LIUKAN_CONFIG_PATH || '.local/liukan/config.json')) {}
  private runtime(config: LiukanStoredConfig): LiukanStoredConfig {
    if (process.env.PUBLIC_MODE !== '1' || config.transport === 'relay' || process.env.ZHIHU_ACCESS_SECRET?.trim()) return config;
    let relay: RelayConfig | null;
    try { relay = config.relay ?? configuredRelay() ?? environmentRelay(); }
    catch { throw new LiukanError('LIUKAN_CONFIG_INVALID', '看山的服务端对话配置读取失败。', 503); }
    if (!relay) throw new LiukanError('LIUKAN_PROVIDER_NOT_CONFIGURED', '看山的服务端对话服务尚未配置。', 503);
    return { transport: 'relay', model: config.model, relay };
  }
  async read(): Promise<LiukanStoredConfig> {
    let config: LiukanStoredConfig;
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      if (!data || !['zhihu', 'relay'].includes(data.transport) || !models.includes(data.model)) throw new Error('invalid');
      const relay = data.relay ? normalizeRelayConfig(data.relay) : undefined;
      if (data.transport === 'relay' && !relay) throw new Error('invalid');
      config = { transport: data.transport, model: data.model, ...(relay ? { relay } : {}) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') config = { ...defaultConfig };
      else throw new LiukanError('LIUKAN_CONFIG_INVALID', '看山的对话配置读取失败，请重新保存。', 409);
    }
    return this.runtime(config);
  }
  async status(): Promise<LiukanPublicConfig> {
    const config = await this.read();
    return { transport: config.transport, model: config.transport === 'relay' ? config.relay!.model : config.model, configured: true,
      ...(config.relay ? { relay: { endpoint: config.relay.endpoint, model: config.relay.model, protocol: config.relay.protocol, reasoning: config.relay.reasoning, hasKey: Boolean(config.relay.apiKey) } } : {}) };
  }
  async set(input: unknown): Promise<LiukanPublicConfig> {
    const task = this.pending.catch(() => {}).then(async () => {
      const data = input as LiukanConfigInput;
      if (!data || !['zhihu', 'relay'].includes(data.transport) || Object.keys(data).some(key => !['transport', 'model', 'relay', 'useWorkshopRelay'].includes(key))) throw new LiukanError('INVALID_CONFIG', '请选择知乎直答或自定义中转。');
      if (data.useWorkshopRelay !== undefined && typeof data.useWorkshopRelay !== 'boolean') throw new LiukanError('INVALID_CONFIG', '复制工作台配置的选项有误。');
      if (data.model !== undefined && !models.includes(data.model)) throw new LiukanError('INVALID_MODEL', '请选择支持的知乎直答模型。');
      let previous: LiukanStoredConfig;
      try { previous = await this.read(); } catch { previous = { ...defaultConfig }; }
      let relay = previous.relay;
      try {
        if (data.useWorkshopRelay) {
          relay = configuredRelay() ?? undefined;
          if (!relay) throw new Error('missing');
        } else if (data.relay) {
          if (typeof data.relay !== 'object' || Object.keys(data.relay).some(key => !['endpoint', 'model', 'protocol', 'reasoning', 'apiKey'].includes(key))) throw new Error('invalid');
          const supplied = data.relay.apiKey?.trim();
          // A blank key only reuses the previous key for the exact saved endpoint.
          const keep = data.relay.endpoint.trim().replace(/\/+$/, '') === previous.relay?.endpoint;
          relay = normalizeRelayConfig({ ...data.relay, apiKey: supplied || (keep ? previous.relay?.apiKey : '') });
          if (relay.apiKey.length > 4096 || relay.endpoint.length > 1000 || relay.model.length > 120 || /[\r\n\u0000]/.test(relay.apiKey + relay.model)) throw new Error('invalid');
        }
        if (data.transport === 'relay' && !relay) throw new Error('missing');
      } catch { throw new LiukanError('INVALID_RELAY_CONFIG', '请填写完整的中转地址、模型和密钥；更换地址后请重新填写密钥。'); }
      const next: LiukanStoredConfig = { transport: data.transport, model: data.model ?? previous.model, ...(relay ? { relay } : {}) };
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await mkdir(dirname(this.path), { recursive: true });
      try { await writeFile(temporary, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 }); await rename(temporary, this.path); }
      finally { await rm(temporary, { force: true }); }
    });
    this.pending = task;
    await task;
    return this.status();
  }
}
export const liukanConfig = new LiukanConfigStore();
