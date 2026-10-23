import { createServerFn } from '@tanstack/react-start';
import { enquiryProblem, enquirySchema } from '@/lib/enquiry-schema';

export const getProperties = createServerFn({ method: 'GET' }).handler(async () => {
  const { getBackend } = await import('@/server/backend');
  const backend = await getBackend();
  const rows = (await backend.publishedProperties()) as any[];

  // Sign only admin-uploaded gallery photos and finished tour videos of published listings.
  const photoPaths = [...new Set(rows.flatMap((r) => r.image_paths ?? []))] as string[];
  const tours = await backend.completedTours();
  const tourByProperty = new Map<string, string>();
  for (const t of tours) if (t.video_path && !tourByProperty.has(t.property_id)) tourByProperty.set(t.property_id, t.video_path);
  const allPaths = [...photoPaths, ...tourByProperty.values()];
  let urls: Record<string, string> = {};
  if (allPaths.length) {
    // A signing failure hides uploaded media rather than failing the whole collection.
    urls = await backend.signMedia(allPaths, 60 * 60 * 24).catch((e) => { console.error('Media signing failed', e); return {}; });
  }
  return rows.map((r) => ({
    ...r,
    photo_urls: (r.image_paths ?? []).map((p: string) => urls[p]).filter(Boolean),
    tour_url: tourByProperty.has(r.id) ? urls[tourByProperty.get(r.id)!] ?? null : null,
  }));
});

export const sendEnquiry = createServerFn({ method: 'POST' })
  .validator((data) => {
    const parsed = enquirySchema.safeParse(data);
    if (!parsed.success) throw new Error(enquiryProblem(parsed.error));
    return parsed.data;
  })
  .handler(async ({ data }) => {
    if (data.website) return { success: true };
    const [{ getRequest }, { clientAddress, withinLimit }] = await Promise.all([import('@tanstack/react-start/server'), import('@/server/rate-limit')]);
    if (!(await withinLimit('ENQUIRY_LIMITER', `ip:${clientAddress(getRequest())}`))) {
      throw new Error('You have sent several enquiries in a short time. Please wait a minute and try again, or call us directly.');
    }
    const { getBackend } = await import('@/server/backend');
    try {
      await (await getBackend()).submitEnquiry(data);
    } catch (e) {
      console.error('[enkop] enquiry failed', e);
      throw new Error('Your enquiry could not be sent. Please try again.');
    }
    return { success: true };
  });
