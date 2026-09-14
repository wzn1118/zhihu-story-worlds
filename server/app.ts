import { join, dirname, resolve } from 'node:path';
import { createLiukanWorkspace, liukanAccountKey } from './liukan/workspace.ts';
import express, { type ErrorRequestHandler } from 'express';
import { createRedrainWorld } from './liukan/redrain-world.ts';
import { createZhihuBrowserRouter } from './zhihu-browser.ts';
import { createZhihuAccountBrowserRouter, ZhihuBrowserAccounts } from './zhihu-browser-accounts.ts';
import { StorySourceError, StorySourceService, validateStoryId } from './story-source.ts';
import { getWorld } from './worlds.ts';
import { StoryWorkshop, WorkshopError } from './story-workshop.ts';
import { artService, artStatus, prepareWorkshopArt, withApprovedArt } from './workshop-art.ts';
import { ZhihuDiscoveryService } from './zhihu-discovery.ts';
import { ZhihuQuestionsService } from './zhihu-questions.ts';
import { creativeTransport, relayConfigStatus, relayEnvironmentStatus, setRelayConfig } from './workshop-creative.ts';
import { configuredRelay, normalizeRelayConfig } from './workshop-relay-config.ts';
import { checkRelayConnection, discoverRelayModels, RelayDiscoveryError } from './workshop-relay-discovery.ts';
import { findWorkshopImageBatch, getImages, listImages, runImages, pauseImages, reviewImage } from './workshop-images.ts';
import { workshopImageConfigStatus } from './workshop-image-config.ts';
import type { WorkshopProject } from '../shared/workshop.ts';
import { startImageLaunch, getImageLaunch } from './workshop-image-launch.ts';
import { getSimpleImageStatus, withSimpleImages } from './workshop-simple-images.ts';
import { launchOptionalImages } from './workshop-optional-images.ts';
import { authRouter, authRequired, attachCurrentUser, requestUser } from './auth.ts';
import { OAuthFailure, zhihuOAuth } from './zhihu-oauth.ts';

