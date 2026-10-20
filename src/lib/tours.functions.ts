import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';

const MODEL = 'google/gemini-omni-1.1-flash';

type Job = { id: string; status: 'queued' | 'in_progress' | 'completed' | 'failed'; progress?: number; error?: { code: string; message: string } };
type Master = Awaited<ReturnType<typeof import('@/server/backend').getMaster>>;
type TourRow = {
  id: string; property_id: string; created_by: string; photo_paths: string[]; direction: string; job_id: string | null;
  status: string; progress: number; video_path: string | null; error: string | null; created_at: string; updated_at: string;
};

async function ai() {
  const m = await import('@/integrations/supabase/privileged.server');
  if (!m.aiAvailable()) throw new Error('Video generation is not configured.');
  return m.aiGatewayFetch;
}

async function gateway(path: string, init?: RequestInit): Promise<Job> {
  const res = await (await ai())(path, { ...init, headers: { 'Content-Type': 'application/json', 'X-Lovable-AIG-SDK': 'fetch' } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    const fallback = res.status === 402 ? 'Not enough AI credits to create this tour.' : res.status === 429 ? 'Another tour is generating. Please wait for it to finish.' : `Video request failed (${res.status}).`;
    throw new Error(body?.message ?? fallback);
  }
  return res.json() as Promise<Job>;
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function withUrl(master: Master, tour: any) {
  if (!tour?.video_path) return { ...tour, video_url: null };
  const urls = await master.signMedia([tour.video_path], 60 * 60);
  return { ...tour, video_url: urls[tour.video_path] ?? null };
}

async function updateTour(master: Master, id: string, patch: Record<string, unknown>) {
  await master.store.update('property_tours', id, patch);
  await master.afterWrite();
  return master.store.first('property_tours', 'id = ?', [id]);
}

export const getStudio = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { master } = context;
    const [properties, tours] = await Promise.all([
      master.store.all('properties', '', [], 'ORDER BY title'),
      master.store.all('property_tours', '', [], 'ORDER BY created_at DESC LIMIT 20'),
    ]);
    return {
      isAdmin: true,
      properties: properties.map((p) => ({ id: p['id'], title: p['title'], neighborhood: p['neighborhood'], property_type: p['property_type'] })) as { id: string; title: string; neighborhood: string; property_type: string }[],
      tours: await Promise.all(tours.map((t) => withUrl(master, t))),
    };
  });

export const startTour = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ propertyId: z.string().uuid(), photoPaths: z.array(z.string().min(1).max(300)).min(1).max(3), direction: z.string().trim().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { master, admin } = context;
    const running = await master.store.first('property_tours', `status IN ('queued', 'in_progress')`);
    if (running) throw new Error('A tour is already generating. Please wait for it to finish.');
    const property = await master.store.first('properties', 'id = ?', [data.propertyId]) as any;
    if (!property) throw new Error('Property not found.');

    const images = await Promise.all(data.photoPaths.map(async (path) => {
      if (!path.startsWith(`${property.id}/photos/`)) throw new Error('Invalid photo.');
      const file = await master.media.bytes(path);
      if (!file) throw new Error('A photo could not be read. Please upload it again.');
      const mime = /^image\/(png|jpeg|webp)$/.test(file.contentType) ? file.contentType : 'image/jpeg';
      return { type: 'image', data: toBase64(file.data), mime_type: mime };
    }));

    const refs = images.slice(1).map((_, i) => `<IMAGE_REF_${i}>`).join(' ');
    const prompt = [
      `A cinematic, quiet-luxury real estate tour of ${property.title}, a ${String(property.property_type).toLowerCase()} in ${property.neighborhood}, ${property.city}.`,
      `Start from <FIRST_FRAME> and move in a slow, smooth forward glide through the space, like a gimbal walkthrough, in a single continuous shot, no scene cuts.`,
      refs ? `Also reveal the spaces shown in ${refs}, keeping their architecture, materials and layout faithful.` : '',
      `Keep the architecture, furniture, colours and proportions of the photographed home unchanged. Soft natural light, warm editorial grade.`,
      data.direction ? `Director notes: ${data.direction}` : '',
      `Audio: subtle ambient room tone and a soft, understated piano. No dialogue. No people. No on-screen text.`,
    ].filter(Boolean).join(' ');

    const job = await gateway('/videos', {
      method: 'POST',
      body: JSON.stringify({
        model: MODEL,
        input: [{ type: 'text', text: prompt }, ...images],
        response_format: { type: 'video', resolution: '720p', duration: '8s', aspect_ratio: '16:9' },
      }),
    });

    try {
      const id = await master.store.upsert('property_tours', {
        property_id: property.id, created_by: admin.id, photo_paths: data.photoPaths, direction: data.direction,
        job_id: job.id, status: job.status, progress: job.progress ?? 0,
      });
      await master.afterWrite();
      return (await master.store.first('property_tours', 'id = ?', [id])) as TourRow;
    } catch (e) {
      console.error(e);
      throw new Error('The tour started but could not be saved.');
    }
  });

export const pollTour = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ tourId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { master } = context;
    const tour = await master.store.first('property_tours', 'id = ?', [data.tourId]) as any;
    if (!tour) throw new Error('Tour not found.');
    if (tour.status === 'completed' || tour.status === 'failed' || !tour.job_id) return withUrl(master, tour);

    const job = await gateway(`/videos/${encodeURIComponent(tour.job_id)}`);
    if (job.status === 'failed') {
      const message = job.error?.code === 'moderation_blocked' || job.error?.code === 'invalid_request'
        ? `${job.error?.message ?? 'The video was blocked.'} The uploaded photos may be the cause â€” try different photos.`
        : job.error?.message ?? 'Video generation failed.';
      return withUrl(master, await updateTour(master, tour.id, { status: 'failed', error: message }));
    }
    if (job.status !== 'completed') {
      return withUrl(master, await updateTour(master, tour.id, { status: job.status, progress: job.progress ?? tour.progress }));
    }

    const path = `${tour.property_id}/tours/${tour.id}.mp4`;
    const res = await (await ai())(`/videos/${encodeURIComponent(tour.job_id)}/content`);
    if (!res.ok) throw new Error(`The finished video could not be downloaded (${res.status}).`);
    try {
      await master.media.put(path, await res.arrayBuffer(), 'video/mp4');
    } catch (e) {
      console.error(e);
      throw new Error('The finished video could not be stored.');
    }
    return withUrl(master, await updateTour(master, tour.id, { status: 'completed', progress: 100, video_path: path }));
  });
