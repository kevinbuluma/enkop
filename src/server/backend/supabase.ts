import type { Enquiry } from '@/lib/enquiry-schema';
import type { Backend } from './types';

// The Lovable Cloud mirror. Reads use the public (RLS-limited) client exactly as before;
// enquiries go to the master so there is a single writer.

const DEFAULT_MASTER = 'https://enkoprealestate.com';

async function client() {
  const { supabase } = await import('@/integrations/supabase/client');
  return supabase as any;
}

/** Optional sections degrade to empty on the mirror, but the cause (often a missing RLS policy) is logged. */
function rows<T = any>(table: string, { data, error }: { data: T[] | null; error: { message: string } | null }): T[] {
  if (error) console.error(`[enkop] mirror read of ${table} failed: ${error.message}`);
  return data ?? [];
}

export const supabaseBackend: Backend = {
  mode: 'mirror',
  async publishedProperties() {
    const { data, error } = await (await client()).from('properties').select('*').eq('status', 'published').order('featured', { ascending: false }).order('created_at', { ascending: true });
    if (error) throw new Error('The collection is temporarily unavailable. Please try again.');
    return data ?? [];
  },
  async completedTours() {
    return rows('property_tours', await (await client()).from('property_tours').select('property_id,video_path,created_at').eq('status', 'completed').not('video_path', 'is', null).order('created_at', { ascending: false }));
  },
  async activeSlides() {
    return rows('homepage_slides', await (await client()).from('homepage_slides').select('id,label,video_path,image_path').eq('active', true).order('position'));
  },
  async activeTeam() {
    return rows('team_members', await (await client()).from('team_members').select('id,name,role,bio,photo_path,position').eq('active', true).order('position'));
  },
  async approvedTestimonials() {
    return rows('testimonials', await (await client()).from('testimonials').select('id,quote,author,context').eq('approved', true).order('position'));
  },
  async setting(key) {
    const { data } = await (await client()).from('site_settings').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
  },
  async signMedia(paths, expiresIn) {
    const { signStoragePaths } = await import('@/integrations/supabase/privileged.server');
    return signStoragePaths(paths, expiresIn);
  },
  async submitEnquiry(data: Enquiry) {
    const master = (process.env['ENKOP_MASTER_URL'] || DEFAULT_MASTER).replace(/\/$/, '');
    try {
      // The visitor's address (vouched for by the bridge secret) lets the master rate-limit per visitor, not per Lovable server.
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const secret = process.env['ENKOP_BRIDGE_SECRET'];
      if (secret) {
        headers['x-enkop-bridge-secret'] = secret;
        const { getRequest } = await import('@tanstack/react-start/server');
        const ip = getRequest()?.headers.get('cf-connecting-ip');
        if (ip) headers['x-enkop-client-ip'] = ip;
      }
      // Bounded so a hung master still leaves time to keep the lead in Lovable Cloud below.
      const res = await fetch(`${master}/api/public/enkop-master/enquiry`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) return;
      console.error(`[enkop] master rejected forwarded enquiry (${res.status})`);
    } catch (e) {
      console.error('[enkop] master unreachable for enquiry', e);
    }
    // Never lose a lead: if the master can't take it, keep it in Lovable Cloud.
    const { insertEnquiry } = await import('@/integrations/supabase/privileged.server');
    await insertEnquiry(data);
  },
};
