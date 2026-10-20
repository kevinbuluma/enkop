import type { Enquiry } from '@/lib/enquiry-schema';
import type { Backend } from './types';

const READS = ['publishedProperties', 'completedTours', 'activeSlides', 'activeTeam', 'approvedTestimonials', 'setting'] as const;

type Fallbacks = {
  mirror: () => Promise<Backend>;
  /** Stores an enquiry in Lovable Cloud; the master pulls it back once it recovers. */
  storeEnquiry: (data: Enquiry) => Promise<void>;
};

const defaults: Fallbacks = {
  mirror: async () => (await import('./supabase')).supabaseBackend,
  storeEnquiry: async (data) => (await import('@/integrations/supabase/privileged.server')).insertEnquiry(data),
};

/**
 * Public reads and enquiries on the master: its database first, the Lovable mirror if that fails.
 * Admin work never falls back (it would edit stale copies), so only the public Backend is wrapped.
 */
export function withMirrorFallback(primary: Backend, fallbacks: Fallbacks = defaults): Backend {
  type Read = (...args: unknown[]) => Promise<unknown>;
  const out: Backend = { ...primary };
  for (const name of READS) {
    const read: Read = async (...args) => {
      try {
        return await (primary[name] as Read)(...args);
      } catch (e) {
        console.error(`[enkop] master ${name} failed; serving the Lovable mirror`, e);
        return ((await fallbacks.mirror())[name] as Read)(...args);
      }
    };
    (out as unknown as Record<string, Read>)[name] = read;
  }
  out.submitEnquiry = async (data) => {
    try {
      await primary.submitEnquiry(data);
    } catch (e) {
      console.error('[enkop] master enquiry write failed; storing it in Lovable Cloud', e);
      await fallbacks.storeEnquiry(data);
    }
  };
  return out;
}
