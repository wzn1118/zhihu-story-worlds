import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import type { LiukanMemoryProfile, LiukanMemoryRecord } from '../../shared/liukan.ts';

const safePlayer = (value: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : 'local-player';

function extendsEndingReading(previous: LiukanMemoryRecord, incoming: LiukanMemoryRecord): boolean {
  if (!previous.scenes.length || previous.scenes.length !== incoming.scenes.length) return false;
  // The stored context is bounded, so only expand an otherwise identical
  // snapshot; a different route to this ending must not overwrite its history.
  return previous.scenes.every((scene, index) => {
    const next = incoming.scenes[index];
    if (scene.title !== next.title || scene.selectedChoice !== next.selectedChoice) return false;
    return index === previous.scenes.length - 1
      ? next.text.length > scene.text.length && next.text.startsWith(scene.text)
      : next.text === scene.text;
  });
}

export class LiukanMemoryStore {
  private pending = new Map<string, Promise<LiukanMemoryRecord[]>>();
  constructor(private readonly root = resolve('.local/liukan-memory')) {}
  private path(playerId: string): string { return resolve(this.root, `${safePlayer(playerId)}.json`); }
  async list(playerId = 'local-player'): Promise<LiukanMemoryRecord[]> {
    try {
      const raw = JSON.parse(await readFile(this.path(playerId), 'utf8')) as unknown;
      if (!Array.isArray(raw)) return [];
      return raw.filter((row): row is LiukanMemoryRecord => Boolean(row && typeof row === 'object' && ['storyId', 'worldId', 'worldVersion', 'title', 'endingTitle', 'completedAt'].every(key => typeof row[key] === 'string') && Array.isArray(row.scenes) && row.scenes.length <= 12 && row.scenes.every((scene: { title?: unknown; text?: unknown; selectedChoice?: unknown }) => scene && typeof scene.title === 'string' && typeof scene.text === 'string' && (scene.selectedChoice === undefined || typeof scene.selectedChoice === 'string')))).slice(-50);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw new Error('关卡回忆记录暂时读取失败。'); }
  }
  async profile(playerId = 'local-player'): Promise<LiukanMemoryProfile> {
    const records = await this.list(playerId);
    const recent = [...records].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0];
    return {
      playerId: safePlayer(playerId),
      storyCount: new Set(records.map(record => record.storyId)).size,
      endingCount: records.length,
      sceneCount: records.reduce((total, record) => total + record.scenes.length, 0),
      ...(recent ? { recent: { title: recent.title, endingTitle: recent.endingTitle, completedAt: recent.completedAt } } : {}),
    };
  }
  async remember(playerId: string, record: LiukanMemoryRecord): Promise<LiukanMemoryRecord[]> {
    const key = safePlayer(playerId);
    const previous = this.pending.get(key) ?? Promise.resolve([]);
    const task = previous.catch(() => []).then(() => this.write(key, record));
    this.pending.set(key, task);
    try { return await task; } finally { if (this.pending.get(key) === task) this.pending.delete(key); }
  }
  private async write(playerId: string, record: LiukanMemoryRecord): Promise<LiukanMemoryRecord[]> {
    const previous = await this.list(playerId);
    const duplicateIndex = previous.findIndex(item => item.storyId === record.storyId && item.worldId === record.worldId && item.worldVersion === record.worldVersion && item.endingTitle === record.endingTitle);
    let next: LiukanMemoryRecord[];
    if (duplicateIndex >= 0) {
      const stored = previous[duplicateIndex];
      if (!extendsEndingReading(stored, record)) return previous;
      // Keep the first completion date while saving newly verified paragraphs.
      next = previous.map((item, index) => index === duplicateIndex ? { ...item, scenes: record.scenes } : item);
    } else next = [...previous, record].slice(-50);
    await mkdir(dirname(this.path(playerId)), { recursive: true });
    const staging = `${this.path(playerId)}.${randomUUID()}.tmp`;
    await writeFile(staging, JSON.stringify(next, null, 2), 'utf8');
    await rename(staging, this.path(playerId));
    return next;
  }
}
