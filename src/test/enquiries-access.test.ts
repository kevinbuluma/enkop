import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, sessionAdmin } from '@/server/auth';
import { FakeD1, hasSqlite } from './fake-d1';

const state = vi.hoisted(() => ({ read: vi.fn(), db: null as unknown }));
vi.mock('@/lib/require-admin', () => ({ requireAdmin: {} }));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: (args: unknown) => unknown) => () => handler({ context: { master: { env: { DB: state.db } } } }),
    };
    return builder;
  },
}));
import { getEnquiries } from '@/lib/enquiries.functions';

describe.skipIf(!hasSqlite)('enquiry administrator access', () => {
  let db: FakeD1;
  beforeEach(async () => {
    db = new FakeD1();
    await db.exec(`
      CREATE TABLE properties (id TEXT PRIMARY KEY, title TEXT);
      CREATE TABLE enquiries (id TEXT PRIMARY KEY, property_id TEXT, name TEXT, email TEXT, phone TEXT, message TEXT, preferred_date TEXT, preferred_contact TEXT, interest TEXT, status TEXT, created_at TEXT);
      CREATE TABLE admins (id TEXT PRIMARY KEY, email TEXT UNIQUE, role TEXT NOT NULL DEFAULT 'admin');
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL, expires_at TEXT NOT NULL);
      INSERT INTO properties VALUES ('p1', 'The Atelier');
      INSERT INTO enquiries VALUES ('e1', 'p1', 'Ann', 'ann@example.com', '', 'Hello there', NULL, 'Email', 'Buying', 'new', '2026-10-20T10:00:00.000Z');
      INSERT INTO admins (id, email, role) VALUES ('a1', 'admin@example.com', 'admin'), ('u1', 'viewer@example.com', 'user');`);
    state.db = db;
    state.read.mockClear();
  });

  it('lets a signed-in administrator read enquiries with their listing title', async () => {
    const rows = await getEnquiries();
    expect(rows).toEqual([expect.objectContaining({ id: 'e1', property_title: 'The Atelier', email: 'ann@example.com' })]);
  });

  it('only accepts live sessions of administrator accounts', async () => {
    const { token } = await createSession(db as never, 'a1');
    expect(await sessionAdmin(db as never, token)).toMatchObject({ id: 'a1', email: 'admin@example.com' });
    expect(await sessionAdmin(db as never, null)).toBeNull();
    expect(await sessionAdmin(db as never, 'forged-token')).toBeNull();

    const viewer = await createSession(db as never, 'u1');
    expect(await sessionAdmin(db as never, viewer.token)).toBeNull();

    await db.exec(`UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'`);
    expect(await sessionAdmin(db as never, token)).toBeNull();
  });
});
