// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { masterDb, pglite, resetMasterDb } from './pg-db';

beforeAll(() => pglite(), 120_000);
import { MasterStore, readMeta, writeMeta } from '@/server/backend/master-store';
import { isMirrorTable, TABLES } from '@/server/backend/tables';
import { signMediaPaths, verifyMediaSignature } from '@/server/backend/media';
import { toPositional, type PgDatabase } from '@/server/backend/pg';
import { completeSetup, createSession, issueSetupToken, sessionAdmin, verifyLogin } from '@/server/auth';

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
  it('serves from the master database when the master bindings exist', async () => {
    vi.doMock('@/server/runtime', async (orig) => ({ ...(await orig<typeof import('@/server/runtime')>()), masterEnv: async () => ({ DB: {} }), afterResponse: async () => {} }));
    const { getBackend } = await import('@/server/backend');
    expect((await getBackend()).mode).toBe('master');
  });
});

describe('mirror table allow-list', () => {
  it('only mirrors content tables, never auth or sync bookkeeping', () => {
    for (const t of ['properties', 'enquiries', 'homepage_slides', 'property_tours', 'team_members', 'testimonials', 'site_settings']) expect(isMirrorTable(t)).toBe(true);
    for (const t of ['admins', 'sessions', 'outbox', 'media', 'meta', 'user_roles', 'auth.users', '__proto__', 'constructor', 'toString']) expect(isMirrorTable(t)).toBe(false);
  });
});

describe('Postgres adapter', () => {
  it('numbers ? placeholders in order', () => {
    expect(toPositional('SELECT * FROM t WHERE a = ? AND b <> ? LIMIT ?')).toBe('SELECT * FROM t WHERE a = $1 AND b <> $2 LIMIT $3');
  });
});

