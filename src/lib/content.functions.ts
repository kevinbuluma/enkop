import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { seasonSettingsSchema, type SeasonSettings } from '@/lib/season';

const BUCKET = 'property-media';

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from('user_roles').select('role').eq('user_id', ctx.userId).eq('role', 'admin').maybeSingle();
  if (!data) throw new Error('Only ENKOP administrators can do this.');
}

async function signPortraits(rows: any[]) {
  const paths = rows.map(r => r.photo_path).filter(Boolean);
  if (!paths.length) return rows.map(r => ({ ...r, photo_url: null as string | null }));
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 24);
  const urls = Object.fromEntries((data ?? []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
  return rows.map(r => ({ ...r, photo_url: (r.photo_path && urls[r.photo_path]) || null }));
}

/* ---------- Public ---------- */
export const getSeasonSettings = createServerFn({ method: 'GET' }).handler(async (): Promise<SeasonSettings | null> => {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'season').maybeSingle();
  const parsed = seasonSettingsSchema.safeParse(data?.value);
  return parsed.success ? parsed.data : null;
});

export const getTeam = createServerFn({ method: 'GET' }).handler(async () => {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data } = await supabase.from('team_members').select('id,name,role,bio,photo_path,position').eq('active', true).order('position');
  return signPortraits(data ?? []) as Promise<{ id: string; name: string; role: string; bio: string; photo_url: string | null }[]>;
});

export const getTestimonials = createServerFn({ method: 'GET' }).handler(async () => {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data } = await supabase.from('testimonials').select('id,quote,author,context').eq('approved', true).order('position');
  return data ?? [];
});

/* ---------- Admin ---------- */
export const getContentAdmin = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [team, quotes, season] = await Promise.all([
      context.supabase.from('team_members').select('*').order('position'),
      context.supabase.from('testimonials').select('*').order('position'),
      context.supabase.from('site_settings').select('value').eq('key', 'season').maybeSingle(),
    ]);
    const s = seasonSettingsSchema.safeParse(season.data?.value);
    return { team: await signPortraits(team.data ?? []), testimonials: quotes.data ?? [], season: s.success ? s.data : null };
  });

export const saveSeasonSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => seasonSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from('site_settings').upsert({ key: 'season', value: data, updated_at: new Date().toISOString() });
    if (error) throw new Error('Seasonal settings could not be saved.');
    return { ok: true };
  });

const memberInput = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(2).max(100),
  role: z.string().trim().max(100),
  bio: z.string().trim().max(1500),
  photo_path: z.string().max(300).regex(/^team\//).nullable(),
  position: z.number().int().min(0).max(999),
  active: z.boolean(),
});
export const saveTeamMember = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => memberInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...row } = data;
    const payload = { ...row, updated_at: new Date().toISOString() };
    const r = id ? await context.supabase.from('team_members').update(payload).eq('id', id) : await context.supabase.from('team_members').insert(payload);
    if (r.error) throw new Error('The team member could not be saved.');
    return { ok: true };
  });

const quoteInput = z.object({
  id: z.string().uuid().nullable(),
  quote: z.string().trim().min(5).max(1200),
  author: z.string().trim().min(2).max(100),
  context: z.string().trim().max(120),
  approved: z.boolean(),
  position: z.number().int().min(0).max(999),
});
export const saveTestimonial = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => quoteInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...row } = data;
    const payload = { ...row, updated_at: new Date().toISOString() };
    const r = id ? await context.supabase.from('testimonials').update(payload).eq('id', id) : await context.supabase.from('testimonials').insert(payload);
    if (r.error) throw new Error('The testimonial could not be saved.');
    return { ok: true };
  });

export const deleteContent = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ table: z.enum(['team_members', 'testimonials']), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from(data.table).delete().eq('id', data.id);
    if (error) throw new Error('Could not delete.');
    return { ok: true };
  });
