import { Router, type ErrorRequestHandler } from 'express';
import { LIUKAN_ABILITIES } from '../../shared/liukan-capabilities.ts';
import { liukanConfig, type LiukanConfigStore } from './config.ts';
import { LiukanCapabilitiesService } from './capabilities.ts';
import { LiukanGeneralChatService } from './general-chat.ts';
import { LiukanError } from './zhida.ts';

/** Mount at /api/liukan before the progress router. GETs never call upstream APIs. */
export function createLiukanCapabilitiesRouter(config: LiukanConfigStore = liukanConfig, abilities = new LiukanCapabilitiesService(), chat = new LiukanGeneralChatService(), publicMode = false) {
  const router = Router();
  router.get('/capabilities', (_request, response) => response.json({ abilities: publicMode ? process.env.ZHIHU_ACCESS_SECRET?.trim() ? LIUKAN_ABILITIES.filter(ability => !ability.private) : [] : LIUKAN_ABILITIES, account: publicMode ? '当前登录的知乎账号' : '本机已配置的知乎账号', documentation: 'zhihu-skill-0.5.3-beta.20260904115023' }));
  router.get('/config', async (_request, response) => { const status = await config.status(); response.json(publicMode ? { transport: status.transport, model: status.model, configured: status.configured, editable: false } : { ...status, editable: true }); });
  router.post('/config', async (request, response) => {
    if (publicMode) throw new LiukanError('SERVER_CONFIG_READ_ONLY', '公网版由服务端配置刘看山。', 403);
    response.json(await config.set(request.body));
  });
  router.post('/capabilities/run', async (request, response) => {
    // The shared CLI is an application provider, never the visiting user's
    // account. Personal API calls must use that user's OAuth grant instead.
    if (publicMode && LIUKAN_ABILITIES.find(ability => ability.id === request.body?.ability)?.private) throw new LiukanError('OAUTH_CAPABILITY_UNAVAILABLE', '此账号资料能力尚未接入当前用户的知乎授权。', 409);
    if (publicMode && !process.env.ZHIHU_ACCESS_SECRET?.trim()) throw new LiukanError('SEARCH_PROVIDER_NOT_CONFIGURED', '资料检索暂未开放，仍可使用聊天和阅读手记。', 503);
    response.json(await abilities.run(request.body));
  });
  router.post('/general-chat', async (request, response) => response.json(await chat.chat(request.body)));
  const errors: ErrorRequestHandler = (error, _request, response, next) => { if (!(error instanceof LiukanError)) return next(error); response.status(error.status).json({ error: { code: error.code, message: error.message, status: error.status } }); };
  router.use(errors);
  return router;
}