describe('master store and outbox triggers', () => {
  let db: PgDatabase;
  let store: MasterStore;
  beforeEach(async () => { await resetMasterDb(); db = await masterDb(); store = new MasterStore(db); bridge.calls = []; bridge.fail.clear(); });

  const outbox = async () => (await db.prepare('SELECT kind, table_name, payload, done_at, attempts FROM outbox ORDER BY id').all<any>()).results;

  it('queues the full Supabase-shaped row in the same transaction as the write', async () => {
    const id = await store.upsert('properties', { slug: 'a-home', title: 'A Home', neighborhood: 'Karen', property_type: 'Villa', price: 1000, amenities: ['Pool'], featured: true, external_links: { instagram: 'https://x.test' } });
    const [row] = await outbox();
    expect(row).toMatchObject({ kind: 'upsert', table_name: 'properties' });
    const payload = JSON.parse(row.payload);
    expect(payload).toMatchObject({ id, slug: 'a-home', amenities: ['Pool'], image_paths: [], featured: true, is_sample: false, price: 1000, external_links: { instagram: 'https://x.test' } });
    expect(Object.keys(payload).sort()).toEqual([...TABLES.properties.columns].sort());
    const stored = await store.first('properties', 'id = ?', [id]);
    expect(stored).toMatchObject({ featured: true, amenities: ['Pool'], price: 1000, external_links: { instagram: 'https://x.test' } });
    expect(stored!['created_at']).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  });

  it('round-trips jsonb values of any shape and text[] arrays', async () => {
    for (const value of ['autumn', 42, ['a', 'b'], { hero: 'scene-1' }, null]) {
      await store.upsert('site_settings', { key: 'k', value });
      expect((await store.first('site_settings', 'key = ?', ['k']))!['value']).toEqual(value ?? {});
    }
    const id = await store.upsert('properties', { slug: 'arr', title: 'Arr', neighborhood: 'Karen', property_type: 'Villa', price: 1, image_paths: ["x/gallery/it's \"quoted\", ok.jpg", 'y/gallery/b.jpg'] });
    expect((await store.first('properties', 'id = ?', [id]))!['image_paths']).toEqual(["x/gallery/it's \"quoted\", ok.jpg", 'y/gallery/b.jpg']);
  });

  it('rolls back the write and the outbox entry together', async () => {
    await store.upsert('properties', { slug: 'dup', title: 'One', neighborhood: 'Karen', property_type: 'Villa', price: 1 });
    await expect(store.upsert('properties', { slug: 'dup', title: 'Two', neighborhood: 'Karen', property_type: 'Villa', price: 1 })).rejects.toThrow();
    expect(await outbox()).toHaveLength(1);
  });

  it('records updates as full rows and deletes as keys, including hand edits', async () => {
    const id = await store.upsert('team_members', { name: 'Ann', position: 0 });
    await store.update('team_members', id, { role: 'Founder' });
    await (await pglite()).query(`UPDATE team_members SET bio = 'Edited in the dashboard' WHERE id = $1`, [id]);
    await store.remove('team_members', id);
    const rows = await outbox();
    expect(rows.map((r) => r.kind)).toEqual(['upsert', 'upsert', 'upsert', 'delete']);
    expect(JSON.parse(rows[1].payload)).toMatchObject({ id, name: 'Ann', role: 'Founder', active: true });
    expect(JSON.parse(rows[2].payload)).toMatchObject({ bio: 'Edited in the dashboard' });
    expect(JSON.parse(rows[3].payload)).toEqual({ id });
  });

  it('does not queue rows imported from the mirror', async () => {
    const row = { id: '33333333-3333-4333-8333-333333333333', name: 'Ann', email: 'a@x.test', message: 'Hi', created_at: '2026-10-20T10:00:00.000Z' };
    expect(await store.importRow('enquiries', row)).toBe(true);
    expect(await store.importRow('enquiries', row)).toBe(false);
    expect(await outbox()).toEqual([]);
    await store.update('enquiries', row.id, { status: 'contacted' });
    expect((await outbox()).map((r) => r.kind)).toEqual(['upsert']);
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

    await (await pglite()).exec(`UPDATE outbox SET next_attempt_at = '2000-01-01T00:00:00.000Z'`);
    expect(await drainOutbox(env)).toMatchObject({ sent: 2, failed: 0, pending: 0 });
    expect(bridge.calls.map((c) => c.route)).toEqual(['mirror/upsert', 'mirror/delete']);
    expect(bridge.calls[1]!.body).toEqual({ table: 'testimonials', keys: [{ id: a }] });
  });

  it('keeps small state in the meta table', async () => {
    expect(await readMeta(db, 'cursor')).toBeNull();
    await writeMeta(db, 'cursor', 'a');
    await writeMeta(db, 'cursor', 'b');
    expect(await readMeta(db, 'cursor')).toBe('b');
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

describe('admin sign-in', () => {
  const adminId = '11111111-2222-4333-8444-555555555555';
  beforeEach(async () => { await resetMasterDb(); });

  it('sets a password from a one-time link and signs in with it, whatever the email case', async () => {
    const db = await masterDb();
    const token = await issueSetupToken(db, 'Owner@Example.com', adminId);
    expect(await verifyLogin(db, 'owner@example.com', 'anything')).toBeNull();
    expect(await completeSetup(db, token, 'correct horse battery')).toMatchObject({ id: adminId, email: 'owner@example.com' });
    expect(await completeSetup(db, token, 'second try password')).toBeNull();
    expect(await verifyLogin(db, 'OWNER@example.com', 'correct horse battery')).toMatchObject({ id: adminId });
    expect(await verifyLogin(db, 'owner@example.com', 'wrong password!')).toBeNull();
  });

  it('resolves live sessions only', async () => {
    const db = await masterDb();
    await issueSetupToken(db, 'owner@example.com', adminId);
    const { token } = await createSession(db, adminId);
    expect(await sessionAdmin(db, token)).toMatchObject({ id: adminId, email: 'owner@example.com' });
    expect(await sessionAdmin(db, `${token}x`)).toBeNull();
    await (await pglite()).exec(`UPDATE sessions SET expires_at = now() - interval '1 minute'`);
    expect(await sessionAdmin(db, token)).toBeNull();
  });
});
