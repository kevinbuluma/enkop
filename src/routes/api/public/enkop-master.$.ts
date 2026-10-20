import { createFileRoute } from '@tanstack/react-router';
import { enquirySchema } from '@/lib/enquiry-schema';

// Server-to-server endpoints of the ENKOP master:
//   POST enquiry  forwarded by the Lovable mirror (public, like the contact form)
//   POST drain    pulls fallback enquiries from the mirror, then pushes queued changes to it
//                 (keyless calls are throttled; x-enkop-internal-key shows results)
//   GET  status   outbox backlog (x-enkop-internal-key)
//   POST test-alert  sends a test alert on every configured channel (x-enkop-internal-key)
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
    if (!p.data.website) {
      const { d1Backend } = await import('@/server/backend/d1');
      await d1Backend(env).submitEnquiry(p.data);
    }
    return Response.json({ ok: true });
  }

  if (route === 'backfill-media' && request.method === 'POST') {
    // Copies media referenced in D1 but not yet stored on the master from the Lovable mirror.
    if (!authorized(request, 'x-enkop-internal-key', process.env['ENKOP_INTERNAL_KEY'])) return Response.json({ message: 'Unauthorized.' }, { status: 401 });
    const { d1Backend } = await import('@/server/backend/d1');
    const { bridgeFetch } = await import('@/server/bridge-client');
    const { media } = d1Backend(env);
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

  if (route === 'drain' && request.method === 'POST' && !authorized(request, 'x-enkop-internal-key', process.env['ENKOP_INTERNAL_KEY'])) {
    // Keyless trigger for external schedulers (Lovable Cloud pg_cron): only pushes already-queued
    // changes, at most once a minute, and reveals nothing.
    const kv = env.MEDIA_KV;
    const last = kv ? Number(await new Response(await kv.get('meta:last-public-drain', 'stream')).text().catch(() => '0')) || 0 : 0;
    if (Date.now() - last < 60_000) return Response.json({ ok: true, throttled: true });
    if (kv) await kv.put('meta:last-public-drain', String(Date.now()));
    const sync = await import('@/server/sync');
    const { pullMirrorEnquiries } = await import('@/server/reconcile');
    await pullMirrorEnquiries(env).catch((e) => console.error('[enkop] mirror enquiry pull failed', e));
    for (let i = 0; i < 4; i++) {
      const r = await sync.drainOutbox(env, 25);
      if (!r.sent || r.failed || !r.pending) break;
    }
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
      const { pullMirrorEnquiries } = await import('@/server/reconcile');
      const enquiries = await pullMirrorEnquiries(env).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
      const results = [];
      // Up to four rounds so a backlog clears within one cron tick.
      for (let i = 0; i < 4; i++) {
        const r = await sync.drainOutbox(env, 25);
        results.push(r);
        if (!r.sent || r.failed || !r.pending) break;
      }
      return Response.json({ enquiries, rounds: results, ...(await sync.outboxStatus(env)) });
    }
    if (route === 'status' && request.method === 'GET') return Response.json(await sync.outboxStatus(env));
  }
  return Response.json({ message: 'Not found.' }, { status: 404 });
}

export const Route = createFileRoute('/api/public/enkop-master/$')({
  server: { handlers: { GET: handle, POST: handle } },
});
