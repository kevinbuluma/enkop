import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { optimizedHeroMedia, optimizedHeroPoster } from '@/lib/hero-media';

const pathOk = (p: string | null) => p === null || /^homepage\/[\w.-]+$/.test(p) || /^[0-9a-f-]{36}\/tours\/[0-9a-f-]{36}\.mp4$/.test(p);

export type PublicSlide = { id: string; label: string; video_url: string | null; image_url: string | null; webm_url?: string | null };

export const getHomepageSlides = createServerFn({ method: 'GET' }).handler(async (): Promise<PublicSlide[]> => {
  const { getBackend } = await import('@/server/backend');
  const backend = await getBackend();
  const data = await backend.activeSlides();
  if (!data.length) return [];
  // Only paths an administrator placed on an active homepage slide are signed, and only when public/ has no copy.
  const unsigned = data.flatMap((s) => [optimizedHeroMedia(s.video_path) ? null : s.video_path, optimizedHeroPoster(s.image_path) ? null : s.image_path]).filter((p): p is string => !!p);
  const urls = unsigned.length ? await backend.signMedia(unsigned, 60 * 60 * 24) : {};
  return data.map((s) => ({
    id: s.id,
    label: s.label,
    video_url: optimizedHeroMedia(s.video_path)?.mp4 ?? (s.video_path ? urls[s.video_path] ?? null : null),
    webm_url: optimizedHeroMedia(s.video_path)?.webm ?? null,
    image_url: optimizedHeroPoster(s.image_path) ?? (s.image_path ? urls[s.image_path] ?? null : null),
  }))
    .filter((s: PublicSlide) => s.video_url || s.image_url);
});

export const getSlideAdmin = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { store, signMedia } = context.master;
    const [slides, tours, properties] = await Promise.all([
      store.all('homepage_slides', '', [], 'ORDER BY position'),
      store.all('property_tours', `status = 'completed'`, [], 'ORDER BY created_at DESC'),
      store.all('properties'),
    ]);
    const titles = new Map(properties.map((p) => [p['id'], p['title'] as string]));
    const urls = await signMedia([...slides.flatMap((s) => [s['video_path'], s['image_path']]), ...tours.map((t) => t['video_path'])].filter((p): p is string => typeof p === 'string'), 60 * 60 * 24);
    return {
      slides: slides.map((s: any) => ({ ...s, video_url: s.video_path ? urls[s.video_path] ?? null : null, image_url: s.image_path ? urls[s.image_path] ?? null : null })) as Array<{ id: string; position: number; label: string; video_path: string | null; image_path: string | null; active: boolean; video_url: string | null; image_url: string | null }>,
      tours: tours.filter((t) => t['video_path']).map((t) => ({ id: t['id'] as string, video_path: t['video_path'] as string, title: titles.get(t['property_id']) ?? 'Property tour', created_at: t['created_at'] as string, video_url: urls[t['video_path'] as string] ?? null })),
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
  .middleware([requireAdmin])
  .validator((d) => slideInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!pathOk(data.video_path) || !pathOk(data.image_path)) throw new Error('Invalid media file.');
    if (!data.video_path && !data.image_path) throw new Error('A slide needs a video or an image.');
    const { store } = context.master;
    const row = { label: data.label, video_path: data.video_path, image_path: data.image_path, active: data.active };
    try {
      if (data.id) await store.update('homepage_slides', data.id, row);
      else {
        const last = await store.first('homepage_slides', '1 = 1', [], 'ORDER BY position DESC');
        await store.upsert('homepage_slides', { ...row, position: ((last?.['position'] as number | undefined) ?? -1) + 1 });
      }
    } catch (e) {
      console.error(e);
      throw new Error(data.id ? 'The slide could not be saved.' : 'The slide could not be added.');
    }
    await context.master.afterWrite();
    return { ok: true };
  });

export const reorderSlides = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator((d) => z.object({ ids: z.array(z.string().uuid()).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { store } = context.master;
    try {
      await store.run(data.ids.flatMap((id, position) => store.updateStatements('homepage_slides', id, { position })));
    } catch (e) {
      console.error(e);
      throw new Error('The new order could not be saved.');
    }
    await context.master.afterWrite();
    return { ok: true };
  });

export const deleteSlide = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.master.store.remove('homepage_slides', data.id);
    await context.master.afterWrite();
    return { ok: true };
  });
