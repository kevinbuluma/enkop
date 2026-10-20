import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

/** Server-function middleware: the caller must hold a valid master admin session cookie. */
export const requireAdmin = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { getMaster } = await import('@/server/backend');
  const { readCookie, sessionAdmin, SESSION_COOKIE } = await import('@/server/auth');
  const master = await getMaster();
  const admin = await sessionAdmin(master.env.DB, readCookie(getRequest()?.headers.get('cookie') ?? null, SESSION_COOKIE));
  if (!admin) throw new Error('Please sign in again.');
  return next({ context: { admin, master } });
});
