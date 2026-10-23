import { envString } from '@/server/runtime';

const DEFAULT_BRIDGE = 'https://enkop-real-estate.lovable.app';

/** Calls the secret-authenticated bridge on Lovable hosting. */
export function bridgeFetch(route: string, init: RequestInit = {}) {
  const secret = envString('ENKOP_BRIDGE_SECRET');
  if (!secret) return Promise.reject(new Error('ENKOP_BRIDGE_SECRET is not set.'));
  const headers = new Headers(init.headers);
  headers.set('x-enkop-bridge-secret', secret);
  const base = (envString('ENKOP_BRIDGE_URL') ?? DEFAULT_BRIDGE).replace(/\/$/, '');
  // Media copies can be 50 MB; everything else is small. A hung call must not stall a whole drain.
  const timeout = route.startsWith('mirror/media/') ? 120_000 : 30_000;
  return fetch(`${base}/api/public/enkop-bridge/${route}`, { signal: AbortSignal.timeout(timeout), ...init, headers });
}
