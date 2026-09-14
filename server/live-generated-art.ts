import express from 'express';
import { resolve } from 'node:path';

/** Generated files arrive after Vite builds its public-file inventory. */
export function liveGeneratedArt(root = process.cwd()) {
  const router = express.Router();
  router.use(express.static(resolve(root, 'public/generated-art'), {
    index: false,
    redirect: false,
    immutable: true,
    maxAge: '1y',
    setHeaders: (response, filePath) => {
      if ((response as express.Response).locals.privateGeneratedArt) {
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('Vary', 'Cookie');
        return;
      }
      if (filePath.endsWith('.json')) {
        response.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  // An absent image must not fall through to the SPA and return HTML with 200.
  router.use((_request, response) => { response.status(404).end(); });
  return router;
}
