import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';

const galleryPath = (propertyId: string, p: string) => p.startsWith(`${propertyId}/gallery/`);

async function signPhotos(sign: (paths: string[], expiresIn: number) => Promise<Record<string, string>>, rows: any[]) {
  const paths = [...new Set(rows.flatMap((r) => r.image_paths ?? []))] as string[];
  if (!paths.length) return rows.map((r) => ({ ...r, photo_urls: [] as string[] }));
  const urls = await sign(paths, 60 * 60 * 24);
  return rows.map((r) => ({ ...r, photo_urls: (r.image_paths ?? []).map((p: string) => urls[p]).filter(Boolean) as string[] }));
}

export const getListings = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { store, signMedia } = context.master;
    const rows = await store.all('properties', '', [], 'ORDER BY created_at DESC');
    return signPhotos(signMedia, rows as any[]);
  });

const listingInput = z.object({
  id: z.string().uuid().nullable(),
  title: z.string().trim().min(3).max(120),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.'),
  neighborhood: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  property_type: z.string().trim().min(2).max(40),
  listing_type: z.enum(['Sale', 'Rent']),
  price: z.number().positive().max(1_000_000_000_000),
  currency: z.string().trim().min(3).max(3),
  bedrooms: z.number().int().min(0).max(50),
  bathrooms: z.number().int().min(0).max(50),
  area_sqm: z.number().int().min(0).max(100_000),
  parking: z.number().int().min(0).max(50),
  description: z.string().trim().max(4000),
  amenities: z.array(z.string().trim().min(1).max(60)).max(30),
  image_paths: z.array(z.string().max(300)).max(20),
  status: z.enum(['draft', 'published']),
  featured: z.boolean(),
  external_links: z.record(z.enum(['instagram', 'tiktok', 'facebook', 'youtube', 'listing', 'tour']), z.string().url().max(500).refine(u => u.startsWith('https://'), 'Links must start with https://')).default({}),
  map_query: z.string().trim().max(200).nullable().default(null),
});

export const saveListing = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .inputValidator((d) => listingInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...row } = data;
    if (id && !row.image_paths.every((p) => galleryPath(id, p))) throw new Error('Invalid photo.');
    const payload = { ...row, is_sample: false, image_key: 'residence-1' };
    const { store } = context.master;
    const clash = await store.first('properties', id ? 'slug = ? AND id <> ?' : 'slug = ?', id ? [row.slug, id] : [row.slug]);
    if (clash) throw new Error('Another listing already uses that web address (slug).');
    let savedId: string;
    try {
      if (id) { await store.update('properties', id, payload); savedId = id; }
      else savedId = String(await store.upsert('properties', payload));
    } catch (e) {
      console.error(e);
      throw new Error('The listing could not be saved.');
    }
    await context.master.afterWrite();
    return { id: savedId };
  });

export const deleteListing = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { store, media } = context.master;
    const listing = await store.first('properties', 'id = ?', [data.id]);
    const tours = await store.all('property_tours', 'property_id = ?', [data.id]);
    try {
      await store.run([...tours.flatMap((t) => store.deleteStatements('property_tours', t['id'])), ...store.deleteStatements('properties', data.id)]);
    } catch (e) {
      console.error(e);
      throw new Error('The listing could not be deleted.');
    }
    const files = [...((listing?.['image_paths'] as string[] | undefined) ?? []), ...tours.flatMap((t) => [...((t['photo_paths'] as string[]) ?? []), ...(t['video_path'] ? [t['video_path'] as string] : [])])];
    if (files.length) await media.remove(files).catch((e) => console.error('[enkop] media cleanup failed', e));
    await context.master.afterWrite();
    return { ok: true };
  });
