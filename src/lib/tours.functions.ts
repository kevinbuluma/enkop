import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const GATEWAY = 'https://ai.gateway.lovable.dev/v1';
const MODEL = 'google/gemini-omni-1.1-flash';
const BUCKET = 'property-media';

type Ctx = { supabase: any; userId: string };
type Job = { id: string; status: 'queued' | 'in_progress' | 'completed' | 'failed'; progress?: number; error?: { code: string; message: string } };

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (!data) throw new Error('Only ENKOP administrators can manage property tours.');
}

function apiKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error('Video generation is not configured.');
  return key;
}

async function gateway(path: string, init?: RequestInit): Promise<Job> {
  const res = await fetch(`${GATEWAY}${path}`, { ...init, headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', 'X-Lovable-AIG-SDK': 'fetch' } });
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

async function withUrl(supabase: any, tour: any) {
  if (!tour.video_path) return { ...tour, video_url: null };
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(tour.video_path, 60 * 60);
  return { ...tour, video_url: data?.signedUrl ?? null };
}

export const getStudio = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role } = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId).eq('role', 'admin').maybeSingle();
    if (!role) return { isAdmin: false, properties: [], tours: [] };
    const [{ data: properties }, { data: tours }] = await Promise.all([
      context.supabase.from('properties').select('id,title,neighborhood,property_type').order('title'),
      context.supabase.from('property_tours').select('*').order('created_at', { ascending: false }).limit(20),
    ]);
    return { isAdmin: true, properties: properties ?? [], tours: await Promise.all((tours ?? []).map((t: any) => withUrl(context.supabase, t))) };
  });

export const startTour = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ propertyId: z.string().uuid(), photoPaths: z.array(z.string().min(1).max(300)).min(1).max(3), direction: z.string().trim().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: running } = await context.supabase.from('property_tours').select('id').in('status', ['queued', 'in_progress']).limit(1);
    if (running?.length) throw new Error('A tour is already generating. Please wait for it to finish.');
    const { data: property } = await context.supabase.from('properties').select('id,title,neighborhood,city,property_type').eq('id', data.propertyId).maybeSingle();
    if (!property) throw new Error('Property not found.');

    const images = await Promise.all(data.photoPaths.map(async (path) => {
      if (!path.startsWith(`${property.id}/photos/`)) throw new Error('Invalid photo.');
      const { data: file, error } = await context.supabase.storage.from(BUCKET).download(path);
      if (error || !file) throw new Error('A photo could not be read. Please upload it again.');
      const mime = file.type && /^image\/(png|jpeg|webp)$/.test(file.type) ? file.type : 'image/jpeg';
      return { type: 'image', data: toBase64(await file.arrayBuffer()), mime_type: mime };
    }));

    const refs = images.slice(1).map((_, i) => `<IMAGE_REF_${i}>`).join(' ');
    const prompt = [
      `A cinematic, quiet-luxury real estate tour of ${property.title}, a ${property.property_type.toLowerCase()} in ${property.neighborhood}, ${property.city}.`,
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

    const { data: tour, error } = await context.supabase.from('property_tours').insert({
      property_id: property.id, created_by: context.userId, photo_paths: data.photoPaths, direction: data.direction,
      job_id: job.id, status: job.status, progress: job.progress ?? 0,
    }).select('*').single();
    if (error) throw new Error('The tour started but could not be saved.');
    return tour;
  });

export const pollTour = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tourId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: tour } = await context.supabase.from('property_tours').select('*').eq('id', data.tourId).maybeSingle();
    if (!tour) throw new Error('Tour not found.');
    if (tour.status === 'completed' || tour.status === 'failed' || !tour.job_id) return withUrl(context.supabase, tour);

    const job = await gateway(`/videos/${encodeURIComponent(tour.job_id)}`);
    if (job.status === 'failed') {
      const message = job.error?.code === 'moderation_blocked' || job.error?.code === 'invalid_request'
        ? `${job.error?.message ?? 'The video was blocked.'} The uploaded photos may be the cause — try different photos.`
        : job.error?.message ?? 'Video generation failed.';
      const { data: updated } = await context.supabase.from('property_tours').update({ status: 'failed', error: message, updated_at: new Date().toISOString() }).eq('id', tour.id).select('*').single();
      return withUrl(context.supabase, updated);
    }
    if (job.status !== 'completed') {
      const { data: updated } = await context.supabase.from('property_tours').update({ status: job.status, progress: job.progress ?? tour.progress, updated_at: new Date().toISOString() }).eq('id', tour.id).select('*').single();
      return withUrl(context.supabase, updated);
    }

    const path = `${tour.property_id}/tours/${tour.id}.mp4`;
    const res = await fetch(`${GATEWAY}/videos/${encodeURIComponent(tour.job_id)}/content`, { headers: { Authorization: `Bearer ${apiKey()}` } });
    if (!res.ok) throw new Error(`The finished video could not be downloaded (${res.status}).`);
    const { error: upErr } = await context.supabase.storage.from(BUCKET).upload(path, await res.arrayBuffer(), { contentType: 'video/mp4', upsert: true });
    if (upErr) throw new Error('The finished video could not be stored.');
    const { data: updated } = await context.supabase.from('property_tours').update({ status: 'completed', progress: 100, video_path: path, updated_at: new Date().toISOString() }).eq('id', tour.id).select('*').single();
    return withUrl(context.supabase, updated);
  });
