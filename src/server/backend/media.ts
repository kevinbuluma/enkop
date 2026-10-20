import type { MasterEnv } from '@/server/runtime';
import { envString } from '@/server/runtime';
import type { MasterStore } from './master-store';

// Private media for the master, in the `property-media` bucket of your Supabase project
// (ENKOP_SUPABASE_URL + ENKOP_SUPABASE_SERVICE_KEY). The `media` table indexes it. Visitors get
// expiring Storage signed URLs, served by Supabase's CDN with byte-range support for video.

export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
export const MEDIA_BUCKET = 'property-media';
const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(key: string, message: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

function mediaKey() {
  const k = envString('ENKOP_MEDIA_KEY');
  if (!k) throw new Error('Media signing is not configured (ENKOP_MEDIA_KEY).');
  return k;
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** HMAC-signed /media links. Superseded by Storage signed URLs; /media still honours old links. */
export async function signMediaPaths(paths: string[], expiresIn: number, origin = envString('ENKOP_MASTER_URL') ?? ''): Promise<Record<string, string>> {
  const key = mediaKey();
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const out: Record<string, string> = {};
  for (const p of [...new Set(paths.filter(Boolean))]) {
    out[p] = `${origin.replace(/\/$/, '')}/media/${encodePath(p)}?exp=${exp}&sig=${await hmac(key, `${p}:${exp}`)}`;
  }
  return out;
}

export async function verifyMediaSignature(path: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  const expected = await hmac(mediaKey(), `${path}:${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** Storage REST client for your project's media bucket (no SDK: works the same on any key format). */
export class SupabaseBucket {
  constructor(readonly url: string, private key: string, readonly bucket = MEDIA_BUCKET) {}

  static fromEnv() {
    const url = envString('ENKOP_SUPABASE_URL');
    const key = envString('ENKOP_SUPABASE_SERVICE_KEY');
    if (!url || !key) throw new Error('Media storage is not configured (ENKOP_SUPABASE_URL / ENKOP_SUPABASE_SERVICE_KEY).');
    return new SupabaseBucket(url.replace(/\/$/, ''), key);
  }

  private headers(extra: Record<string, string> = {}) {
    // Legacy JWT keys go in Authorization; new sb_secret_ keys are sent only as apikey.
    return { apikey: this.key, ...(this.key.startsWith('sb_') ? {} : { Authorization: `Bearer ${this.key}` }), ...extra };
  }

  private async ok(res: Response, what: string) {
    if (!res.ok) throw new Error(`Storage ${what} failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return res;
  }

  async upload(path: string, data: ArrayBuffer, contentType: string) {
    await this.ok(await fetch(`${this.url}/storage/v1/object/${this.bucket}/${encodePath(path)}`, {
      method: 'POST', headers: this.headers({ 'Content-Type': contentType, 'x-upsert': 'true', 'Cache-Control': 'max-age=3600' }), body: data,
    }), 'upload');
  }

  async download(path: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
    const res = await fetch(`${this.url}/storage/v1/object/authenticated/${this.bucket}/${encodePath(path)}`, { headers: this.headers() });
    if (res.status === 400 || res.status === 404) return null;
    await this.ok(res, 'download');
    return { data: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }

  async remove(paths: string[]) {
    if (!paths.length) return;
    await this.ok(await fetch(`${this.url}/storage/v1/object/${this.bucket}`, {
      method: 'DELETE', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: paths }),
    }), 'delete');
  }

  async sign(paths: string[], expiresIn: number): Promise<Record<string, string>> {
    const list = [...new Set(paths.filter(Boolean))];
    if (!list.length) return {};
    const res = await this.ok(await fetch(`${this.url}/storage/v1/object/sign/${this.bucket}`, {
      method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn, paths: list }),
    }), 'signing');
    const out: Record<string, string> = {};
    for (const r of (await res.json()) as { path: string | null; signedURL: string | null; error: string | null }[]) {
      if (r.path && r.signedURL && !r.error) out[r.path] = `${this.url}/storage/v1${r.signedURL}`;
    }
    return out;
  }
}

/** Expiring Storage signed URLs, keyed by path; missing entries could not be signed. */
export function signStorageMedia(paths: string[], expiresIn: number) {
  return SupabaseBucket.fromEnv().sign(paths, expiresIn);
}

export class MediaStore {
  constructor(private env: MasterEnv, private store: MasterStore, private bucket?: SupabaseBucket) {}

  private get files() {
    return (this.bucket ??= SupabaseBucket.fromEnv());
  }

  private indexStatement(path: string, contentType: string, size: number) {
    return this.store.db.prepare(`INSERT INTO media (path, content_type, size) VALUES (?, ?, ?) ON CONFLICT (path) DO UPDATE SET content_type = excluded.content_type, size = excluded.size`).bind(path, contentType, size);
  }

  /** Stores the file, records it and queues a copy to the Lovable mirror. */
  async put(path: string, data: ArrayBuffer, contentType: string) {
    if (data.byteLength > MAX_MEDIA_BYTES) throw new Error('Files must be 50 MB or smaller.');
    await this.files.upload(path, data, contentType);
    await this.store.run([this.indexStatement(path, contentType, data.byteLength), this.store.outboxStatement('media_put', { path, contentType })]);
  }

  /** Stores a file copied from the mirror or legacy KV (no outbox entry: the mirror already has it). */
  async putImported(path: string, data: ArrayBuffer, contentType: string) {
    if (data.byteLength > MAX_MEDIA_BYTES) throw new Error(`${path} is larger than 50 MB.`);
    await this.files.upload(path, data, contentType);
    await this.store.run([this.indexStatement(path, contentType, data.byteLength)]);
  }

  /** Paths referenced by content rows that are not in the media store yet. */
  async missingPaths(): Promise<string[]> {
    const [{ results: refs }, { results: have }] = await Promise.all([
      this.store.db.prepare(`
        SELECT video_path AS p FROM homepage_slides WHERE video_path IS NOT NULL
        UNION SELECT image_path FROM homepage_slides WHERE image_path IS NOT NULL
        UNION SELECT photo_path FROM team_members WHERE photo_path IS NOT NULL
        UNION SELECT video_path FROM property_tours WHERE video_path IS NOT NULL
        UNION SELECT unnest(photo_paths) FROM property_tours
        UNION SELECT unnest(image_paths) FROM properties`).all<{ p: string }>(),
      this.store.db.prepare('SELECT path FROM media').all<{ path: string }>(),
    ]);
    const stored = new Set(have.map((h) => h.path));
    return [...new Set(refs.map((r) => r.p))].filter((p) => p && !stored.has(p));
  }

  sign(paths: string[], expiresIn: number) {
    return this.files.sign(paths, expiresIn);
  }

  bytes(path: string) {
    return this.files.download(path);
  }

  async remove(paths: string[]) {
    await this.files.remove(paths);
    await this.store.run(paths.flatMap((p) => [
      this.store.db.prepare(`DELETE FROM media WHERE path = ?`).bind(p),
      this.store.outboxStatement('media_delete', { path: p }),
    ]));
  }
}
