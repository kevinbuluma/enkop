// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, sessionAdmin } from '@/server/auth';
import { masterDb, pglite, resetMasterDb } from './pg-db';

const state = vi.hoisted(() => ({ db: null as unknown }));
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

const P1 = '0a000000-0000-4000-8000-000000000001';
const E1 = '0e000000-0000-4000-8000-000000000001';
const ADMIN = '0b000000-0000-4000-8000-000000000001';
const VIEWER = '0b000000-0000-4000-8000-000000000002';

describe('enquiry administrator access', () => {
  beforeAll(() => pglite(), 120_000);
  beforeEach(async () => {
    await resetMasterDb();
    await (await pglite()).exec(`
      SELECT set_config('enkop.skip_outbox', 'on', false);
      INSERT INTO properties (id, slug, title, neighborhood, property_type, price) VALUES ('${P1}', 'the-atelier', 'The Atelier', 'Westlands', 'Apartment', 1);
      INSERT INTO enquiries (id, property_id, name, email, message, interest, created_at) VALUES ('${E1}', '${P1}', 'Ann', 'ann@example.com', 'Hello there', 'Buying', '2026-10-20T10:00:00.000Z');
      INSERT INTO admins (id, email, role) VALUES ('${ADMIN}', 'admin@example.com', 'admin'), ('${VIEWER}', 'viewer@example.com', 'user');
      SELECT set_config('enkop.skip_outbox', '', false);`);
    state.db = await masterDb();
  });

  it('lets a signed-in administrator read enquiries with their listing title', async () => {
    const rows = await getEnquiries();
    expect(rows).toEqual([expect.objectContaining({ id: E1, property_title: 'The Atelier', email: 'ann@example.com', created_at: '2026-10-20T10:00:00.000Z' })]);
  });

  it('only accepts live sessions of administrator accounts', async () => {
    const db = state.db as never;
    const { token } = await createSession(db, ADMIN);
    expect(await sessionAdmin(db, token)).toMatchObject({ id: ADMIN, email: 'admin@example.com' });
    expect(await sessionAdmin(db, null)).toBeNull();
    expect(await sessionAdmin(db, 'forged-token')).toBeNull();

    const viewer = await createSession(db, VIEWER);
    expect(await sessionAdmin(db, viewer.token)).toBeNull();

    await (await pglite()).exec(`UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'`);
    expect(await sessionAdmin(db, token)).toBeNull();
  });
});
