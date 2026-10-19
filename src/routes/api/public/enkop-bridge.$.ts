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

async function handle({ request, params }: { request: Request; params: { _splat?: string } }) {
  const secret = process.env['ENKOP_BRIDGE_SECRET'];
  if (!secret) return Response.json({ message: 'Bridge not configured.' }, { status: 503 });
  if (!safeEqual(request.headers.get('x-enkop-bridge-secret') ?? '', secret)) return Response.json({ message: 'Unauthorized.' }, { status: 401 });
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

  if (request.method !== 'POST') return Response.json({ message: 'Not found.' }, { status: 404 });
  if (privilegedMode('db') !== 'direct') return Response.json({ message: 'Storage not configured.' }, { status: 503 });
  const json = await request.json().catch(() => null);
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
