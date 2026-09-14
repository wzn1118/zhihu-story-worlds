import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type ZhihuOAuthSessionStoreOptions = { path: string; secret: string };
const AAD = Buffer.from('redleaf.zhihu-oauth.sessions.v1');
const MAX_FILE_BYTES = 64 * 1024 * 1024;

/** One application process owns this store. No credentials or account data are stored in plaintext. */
export function createZhihuOAuthSessionStore(options: ZhihuOAuthSessionStoreOptions) {
  if (!options.path.trim() || options.secret.length < 48) throw new Error('OAuth session persistence requires a store path and SESSION_SECRET of at least 48 characters.');
  const path = resolve(options.path);
  const key = createHash('sha256').update(AAD).update(options.secret).digest();
  function load(): unknown[] {
    let fd: number | undefined;
    try {
      try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Invalid session store.');
      fchmodSync(fd, 0o600);
      const envelope = JSON.parse(readFileSync(fd, 'utf8'));
      if (envelope.version !== 1 || typeof envelope.iv !== 'string' || typeof envelope.tag !== 'string' || typeof envelope.ciphertext !== 'string') throw new Error('Invalid session store.');
      const iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64');
      if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid session store.');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(AAD); decipher.setAuthTag(tag);
      const sessions: unknown = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
      if (!Array.isArray(sessions)) throw new Error('Invalid session store.');
      return sessions;
    } catch { throw new Error('OAuth session store could not be read or authenticated. Check its path and persistent SESSION_SECRET.'); }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  function save(sessions: unknown[]) {
    let fd: number | undefined;
    const temporary = `${path}.${randomBytes(12).toString('hex')}.tmp`;
    try {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(AAD);
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(sessions), 'utf8'), cipher.final()]);
      const envelope = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
      if (Buffer.byteLength(envelope) > MAX_FILE_BYTES) throw new Error('Session store exceeds its limit.');
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      writeFileSync(fd, envelope, 'utf8'); fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(temporary, path);
    } catch { throw new Error('OAuth session store could not be saved.'); }
    finally {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('OAuth temporary session store could not be removed.'); }
    }
  }
  return { load, save };
}
