import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import { fallbackInput, fallbackPrompt } from '@/lib/fallback-image';
import { editImage, imageSettings } from '@/lib/image-gateway.server';

export const Route = createFileRoute('/api/homepage-fallback')({
  server: { handlers: { POST: async ({ request }) => {
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    if (!token || token.split('.').length !== 3) return Response.json({ message: 'Please sign in.' }, { status: 401 });
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!url || !key || !apiKey) return Response.json({ message: 'Image generation is not configured.' }, { status: 500 });
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('apikey', key);
        return fetch(input, { ...init, headers });
      } },
    });
    const { data: user, error: authError } = await db.auth.getUser(token);
    if (authError || !user.user) return Response.json({ message: 'Please sign in again.' }, { status: 401 });
    const { data: role } = await db.from('user_roles').select('role').eq('user_id', user.user.id).eq('role', 'admin').maybeSingle();
    if (!role) return Response.json({ message: 'Only ENKOP administrators can generate fallback images.' }, { status: 403 });
    const denialPath = 'homepage/image-provider-denial.json';
    const { data: denial } = await db.storage.from('property-media').download(denialPath);
    if (denial) {
      const blocked = JSON.parse(await denial.text()) as { message?: string };
      return Response.json({ message: blocked.message ?? 'Image provider access must be restored before generating images.' }, { status: 403 });
    }
    let form: FormData;
    try { form = await request.formData(); } catch { return Response.json({ message: 'Invalid upload.' }, { status: 400 }); }
    const parsed = fallbackInput.safeParse({ slideId: form.get('slideId'), videoPath: form.get('videoPath'), notes: form.get('notes') ?? '' });
    const frame = form.get('image');
    if (!parsed.success || !(frame instanceof File) || frame.type !== 'image/jpeg' || !frame.size || frame.size > 8 * 1024 * 1024) {
      return Response.json({ message: 'Provide a tour frame and style notes of up to 500 characters.' }, { status: 400 });
    }
    const { data: slide } = await db.from('homepage_slides').select('video_path').eq('id', parsed.data.slideId).maybeSingle();
    if (!slide?.video_path || slide.video_path !== parsed.data.videoPath) return Response.json({ message: 'The scene video changed. Refresh before generating an image.' }, { status: 409 });
    const upstreamForm = new FormData();
    upstreamForm.set('image', frame);
    upstreamForm.set('prompt', fallbackPrompt(parsed.data.notes));
    upstreamForm.set('size', '1536x864');
    upstreamForm.set('quality', 'medium');
    upstreamForm.set('stream', form.get('stream') === 'false' ? 'false' : 'true');
    const upstream = await editImage({ ...imageSettings, apiKey }, upstreamForm);
    if (upstream.status === 403) {
      const body = await upstream.clone().json().catch(() => null) as { type?: string; message?: string; error?: { type?: string; message?: string } } | null;
      const type = body?.type ?? body?.error?.type;
      if (type === 'permission_error' || type === 'provider_access_denied' || type === 'provider_denied') {
        const { error } = await db.storage.from('property-media').upload(denialPath, JSON.stringify({ message: body?.message ?? body?.error?.message ?? 'Image provider access is denied.' }), { contentType: 'application/json', upsert: true });
        if (error) return Response.json({ message: 'Image provider access is denied. The pause could not be saved; contact support before trying again.' }, { status: 403 });
      }
    }
    const headers = new Headers({ 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-cache, no-transform' });
    upstream.headers.forEach((value, name) => { if (name.toLowerCase().startsWith('x-lovable-aig-')) headers.set(name, value); });
    return new Response(upstream.body, { status: upstream.status, headers });
  } } },
});