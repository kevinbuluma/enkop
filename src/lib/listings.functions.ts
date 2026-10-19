import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const BUCKET = 'property-media';
const galleryPath = (propertyId: string, p: string) => p.startsWith(`${propertyId}/gallery/`);

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from('user_roles').select('role').eq('user_id', ctx.userId).eq('role', 'admin').maybeSingle();
  if (!data) throw new Error('Only ENKOP administrators can manage listings.');
}

async function signPhotos(storage: any, rows: any[]) {
  const paths = [...new Set(rows.flatMap((r) => r.image_paths ?? []))];
  if (!paths.length) return rows.map((r) => ({ ...r, photo_urls: [] as string[] }));
  const { data } = await storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 24);
  const urls = Object.fromEntries((data ?? []).filter((d: any) => d.signedUrl).map((d: any) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, photo_urls: (r.image_paths ?? []).map((p: string) => urls[p]).filter(Boolean) as string[] }));
}

export const getListings = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.from('properties').select('*').order('created_at', { ascending: false });
    if (error) throw new Error('The listings could not be loaded.');
    return signPhotos(context.supabase.storage, data ?? []);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listingInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...row } = data;
    if (id && !row.image_paths.every((p) => galleryPath(id, p))) throw new Error('Invalid photo.');
    const payload = { ...row, is_sample: false, image_key: 'residence-1', updated_at: new Date().toISOString() };
    const db = context.supabase.from('properties');
    const result = id
      ? await db.update(payload).eq('id', id).select('id').single()
      : await db.insert(payload).select('id').single();
    if (result.error) throw new Error(result.error.code === '23505' ? 'Another listing already uses that web address (slug).' : 'The listing could not be saved.');
    return { id: result.data.id as string };
  });

export const deleteListing = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from('properties').delete().eq('id', data.id);
    if (error) throw new Error('The listing could not be deleted.');
    return { ok: true };
  });
