import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSqlite, masterDb, type FakeD1 } from './fake-d1';
import { MasterStore } from '@/server/backend/master-store';
import { isMirrorTable, rowJsonSql, TABLES } from '@/server/backend/tables';
import { signMediaPaths, verifyMediaSignature } from '@/server/backend/media';
import { completeSetup, issueSetupToken, verifyLogin } from '@/server/auth';

const bridge = vi.hoisted(() => ({ calls: [] as { route: string; body: unknown }[], fail: new Set<string>() }));
vi.mock('@/server/bridge-client', () => ({
  bridgeFetch: async (route: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    bridge.calls.push({ route, body });
    return bridge.fail.has(route) ? new Response('{"message":"down"}', { status: 503 }) : Response.json({ ok: true });
  },
}));

describe('backend mode selection', () => {
  afterEach(() => { vi.resetModules(); vi.doUnmock('@/server/runtime'); });
  it('serves from the Lovable mirror when no Cloudflare bindings exist', async () => {
    vi.doMock('@/server/runtime', async (orig) => ({ ...(await orig<typeof import('@/server/runtime')>()), masterEnv: async () => null }));
    const { getBackend, getMaster } = await import('@/server/backend');
    expect((await getBackend()).mode).toBe('mirror');
    await expect(getMaster()).rejects.toThrow(/master site/);
  });
  it('serves from D1 when the master bindings exist', async () => {
    vi.doMock('@/server/runtime', async (orig) => ({ ...(await orig<typeof import('@/server/runtime')>()), masterEnv: async () => ({ DB: {} }), afterResponse: async () => {} }));
    const { getBackend } = await import('@/server/backend');
    expect((await getBackend()).mode).toBe('master');
  });
});

describe('mirror table allow-list', () => {
  it('only mirrors content tables, never auth or sync bookkeeping', () => {
    for (const t of ['properties', 'enquiries', 'homepage_slides', 'property_tours', 'team_members', 'testimonials', 'site_settings']) expect(isMirrorTable(t)).toBe(true);
    for (const t of ['admins', 'sessions', 'outbox', 'media', 'user_roles', 'auth.users', '__proto__', 'constructor', 'toString']) expect(isMirrorTable(t)).toBe(false);
  });
});

