import express from 'express';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

type Encoding = 'br' | 'gzip' | 'identity';
const preference: Encoding[] = ['br', 'gzip', 'identity'];
const immutablePath = /(?:[/\\]build[/\\][\w-]+\.[a-f0-9]{16}\.(?:js|css)|[/\\]optimized[/\\][\w-]+(?:\.w\d+)?\.[a-f0-9]{16}\.(?:webp|avif))$/;

/** Explicit exclusions override wildcards; an omitted identity stays a fallback. */
function acceptedEncodings(header: string | undefined): Map<Encoding, number> {
  const weights = new Map<string, number>();
  for (const entry of (header ?? '').split(',')) {
    const [name, ...parameters] = entry.trim().toLowerCase().split(';');
    if (!name) continue;
    const q = parameters.map(parameter => parameter.trim()).find(parameter => parameter.startsWith('q='));
    const weight = q === undefined ? 1 : /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(q) ? Number(q.slice(2)) : 0;
    weights.set(name, Math.max(weights.get(name) ?? 0, weight));
  }
  const fallback = Math.min(1, ...[...weights.values()].filter(weight => weight > 0));
  return new Map(preference.map(encoding => [encoding, weights.get(encoding) ?? (
    encoding === 'identity' ? (weights.get('*') === 0 ? 0 : fallback) : weights.get('*') ?? 0
  )]));
}

async function isFile(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
}

/** Serve offline-compressed representations without doing compression on requests. */
export function redrainStatic(root = resolve(process.cwd(), 'public/games/redrain')) {
  const router = express.Router();
  const staticFiles = express.static(root, {
    dotfiles: 'deny',
    setHeaders(response, filePath, metadata) {
      const suffix = filePath.match(/\.(?:js|css)\.(br|gz)$/)?.[1];
      const originalPath = suffix ? filePath.slice(0, -(suffix.length + 1)) : filePath;
      if (suffix) {
        response.setHeader('Content-Encoding', suffix === 'br' ? 'br' : 'gzip');
        response.setHeader('Content-Type', originalPath.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
      }
      if (/\.(?:js|css)$/.test(originalPath)) {
        // Representation-specific validators prevent identity and compressed 304 collisions.
        response.setHeader('ETag', `W/"${metadata.size.toString(16)}-${metadata.mtimeMs.toString(16)}-${suffix ?? 'identity'}"`);
      }
      if (immutablePath.test(originalPath)) {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (/\.(?:html|js|css)$/.test(originalPath)) {
        response.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
      response.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });
  router.use(async (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();
    let pathname: string;
    try { pathname = decodeURIComponent(request.path); } catch { return response.status(404).end(); }
    // public/assets is intentionally symlinked to shared artwork, but URL traversal is never valid.
    if (/[\\\0]/.test(pathname) || pathname.split('/').some(segment => segment.startsWith('.')) || /\.(?:br|gz)$/.test(pathname)) {
      return response.status(404).end();
    }
    const originalUrl = request.url;
    if (/\.(?:js|css)$/.test(pathname)) {
      response.vary('Accept-Encoding');
      const file = resolve(root, `.${pathname}`);
      const [identity, br, gzip] = await Promise.all([isFile(file), isFile(`${file}.br`), isFile(`${file}.gz`)]);
      if (!identity) return response.status(404).end();
      const weights = acceptedEncodings(request.get('Accept-Encoding'));
      const available: Record<Encoding, boolean> = { identity, br, gzip };
      const selected = request.get('Range') && weights.get('identity')! > 0 ? 'identity' : preference
        .filter(encoding => available[encoding] && weights.get(encoding)! > 0)
        .sort((left, right) => weights.get(right)! - weights.get(left)!)[0];
      if (!selected) return response.status(406).end();
      if (selected !== 'identity') {
        const queryStart = originalUrl.indexOf('?');
        const urlPath = queryStart < 0 ? originalUrl : originalUrl.slice(0, queryStart);
        request.url = `${urlPath}.${selected === 'br' ? 'br' : 'gz'}${queryStart < 0 ? '' : originalUrl.slice(queryStart)}`;
      }
    }
    staticFiles(request, response, error => {
      request.url = originalUrl;
      if (error) {
        // Express owns Range/conditional semantics. Error bodies must not claim compression.
        response.removeHeader('Content-Encoding');
        return next(error);
      }
      next();
    });
  });
  // A missing game asset is a real 404, so the image loader can use its fallback.
  router.use((_request, response) => response.status(404).end());
  return router;
}
