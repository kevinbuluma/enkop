// In-memory Postgres (PGlite) with the real master schema from master-db/migrations, exposed through
// the same PgDatabase adapter the Worker uses. One instance per test file; resetMasterDb() empties it.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PgDatabase, PG_PARSERS } from '@/server/backend/pg';

const MIGRATIONS = resolve(process.cwd(), 'master-db/migrations');
const TABLES = ['outbox', 'sessions', 'admins', 'media', 'meta', 'enquiries', 'property_tours', 'properties', 'homepage_slides', 'team_members', 'testimonials', 'site_settings'];

let instance: PGlite | null = null;

/** Raw access for test setup and assertions. */
export async function pglite() {
  if (!instance) {
    // Like `pg`, send jsonb parameters that are already JSON text unchanged.
    const asJsonText = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
    instance = new PGlite({ parsers: PG_PARSERS, serializers: { 114: asJsonText, 3802: asJsonText } });
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
      await instance.exec(readFileSync(resolve(MIGRATIONS, f), 'utf8'));
    }
  }
  return instance;
}

export async function masterDb(): Promise<PgDatabase> {
  const pg = await pglite();
  return new PgDatabase(async () => ({
    query: async (text, params) => {
      const r = await pg.query<Record<string, unknown>>(text, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
    end: async () => {},
  }));
}

export async function resetMasterDb() {
  await (await pglite()).exec(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}
