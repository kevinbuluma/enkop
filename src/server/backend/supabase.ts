import type { Enquiry } from '@/lib/enquiry-schema';
import type { Backend } from './types';

// The Lovable Cloud mirror. Reads use the public (RLS-limited) client exactly as before;
// enquiries go to the master so there is a single writer.

const DEFAULT_MASTER = 'https://enkop.kevinbuluma9-7ff.workers.dev';

async function client() {
  const { supabase } = await import('@/integrations/supabase/client');
  return supabase as any;
}

export const supabaseBackend: Backend = {
  mode: 'mirror',
  async publishedProperties() {
    const { data, error } = await (await client()).from('properties').select('*').eq('status', 'published').order('featured', { ascending: false }).order('created_at', { ascending: true });
    if (error) throw new Error('The collection is temporarily unavailable. Please try again.');
    return data ?? [];
  },
  async completedTours() {
    const { data } = await (await client()).from('property_tours').select('property_id,video_path,created_at').eq('status', 'completed').not('video_path', 'is', null).order('created_at', { ascending: false });
    return data ?? [];
  },
  async activeSlides() {
    const { data } = await (await client()).from('homepage_slides').select('id,label,video_path,image_path').eq('active', true).order('position');
    return data ?? [];
  },
  async activeTeam() {
    const { data } = await (await client()).from('team_members').select('id,name,role,bio,photo_path,position').eq('active', true).order('position');
    return data ?? [];
  },
  async approvedTestimonials() {
    const { data } = await (await client()).from('testimonials').select('id,quote,author,context').eq('approved', true).order('position');
    return data ?? [];
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
    const secret = process.env['ENKOP_BRIDGE_SECRET'];
    const master = (process.env['ENKOP_MASTER_URL'] || DEFAULT_MASTER).replace(/\/$/, '');
    if (secret) {
      try {
        const res = await fetch(`${master}/api/public/enkop-master/enquiry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-enkop-bridge-secret': secret },
          body: JSON.stringify(data),
        });
        if (res.ok) return;
        console.error(`[enkop] master rejected forwarded enquiry (${res.status})`);
      } catch (e) {
        console.error('[enkop] master unreachable for enquiry', e);
      }
    }
    // Never lose a lead: if the master can't take it, keep it in Lovable Cloud.
    const { insertEnquiry } = await import('@/integrations/supabase/privileged.server');
    await insertEnquiry(data);
  },
};
