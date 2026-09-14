import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Router } from 'express';
import type { LiukanWorldLoader } from '../../shared/liukan.ts';
import type { StoryWorkshop } from '../story-workshop.ts';
import type { ZhihuDiscoveryService } from '../zhihu-discovery.ts';
import { createLiukanInboxRouter, LiukanInboxService } from './inbox.ts';
import { createLiukanReadingRouter, LiukanReadingService } from './reading.ts';
import { createLiukanCapabilitiesRouter } from './capabilities-router.ts';
import { createLiukanRouter } from './router.ts';
import { LiukanZhidaService } from './zhida.ts';
import { LiukanMemoryStore } from './memory.ts';
import { LiukanGeneralChatService } from './general-chat.ts';

/** Never use a browser-provided playerId, email, or path as an account key. */
export function liukanAccountKey(userId: string) {
  return `account-${createHash('sha256').update(userId).digest('hex')}`;
}

export function createLiukanWorkspace(discovery: ZhihuDiscoveryService, workshop: StoryWorkshop, loadWorld: LiukanWorldLoader, account?: { id: string; root: string }) {
  const root = account?.root;
  const inbox = root ? new LiukanInboxService(discovery, workshop, join(root, 'inbox')) : new LiukanInboxService(discovery, workshop);
  const reading = root ? new LiukanReadingService(inbox, join(root, 'reading')) : new LiukanReadingService(inbox);
  const recall = root ? new LiukanZhidaService(loadWorld, new LiukanMemoryStore(join(root, 'memory'))) : new LiukanZhidaService(loadWorld);
  // Caches, pending requests, and concurrency slots also belong to this account.
  const router = Router();
  router.use('/inbox', createLiukanInboxRouter(discovery, workshop, inbox));
  router.use('/reading', createLiukanReadingRouter(inbox, reading));
  router.use(createLiukanCapabilitiesRouter(undefined, undefined, new LiukanGeneralChatService(undefined, Boolean(account)), Boolean(account)));
  router.use(createLiukanRouter(loadWorld, recall, account ? liukanAccountKey(account.id) : undefined));
  return { router, discovery };
}
