import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { seasonSettingsSchema, type SeasonSettings } from '@/lib/season';

async function signPortraits(rows: any[], sign?: (paths: string[], expiresIn: number) => Promise<Record<string, string>>) {
  const paths = rows.map(r => r.photo_path).filter(Boolean);
  if (!paths.length) return rows.map(r => ({ ...r, photo_url: null as string | null }));
  const signer = sign ?? (await (await import('@/server/backend')).getBackend()).signMedia;
  const urls = await signer(paths, 60 * 60 * 24);
  return rows.map(r => ({ ...r, photo_url: (r.photo_path && urls[r.photo_path]) || null }));
}

/* ---------- Public ---------- */
export const getSeasonSettings = createServerFn({ method: 'GET' }).handler(async (): Promise<SeasonSettings | null> => {
  const { getBackend } = await import('@/server/backend');
  const parsed = seasonSettingsSchema.safeParse(await (await getBackend()).setting('season'));
  return parsed.success ? parsed.data : null;
});

export const getTeam = createServerFn({ method: 'GET' }).handler(async () => {
  const { getBackend } = await import('@/server/backend');
  const backend = await getBackend();
  const rows = (await backend.activeTeam()).map((r: any) => ({ id: r.id, name: r.name, role: r.role, bio: r.bio, photo_path: r.photo_path, position: r.position }));
  return signPortraits(rows, backend.signMedia) as Promise<{ id: string; name: string; role: string; bio: string; photo_url: string | null }[]>;
});

export const getTestimonials = createServerFn({ method: 'GET' }).handler(async () => {
  const { getBackend } = await import('@/server/backend');
  return (await (await getBackend()).approvedTestimonials()).map((r: any) => ({ id: r.id as string, quote: r.quote as string, author: r.author as string, context: r.context as string }));
});

/* ---------- Admin ---------- */
export const getContentAdmin = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { store, signMedia } = context.master;
    const [team, quotes, season] = await Promise.all([
      store.all('team_members', '', [], 'ORDER BY position'),
      store.all('testimonials', '', [], 'ORDER BY position'),
      store.first('site_settings', 'key = ?', ['season']),
    ]);
    const s = seasonSettingsSchema.safeParse(season?.['value']);
    return { team: await signPortraits(team as any[], signMedia), testimonials: quotes as any[], season: s.success ? s.data : null };
  });

export const saveSeasonSettings = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(d => seasonSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await context.master.store.upsert('site_settings', { key: 'season', value: data });
    await context.master.afterWrite();
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
  .middleware([requireAdmin])
  .validator(d => memberInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...row } = data;
    const { store } = context.master;
    try {
      if (id) await store.update('team_members', id, row); else await store.upsert('team_members', row);
    } catch (e) {
      console.error(e);
      throw new Error('The team member could not be saved.');
    }
    await context.master.afterWrite();
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
  .middleware([requireAdmin])
  .validator(d => quoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...row } = data;
    const { store } = context.master;
    try {
      if (id) await store.update('testimonials', id, row); else await store.upsert('testimonials', row);
    } catch (e) {
      console.error(e);
      throw new Error('The testimonial could not be saved.');
    }
    await context.master.afterWrite();
    return { ok: true };
  });

export const deleteContent = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(d => z.object({ table: z.enum(['team_members', 'testimonials']), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.master.store.remove(data.table, data.id);
    await context.master.afterWrite();
    return { ok: true };
  });
