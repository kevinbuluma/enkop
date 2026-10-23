import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const MASTER = 'https://enkop.kevinbuluma9-7ff.workers.dev';
const noStore = { 'Cache-Control': 'no-store' };

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('signin'), email: z.string().trim().email().max(200), password: z.string().min(1).max(200) }),
  z.object({ action: z.literal('setup'), token: z.string().min(20).max(200), password: z.string().max(200) }),
]);

export const Route = createFileRoute('/api/admin/session')({
  server: { handlers: {
    GET: async ({ request }) => {
      const { masterEnv } = await import('@/server/runtime');
      const env = await masterEnv();
      if (!env) return Response.json({ mode: 'mirror', masterUrl: process.env['ENKOP_MASTER_URL'] || MASTER }, { headers: noStore });
      const { readCookie, sessionAdmin, SESSION_COOKIE } = await import('@/server/auth');
      const admin = await sessionAdmin(env.DB, readCookie(request.headers.get('cookie'), SESSION_COOKIE));
      return Response.json({ mode: 'master', admin: admin ? { id: admin.id, email: admin.email } : null }, { headers: noStore });
    },
    POST: async ({ request }) => {
      const { masterEnv } = await import('@/server/runtime');
      const env = await masterEnv();
      if (!env) return Response.json({ message: 'Sign in on the ENKOP master site.' }, { status: 409 });
      const auth = await import('@/server/auth');
      if (!auth.sameOrigin(request)) return Response.json({ message: 'Forbidden.' }, { status: 403 });
      const parsed = body.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return Response.json({ message: 'Enter a valid email and password.' }, { status: 400 });
      const { clientAddress, withinLimit } = await import('@/server/rate-limit');
      const account = parsed.data.action === 'signin' ? `signin:${parsed.data.email.toLowerCase()}` : 'setup';
      if (!(await withinLimit('SIGNIN_LIMITER', `ip:${clientAddress(request)}`, account))) {
        return Response.json({ message: 'Too many attempts. Wait a minute and try again.' }, { status: 429, headers: { ...noStore, 'Retry-After': '60' } });
      }
      let admin: { id: string; email: string } | null;
      if (parsed.data.action === 'signin') {
        admin = await auth.verifyLogin(env.DB, parsed.data.email, parsed.data.password);
        if (!admin) return Response.json({ message: 'Invalid login credentials' }, { status: 401 });
      } else {
        const problem = auth.passwordProblem(parsed.data.password);
        if (problem) return Response.json({ message: problem }, { status: 400 });
        admin = await auth.completeSetup(env.DB, parsed.data.token, parsed.data.password);
        if (!admin) return Response.json({ message: 'This setup link has expired or was already used.' }, { status: 400 });
      }
      const { token, expires } = await auth.createSession(env.DB, admin.id);
      return Response.json({ admin: { id: admin.id, email: admin.email } }, { headers: { ...noStore, 'Set-Cookie': auth.sessionCookie(token, expires) } });
    },
    DELETE: async ({ request }) => {
      const { masterEnv } = await import('@/server/runtime');
      const env = await masterEnv();
      const auth = await import('@/server/auth');
      if (env && auth.sameOrigin(request)) await auth.endSession(env.DB, auth.readCookie(request.headers.get('cookie'), auth.SESSION_COOKIE));
      return Response.json({ ok: true }, { headers: { ...noStore, 'Set-Cookie': auth.clearedSessionCookie } });
    },
  } },
});
