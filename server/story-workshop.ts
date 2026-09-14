import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import type { GameWorld, StoryDetail } from '../shared/types.ts';
import { originalWorkUrl, zhihuImage, zhihuStoryApi } from '../shared/zhihu-source.ts';
import { isImportedId, originalSeed, defaultGenerationOptions, type GenerationOptions, type GeneratedDraft, type ImportedSource, type WorkshopProject } from '../shared/workshop.ts';
import { outlineSchema, routeSchema, validateSchema } from './workshop-schema.ts';
import { claimImportRecovery, publishImportRecord } from './import-recovery.ts';

export class WorkshopError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
export function generationOptions(value: unknown, fallback: GenerationOptions = defaultGenerationOptions): GenerationOptions {
  if (value === undefined) return { ...fallback };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkshopError('INVALID_GENERATION_OPTIONS', '请选择生成速度、创作方式和配图方式。');
  const data = value as Record<string, unknown>;
  const result = { ...fallback, ...data };
  if (Object.keys(data).some(key => !['mode', 'adaptation', 'images'].includes(key)) || !['fast', 'full'].includes(result.mode as string) || !['faithful', 'inspiration'].includes(result.adaptation as string) || !['none', 'image2', 'gpt6'].includes(result.images as string)) throw new WorkshopError('INVALID_GENERATION_OPTIONS', '生成或配图选项无效。');
  return result as GenerationOptions;
}
export async function writeJson(file: string, data: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temp, 'wx');
  try { await handle.writeFile(JSON.stringify(data, null, 2), 'utf8'); await handle.sync(); } finally { await handle.close(); }
  for (let attempt = 0; ; attempt++) {
    try { await rename(temp, file); break; }
    catch (error) {
      if (attempt >= 12 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      // Windows readers/virus scanners briefly hold destination handles. Keep the
      // existing complete file intact while retrying only the atomic replacement.
      await new Promise(r => setTimeout(r, Math.min(200, 20 * (attempt + 1))));
    }
  }
}
export async function jsonFile<T>(file: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return JSON.parse(await readFile(file, 'utf8')) as T; }
    catch (error) {
      if (attempt >= 8 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await new Promise(r => setTimeout(r, Math.min(160, 20 * (attempt + 1))));
    }
  }
}
export function hashSource(source: ImportedSource) { return createHash('sha256').update(JSON.stringify({ title: source.title, author: source.author, text: source.text, scope: source.scope, ...(source.referenceUrl ? { referenceUrl: source.referenceUrl } : {}), ...(source.origin ? source.origin.kind === 'zhihu-story' ? { zhihuWorkId: source.origin.workId } : { zhihuSearchUrl: source.origin.sourceUrl, ...(source.origin.contentScope === 'webpage-selection' ? { zhihuContentScope: 'webpage-selection' } : {}) } : {}) })).digest('hex'); }
export function alive(pid: number) { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch { return false; } }
export interface LockOwner { token: string; pid: number; childPid?: number; heartbeat: string }
export const jobAlive = (owner: LockOwner) => alive(owner.pid) || Boolean(owner.childPid && alive(owner.childPid));

