import { createFileRoute } from '@tanstack/react-router';
import { fallbackInput, fallbackPrompt } from '@/lib/fallback-image';
import { editImage, imageSettings } from '@/lib/image-gateway.server';
import { aiAvailable } from '@/integrations/supabase/privileged.server';

const DENIAL_KEY = 'image_provider_denial';

export const Route = createFileRoute('/api/homepage-fallback')({
  server: { handlers: { POST: async ({ request }) => {
    const { masterEnv } = await import('@/server/runtime');
    const env = await masterEnv();
    if (!env) return Response.json({ message: 'Generate images on the ENKOP master site.' }, { status: 409 });
    const auth = await import('@/server/auth');
    if (!auth.sameOrigin(request)) return Response.json({ message: 'Forbidden.' }, { status: 403 });
    const admin = await auth.sessionAdmin(env.DB, auth.readCookie(request.headers.get('cookie'), auth.SESSION_COOKIE));
    if (!admin) return Response.json({ message: 'Please sign in again.' }, { status: 401 });
    if (!aiAvailable()) return Response.json({ message: 'Image generation is not configured.' }, { status: 500 });

    const { d1Backend } = await import('@/server/backend/d1');
    const { store } = d1Backend(env);
    const denial = await store.first('site_settings', 'key = ?', [DENIAL_KEY]);
    if (denial) {
      const blocked = (denial['value'] ?? {}) as { message?: string };
      return Response.json({ message: blocked.message ?? 'Image provider access must be restored before generating images.' }, { status: 403 });
    }
    let form: FormData;
    try { form = await request.formData(); } catch { return Response.json({ message: 'Invalid upload.' }, { status: 400 }); }
    const parsed = fallbackInput.safeParse({ slideId: form.get('slideId'), videoPath: form.get('videoPath'), notes: form.get('notes') ?? '' });
    const frame = form.get('image');
    if (!parsed.success || !(frame instanceof File) || frame.type !== 'image/jpeg' || !frame.size || frame.size > 8 * 1024 * 1024) {
      return Response.json({ message: 'Provide a tour frame and style notes of up to 500 characters.' }, { status: 400 });
    }
    const slide = await store.first('homepage_slides', 'id = ?', [parsed.data.slideId]);
    if (!slide?.['video_path'] || slide['video_path'] !== parsed.data.videoPath) return Response.json({ message: 'The scene video changed. Refresh before generating an image.' }, { status: 409 });
    const upstreamForm = new FormData();
    upstreamForm.set('image', frame);
    upstreamForm.set('prompt', fallbackPrompt(parsed.data.notes));
    upstreamForm.set('size', '1536x864');
    upstreamForm.set('quality', 'medium');
    upstreamForm.set('stream', form.get('stream') === 'false' ? 'false' : 'true');
    const upstream = await editImage(imageSettings, upstreamForm);
    if (upstream.status === 403) {
      const body = await upstream.clone().json().catch(() => null) as { type?: string; message?: string; error?: { type?: string; message?: string } } | null;
      const type = body?.type ?? body?.error?.type;
      if (type === 'permission_error' || type === 'provider_access_denied' || type === 'provider_denied') {
        try {
          await store.upsert('site_settings', { key: DENIAL_KEY, value: { message: body?.message ?? body?.error?.message ?? 'Image provider access is denied.' } });
        } catch {
          return Response.json({ message: 'Image provider access is denied. The pause could not be saved; contact support before trying again.' }, { status: 403 });
        }
      }
    }
    const headers = new Headers({ 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-cache, no-transform' });
    upstream.headers.forEach((value, name) => { if (name.toLowerCase().startsWith('x-lovable-aig-')) headers.set(name, value); });
    return new Response(upstream.body, { status: upstream.status, headers });
  } } },
});
