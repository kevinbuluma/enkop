import { createFileRoute } from '@tanstack/react-router';

// Content management for ENKOP's own tooling (cloudflare/scripts/enkop-content.mjs), authenticated
// with x-enkop-internal-key. Master only; writes go through MasterStore so the mirror follows.
//   GET  list/<table>              rows of a content table
//   PUT  media?path=<path>         stores a file (JPG, PNG, WebP, MP4, WebM)
//   POST upsert/<table>            inserts or updates one row (JSON body), returns its key
//   POST update/<table>/<key>      updates the given columns of one row (JSON body)
const TYPES = /^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/;
const CONTENT_TABLES = ['properties', 'homepage_slides', 'team_members', 'testimonials', 'site_settings', 'property_tours'] as const;
type ContentTable = (typeof CONTENT_TABLES)[number];
const isContentTable = (t: string | undefined): t is ContentTable => (CONTENT_TABLES as readonly string[]).includes(t ?? '');

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handle({ request, params }: { request: Request; params: { _splat?: string } }) {
  const { masterEnv, afterResponse } = await import('@/server/runtime');
  const env = await masterEnv();
  if (!env) return Response.json({ message: 'Not found.' }, { status: 404 });
  const secret = process.env['ENKOP_INTERNAL_KEY'];
  if (!secret || !safeEqual(request.headers.get('x-enkop-internal-key') ?? '', secret)) return Response.json({ message: 'Unauthorized.' }, { status: 401 });

  const { d1Backend } = await import('@/server/backend/d1');
  const { store, media } = d1Backend(env);
  const drainSoon = () => afterResponse(async () => (await import('@/server/sync')).drainOutbox(env));
  const [action, table, key] = (params._splat ?? '').split('/').map(decodeURIComponent);

  if (action === 'list' && request.method === 'GET') {
    if (!isContentTable(table)) return Response.json({ message: `Tables: ${CONTENT_TABLES.join(', ')}` }, { status: 400 });
    return Response.json({ rows: await store.all(table) });
  }

  if (action === 'media' && request.method === 'PUT') {
    const { signablePath } = await import('@/lib/enquiry-schema');
    const path = new URL(request.url).searchParams.get('path') ?? '';
    const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!signablePath(path)) return Response.json({ message: 'Invalid file location.' }, { status: 400 });
    if (!TYPES.test(type)) return Response.json({ message: 'Use JPG, PNG, WebP, MP4 or WebM files.' }, { status: 415 });
    const data = await request.arrayBuffer();
    if (!data.byteLength) return Response.json({ message: 'The file is empty.' }, { status: 400 });
    try {
      await media.put(path, data, type);
    } catch (e) {
      return Response.json({ message: e instanceof Error ? e.message : 'The file could not be stored.' }, { status: 413 });
    }
    await drainSoon();
    return Response.json({ path, size: data.byteLength });
  }

  if ((action === 'upsert' || action === 'update') && request.method === 'POST') {
    if (!isContentTable(table)) return Response.json({ message: `Tables: ${CONTENT_TABLES.join(', ')}` }, { status: 400 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ message: 'Send a JSON object.' }, { status: 400 });
    try {
      if (action === 'upsert') {
        const pk = await store.upsert(table, body as Record<string, unknown>);
        await drainSoon();
        return Response.json({ key: pk });
      }
      if (!key) return Response.json({ message: 'Missing row key.' }, { status: 400 });
      const { TABLES } = await import('@/server/backend/tables');
      if (!(await store.first(table, `${TABLES[table].pk} = ?`, [key]))) return Response.json({ message: 'No such row.' }, { status: 404 });
      await store.update(table, key, body as Record<string, unknown>);
      await drainSoon();
      return Response.json({ key });
    } catch (e) {
      return Response.json({ message: e instanceof Error ? e.message : 'The change could not be saved.' }, { status: 400 });
    }
  }

  return Response.json({ message: 'Not found.' }, { status: 404 });
}

export const Route = createFileRoute('/api/public/enkop-content/$')({
  server: { handlers: { GET: handle, POST: handle, PUT: handle } },
});
