import { createServerFn } from '@tanstack/react-start';
import { enquirySchema } from '@/lib/enquiry-schema';

export const getProperties = createServerFn({ method: 'GET' }).handler(async () => {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data, error } = await supabase.from('properties').select('*').eq('status', 'published').order('featured', { ascending: false }).order('created_at', { ascending: true });
  if (error) throw new Error('The collection is temporarily unavailable. Please try again.');
  const rows = data ?? [];

  // Sign only admin-uploaded gallery photos and finished tour videos of published listings.
  const photoPaths = [...new Set(rows.flatMap((r) => r.image_paths ?? []))];
  const { data: tours } = await supabase.from('property_tours').select('property_id,video_path,created_at').eq('status', 'completed').not('video_path', 'is', null).order('created_at', { ascending: false });
  const tourByProperty = new Map<string, string>();
  for (const t of tours ?? []) if (t.video_path && !tourByProperty.has(t.property_id)) tourByProperty.set(t.property_id, t.video_path);
  const allPaths = [...photoPaths, ...tourByProperty.values()];
  let urls: Record<string, string> = {};
  if (allPaths.length) {
    const { signStoragePaths } = await import('@/integrations/supabase/privileged.server');
    // A signing failure hides uploaded media rather than failing the whole collection.
    urls = await signStoragePaths(allPaths, 60 * 60 * 24).catch((e) => { console.error('Media signing failed', e); return {}; });
  }
  return rows.map((r) => ({
    ...r,
    photo_urls: (r.image_paths ?? []).map((p: string) => urls[p]).filter(Boolean),
    tour_url: tourByProperty.has(r.id) ? urls[tourByProperty.get(r.id)!] ?? null : null,
  }));
});

export const sendEnquiry = createServerFn({ method: 'POST' })
  .inputValidator((data) => enquirySchema.parse(data))
  .handler(async ({ data }) => {
    if (data.website) return { success: true };
    const { insertEnquiry } = await import('@/integrations/supabase/privileged.server');
    await insertEnquiry(data);
    return { success: true };
  });
