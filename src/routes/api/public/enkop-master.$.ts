import { createFileRoute } from '@tanstack/react-router';
import { enquirySchema } from '@/lib/enquiry-schema';

// Server-to-server endpoints of the ENKOP master:
//   POST enquiry  forwarded by the Lovable mirror (public, like the contact form)
//   POST drain    pulls fallback enquiries from the mirror, then pushes queued changes to it
//                 (keyless calls are throttled; x-enkop-internal-key shows results)
//   GET  status   outbox backlog (x-enkop-internal-key)
//   POST test-alert  sends a test alert on every configured channel (x-enkop-internal-key)
//   POST backfill-media / copy-kv-media  fill Supabase Storage from the mirror / legacy KV (keyed)
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const authorized = (request: Request, header: string, secret: string | undefined) => !!secret && safeEqual(request.headers.get(header) ?? '', secret);

async function handle({ request, params }: { request: Request; params: { _splat?: string } }) {
  const { masterEnv } = await import('@/server/runtime');
  const env = await masterEnv();
  if (!env) return Response.json({ message: 'Not found.' }, { status: 404 });
  const route = params._splat ?? '';

  if (route === 'enquiry' && request.method === 'POST') {
    // Same validation and spam trap as the master's own public form, which needs no credential either.
    const p = enquirySchema.safeParse(await request.json().catch(() => null));
    if (!p.success) return Response.json({ message: 'Invalid enquiry.' }, { status: 400 });
    const { clientAddress, withinLimit } = await import('@/server/rate-limit');
    const forwarded = authorized(request, 'x-enkop-bridge-secret', process.env['ENKOP_BRIDGE_SECRET']) ? request.headers.get('x-enkop-client-ip') : null;
    // A refused forward is kept by the mirror and pulled back on the next drain, so nothing is lost.
    if (!(await withinLimit('ENQUIRY_LIMITER', `ip:${forwarded || clientAddress(request)}`))) return Response.json({ message: 'Too many enquiries.' }, { status: 429, headers: { 'Retry-After': '60' } });
    if (!p.data.website) {
      const { masterBackend } = await import('@/server/backend/master');
      await masterBackend(env).submitEnquiry(p.data);
    }
    return Response.json({ ok: true });
  }

  if (route === 'backfill-media' && request.method === 'POST') {
    // Copies media referenced by content rows but not yet in the master's Storage from the Lovable mirror.
    if (!authorized(request, 'x-enkop-internal-key', process.env['ENKOP_INTERNAL_KEY'])) return Response.json({ message: 'Unauthorized.' }, { status: 401 });
    const { masterBackend } = await import('@/server/backend/master');
    const { bridgeFetch } = await import('@/server/bridge-client');
    const { media } = masterBackend(env);
    const missing = await media.missingPaths();
    const copied: string[] = [], failed: Record<string, string> = {};
    if (missing.length) {
      const res = await bridgeFetch('sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: missing.slice(0, 200), expiresIn: 600 }) }).catch((e) => e as Error);
      if (!(res instanceof Response) || !res.ok) return Response.json({ missing, message: `Bridge unavailable: ${res instanceof Response ? res.status : res.message}` }, { status: 502 });
      const { urls } = (await res.json()) as { urls: Record<string, string> };
      for (const path of missing) {
        try {
          if (!urls[path]) throw new Error('not in mirror storage');
          const file = await fetch(urls[path]);
          if (!file.ok) throw new Error(`download ${file.status}`);
          const type = file.headers.get('content-type') ?? 'application/octet-stream';
          const fixed = type === 'application/octet-stream' && path.endsWith('.mp4') ? 'video/mp4' : type;
          await media.putImported(path, await file.arrayBuffer(), fixed);
          copied.push(path);
        } catch (e) { failed[path] = e instanceof Error ? e.message : String(e); }
      }
    }
    return Response.json({ missing: missing.length, copied, failed });
  }

  if (route === 'copy-kv-media' && request.method === 'POST') {
    // One-time move of files from the legacy Cloudflare KV store into Supabase Storage.
    if (!authorized(request, 'x-enkop-internal-key', process.env['ENKOP_INTERNAL_KEY'])) return Response.json({ message: 'Unauthorized.' }, { status: 401 });
    const kv = env.MEDIA_KV;
    if (!kv) return Response.json({ message: 'No KV namespace is bound.' }, { status: 409 });
    const { masterBackend } = await import('@/server/backend/master');
    const { media } = masterBackend(env);
    const { results } = await env.DB.prepare('SELECT path, content_type FROM media ORDER BY path').all<{ path: string; content_type: string }>();
    const copied: string[] = [], failed: Record<string, string> = {};
    for (const { path, content_type } of results) {
      try {
        const { value } = await kv.getWithMetadata<{ contentType?: string }>(path, 'stream');
        if (!value) throw new Error('not in KV');
        await media.putImported(path, await new Response(value).arrayBuffer(), content_type);
        copied.push(path);
      } catch (e) { failed[path] = e instanceof Error ? e.message : String(e); }
    }
    return Response.json({ indexed: results.length, copied, failed });
  }

  if (route === 'drain' && request.method === 'POST' && !authorized(request, 'x-enkop-internal-key', process.env['ENKOP_INTERNAL_KEY'])) {
    // Keyless trigger for external schedulers (pg_cron in Supabase and Lovable Cloud): only pushes
    // already-queued changes, at most once a minute, and reveals nothing.
    const now = Date.now();
    const { results: claimed } = await env.DB.prepare(
      `INSERT INTO meta (key, value) VALUES ('last-public-drain', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()
       WHERE meta.value::bigint < ? RETURNING key`,
    ).bind(String(now), now - 60_000).all();
    if (!claimed.length) return Response.json({ ok: true, throttled: true });
    const sync = await import('@/server/sync');
    await sync.syncWithMirror(env);
    return Response.json({ ok: true });
  }

  if (route === 'test-alert' && request.method === 'POST') {
    if (!authorized(request, 'x-enkop-internal-key', process.env['ENKOP_INTERNAL_KEY'])) return Response.json({ message: 'Unauthorized.' }, { status: 401 });
    const { notify } = await import('@/server/notify');
    try {
      const delivered = await notify(env, { kind: 'test', text: 'ENKOP test alert: enquiry alerts are reaching you. No action needed.' });
      return Response.json({ delivered });
    } catch (e) {
      return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }

  if (route === 'drain' || route === 'status') {
    if (!authorized(request, 'x-enkop-internal-key', process.env['ENKOP_INTERNAL_KEY'])) return Response.json({ message: 'Unauthorized.' }, { status: 401 });
    const sync = await import('@/server/sync');
    if (route === 'drain' && request.method === 'POST') {
      return Response.json({ ...(await sync.syncWithMirror(env)), ...(await sync.outboxStatus(env)) });
    }
    if (route === 'status' && request.method === 'GET') return Response.json(await sync.outboxStatus(env));
  }
  return Response.json({ message: 'Not found.' }, { status: 404 });
}

export const Route = createFileRoute('/api/public/enkop-master/$')({
  server: { handlers: { GET: handle, POST: handle } },
});
