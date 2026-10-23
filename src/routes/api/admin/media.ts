import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const TYPES = /^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/;

async function signedInMaster(request: Request) {
  const { masterEnv } = await import('@/server/runtime');
  const env = await masterEnv();
  if (!env) return { error: Response.json({ message: 'Upload on the ENKOP master site.' }, { status: 409 }) };
  const auth = await import('@/server/auth');
  if (!auth.sameOrigin(request)) return { error: Response.json({ message: 'Forbidden.' }, { status: 403 }) };
  const admin = await auth.sessionAdmin(env.DB, auth.readCookie(request.headers.get('cookie'), auth.SESSION_COOKIE));
  if (!admin) return { error: Response.json({ message: 'Please sign in again.' }, { status: 401 }) };
  const { masterBackend } = await import('@/server/backend/master');
  return { env, master: masterBackend(env) };
}

async function drainSoon(env: Parameters<typeof import('@/server/sync').drainOutbox>[0]) {
  const { afterResponse } = await import('@/server/runtime');
  await afterResponse(async () => (await import('@/server/sync')).drainOutbox(env));
}

export const Route = createFileRoute('/api/admin/media')({
  server: { handlers: {
    PUT: async ({ request }) => {
      const ctx = await signedInMaster(request);
      if ('error' in ctx) return ctx.error;
      const { signablePath } = await import('@/lib/enquiry-schema');
      const path = new URL(request.url).searchParams.get('path') ?? '';
      const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim();
      if (!signablePath(path)) return Response.json({ message: 'Invalid file location.' }, { status: 400 });
      if (!TYPES.test(type)) return Response.json({ message: 'Use JPG, PNG, WebP, MP4 or WebM files.' }, { status: 415 });
      const { MAX_MEDIA_BYTES } = await import('@/server/backend/media');
      if (Number(request.headers.get('content-length') ?? 0) > MAX_MEDIA_BYTES) return Response.json({ message: 'Files must be under 50 MB.' }, { status: 413 });
      const data = await request.arrayBuffer();
      if (!data.byteLength) return Response.json({ message: 'The file is empty.' }, { status: 400 });
      try {
        await ctx.master.media.put(path, data, type);
      } catch (e) {
        return Response.json({ message: e instanceof Error ? e.message : 'The file could not be stored.' }, { status: 413 });
      }
      await drainSoon(ctx.env);
      return Response.json({ path });
    },
    DELETE: async ({ request }) => {
      const ctx = await signedInMaster(request);
      if ('error' in ctx) return ctx.error;
      const { signablePath } = await import('@/lib/enquiry-schema');
      const parsed = z.object({ paths: z.array(z.string().refine(signablePath)).min(1).max(50) }).safeParse(await request.json().catch(() => null));
      if (!parsed.success) return Response.json({ message: 'Invalid files.' }, { status: 400 });
      await ctx.master.media.remove(parsed.data.paths);
      await drainSoon(ctx.env);
      return Response.json({ ok: true });
    },
  } },
});
