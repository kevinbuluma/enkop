import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSqlite, masterDb, type FakeD1 } from './fake-d1';
import { withMirrorFallback } from '@/server/backend/fallback';
import type { Backend } from '@/server/backend/types';
import type { Enquiry } from '@/lib/enquiry-schema';

const bridge = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], since: [] as string[] }));
vi.mock('@/server/bridge-client', () => ({
  bridgeFetch: async (route: string, init: RequestInit = {}) => {
    if (route !== 'mirror/enquiries') return Response.json({ ok: true });
    const { since } = JSON.parse(String(init.body));
    bridge.since.push(since);
    return Response.json({ rows: bridge.rows.filter((r) => String(r['created_at']) >= since) });
  },
}));

const enquiry: Enquiry = {
  name: 'Ann', email: 'ann@example.com', phone: '', message: 'Viewing please', property_id: null,
  preferred_date: '', preferred_contact: 'email', interest: 'buy', website: '',
} as unknown as Enquiry;

function backend(overrides: Partial<Backend>): Backend {
  const fail = async () => { throw new Error('D1 down'); };
  return {
    mode: 'master', publishedProperties: fail, completedTours: fail, activeSlides: fail, activeTeam: fail,
    approvedTestimonials: fail, setting: fail, signMedia: async () => ({}), submitEnquiry: fail, ...overrides,
  } as Backend;
}

describe('master falls back to the Lovable mirror', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('serves public reads from D1 while it works', async () => {
    const mirror = vi.fn();
    const b = withMirrorFallback(backend({ activeSlides: async () => [{ id: 'd1', label: '', video_path: null, image_path: null }] }), { mirror, storeEnquiry: vi.fn() });
    expect(await b.activeSlides()).toEqual([{ id: 'd1', label: '', video_path: null, image_path: null }]);
    expect(mirror).not.toHaveBeenCalled();
  });

  it('reads the mirror when D1 fails, keeping arguments', async () => {
    const setting = vi.fn(async (key: string) => `mirror:${key}`);
    const b = withMirrorFallback(backend({}), { mirror: async () => backend({ setting }), storeEnquiry: vi.fn() });
    expect(await b.setting('hero')).toBe('mirror:hero');
    expect(setting).toHaveBeenCalledWith('hero');
  });

  it('never loses an enquiry: stores it in Lovable Cloud when D1 rejects it', async () => {
    const storeEnquiry = vi.fn(async () => {});
    await withMirrorFallback(backend({}), { mirror: vi.fn(), storeEnquiry }).submitEnquiry(enquiry);
    expect(storeEnquiry).toHaveBeenCalledWith(enquiry);
  });

  it('keeps media signing on the master', async () => {
    const b = withMirrorFallback(backend({ signMedia: async () => ({ a: 'master-url' }) }), { mirror: vi.fn(), storeEnquiry: vi.fn() });
    expect(await b.signMedia(['a'], 60)).toEqual({ a: 'master-url' });
  });
});

describe('WhatsApp alerts through Meta', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('sends plain text when no template is configured', async () => {
    const { metaMessage } = await import('@/server/notify');
    expect(metaMessage('Hi\nthere')).toEqual({ type: 'text', text: { body: 'Hi\nthere' } });
  });
  it('flattens the alert into the approved template variable', async () => {
    vi.stubEnv('META_WA_TEMPLATE', 'enquiry_alert');
    const { metaMessage } = await import('@/server/notify');
    const m = metaMessage('New ENKOP enquiry\nName: Ann\n\nMessage:      hello') as any;
    expect(m.template.name).toBe('enquiry_alert');
    expect(m.template.language.code).toBe('en');
    const text = m.template.components[0].parameters[0].text as string;
    expect(text).toBe('New ENKOP enquiry · Name: Ann · Message:   hello');
    expect(text).not.toMatch(/\n|\s{4,}/);
  });
});

describe.skipIf(!hasSqlite)('enquiries taken by the Lovable fallback come back to the master', () => {
  let db: FakeD1;
  const kv = new Map<string, string>();
  const env = () => ({
    DB: db,
    MEDIA_KV: {
      get: async (k: string) => (kv.has(k) ? new Response(kv.get(k)).body : null),
      put: async (k: string, v: string) => { kv.set(k, v); },
    },
  }) as never;
  const lead = (id: string, created_at: string, extra: Record<string, unknown> = {}) => ({
    id, name: 'Ann', email: 'ann@example.com', phone: '', message: 'Hello', property_id: null, preferred_date: null,
    preferred_contact: 'email', interest: 'buy', status: 'new', created_at, updated_at: created_at, ...extra,
  });

  beforeEach(async () => { db = await masterDb(); kv.clear(); bridge.rows = []; bridge.since = []; });

  it('imports new leads once, queues one alert each and advances the cursor', async () => {
    const { pullMirrorEnquiries } = await import('@/server/reconcile');
    bridge.rows = [lead('11111111-1111-4111-8111-111111111111', '2026-10-20 10:00:00.123456+00')];
    expect((await pullMirrorEnquiries(env())).imported).toHaveLength(1);
    expect((await pullMirrorEnquiries(env())).imported).toHaveLength(0);
    const rows = (await db.prepare('SELECT id, created_at FROM enquiries').all<any>()).results;
    expect(rows).toEqual([{ id: '11111111-1111-4111-8111-111111111111', created_at: '2026-10-20T10:00:00.123Z' }]);
    const alerts = (await db.prepare(`SELECT payload FROM outbox WHERE kind = 'notify'`).all<any>()).results;
    expect(alerts).toHaveLength(1);
    expect(JSON.parse(alerts[0].payload).text).toMatch(/Lovable fallback/);
    expect((await db.prepare(`SELECT count(*) AS n FROM outbox WHERE kind <> 'notify'`).first<any>()).n).toBe(0);
    expect(bridge.since.at(-1)).toBe('2026-10-20T10:00:00.123Z');
  });

  it('keeps a lead whose listing no longer exists on the master', async () => {
    const { pullMirrorEnquiries } = await import('@/server/reconcile');
    bridge.rows = [lead('22222222-2222-4222-8222-222222222222', '2026-10-20T11:00:00.000Z', { property_id: '99999999-9999-4999-8999-999999999999' })];
    expect((await pullMirrorEnquiries(env())).imported).toHaveLength(1);
    expect((await db.prepare('SELECT property_id FROM enquiries').first<any>()).property_id).toBeNull();
  });
});
