import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database } from '@/integrations/supabase/types';

const BUCKET = 'property-media';
const pathOk = (p: string | null) => p === null || /^homepage\/[\w.-]+$/.test(p) || /^[0-9a-f-]{36}\/tours\/[0-9a-f-]{36}\.mp4$/.test(p);

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from('user_roles').select('role').eq('user_id', ctx.userId).eq('role', 'admin').maybeSingle();
  if (!data) throw new Error('Only ENKOP administrators can manage the homepage.');
}

async function sign(storage: any, paths: (string | null)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return {} as Record<string, string>;
  const { data } = await storage.from(BUCKET).createSignedUrls(list, 60 * 60 * 24);
  return Object.fromEntries((data ?? []).filter((d: any) => d.signedUrl).map((d: any) => [d.path, d.signedUrl])) as Record<string, string>;
}

export type PublicSlide = { id: string; label: string; video_url: string | null; image_url: string | null };

export const getHomepageSlides = createServerFn({ method: 'GET' }).handler(async (): Promise<PublicSlide[]> => {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  const pub = createClient<Database>(process.env['SUPABASE_URL']!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => { const h = new Headers(init?.headers); if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization'); h.set('apikey', key); return fetch(input, { ...init, headers: h }); } },
  });
  const { data, error } = await (pub as any).from('homepage_slides').select('id,label,video_path,image_path').eq('active', true).order('position');
  if (error || !data?.length) return [];
  // Only paths an administrator placed on an active homepage slide are signed.
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const urls = await sign(supabaseAdmin.storage, data.flatMap((s: any) => [s.video_path, s.image_path]));
  return data.map((s: any) => ({ id: s.id, label: s.label, video_url: s.video_path ? urls[s.video_path] ?? null : null, image_url: s.image_path ? urls[s.image_path] ?? null : null }))
    .filter((s: PublicSlide) => s.video_url || s.image_url);
});

export const getSlideAdmin = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [{ data: slides }, { data: tours }] = await Promise.all([
      (context.supabase as any).from('homepage_slides').select('*').order('position'),
      context.supabase.from('property_tours').select('id,video_path,created_at,properties(title)').eq('status', 'completed').order('created_at', { ascending: false }),
    ]);
    const urls = await sign(context.supabase.storage, [...(slides ?? []).flatMap((s: any) => [s.video_path, s.image_path]), ...(tours ?? []).map((t: any) => t.video_path)]);
    return {
      slides: (slides ?? []).map((s: any) => ({ ...s, video_url: s.video_path ? urls[s.video_path] ?? null : null, image_url: s.image_path ? urls[s.image_path] ?? null : null })) as Array<{ id: string; position: number; label: string; video_path: string | null; image_path: string | null; active: boolean; video_url: string | null; image_url: string | null }>,
      tours: (tours ?? []).map((t: any) => ({ id: t.id as string, video_path: t.video_path as string, title: (t.properties?.title ?? 'Property tour') as string, created_at: t.created_at as string, video_url: urls[t.video_path] ?? null })),
    };
  });

const slideInput = z.object({
  id: z.string().uuid().nullable(),
  label: z.string().trim().max(120),
  video_path: z.string().max(300).nullable(),
  image_path: z.string().max(300).nullable(),
  active: z.boolean(),
});

export const saveSlide = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => slideInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!pathOk(data.video_path) || !pathOk(data.image_path)) throw new Error('Invalid media file.');
    if (!data.video_path && !data.image_path) throw new Error('A slide needs a video or an image.');
    const db = (context.supabase as any).from('homepage_slides');
    const row = { label: data.label, video_path: data.video_path, image_path: data.image_path, active: data.active };
    if (data.id) {
      const { error } = await db.update(row).eq('id', data.id);
      if (error) throw new Error('The slide could not be saved.');
    } else {
      const { data: last } = await (context.supabase as any).from('homepage_slides').select('position').order('position', { ascending: false }).limit(1).maybeSingle();
      const { error } = await db.insert({ ...row, position: (last?.position ?? -1) + 1 });
      if (error) throw new Error('The slide could not be added.');
    }
    return { ok: true };
  });

export const reorderSlides = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const results = await Promise.all(data.ids.map((id, position) => (context.supabase as any).from('homepage_slides').update({ position }).eq('id', id)));
    if (results.some((r: any) => r.error)) throw new Error('The new order could not be saved.');
    return { ok: true };
  });

export const deleteSlide = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context.supabase as any).from('homepage_slides').delete().eq('id', data.id);
    if (error) throw new Error('The slide could not be removed.');
    return { ok: true };
  });
