import { masterEnv } from '@/server/runtime';
import type { Backend } from './types';

export type { Backend, BackendMode } from './types';

const DRAIN_EVERY_MS = 60_000;
let lastDrain = 0;

/** Retries queued mirror changes on ordinary traffic, at most once a minute per isolate. */
async function drainOccasionally(env: NonNullable<Awaited<ReturnType<typeof masterEnv>>>) {
  if (Date.now() - lastDrain < DRAIN_EVERY_MS) return;
  lastDrain = Date.now();
  const { afterResponse } = await import('@/server/runtime');
  await afterResponse(async () => (await import('@/server/sync')).drainOutbox(env));
}

/**
 * The master (D1/media on Cloudflare) when its bindings exist, falling back to the mirror if D1
 * fails; otherwise the Lovable Cloud mirror itself.
 */
export async function getBackend(): Promise<Backend> {
  const env = await masterEnv();
  if (env) {
    const { d1Backend } = await import('./d1');
    const { withMirrorFallback } = await import('./fallback');
    await drainOccasionally(env);
    return withMirrorFallback(d1Backend(env));
  }
  const { supabaseBackend } = await import('./supabase');
  return supabaseBackend;
}

/** Master-only access to the D1 store and media; throws on the mirror. */
export async function getMaster() {
  const env = await masterEnv();
  if (!env) throw new Error(`Administration has moved to the ENKOP master site: ${process.env['ENKOP_MASTER_URL'] || 'https://enkop.kevinbuluma9-7ff.workers.dev'}/admin`);
  const { d1Backend } = await import('./d1');
  const { afterResponse } = await import('@/server/runtime');
  return {
    env,
    ...d1Backend(env),
    /** Pushes queued changes to the mirror once the response is on its way. */
    afterWrite: () => afterResponse(async () => (await import('@/server/sync')).drainOutbox(env)),
  };
}
