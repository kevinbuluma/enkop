import { createFileRoute } from '@tanstack/react-router';

// Serves private master media through HMAC-signed, expiring links (see src/server/backend/media.ts).
export const Route = createFileRoute('/media/$')({
  server: { handlers: { GET: async ({ request, params }) => {
    const { masterEnv } = await import('@/server/runtime');
    const env = await masterEnv();
    if (!env) return new Response('Not found', { status: 404 });
    const url = new URL(request.url);
    const path = (params as { _splat?: string })._splat ?? '';
    const { verifyMediaSignature, MediaStore } = await import('@/server/backend/media');
    if (!(await verifyMediaSignature(path, url.searchParams.get('exp'), url.searchParams.get('sig')))) return new Response('Link expired', { status: 403 });
    const { MasterStore } = await import('@/server/backend/master-store');
    const obj = await new MediaStore(env, new MasterStore(env.DB)).get(path);
    if (!obj) return new Response('Not found', { status: 404 });

    const headers = new Headers({ 'Content-Type': obj.contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    const range = request.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      const buf = obj.body instanceof ArrayBuffer ? obj.body : await new Response(obj.body).arrayBuffer();
      const size = buf.byteLength;
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(buf.slice(start, end + 1), { status: 206, headers });
    }
    headers.set('Content-Length', String(obj.size));
    return new Response(obj.body, { headers });
  } } },
});
