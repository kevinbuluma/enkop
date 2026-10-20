// Browser helpers for the master admin: cookie session and media uploads.

export type AdminInfo = { id: string; email: string };
export type AdminSession = { mode: 'master'; admin: AdminInfo | null } | { mode: 'mirror'; masterUrl: string };

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(body.message ?? `Request failed (${res.status}).`);
  return body;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const adminSession = () => call<AdminSession>('/api/admin/session');
export const adminSignIn = (email: string, password: string) => call<{ admin: AdminInfo }>('/api/admin/session', json({ action: 'signin', email, password }));
export const adminSetup = (token: string, password: string) => call<{ admin: AdminInfo }>('/api/admin/session', json({ action: 'setup', token, password }));
export const adminSignOut = () => call<{ ok: true }>('/api/admin/session', { method: 'DELETE' });

/** Uploads a file to the master's private media store under `path`. */
export async function uploadMedia(path: string, file: Blob, contentType = file.type || 'application/octet-stream') {
  await call<{ path: string }>(`/api/admin/media?path=${encodeURIComponent(path)}`, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
  return path;
}

export const removeMedia = (paths: string[]) => call<{ ok: true }>('/api/admin/media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) });
