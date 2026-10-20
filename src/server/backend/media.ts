import type { MasterEnv } from '@/server/runtime';
import { envString } from '@/server/runtime';
import type { MasterStore } from './master-store';

// Private media for the master. Bytes live in R2 when the MEDIA bucket is bound, otherwise in KV
// (MEDIA_KV, 25 MiB per file). The `media` table indexes both. Links are HMAC-signed and expire.

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
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

/** Signed, expiring links to private media, keyed by path. */
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

export type MediaObject = { body: ReadableStream | ArrayBuffer; contentType: string; size: number };

export class MediaStore {
  constructor(private env: MasterEnv, private store: MasterStore) {}

  get backend(): 'r2' | 'kv' {
    if (this.env.MEDIA) return 'r2';
    if (this.env.MEDIA_KV) return 'kv';
    throw new Error('No media storage is bound (MEDIA or MEDIA_KV).');
  }

  /** Stores the file, records it and queues a copy to the Lovable mirror. */
  async put(path: string, data: ArrayBuffer, contentType: string) {
    if (data.byteLength > MAX_MEDIA_BYTES) throw new Error('Files must be 25 MB or smaller.');
    if (this.backend === 'r2') await this.env.MEDIA!.put(path, data, { httpMetadata: { contentType } });
    else await this.env.MEDIA_KV!.put(path, data, { metadata: { contentType } });
    await this.store.run([
      this.store.db.prepare(`INSERT INTO media (path, content_type, size) VALUES (?, ?, ?) ON CONFLICT (path) DO UPDATE SET content_type = excluded.content_type, size = excluded.size`).bind(path, contentType, data.byteLength),
      this.store.outboxStatement('media_put', { path, contentType }),
    ]);
  }

  /** Stores a file copied from the mirror (no outbox entry: the mirror already has it). */
  async putImported(path: string, data: ArrayBuffer, contentType: string) {
    if (data.byteLength > MAX_MEDIA_BYTES) throw new Error(`${path} is larger than 25 MB; enable R2 for files this size.`);
    if (this.backend === 'r2') await this.env.MEDIA!.put(path, data, { httpMetadata: { contentType } });
    else await this.env.MEDIA_KV!.put(path, data, { metadata: { contentType } });
    await this.store.db.prepare(`INSERT INTO media (path, content_type, size) VALUES (?, ?, ?) ON CONFLICT (path) DO UPDATE SET content_type = excluded.content_type, size = excluded.size`).bind(path, contentType, data.byteLength).run();
  }

  /** Paths referenced by content rows that are not in the media store yet. */
  async missingPaths(): Promise<string[]> {
    // D1 rejects compound SELECTs with more than five terms.
    const [{ results: columns }, { results: lists }, { results: have }] = await Promise.all([
      this.store.db.prepare(`
        SELECT video_path AS p FROM homepage_slides WHERE video_path IS NOT NULL
        UNION SELECT image_path FROM homepage_slides WHERE image_path IS NOT NULL
        UNION SELECT photo_path FROM team_members WHERE photo_path IS NOT NULL
        UNION SELECT video_path FROM property_tours WHERE video_path IS NOT NULL`).all<{ p: string }>(),
      this.store.db.prepare(`
        SELECT j.value AS p FROM property_tours, json_each(property_tours.photo_paths) j
        UNION SELECT j.value FROM properties, json_each(properties.image_paths) j`).all<{ p: string }>(),
      this.store.db.prepare('SELECT path FROM media').all<{ path: string }>(),
    ]);
    const stored = new Set(have.map((h) => h.path));
    return [...new Set([...columns, ...lists].map((r) => r.p))].filter((p) => p && !stored.has(p));
  }

  async get(path: string): Promise<MediaObject | null> {
    if (this.env.MEDIA) {
      const obj = await this.env.MEDIA.get(path);
      if (obj) return { body: obj.body, contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream', size: obj.size };
    }
    if (this.env.MEDIA_KV) {
      const { value, metadata } = await this.env.MEDIA_KV.getWithMetadata<{ contentType?: string }>(path, 'stream');
      if (value) {
        const buf = await new Response(value).arrayBuffer();
        return { body: buf, contentType: metadata?.contentType ?? 'application/octet-stream', size: buf.byteLength };
      }
    }
    return null;
  }

  async bytes(path: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
    const obj = await this.get(path);
    if (!obj) return null;
    const data = obj.body instanceof ArrayBuffer ? obj.body : await new Response(obj.body).arrayBuffer();
    return { data, contentType: obj.contentType };
  }

  async remove(paths: string[]) {
    for (const p of paths) {
      if (this.env.MEDIA) await this.env.MEDIA.delete(p);
      if (this.env.MEDIA_KV) await this.env.MEDIA_KV.delete(p);
    }
    await this.store.run(paths.flatMap((p) => [
      this.store.db.prepare(`DELETE FROM media WHERE path = ?`).bind(p),
      this.store.outboxStatement('media_delete', { path: p }),
    ]));
  }
}
