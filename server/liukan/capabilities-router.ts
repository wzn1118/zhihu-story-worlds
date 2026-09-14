import { Router, type ErrorRequestHandler } from 'express';
import { LIUKAN_ABILITIES } from '../../shared/liukan-capabilities.ts';
import { liukanConfig, type LiukanConfigStore } from './config.ts';
import { LiukanCapabilitiesService } from './capabilities.ts';
import { LiukanGeneralChatService } from './general-chat.ts';
import { LiukanError } from './zhida.ts';

/** Mount at /api/liukan before the progress router. GETs never call upstream APIs. */
export function createLiukanCapabilitiesRouter(config: LiukanConfigStore = liukanConfig, abilities = new LiukanCapabilitiesService(), chat = new LiukanGeneralChatService()) {
  const router = Router();
  router.get('/capabilities', (_request, response) => response.json({ abilities: LIUKAN_ABILITIES, account: '本机已配置的知乎账号', documentation: 'zhihu-skill-0.5.3-beta.20260904115023' }));
  router.get('/config', async (_request, response) => response.json(await config.status()));
  router.post('/config', async (request, response) => response.json(await config.set(request.body)));
  router.post('/capabilities/run', async (request, response) => response.json(await abilities.run(request.body)));
  router.post('/general-chat', async (request, response) => response.json(await chat.chat(request.body)));
  const errors: ErrorRequestHandler = (error, _request, response, next) => { if (!(error instanceof LiukanError)) return next(error); response.status(error.status).json({ error: { code: error.code, message: error.message, status: error.status } }); };
  router.use(errors);
  return router;
}
