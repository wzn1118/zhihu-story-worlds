import { Router, type ErrorRequestHandler } from 'express';
import type { LiukanWorldLoader } from '../../shared/liukan.ts';
import { LiukanError, LiukanZhidaService } from './zhida.ts';

/** Mount after the app's JSON parser and local-origin guard at /api/liukan. */
export function createLiukanRouter(loadWorld: LiukanWorldLoader, service = new LiukanZhidaService(loadWorld)): Router {
  const router = Router();
  router.post('/chat', async (request, response) => response.json(await service.recall(request.body)));
  router.post('/remember', async (request, response) => response.json({ memories: await service.remember(request.body) }));
  router.get('/memories', async (request, response) => {
    if (request.query.playerId !== undefined && typeof request.query.playerId !== 'string') throw new LiukanError('INVALID_PLAYER', '玩家记录标识有误。');
    const playerId = request.query.playerId;
    const memories = await service.memories(playerId);
    response.json({ memories, profile: await service.memoryProfile(playerId) });
  });
  const errors: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (!(error instanceof LiukanError)) return next(error);
    response.status(error.status).json({ error: { code: error.code, message: error.message, status: error.status } });
  };
  router.use(errors);
  return router;
}
