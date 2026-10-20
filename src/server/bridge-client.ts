import { envString } from '@/server/runtime';

const DEFAULT_BRIDGE = 'https://enkop-real-estate.lovable.app';

/** Calls the secret-authenticated bridge on Lovable hosting. */
export function bridgeFetch(route: string, init: RequestInit = {}) {
  const secret = envString('ENKOP_BRIDGE_SECRET');
  if (!secret) return Promise.reject(new Error('ENKOP_BRIDGE_SECRET is not set.'));
  const headers = new Headers(init.headers);
  headers.set('x-enkop-bridge-secret', secret);
  const base = (envString('ENKOP_BRIDGE_URL') ?? DEFAULT_BRIDGE).replace(/\/$/, '');
  return fetch(`${base}/api/public/enkop-bridge/${route}`, { ...init, headers });
}
