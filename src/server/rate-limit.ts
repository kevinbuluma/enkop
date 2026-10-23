import { masterEnv } from '@/server/runtime';

// Workers Rate Limiting bindings declared in cloudflare/wrangler.jsonc. Limits are per Cloudflare
// location and approximate; they stop floods (WhatsApp alert spam, password guessing), not single requests.
type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
export type LimiterName = 'SIGNIN_LIMITER' | 'ENQUIRY_LIMITER';

/** True when every key is under its limit. Without the binding (Lovable hosting, tests) nothing is limited. */
export async function withinLimit(name: LimiterName, ...keys: string[]) {
  const limiter = (await masterEnv())?.[name] as Limiter | undefined;
  if (!limiter) return true;
  try {
    const results = await Promise.all(keys.map((key) => limiter.limit({ key })));
    return results.every((r) => r.success);
  } catch (e) {
    console.error('[enkop] rate limiter unavailable', e);
    return true;
  }
}

export const clientAddress = (request: Request | undefined | null) => request?.headers.get('cf-connecting-ip') ?? 'unknown';