/** Copy validated MODEL drafts, never a published world or an approval from another version. */
export async function seedEditorialRevision(directory: string, baseVersion: string, nextVersion: string) {
  if (!/^r[1-9][0-9]*$/.test(baseVersion) || !/^r[1-9][0-9]*$/.test(nextVersion) || baseVersion === nextVersion) throw new WorkshopError('INVALID_REVISION', '编辑修订需要独立的新版本。');
  const draft = await jsonFile<GeneratedDraft>(join(directory, baseVersion, 'draft.json')).catch(() => { throw new WorkshopError('DRAFT_NOT_FOUND', '原版本的完整创作稿尚未保存。', 409); });
  validateSchema(outlineSchema, draft.outline);
  if (draft.routes.length !== 3 || draft.routes.some(route => !draft.outline.routes.some(expected => expected.id === route.routeId)) || new Set(draft.routes.map(route => route.routeId)).size !== 3) throw new WorkshopError('INVALID_DRAFT', '原版本路线稿不完整。', 409);
  for (const route of draft.routes) validateSchema(routeSchema, route);
  const target = join(directory, nextVersion);
  await mkdir(target); // Never replace any existing revision, even if partially written.
  await writeJson(join(target, 'draft.json'), draft);
  await writeJson(join(target, 'outline.json'), draft.outline);
  for (const route of draft.routes) await writeJson(join(target, `route-${route.routeId}.json`), route);
  await writeJson(join(target, 'revision-origin.json'), { kind: 'editorial-revision', baseVersion, draftHash: createHash('sha256').update(JSON.stringify(draft)).digest('hex'), createdAt: new Date().toISOString() });
}
export class StoryWorkshop {
  root: string;
  constructor(root = resolve('.local/story-workshop')) { this.root = resolve(root); }
  dir(id: string) { if (!isImportedId(id)) throw new WorkshopError('INVALID_PROJECT_ID', '导入作品编号格式错误。'); return join(this.root, 'projects', id); }
  async get(id: string): Promise<WorkshopProject> {
    let project: WorkshopProject;
    try { project = await jsonFile(join(this.dir(id), 'project.json')); }
    catch (error) {
      if (error instanceof WorkshopError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new WorkshopError('PROJECT_NOT_FOUND', '未找到导入作品。', 404);
      throw new WorkshopError('PROJECT_READ_FAILED', '本地制作记录读取失败，请检查文件或稍后刷新。', 503);
    }
    if (project.status === 'running') {
      let owner: LockOwner | undefined;
      try { owner = await jsonFile(join(this.dir(id), 'job.lock', 'owner.json')); } catch { /* acquired lock has a brief owner-write interval */ }
      if ((owner && !jobAlive(owner)) || (!owner && Date.now() - Date.parse(project.updatedAt) > 60_000)) {
        project.status = 'interrupted'; project.error = { code: 'WORKER_INTERRUPTED', stage: project.stage, message: '上次生成进程已结束，已完成阶段仍在。可续跑，不会重写原文。' };
        if (project.generation) { const ended = Date.now(); project.generation.finishedAt = new Date(ended).toISOString(); project.generation.elapsedMs = ended - Date.parse(project.generation.startedAt); }
        if (project.editorial?.status === 'reviewing') project.editorial = { ...project.editorial, status: 'failed', message: '审稿进程已结束，完成的稿件和检查记录仍保留。' };
        await this.save(project);
      }
    }
    return project;
  }
  async save(project: WorkshopProject) { project.updatedAt = new Date().toISOString(); await writeJson(join(this.dir(project.id), 'project.json'), project); }
  async list() {
    await mkdir(join(this.root, 'projects'), { recursive: true });
    const ids = (await readdir(join(this.root, 'projects'))).filter(isImportedId);
    const entries = await Promise.all(ids.map(id => this.get(id).catch(error => { if (error instanceof WorkshopError && error.code === 'PROJECT_NOT_FOUND') return null; throw error; })));
    return entries.filter((p): p is WorkshopProject => p !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async import(value: unknown, ownerId?: string): Promise<WorkshopProject> {
    if (!value || typeof value !== 'object') throw new WorkshopError('INVALID_SOURCE', '请填写标题、作者和正文。');
    const data = value as ImportedSource & { generationOptions?: GenerationOptions };
    const options = generationOptions(data.generationOptions);
    if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120 || typeof data.author !== 'string' || !data.author.trim() || data.author.length > 120 || typeof data.text !== 'string' || data.text.trim().length < 80 || data.text.length > 120000 || /\u0000/.test(data.text)) throw new WorkshopError('INVALID_SOURCE', '标题/作者各1–120字；正文80–120000字。原文不做裁剪或改写。');
    if (data.scope && !['user-import', 'original-seed'].includes(data.scope)) throw new WorkshopError('INVALID_SCOPE', '来源类型不符合约定。');
    if (data.origin !== undefined) throw new WorkshopError('INVALID_ORIGIN', '知乎来源由服务器核对，请从知乎书库选择原作。');
    let referenceUrl: string | undefined;
    if (data.referenceUrl !== undefined) {
      try { const { canonicalZhihuSource } = await import('../shared/zhihu-discovery.ts'); referenceUrl = canonicalZhihuSource(data.referenceUrl).sourceUrl; }
      catch { throw new WorkshopError('INVALID_REFERENCE_URL', '来源链接需要是具体的 HTTPS 知乎回答或文章地址。'); }
    }
    if (data.scope === 'original-seed' && (data.text !== originalSeed.text || data.title !== originalSeed.title || data.author !== originalSeed.author)) throw new WorkshopError('INVALID_SCOPE', '修改后的文本请使用用户导入类型。');
    const source: ImportedSource = { title: data.title, author: data.author, text: data.text, scope: data.scope ?? 'user-import', ...(referenceUrl ? { referenceUrl } : {}) };
    return this.persistImport(source, options, ownerId);
  }
  async importZhihu(detail: StoryDetail, requestedOptions?: unknown, ownerId?: string): Promise<WorkshopProject> {
    const options = generationOptions(requestedOptions);
    if (!/^\d{8,24}$/.test(detail.id) || detail.sourceUrl !== `${zhihuStoryApi}${detail.id}` || detail.contentScope !== 'api-excerpt') throw new WorkshopError('INVALID_ORIGIN', '需要经知乎故事接口核对的原作节选。');
    if (!detail.title?.trim() || detail.title.length > 120 || !detail.author?.trim() || detail.author.length > 120 || typeof detail.content !== 'string' || detail.content.trim().length < 80 || detail.content.length > 120000 || detail.content.includes('\u0000') || !Number.isFinite(Date.parse(detail.fetchedAt))) throw new WorkshopError('INVALID_SOURCE', '这份节选暂不符合导入要求，原文不会被截断或改写。');
    const source: ImportedSource = {
      title: detail.title, author: detail.author, text: detail.content, scope: 'zhihu-excerpt',
      origin: { kind: 'zhihu-story', workId: detail.id, sourceUrl: detail.sourceUrl, fetchedAt: detail.fetchedAt,
        ...(originalWorkUrl(detail.originalUrl) ? { originalUrl: originalWorkUrl(detail.originalUrl) } : {}),
        ...(zhihuImage(detail.authorAvatar) ? { authorAvatar: zhihuImage(detail.authorAvatar) } : {}),
        ...(zhihuImage(detail.sourceCover) ? { cover: zhihuImage(detail.sourceCover) } : {}),
      },
    };
    return this.persistImport(source, options, ownerId);
  }
  async importZhihuSearch(source: ImportedSource, requestedOptions?: unknown, ownerId?: string): Promise<WorkshopProject> {
    const options = generationOptions(requestedOptions);
    const { canonicalZhihuSource } = await import('../shared/zhihu-discovery.ts');
    const identity = canonicalZhihuSource(source.origin?.sourceUrl);
    if (source.scope !== 'zhihu-excerpt' || !['search-excerpt', 'webpage-selection'].includes(source.origin?.contentScope ?? '') || source.origin?.kind !== identity.kind || source.origin.workId !== identity.workId || !Number.isFinite(Date.parse(source.origin.fetchedAt))) throw new WorkshopError('INVALID_ORIGIN', '需要已保存的知乎来源节选记录。');
    if (typeof source.title !== 'string' || !source.title.trim() || source.title.length > 120 || typeof source.author !== 'string' || !source.author.trim() || source.author.length > 120 || typeof source.text !== 'string' || !source.text.trim() || source.text.length > 120000 || source.text.includes('\u0000')) throw new WorkshopError('INVALID_SOURCE', '这份搜索节选暂不符合导入要求，原文不会被截断或改写。');
    return this.persistImport(source, options, ownerId);
  }
  private async persistImport(source: ImportedSource, options: GenerationOptions = { ...defaultGenerationOptions }, ownerId?: string): Promise<WorkshopProject> {
    const hash = hashSource(source);
    // Stable import idempotency, including simultaneous POSTs across processes.
    await mkdir(join(this.root, 'imports'), { recursive: true });
    const indexFile = join(this.root, 'imports', `${hash}.json`);
    const proposedId = `import-${randomUUID()}`;
    if (!await publishImportRecord(indexFile, { id: proposedId, pid: process.pid })) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const index = await jsonFile<{ id?: string; pid?: number }>(indexFile).catch(() => null);
        if (index?.id && isImportedId(index.id)) {
          const existing = await this.get(index.id).catch(error => { if (error instanceof WorkshopError && error.code === 'PROJECT_NOT_FOUND') return null; throw error; });
          if (existing && (!ownerId || !existing.ownerId || existing.ownerId === ownerId)) return existing;
        }
        const abandoned = index?.pid !== undefined ? !alive(index.pid) : Date.now() - (await stat(indexFile)).mtimeMs > 120_000;
        if (abandoned) {
          const release = await claimImportRecovery(indexFile, alive);
          if (!release) throw new WorkshopError('IMPORT_BUSY', '同一原文正在恢复入库，请稍后刷新。', 409);
          let claimed = false;
          try {
            const current = await jsonFile<{ id?: string; pid?: number }>(indexFile).catch(() => null);
            let id = current?.id && isImportedId(current.id) ? current.id : undefined;
            if (id) {
              const existing = await this.get(id).catch(error => { if (error instanceof WorkshopError && error.code === 'PROJECT_NOT_FOUND') return null; throw error; });
              if (existing && (!ownerId || !existing.ownerId || existing.ownerId === ownerId)) return existing;
            }
            if (current?.pid !== undefined && alive(current.pid)) throw new WorkshopError('IMPORT_BUSY', '同一原文正在入库，请稍后刷新。', 409);
            if (!id) {
              const dirs = await readdir(join(this.root, 'projects')).catch(() => []);
              for (const candidate of dirs.filter(isImportedId)) {
                const stored = await jsonFile<ImportedSource>(join(this.dir(candidate), 'source.json')).catch(() => null);
                if (stored && hashSource(stored) === hash) { id = candidate; break; }
              }
            }
            id ??= proposedId;
            await writeJson(indexFile, { id, pid: process.pid });
            claimed = true;
            const restored = await this.initializeImport(id, source, hash, options);
            if (ownerId && !restored.ownerId) { restored.ownerId = ownerId; await this.save(restored); }
            return restored;
          } catch (error) {
            if (claimed) {
              const current = await jsonFile<{ id: string }>(indexFile);
              await writeJson(indexFile, { id: current.id, pid: -1 });
            }
            throw error;
          } finally { await release(); }
        }
        await new Promise(r => setTimeout(r, 100));
      }
      throw new WorkshopError('IMPORT_BUSY', '同一原文正在入库，请稍后刷新。', 409);
    }
    try {
      const created = await this.initializeImport(proposedId, source, hash, options);
      if (ownerId) { created.ownerId = ownerId; await this.save(created); }
      return created;
    } catch (error) { await writeJson(indexFile, { id: proposedId, pid: -1 }).catch(() => {}); throw error; }
  }
  private async initializeImport(id: string, source: ImportedSource, hash: string, options: GenerationOptions): Promise<WorkshopProject> {
    const existing = await this.get(id).catch(error => { if (error instanceof WorkshopError && error.code === 'PROJECT_NOT_FOUND') return null; throw error; }); if (existing) return existing;
    const now = new Date().toISOString();
    await mkdir(this.dir(id), { recursive: true });
    await writeJson(join(this.dir(id), 'source.json'), source);
    const project: WorkshopProject = { id, title: source.title, author: source.author, scope: source.scope, ...(source.origin ? { origin: source.origin } : {}), sourceHash: hash, createdAt: now, updatedAt: now, revision: 0, status: 'idle', stage: 'imported', completedRoutes: 0, playable: false, attempts: 0, art: { status: 'pending', approved: 0, total: 0 }, events: [{ at: now, stage: 'imported', message: '原文已逐字保存；尚未生成。' }] };
    project.generationOptions = { ...options };
    if (options.images === 'none') project.art = { status: 'disabled', provider: 'none', approved: 0, total: 0, message: '纯文字模式，可在文本发布后另外制作插图。' };
    await this.save(project); return project;
  }
  async source(id: string) { await this.get(id); return jsonFile<ImportedSource>(join(this.dir(id), 'source.json')); }
  async generate(id: string, mode: 'resume' | 'regenerate' | 'revise' = 'resume', requestedOptions?: unknown) {
    const directory = this.dir(id), lock = join(directory, 'job.lock');
    let project = await this.get(id);
    if (!['resume', 'regenerate', 'revise'].includes(mode)) throw new WorkshopError('INVALID_MODE', '生成模式应为 resume、regenerate 或 revise。');
    const options = generationOptions(requestedOptions, project.generationOptions ?? { mode: 'full', adaptation: 'faithful', images: 'none' });
    try { await mkdir(lock); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let owner: LockOwner | undefined; try { owner = await jsonFile(join(lock, 'owner.json')); } catch { /* another process is acquiring */ }
      if (!owner || jobAlive(owner)) return this.get(id);
      // Serialize orphan recovery as well as ordinary acquisition. A second recovery must
      // never delete the first caller's newly acquired live lock.
      let recovery;
      const recoveryFile = join(directory, 'job.recovery');
      try { recovery = await open(recoveryFile, 'wx'); } catch { return this.get(id); }
      try {
        const current = await jsonFile<LockOwner>(join(lock, 'owner.json')).catch(() => null);
        if (!current || current.token !== owner.token || jobAlive(current)) return this.get(id);
        await rm(lock, { recursive: true, force: true });
        try { await mkdir(lock); } catch { return this.get(id); }
      } finally { await recovery.close(); await rm(recoveryFile, { force: true }); }
    }
    const token = randomUUID();
    await writeJson(join(lock, 'owner.json'), { token, pid: process.pid, heartbeat: new Date().toISOString() });
    project = await this.get(id);
    const previous = project.generationOptions ?? { mode: 'full', adaptation: 'faithful', images: 'none' };
    const changed = Object.keys(options).some(key => options[key as keyof GenerationOptions] !== previous[key as keyof GenerationOptions]);
    if (mode === 'resume' && project.status === 'ready' && !changed) { await rm(lock, { recursive: true, force: true }); return project; }
    try {
      // A different generation contract must never consume the previous contract's checkpoints.
      if (changed && project.revision && mode === 'resume') mode = 'regenerate';
      if (mode === 'revise' && previous.mode === 'fast' && project.publishedVersion) throw new WorkshopError('FAST_REVISION_REQUIRES_REGENERATE', '快速版请使用重新生成；需要长篇可切换完整版另开新版本。', 409);
      if (mode === 'revise') {
        if (!project.publishedVersion) throw new WorkshopError('WORLD_NOT_READY', '编辑修订需要一个已有文本版本；未发布稿请使用续跑。', 409);
        await seedEditorialRevision(directory, project.publishedVersion, `r${project.revision + 1}`);
        project.basedOnVersion = project.publishedVersion;
        project.events.push({ at: new Date().toISOString(), stage: 'editorial', message: `从 ${project.publishedVersion} 的真实模型完成稿创建独立编辑修订；旧版原文、游戏与存档保持不变。` });
      }
      if (mode === 'regenerate' || mode === 'revise' || !project.revision) {
        project.revision++; project.completedRoutes = 0; project.stage = 'outline';
        project.editorial = { status: 'pending', revision: project.revision };
        if (mode !== 'revise') delete project.basedOnVersion;
      }
      project.status = 'running'; delete project.error; project.jobId = token; project.attempts++;
      project.generationOptions = options;
      const started = Date.now();
      project.generation = { startedAt: new Date(started).toISOString(), ...(options.mode === 'fast' ? { deadlineAt: new Date(started + 285_000).toISOString() } : {}) };
      if (options.images === 'none') project.art = { status: 'disabled', provider: 'none', approved: 0, total: 0, message: '本次不生成配图。' };
      else project.art = { status: 'pending', provider: options.images, approved: 0, total: 0, message: '文本发布后单独制作插图。' };
      await this.save(project);
    } catch (error) {
      if ((await jsonFile<LockOwner>(join(lock, 'owner.json')).catch(() => null))?.token === token) await rm(lock, { recursive: true, force: true });
      throw error;
    }
    try {
      const child = spawn(process.execPath, ['--import', 'tsx', resolve('server/workshop-worker.ts'), this.root, id, token], { cwd: process.cwd(), detached: true, windowsHide: true, stdio: 'ignore', shell: false });
      await new Promise<void>((yes, no) => { child.once('spawn', yes); child.once('error', no); });
      await writeJson(join(lock, 'owner.json'), { token, pid: child.pid, heartbeat: new Date().toISOString() });
      child.unref();
    } catch (error) {
      project.status = 'failed'; project.error = { code: 'WORKER_START_FAILED', message: error instanceof Error ? `生成工作进程启动失败：${error.message.slice(0, 240)}` : '生成工作进程启动失败，可重试。', stage: project.stage };
      await this.save(project); await rm(lock, { recursive: true, force: true });
    }
    return project;
  }
  async world(id: string, version?: string): Promise<GameWorld> {
    const project = await this.get(id), selected = version ?? project.publishedVersion;
    if (!selected || !/^r[1-9][0-9]*$/.test(selected)) throw new WorkshopError('WORLD_NOT_READY', '文本尚未通过完整检查；请查看生成进度。', 409);
    try { return await jsonFile(join(this.dir(id), selected, 'world.json')); }
    catch { throw new WorkshopError('WORLD_VERSION_NOT_FOUND', '该版本尚未发布或不存在。', 404); }
  }
}
