import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import express, { type RequestHandler, type Response } from 'express';

const scrypt = promisify(scryptCallback);
const storePath = resolve(process.env.AUTH_STORE ?? '.local/auth/users.json');
const sessionSecret = process.env.SESSION_SECRET ?? 'dev-only-change-this-session-secret';
const cookieName = 'redleaf_session';
export type User = { id: string; email: string; name: string; passwordHash: string; createdAt: string };
type Store = { users: User[] };
let writeQueue = Promise.resolve();

async function readStore(): Promise<Store> {
  try { return JSON.parse(await fs.readFile(storePath, 'utf8')) as Store; }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return { users: [] }; }
}
async function saveStore(store: Store) {
  writeQueue = writeQueue.then(async () => { await fs.mkdir(dirname(storePath), { recursive: true }); await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8'); });
  return writeQueue;
}
async function hashPassword(password: string) { const salt = randomBytes(16).toString('hex'); const derived = await scrypt(password, salt, 64) as Buffer; return `scrypt:${salt}:${derived.toString('hex')}`; }
async function verifyPassword(password: string, encoded: string) {
  const [, salt, expected] = encoded.split(':'); if (!salt || !expected) return false;
  const actual = await scrypt(password, salt, 64) as Buffer; const target = Buffer.from(expected, 'hex'); return actual.length === target.length && timingSafeEqual(actual, target);
}
function sign(value: string) { return createHmac('sha256', sessionSecret).update(value).digest('base64url'); }
function issueSession(userId: string) { const value = `${userId}.${Date.now() + 1000 * 60 * 60 * 24 * 14}`; return `${value}.${sign(value)}`; }
function sessionUserId(token?: string) { if (!token) return null; const [id, expiry, signature] = token.split('.'); const value = `${id}.${expiry}`; if (!id || !expiry || !signature || Number(expiry) < Date.now() || sign(value) !== signature) return null; return id; }
function isSecureRequest(request: Pick<express.Request, 'secure' | 'headers'>) {
  return request.secure === true || request.headers?.['x-forwarded-proto'] === 'https';
}
function setSession(response: Response, userId: string, secure: boolean) { response.cookie(cookieName, issueSession(userId), { httpOnly: true, sameSite: 'lax', secure, maxAge: 1000 * 60 * 60 * 24 * 14, path: '/' }); }
function publicUser(user: User) { return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt }; }
export async function currentUser(request: { headers: { cookie?: string } }) { const token = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1); const id = sessionUserId(token); if (!id) return null; return (await readStore()).users.find(user => user.id === id) ?? null; }
export function requestUser(request: express.Request): User | null { return (request as express.Request & { user?: User }).user ?? null; }
export async function attachCurrentUser(request: express.Request, _response: express.Response, next: express.NextFunction) { const user = await currentUser(request); if (user) (request as express.Request & { user?: User }).user = user; next(); }
export function authRequired(): RequestHandler { return async (request, response, next) => { if (await currentUser(request)) return next(); response.status(401).json({ error: { code: 'AUTH_REQUIRED', message: '请先登录。', status: 401 } }); }; }
export function authRouter() {
  const router = express.Router();
  router.get('/me', async (request, response) => { const user = await currentUser(request); response.json({ user: user ? publicUser(user) : null }); });
  router.post('/register', async (request, response) => { const email = String(request.body?.email ?? '').trim().toLowerCase(); const name = String(request.body?.name ?? '').trim(); const password = String(request.body?.password ?? ''); if (!/^\S+@\S+\.\S+$/.test(email) || name.length < 1 || name.length > 80 || password.length < 8 || password.length > 200) return response.status(400).json({ error: { code: 'INVALID_REGISTRATION', message: '请输入有效邮箱、昵称和至少8位密码。', status: 400 } }); const store = await readStore(); if (store.users.some(user => user.email === email)) return response.status(409).json({ error: { code: 'EMAIL_EXISTS', message: '该邮箱已注册。', status: 409 } }); const user: User = { id: randomBytes(16).toString('hex'), email, name, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() }; store.users.push(user); await saveStore(store); setSession(response, user.id, isSecureRequest(request)); response.status(201).json({ user: publicUser(user) }); });
  router.post('/login', async (request, response) => { const email = String(request.body?.email ?? '').trim().toLowerCase(); const password = String(request.body?.password ?? ''); const user = (await readStore()).users.find(candidate => candidate.email === email); if (!user || !(await verifyPassword(password, user.passwordHash))) return response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: '邮箱或密码不正确。', status: 401 } }); setSession(response, user.id, isSecureRequest(request)); response.json({ user: publicUser(user) }); });
  router.post('/logout', (request, response) => { response.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: isSecureRequest(request), path: '/' }); response.status(204).end(); });
  return router;
}
