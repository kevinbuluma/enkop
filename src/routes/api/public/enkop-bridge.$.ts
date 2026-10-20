import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { enquirySchema, signablePath } from '@/lib/enquiry-schema';

// Server-to-server bridge for hosts without Lovable-managed keys. Authenticated by a shared secret.
function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i % (x.length || 1)] ?? 0) ^ (y[i % (y.length || 1)] ?? 0);
  return diff === 0;
}

const signSchema = z.object({ paths: z.array(z.string().refine(signablePath)).min(1).max(200), expiresIn: z.number().int().positive().max(86400) });
// Mirror writes from the ENKOP master. `rows` carries full rows (upsert) or primary keys (delete).
const mirrorSchema = z.object({ table: z.string(), rows: z.array(z.record(z.string(), z.unknown())).min(1).max(100) })
  .or(z.object({ table: z.string(), keys: z.array(z.record(z.string(), z.unknown())).min(1).max(100) }).transform((d) => ({ table: d.table, rows: d.keys })));

async function handle({ request, params }: { request: Request; params: { _splat?: string } }) {
  const secret = process.env['ENKOP_BRIDGE_SECRET'];
  if (!secret) return Response.json({ message: 'Bridge not configured.' }, { status: 503 });
  if (!safeEqual(request.headers.get('x-enkop-bridge-secret') ?? '', secret)) return Response.json({ message: 'Unauthorized.' }, { status: 401 });
  // The bridge only serves on Lovable hosting (managed keys); the ENKOP master never answers it.
  const { isMaster } = await import('@/server/runtime');
  if (await isMaster()) return Response.json({ message: 'Not found.' }, { status: 404 });
  // Never relay onwards: the bridge only serves where managed keys exist.
  const { privilegedMode, signStoragePaths, insertEnquiry, aiGatewayFetch } = await import('@/integrations/supabase/privileged.server');
  const route = params._splat ?? '';

  if (route.startsWith('ai/')) {
    if (privilegedMode('ai') !== 'direct') return Response.json({ message: 'AI not configured.' }, { status: 503 });
    const q = new URL(request.url).search;
    const headers = new Headers();
    const ct = request.headers.get('content-type');
    if (ct) headers.set('Content-Type', ct);
    for (const [k, v] of request.headers) if (k.toLowerCase().startsWith('x-lovable-aig-')) headers.set(k, v);
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
    const init: RequestInit = { method: request.method, headers, ...(body ? { body } : {}) };
    const up = await aiGatewayFetch(`/${route.slice(3)}${q}`, init);
    const out = new Headers({ 'Content-Type': up.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-cache, no-transform' });
    up.headers.forEach((v, k) => { if (k.toLowerCase().startsWith('x-lovable-aig-')) out.set(k, v); });
    return new Response(up.body, { status: up.status, headers: out });
  }

  if (route.startsWith('mirror/media/')) {
    if (privilegedMode('db') !== 'direct') return Response.json({ message: 'Storage not configured.' }, { status: 503 });
    const path = route.slice('mirror/media/'.length).split('/').map(decodeURIComponent).join('/');
    if (!signablePath(path)) return Response.json({ message: 'Invalid path.' }, { status: 400 });
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const bucket = supabaseAdmin.storage.from('property-media');
    if (request.method === 'PUT') {
      const { error } = await bucket.upload(path, await request.arrayBuffer(), { contentType: request.headers.get('content-type') ?? 'application/octet-stream', upsert: true });
      return error ? Response.json({ message: error.message }, { status: 500 }) : Response.json({ ok: true });
    }
    if (request.method === 'DELETE') {
      const { error } = await bucket.remove([path]);
      return error ? Response.json({ message: error.message }, { status: 500 }) : Response.json({ ok: true });
    }
    return Response.json({ message: 'Not found.' }, { status: 404 });
  }

  if (request.method !== 'POST') return Response.json({ message: 'Not found.' }, { status: 404 });
  if (privilegedMode('db') !== 'direct') return Response.json({ message: 'Storage not configured.' }, { status: 503 });
  const json = await request.json().catch(() => null);
  if (route === 'mirror/upsert' || route === 'mirror/delete') {
    const { isMirrorTable, TABLES } = await import('@/server/backend/tables');
    const p = mirrorSchema.safeParse(json);
    if (!p.success || !isMirrorTable(p.data.table)) return Response.json({ message: 'Invalid mirror request.' }, { status: 400 });
    const table = p.data.table;
    const pk = TABLES[table].pk;
    const allowed = new Set<string>(TABLES[table].columns);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = (supabaseAdmin as any).from(table);
    if (route === 'mirror/upsert') {
      const rows = p.data.rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => allowed.has(k))));
      if (rows.some((r) => r[pk] === undefined)) return Response.json({ message: 'Rows need a primary key.' }, { status: 400 });
      const { error } = await db.upsert(rows, { onConflict: pk });
      return error ? Response.json({ message: error.message }, { status: 500 }) : Response.json({ ok: true, count: rows.length });
    }
    const keys = p.data.rows.map((r) => r[pk]).filter((v): v is string => typeof v === 'string');
    if (!keys.length) return Response.json({ message: 'No keys to delete.' }, { status: 400 });
    const { error } = await db.delete().in(pk, keys);
    return error ? Response.json({ message: error.message }, { status: 500 }) : Response.json({ ok: true, count: keys.length });
  }
  if (route === 'notify') {
    const p = z.object({ text: z.string().min(1).max(4000) }).safeParse(json);
    if (!p.success) return Response.json({ message: 'Invalid alert.' }, { status: 400 });
    const { sendWhatsAppAlert } = await import('@/integrations/supabase/privileged.server');
    try { await sendWhatsAppAlert(p.data.text); } catch (e) { return Response.json({ message: e instanceof Error ? e.message : 'Alert failed.' }, { status: 502 }); }
    return Response.json({ ok: true });
  }
  if (route === 'sign') {
    const p = signSchema.safeParse(json);
    if (!p.success) return Response.json({ message: 'Invalid request.' }, { status: 400 });
    return Response.json({ urls: await signStoragePaths(p.data.paths, p.data.expiresIn) });
  }
  if (route === 'enquiry') {
    const p = enquirySchema.safeParse(json);
    if (!p.success) return Response.json({ message: 'Invalid enquiry.' }, { status: 400 });
    if (!p.data.website) await insertEnquiry(p.data);
    return Response.json({ ok: true });
  }
  return Response.json({ message: 'Not found.' }, { status: 404 });
}

export const Route = createFileRoute('/api/public/enkop-bridge/$')({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle } },
});
