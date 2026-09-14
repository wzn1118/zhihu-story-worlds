import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type RelayProtocol = 'responses' | 'chat-completions';
export interface RelayConfig { endpoint: string; apiKey: string; model: string; protocol: RelayProtocol; reasoning?: string }
type StoredConfig = { useEnvironment: true } | RelayConfig | { disabled: true };
const configFile = () => resolve(process.env.WORKSHOP_CONFIG_PATH || '.local/story-workshop/creative-relay.json');
export function normalizeRelayConfig(config: Partial<RelayConfig>): RelayConfig {
  const url = new URL(config.endpoint?.trim() || 'https://invalid.invalid');
  if (!config.endpoint || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !config.apiKey?.trim() || !config.model?.trim()) throw new Error('请填写有效的中转地址、模型和密钥。');
  let endpoint = url.href.replace(/\/+$/, '').replace(/\/(responses|chat\/completions)$/, '');
  if (new URL(endpoint).pathname === '/') endpoint += '/v1';
  const protocol = config.protocol ?? 'chat-completions';
  if (!['responses', 'chat-completions'].includes(protocol)) throw new Error('请选择 Responses 或 Chat Completions 协议。');
  const reasoning = config.reasoning?.trim();
  if (reasoning && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(reasoning)) throw new Error('推理强度无效。');
  return { endpoint, apiKey: config.apiKey.trim(), model: config.model.trim(), protocol, ...(reasoning ? { reasoning } : {}) };
}
export function environmentRelay(): RelayConfig | null {
  if (!process.env.OPENAI_BASE_URL || !process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return null;
  return normalizeRelayConfig({ endpoint: process.env.OPENAI_BASE_URL, apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL,
    protocol: process.env.OPENAI_TRANSPORT?.startsWith('responses') ? 'responses' : 'chat-completions', reasoning: process.env.OPENAI_REASONING_EFFORT });
}
export function configuredRelay(): RelayConfig | null {
  let stored: StoredConfig | undefined;
  try { stored = JSON.parse(readFileSync(configFile(), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('中转站配置读取失败，请在工作台重新保存。'); }
  if (stored) {
    if ('disabled' in stored) return null;
    if ('useEnvironment' in stored) return environmentRelay();
    return normalizeRelayConfig(stored);
  }
  if (process.env.WORKSHOP_RELAY_URL && process.env.WORKSHOP_RELAY_API_KEY && process.env.WORKSHOP_RELAY_MODEL) return normalizeRelayConfig({ endpoint: process.env.WORKSHOP_RELAY_URL, apiKey: process.env.WORKSHOP_RELAY_API_KEY, model: process.env.WORKSHOP_RELAY_MODEL, protocol: process.env.WORKSHOP_RELAY_PROTOCOL as RelayProtocol });
  return null;
}
export const publicRelay = (config: RelayConfig | null) => config ? { configured: true, endpoint: config.endpoint, model: config.model, protocol: config.protocol, reasoning: config.reasoning } : { configured: false };
export const relayConfigStatus = () => publicRelay(configuredRelay());
export const creativeTransport = () => configuredRelay() ? 'relay' as const : 'local-cli' as const;
export const relayEnvironmentStatus = () => ({ ...publicRelay(environmentRelay()), images: { configured: !!(process.env.IMAGE2_API_KEY && process.env.IMAGE2_BASE_URL), endpoint: process.env.IMAGE2_BASE_URL, model: process.env.IMAGE2_MODEL } });
export async function setRelayConfig(config: Partial<RelayConfig> | { useEnvironment: true } | null) {
  const value: StoredConfig = !config ? { disabled: true } : 'useEnvironment' in config ? { useEnvironment: true } : normalizeRelayConfig(config);
  if ('useEnvironment' in value && !environmentRelay()) throw new Error('当前服务没有完整的环境中转配置。');
  const file = configFile(); await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 }); await rename(temp, file); }
  finally { await rm(temp, { force: true }); }
}