describe.skipIf(!hasSqlite)('master store and outbox', () => {
  let db: FakeD1;
  let store: MasterStore;
  beforeEach(async () => { db = await masterDb(); store = new MasterStore(db as never); bridge.calls = []; bridge.fail.clear(); });

  const outbox = async () => (await db.prepare('SELECT kind, table_name, payload, done_at, attempts FROM outbox ORDER BY id').all<any>()).results;

  it('queues the full Supabase-shaped row in the same batch as the write', async () => {
    const id = await store.upsert('properties', { slug: 'a-home', title: 'A Home', neighborhood: 'Karen', property_type: 'Villa', price: 1000, amenities: ['Pool'], featured: true, external_links: { instagram: 'https://x.test' } });
    const [row] = await outbox();
    expect(row).toMatchObject({ kind: 'upsert', table_name: 'properties' });
    const payload = JSON.parse(row.payload);
    expect(payload).toMatchObject({ id, slug: 'a-home', amenities: ['Pool'], image_paths: [], featured: true, is_sample: false, external_links: { instagram: 'https://x.test' } });
    expect(Object.keys(payload).sort()).toEqual([...TABLES.properties.columns].sort());
    expect(await store.first('properties', 'id = ?', [id])).toMatchObject({ featured: true, amenities: ['Pool'] });
  });

  it('rolls back the write and the outbox entry together', async () => {
    await store.upsert('properties', { slug: 'dup', title: 'One', neighborhood: 'Karen', property_type: 'Villa', price: 1 });
    await expect(store.upsert('properties', { slug: 'dup', title: 'Two', neighborhood: 'Karen', property_type: 'Villa', price: 1 })).rejects.toThrow();
    expect(await outbox()).toHaveLength(1);
  });

  it('records updates as full rows and deletes as keys', async () => {
    const id = await store.upsert('team_members', { name: 'Ann', position: 0 });
    await store.update('team_members', id, { role: 'Founder' });
    await store.remove('team_members', id);
    const rows = await outbox();
    expect(rows.map((r) => r.kind)).toEqual(['upsert', 'upsert', 'delete']);
    expect(JSON.parse(rows[1].payload)).toMatchObject({ id, name: 'Ann', role: 'Founder', active: true });
    expect(JSON.parse(rows[2].payload)).toEqual({ id });
  });

  it('builds row JSON for every mirrored table', async () => {
    for (const t of Object.keys(TABLES) as (keyof typeof TABLES)[]) {
      await expect(db.prepare(`SELECT ${rowJsonSql(t)} AS j FROM ${t} LIMIT 0`).all()).resolves.toBeTruthy();
    }
  });

  it('sends changes in order and holds later ones back when one fails', async () => {
    const { drainOutbox } = await import('@/server/sync');
    const env = { DB: db } as never;
    const a = await store.upsert('testimonials', { quote: 'Lovely home', author: 'Ann' });
    await store.remove('testimonials', a);
    bridge.fail.add('mirror/upsert');
    expect(await drainOutbox(env)).toMatchObject({ sent: 0, failed: 1, pending: 2 });
    expect(bridge.calls.map((c) => c.route)).toEqual(['mirror/upsert']);

    // The failed head is backed off, so nothing behind it may run yet.
    bridge.calls = []; bridge.fail.clear();
    expect(await drainOutbox(env)).toMatchObject({ sent: 0, pending: 2 });
    expect(bridge.calls).toEqual([]);

    await db.exec(`UPDATE outbox SET next_attempt_at = '2000-01-01T00:00:00.000Z'`);
    expect(await drainOutbox(env)).toMatchObject({ sent: 2, failed: 0, pending: 0 });
    expect(bridge.calls.map((c) => c.route)).toEqual(['mirror/upsert', 'mirror/delete']);
    expect(bridge.calls[1]!.body).toEqual({ table: 'testimonials', keys: [{ id: a }] });
  });
});

describe('signed media links', () => {
  beforeEach(() => { process.env['ENKOP_MEDIA_KEY'] = 'test-media-key'; });
  afterEach(() => { delete process.env['ENKOP_MEDIA_KEY']; vi.useRealTimers(); });

  it('accepts its own links and rejects tampered or expired ones', async () => {
    const path = 'homepage/scene-1.jpg';
    const url = new URL((await signMediaPaths([path], 60, 'https://master.test'))[path]!);
    expect(url.pathname).toBe('/media/homepage/scene-1.jpg');
    const exp = url.searchParams.get('exp'), sig = url.searchParams.get('sig');
    expect(await verifyMediaSignature(path, exp, sig)).toBe(true);
    expect(await verifyMediaSignature('homepage/scene-2.jpg', exp, sig)).toBe(false);
    expect(await verifyMediaSignature(path, String(Number(exp) + 1), sig)).toBe(false);
    expect(await verifyMediaSignature(path, exp, `${sig!.slice(0, -1)}A`)).toBe(sig!.endsWith('A') ? true : false);
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 120_000);
    expect(await verifyMediaSignature(path, exp, sig)).toBe(false);
  });
});

describe.skipIf(!hasSqlite)('admin password setup', () => {
  it('sets a password from a one-time link and signs in with it', async () => {
    const db = await masterDb();
    const token = await issueSetupToken(db as never, 'owner@example.com', 'a1');
    expect(await verifyLogin(db as never, 'owner@example.com', 'anything')).toBeNull();
    expect(await completeSetup(db as never, token, 'correct horse battery')).toMatchObject({ id: 'a1' });
    expect(await completeSetup(db as never, token, 'second try password')).toBeNull();
    expect(await verifyLogin(db as never, 'OWNER@example.com', 'correct horse battery')).toMatchObject({ id: 'a1' });
    expect(await verifyLogin(db as never, 'owner@example.com', 'wrong password!')).toBeNull();
  });
});
