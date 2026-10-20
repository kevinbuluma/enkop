import { createFileRoute } from '@tanstack/react-router';

// Reports which backend this host runs: "master" (Cloudflare D1/media) or "mirror" (Lovable Cloud).
export const Route = createFileRoute('/api/public/enkop-health')({
  server: { handlers: { GET: async () => {
    const { masterEnv } = await import('@/server/runtime');
    const env = await masterEnv();
    if (!env) return Response.json({ mode: 'mirror' }, { headers: { 'Cache-Control': 'no-store' } });
    let db = false;
    try { db = (await env.DB.prepare('select 1 as ok').first<{ ok: number }>())?.ok === 1; } catch { /* reported as false */ }
    const media = env.MEDIA ? 'r2' : env.MEDIA_KV ? 'kv' : 'none';
    return Response.json({ mode: 'master', db, media }, { headers: { 'Cache-Control': 'no-store' } });
  } } },
});