export function createApp(source = new StorySourceService(), workshop = new StoryWorkshop(), discovery = new ZhihuDiscoveryService(), artLookup?: Parameters<typeof withApprovedArt>[2], imageLookup = { getImages, listImages }, questions = new ZhihuQuestionsService()) {
  const app = express();
  const independentArtLookup = { getArtBatch: imageLookup.getImages, listArtBatches: imageLookup.listImages };
  async function ownedProject(request: express.Request, response: express.Response, id: string) {
    const project = await workshop.get(id), ownerId = requestUser(request)?.id;
    if (ownerId && project.ownerId !== ownerId) throw new WorkshopError('PROJECT_NOT_FOUND', '未找到当前账号的改编项目，请刷新项目列表。', 404);
    return project;
  }
  async function withCurrentImages(projects: WorkshopProject[]) {
    const batches = projects.some(project => !project.generationOptions || project.generationOptions.images === 'image2') ? await imageLookup.listImages().catch(() => null) : [];
    return Promise.all(projects.map(async project => {
      if (project.generationOptions?.images === 'none') return project;
      const world = project.publishedVersion ? await workshop.world(project.id, project.publishedVersion).catch(() => null) : null;
      if (project.generationOptions?.images === 'gpt6') {
        if (!world || world.version !== `r${project.revision}`) return project;
        const simple = await getSimpleImageStatus(world, workshop.dir(project.id));
        const art: WorkshopProject['art'] = { provider: 'gpt6', status: simple.state === 'generating' ? 'in-progress' : simple.state === 'ready' || simple.state === 'partial' ? 'ready' : simple.state === 'failed' ? 'failed' : 'pending', approved: simple.completed, total: simple.targetedScenes,
          message: `GPT6 简洁 SVG：${simple.completed} / ${simple.targetedScenes || '待确定'} 个关键场景已生成，全篇共 ${simple.totalScenes} 场${simple.failed ? `；${simple.failed} 张未完成，可单独重试` : ''}。` };
        return { ...project, art };
      }
      const batch = world && batches ? findWorkshopImageBatch(world, batches) : null;
      const unavailable = !batches || Boolean(project.publishedVersion && !world);
      const art: WorkshopProject['art'] = batch ? artStatus(batch) : { status: unavailable ? 'failed' : 'pending', approved: 0, total: project.validation?.scenes ?? 0,
        ...(unavailable ? { message: '独立美术清单暂时无法读取。' } : {}) };
      return { ...project, art };
    }));
  }
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'loopback') app.set('trust proxy', 'loopback');
  app.use((request, response, next) => {
    let path = request.path; try { path = decodeURIComponent(path); } catch { return response.sendStatus(400); }
    if (path.replace(/\\/g, '/').split('/').some(part => ['.local', '.private'].includes(part.toLowerCase()))) return response.sendStatus(404);
    next();
  });
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  // No permissive CORS. Reject cross-origin/browser form POSTs before paid or local mutations.
  app.use('/api', (request, response, next) => {
    // Keep the development workbench local while allowing authenticated
    // production deployments behind an HTTPS reverse proxy.
    const allowedHosts = new Set((process.env.ALLOWED_HOSTS ?? '127.0.0.1,localhost,[::1]').split(',').map(host => host.trim().toLowerCase()).filter(Boolean));
    if (!allowedHosts.has(request.hostname.toLowerCase())) return response.status(403).json({ error: { code: 'LOCAL_HOST_REQUIRED', message: '此工作台仅接受已配置的地址。', status: 403 } });
    const extensionInbox = request.path === '/liukan/inbox/extension';
    const extensionOrigin = request.get('origin');
    const fromExtension = Boolean(extensionOrigin && /^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin));
    if (extensionInbox && fromExtension) {
      response.setHeader('Access-Control-Allow-Origin', extensionOrigin!);
      response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.setHeader('Vary', 'Origin');
      if (request.method === 'OPTIONS') return response.sendStatus(204);
    }
    if (request.method === 'POST') {
      const origin = request.get('origin');
      if (((origin && origin !== `${request.protocol}://${request.get('host')}`) || request.get('sec-fetch-site') === 'cross-site') && !(extensionInbox && fromExtension)) return response.status(403).json({ error: { code: 'CROSS_ORIGIN', message: '请从本机工作台发起请求。', status: 403 } });
      if (!request.is('application/json')) return response.status(415).json({ error: { code: 'JSON_REQUIRED', message: '请求需要 JSON。', status: 415 } });
    }
    next();
  });
  app.use('/api', express.json({ limit: '768kb' }));
  app.use('/api/oauth', zhihuOAuth.router);
  app.get('/auth/callback', zhihuOAuth.callback);
  app.use('/api/auth', authRouter());
  app.use('/api', attachCurrentUser);
  const publicMode = process.env.PUBLIC_MODE === '1';
  if (publicMode) app.use('/api', authRequired());
  if (publicMode) app.use('/api', (request, response, next) => {
    if (request.get('X-Redleaf-Account') !== requestUser(request)?.id) return response.status(409).json({ error: { code: 'ACCOUNT_CHANGED', message: '登录账号已变化，请刷新页面后继续。', status: 409 } });
    next();
  });
  if (publicMode) app.use(['/generated-art/workshop', '/generated-art/workshop-simple'], attachCurrentUser, async (request, response, next) => {
    if (!requestUser(request)) return response.sendStatus(401);
    let path: string; try { path = decodeURIComponent(request.path); } catch { return response.sendStatus(404); }
    let storyId: string | undefined;
    if (request.baseUrl === '/generated-art/workshop-simple') {
      const world = /^\/workshop-([a-f0-9-]{36})-r[1-9][0-9]*\//.exec(path);
      if (world) storyId = `import-${world[1]}`;
    } else {
      const assetUrl = `/generated-art/workshop${path}`;
      const batch = (await imageLookup.listImages()).find(batch => batch.jobs.some(job => job.asset?.url === assetUrl));
      storyId = batch?.storyId;
    }
    if (!storyId?.startsWith('import-') || !await ownedProject(request, response, storyId)) { if (!response.headersSent) response.sendStatus(404); return; }
    response.locals.privateGeneratedArt = true;
    next();
  });
  // These batches administer the shared catalog. Per-project image endpoints
  // below remain available after checking the project's authenticated owner.
  if (publicMode) app.use('/api/art', (_request, response) => response.status(403).json({ error: { code: 'SHARED_ART_READ_ONLY', message: '公网版不能管理共享故事的美术任务。', status: 403 } }));
  if (publicMode) app.use('/api/workshop/images/:id', async (request, response, next) => {
    const batch = await imageLookup.getImages(request.params.id);
    if (!batch?.storyId.startsWith('import-') || !await ownedProject(request, response, batch.storyId)) { if (!response.headersSent) response.sendStatus(404); return; }
    next();
  });
  if (!publicMode) app.use('/api/zhihu-browser', createZhihuBrowserRouter(discovery));
  const publicWorkspaceRoot = resolve(process.env.LIUKAN_USERS_ROOT || join(dirname(discovery.root), 'liukan-users'));
  const accountWorkspaces = new Map<string, ReturnType<typeof createLiukanWorkspace>>();
  const loadWorld = (storyId: string, version?: string) => storyId === 'redrain-rebirth-week' ? createRedrainWorld() : storyId.startsWith('import-') ? workshop.world(storyId, version) : getWorld(storyId);
  const localWorkspace = publicMode ? undefined : createLiukanWorkspace(discovery, workshop, loadWorld);
  function workspaceFor(request: express.Request) {
    if (localWorkspace) return localWorkspace;
    const user = requestUser(request);
    if (!user) throw new WorkshopError('AUTH_REQUIRED', '请先登录。', 401);
    let workspace = accountWorkspaces.get(user.id);
    if (!workspace) {
      const root = join(publicWorkspaceRoot, liukanAccountKey(user.id));
      workspace = createLiukanWorkspace(discovery.scoped(join(root, 'discovery')), workshop, async (storyId, version) => {
        if (storyId.startsWith('import-') && (await workshop.get(storyId)).ownerId !== user.id) throw new WorkshopError('PROJECT_NOT_FOUND', '此项目不存在。', 404);
        return loadWorld(storyId, version);
      }, { id: user.id, root });
      accountWorkspaces.set(user.id, workspace);
    }
    return workspace;
  }
  if (publicMode) {
    const browsers = new ZhihuBrowserAccounts({ root: join(publicWorkspaceRoot, 'browser-profiles') });
    app.locals.closeAccountBrowsers = () => browsers.closeAll();
    app.use('/api/zhihu-browser', createZhihuAccountBrowserRouter(browsers, request => requestUser(request)!.id, request => workspaceFor(request).discovery));
  }
  app.use('/api/liukan', (request, response, next) => workspaceFor(request).router(request, response, next));
  app.get('/api/zhihu/questions/hotlist', async (_request, response) => response.json(await questions.hotlist()));
  app.get('/api/zhihu/questions/answers', async (request, response) => response.json(await questions.questionAnswers(request.query.url, request.query.offset, workspaceFor(request).discovery)));
  app.get('/api/workshop/discovery', async (request, response) => response.json(await workspaceFor(request).discovery.list()));
  app.post('/api/workshop/discovery', async (request, response) => response.json(await workspaceFor(request).discovery.search(request.body?.query)));
  app.post('/api/workshop/discovery/url', async (request, response) => {
    const candidate = await workspaceFor(request).discovery.resolveUrl(request.body?.sourceUrl);
    response.json(candidate);
  });
  app.post('/api/workshop/discovery/page', async (request, response) => response.status(201).json(await workspaceFor(request).discovery.capturePage(request.body)));
  app.post('/api/workshop/discovery/import', async (request, response) => {
    const project = await workshop.importZhihuSearch(await workspaceFor(request).discovery.source(request.body?.candidateId), request.body?.generationOptions, requestUser(request)?.id);
    response.status(request.body?.generate === true ? 202 : 201).json(request.body?.generate === true ? await workshop.generate(project.id, 'resume', request.body?.generationOptions) : project);
  });
  app.get('/api/workshop/favorites/recent', async (request, response) => {
    if (request.query.offset !== undefined) throw new OAuthFailure('INVALID_FAVORITES_QUERY', 400);
    response.json(await zhihuOAuth.favoritesRecent(request, request.query.limit, requestUser(request)?.id));
  });
  app.get('/api/workshop/favorites/lists', async (request, response) => {
    if (request.query.offset !== undefined) throw new OAuthFailure('INVALID_FAVORITES_QUERY', 400);
    response.json(await zhihuOAuth.favoritesLists(request, request.query.limit, requestUser(request)?.id));
  });
  app.get('/api/workshop/favorites/lists/:id/items', async (request, response) => {
    response.json(await zhihuOAuth.favoritesItems(request, request.params.id, request.query.offset, request.query.limit, requestUser(request)?.id));
  });
  app.post('/api/workshop/favorites/import', async (request, response) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['itemId', 'generate', 'generationOptions'].includes(key)) || (body.generate !== undefined && typeof body.generate !== 'boolean')) throw new WorkshopError('INVALID_FAVORITE_IMPORT', '请选择当前账号的一条收藏和生成选项。');
    const selection = zhihuOAuth.favoriteSource(request, body.itemId, requestUser(request)?.id);
    selection.assertActive();
    const project = await workshop.importZhihuSearch(selection.source, body.generationOptions, selection.ownerId);
    selection.assertActive();
    if (body.generate === true) {
      const generated = await workshop.generate(project.id, 'resume', body.generationOptions);
      selection.assertActive();
      response.status(202).json(generated);
    } else response.status(201).json(project);
  });
  app.get('/api/workshop/projects', async (request, response) => {
    const ownerId = requestUser(request)?.id;
    const projects = (await workshop.list()).filter(project => !publicMode ? !ownerId || !project.ownerId || project.ownerId === ownerId : project.ownerId === ownerId);
    response.json({ projects: await withCurrentImages(projects), capabilities: { creativeConfigEditable: !publicMode, quickImages: true, revise: true, editorial: true, zhihuImport: true, creativeTransport: creativeTransport(), relay: relayConfigStatus(), environmentRelay: { ...relayEnvironmentStatus(), images: await workshopImageConfigStatus() } } });
  });
  function relayInput(body: Record<string, unknown>) {
    if (typeof body.apiKey === 'string' && body.apiKey.trim()) return body;
    // Never send a saved credential to a newly entered endpoint.
    const saved = configuredRelay();
    let endpoint: string | undefined;
    try {
      endpoint = normalizeRelayConfig({ endpoint: typeof body.endpoint === 'string' ? body.endpoint.trim().replace(/\/+$/, '').replace(/\/models$/, '') : '', apiKey: 'endpoint-validation', model: 'endpoint-validation' }).endpoint;
    } catch { /* The safe validation error below covers invalid addresses. */ }
    if (!saved || endpoint !== saved.endpoint) throw new RelayDiscoveryError('请填写 API 密钥；更换中转地址后需要重新填写。', 400, 'invalid_config');
    return { ...body, endpoint, apiKey: saved.apiKey };
  }
  for (const [action, run] of [['models', discoverRelayModels], ['check', checkRelayConnection]] as const) {
    app.post(`/api/workshop/creative-config/${action}`, async (request, response) => {
      if (publicMode) throw new WorkshopError('SERVER_CONFIG_READ_ONLY', '公网版由服务端配置创作服务。', 403);
      const controller = new AbortController();
      const abort = () => controller.abort();
      response.once('close', abort);
      try { response.json(await run(relayInput(request.body ?? {}), { signal: controller.signal })); }
      finally { response.off('close', abort); }
    });
  }
  app.post('/api/workshop/creative-config', async (request, response) => {
    if (publicMode) throw new WorkshopError('SERVER_CONFIG_READ_ONLY', '公网版由服务端配置创作服务。', 403);
    const body = request.body ?? {};
    if (body.clear === true) await setRelayConfig(null);
    else if (body.useEnvironment === true) await setRelayConfig({ useEnvironment: true });
    else {
      const input = relayInput(body);
      try { await setRelayConfig({ endpoint: typeof input.endpoint === 'string' ? input.endpoint : '', apiKey: typeof input.apiKey === 'string' ? input.apiKey : '', model: typeof input.model === 'string' ? input.model : '', protocol: input.protocol as 'responses' | 'chat-completions', reasoning: typeof input.reasoning === 'string' ? input.reasoning : undefined }); }
      catch { throw new RelayDiscoveryError('中转站配置无效，请重新检测连接后保存。', 400, 'invalid_config'); }
    }
    response.json({ creativeTransport: creativeTransport(), relay: relayConfigStatus() });
  });
  app.post('/api/workshop/from-zhihu', async (request, response) => {
    const id = request.body?.storyId;
    validateStoryId(id);
    response.status(201).json(await workshop.importZhihu(await source.detail(id), request.body?.generationOptions, requestUser(request)?.id));
  });
  app.post('/api/workshop/projects', async (request, response) => response.status(201).json(await workshop.import(request.body, requestUser(request)?.id)));
  app.get('/api/workshop/projects/:id', async (request, response) => {
    const project = await ownedProject(request, response, request.params.id); if (!project) return;
    response.json((await withCurrentImages([project]))[0]);
  });
  app.get('/api/workshop/projects/:id/source', async (request, response) => {
    const project = await ownedProject(request, response, request.params.id); if (!project) return;
    response.json(await workshop.source(request.params.id));
  });
  app.post('/api/workshop/projects/:id/generate', async (request, response) => {
    const project = await ownedProject(request, response, request.params.id); if (!project) return;
    response.status(202).json(await workshop.generate(request.params.id, request.body?.mode ?? 'resume', request.body?.generationOptions));
  });
  app.get('/api/workshop/projects/:id/world', async (request, response) => {
    const project = await ownedProject(request, response, request.params.id); if (!project) return;
    const world = await workshop.world(project.id, typeof request.query.version === 'string' ? request.query.version : undefined);
    if (world.generated?.illustrationMode === 'none') response.json(world);
    else if (world.generated?.illustrationMode === 'gpt6') response.json(await withSimpleImages(world, workshop.dir(project.id)));
    else response.json(await withApprovedArt(world, project.art.batchId, independentArtLookup));
  });
  app.get('/api/workshop/projects/:id/simple-images', async (request, response) => {
    const project = await ownedProject(request, response, request.params.id); if (!project) return;
    const world = await workshop.world(request.params.id, typeof request.query.version === 'string' ? request.query.version : undefined);
    response.json(await getSimpleImageStatus(world, workshop.dir(request.params.id)));
  });
  app.post('/api/workshop/projects/:id/simple-images', async (request, response) => {
    const project = await ownedProject(request, response, request.params.id); if (!project) return;
    const world = await workshop.world(request.params.id, typeof request.query.version === 'string' ? request.query.version : undefined);
    if (world.generated?.illustrationMode !== 'gpt6') throw new WorkshopError('IMAGE_MODE_MISMATCH', '这个版本未选择 GPT6 简洁插画。', 409);
    await launchOptionalImages(world, 'gpt6', workshop.root);
    response.status(202).json(await getSimpleImageStatus(world, workshop.dir(request.params.id)));
  });
  app.get('/api/workshop/projects/:id/art', async (request, response) => {
    const project = await ownedProject(request, response, request.params.id); if (!project) return;
    const world = await workshop.world(request.params.id, typeof request.query.version === 'string' ? request.query.version : undefined);
    response.json(findWorkshopImageBatch(world, await imageLookup.listImages()));
  });
  app.get('/api/workshop/projects/:id/image-launch', async (request, response) => {
    const project = await ownedProject(request, response, request.params.id); if (!project) return;
    const world = await workshop.world(request.params.id, typeof request.query.version === 'string' ? request.query.version : undefined);
    response.json(await getImageLaunch(world));
  });
  app.post('/api/workshop/projects/:id/image-launch', async (request, response) => {
    const project = await ownedProject(request, response, request.params.id); if (!project) return;
    const started = performance.now();
    const world = await workshop.world(request.params.id, typeof request.query.version === 'string' ? request.query.version : undefined);
    const loaded = performance.now(), launch = await startImageLaunch(world);
    response.setHeader('Server-Timing', `world;dur=${(loaded - started).toFixed(1)}, launch;dur=${(performance.now() - loaded).toFixed(1)}`);
    response.status(202).json(launch);
  });
  app.post('/api/workshop/projects/:id/art', async (request, response) => {
    const project = await ownedProject(request, response, request.params.id); if (!project) return;
    if (project.status === 'running') throw new WorkshopError('GENERATION_BUSY', '本次文本生成仍在进行，请等当前版本发布后登记美术。', 409);
    project.art = await prepareWorkshopArt(await workshop.world(project.id), 'style-first'); await workshop.save(project); response.json(project);
  });
  app.get('/api/art/batches', async (_request, response) => response.json({ batches: await (await artService()).listArtBatches() }));
  app.get('/api/workshop/images', async (request, response) => {
    const batches = await imageLookup.listImages();
    if (!publicMode) return response.json({ batches });
    const owned = new Set((await workshop.list()).filter(project => project.ownerId === requestUser(request)?.id).map(project => project.id));
    response.json({ batches: batches.filter(batch => owned.has(batch.storyId)) });
  });
  app.get('/api/workshop/images/:id', async (request, response) => {
    const batch = await imageLookup.getImages(request.params.id);
    if (!batch) throw new WorkshopError('ART_NOT_FOUND', '此工作台生图批次不存在。', 404);
    response.json(batch);
  });
  app.post('/api/workshop/images/:id/run', async (request, response) => {
    const body = request.body ?? {};
    if (body.maxJobs !== undefined && (!Number.isInteger(body.maxJobs) || body.maxJobs < 1 || body.maxJobs > 40)) throw new WorkshopError('INVALID_BUDGET', '单次制作数量应为1–40。');
    if (body.concurrency !== undefined && (!Number.isInteger(body.concurrency) || body.concurrency < 1 || body.concurrency > 8)) throw new WorkshopError('INVALID_CONCURRENCY', '工作台独立并发数应为1–8。');
    response.status(202).json(await runImages(request.params.id, { maxJobs: body.maxJobs ?? 40, concurrency: body.concurrency ?? 8, recoverOnly: body.recoverOnly === true }));
  });
  app.post('/api/workshop/images/:id/pause', async (request, response) => response.json(await pauseImages(request.params.id)));
  app.post('/api/workshop/images/:id/jobs/:jobId/review', async (request, response) => {
    const { decision, reviewer, notes } = request.body ?? {};
    if (!['approved', 'rejected'].includes(decision) || typeof reviewer !== 'string' || !reviewer.trim() || reviewer.length > 120 || typeof notes !== 'string' || !notes.trim() || notes.length > 2000) throw new WorkshopError('INVALID_REVIEW', '请填写审核人和具体观察。');
    response.json(await reviewImage(request.params.id, request.params.jobId, { decision, reviewer, notes }));
  });
  app.post('/api/art/batches', async (request, response) => {
    const id = request.body?.storyId;
    if (typeof id !== 'string') throw new WorkshopError('INVALID_STORY_ID', '需要已发布作品的 storyId。');
    if (id.startsWith('import-')) throw new WorkshopError('WORKSHOP_ART_ENDPOINT_REQUIRED', '导入故事请使用该项目的独立美术清单。', 409);
    const world = getWorld(id);
    response.status(201).json(await (await artService()).prepareArtBatch({ world, minimumImages: 30 }));
  });
  app.get('/api/art/batches/:id', async (request, response) => { const batch = await (await artService()).getArtBatch(request.params.id); if (!batch) throw new WorkshopError('ART_NOT_FOUND', '美术批次不存在。', 404); response.json(batch); });
  app.post('/api/art/batches/:id/run', async (request, response) => {
    const body = request.body ?? {};
    if (body.maxJobs !== undefined && (!Number.isInteger(body.maxJobs) || body.maxJobs < 1 || body.maxJobs > 100)) throw new WorkshopError('INVALID_BUDGET', '制作数量应为1–100。');
    response.status(202).json(await (await artService()).runArtBatch(request.params.id, { maxJobs: body.maxJobs ?? 2, concurrency: body.concurrency ?? 2, recoverOnly: body.recoverOnly === true, acknowledgeBlock: body.acknowledgeBlock === true }));
  });
  app.post('/api/art/batches/:id/pause', async (request, response) => response.json(await (await artService()).pauseArtBatch(request.params.id)));
  app.post('/api/art/batches/:id/jobs/:jobId/review', async (request, response) => {
    const { decision, reviewer, notes } = request.body ?? {};
    if (!['approved', 'rejected'].includes(decision) || typeof reviewer !== 'string' || !reviewer.trim() || reviewer.length > 120 || typeof notes !== 'string' || !notes.trim() || notes.length > 2000) throw new WorkshopError('INVALID_REVIEW', '审核需要结论、审核人和具体观察。');
    response.json(await (await artService()).reviewArtJob(request.params.id, request.params.jobId, { decision, reviewer, notes }));
  });
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'yuye-story-worlds', source: 'zhihu-hackathon-content-api', authentication: 'not-required' });
  });
  app.get('/api/stories', async (request, response) => {
    response.json(await source.list(request.query.refresh === '1'));
  });
  app.get('/api/stories/:id', async (request, response) => {
    response.json(await source.detail(request.params.id, request.query.refresh === '1'));
  });
  app.get('/api/worlds/:id', async (request, response) => {
    const id = request.params.id;
    validateStoryId(id);
    const list = await source.list();
    if (!list.stories.some((story) => story.id === id)) throw new StorySourceError('STORY_NOT_FOUND', '该编号不在知乎故事列表中。', 404);
    response.json(await withApprovedArt(getWorld(id), undefined, artLookup));
  });
  app.use('/api', (_request, _response, next) => next(new StorySourceError('API_NOT_FOUND', '接口不存在。', 404)));
  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof Error && ['ArtProductionError', 'WorkshopImageError'].includes(error.constructor.name)) {
      const artError = error as Error & { code: string; status: number };
      if (/^[A-Z0-9_]+$/.test(artError.code) && Number.isInteger(artError.status) && artError.status >= 400 && artError.status <= 599) {
        response.status(artError.status).json({ error: { code: artError.code, message: `美术服务：${artError.code}。当前队列和已返回结果已保留。`, status: artError.status } }); return;
      }
    }
    if (error instanceof Error && (error as Error & { type?: string }).type === 'entity.too.large') {
      response.status(413).json({ error: { code: 'SOURCE_TOO_LARGE', message: '请求超过768KB上限。', status: 413 } }); return;
    }
    const safe = error instanceof StorySourceError || error instanceof WorkshopError || error instanceof RelayDiscoveryError || error instanceof OAuthFailure ? error
      : error instanceof SyntaxError ? new WorkshopError('INVALID_JSON', '请求 JSON 格式错误。', 400)
      : new WorkshopError('INTERNAL_ERROR', '服务请求失败，请检查本机生成/美术服务状态后重试。', 500);
    response.status(safe.status).json({ error: { code: safe.code, message: safe.message, status: safe.status } });
  };
  app.use(errorHandler);
  return app;
}
