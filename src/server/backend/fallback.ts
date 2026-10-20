import type { Enquiry } from '@/lib/enquiry-schema';
import type { Backend } from './types';

const READS = ['publishedProperties', 'completedTours', 'activeSlides', 'activeTeam', 'approvedTestimonials', 'setting'] as const;

type Fallbacks = {
  mirror: () => Promise<Backend>;
  /** Stores an enquiry in Lovable Cloud; the master pulls it back once D1 recovers. */
  storeEnquiry: (data: Enquiry) => Promise<void>;
};

const defaults: Fallbacks = {
  mirror: async () => (await import('./supabase')).supabaseBackend,
  storeEnquiry: async (data) => (await import('@/integrations/supabase/privileged.server')).insertEnquiry(data),
};

/**
 * Public reads and enquiries on the master: D1 first, the Lovable mirror if D1 fails. Admin work
 * never falls back (it would edit stale copies), so only the public Backend is wrapped.
 */
export function withMirrorFallback(primary: Backend, fallbacks: Fallbacks = defaults): Backend {
  const out: Backend = { ...primary };
  for (const name of READS) {
    (out as any)[name] = async (...args: unknown[]) => {
      try {
        return await (primary as any)[name](...args);
      } catch (e) {
        console.error(`[enkop] D1 ${name} failed; serving the Lovable mirror`, e);
        return ((await fallbacks.mirror()) as any)[name](...args);
      }
    };
  }
  out.submitEnquiry = async (data) => {
    try {
      await primary.submitEnquiry(data);
    } catch (e) {
      console.error('[enkop] D1 enquiry write failed; storing it in Lovable Cloud', e);
      await fallbacks.storeEnquiry(data);
    }
  };
  return out;
}
