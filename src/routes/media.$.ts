import { createFileRoute } from '@tanstack/react-router';

// Media now comes from Supabase Storage signed URLs. Links handed out earlier (/media/<path>?exp=&sig=)
// keep working until they expire: the HMAC is checked, then the browser is sent to a fresh signed URL.
export const Route = createFileRoute('/media/$')({
  server: { handlers: { GET: async ({ request, params }) => {
    const { masterEnv } = await import('@/server/runtime');
    if (!(await masterEnv())) return new Response('Not found', { status: 404 });
    const url = new URL(request.url);
    const path = (params as { _splat?: string })._splat ?? '';
    const { verifyMediaSignature, signStorageMedia } = await import('@/server/backend/media');
    const exp = url.searchParams.get('exp');
    if (!(await verifyMediaSignature(path, exp, url.searchParams.get('sig')))) return new Response('Link expired', { status: 403 });
    const remaining = Math.max(60, Number(exp) - Math.floor(Date.now() / 1000));
    const target = (await signStorageMedia([path], remaining))[path];
    if (!target) return new Response('Not found', { status: 404 });
    return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'private, no-store' } });
  } } },
});
