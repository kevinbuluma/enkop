// @vitest-environment node
// Rebuilds the Lovable Cloud mirror from supabase/migrations and checks it against the master's
// content tables, so a column or table created outside the migrations folder fails here.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { TABLES } from '@/server/backend/tables';

const MIGRATIONS = resolve(process.cwd(), 'supabase/migrations');
const files = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort();

// The parts of a Supabase project the migrations rely on but do not create.
const SUPABASE_STUBS = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
  CREATE SCHEMA extensions;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of files) await db.exec(readFileSync(resolve(MIGRATIONS, f), 'utf8'));
}, 120_000);

describe('Lovable mirror migrations', () => {
  it('build every mirrored table with exactly the master columns', async () => {
    for (const [table, spec] of Object.entries(TABLES)) {
      const { rows } = await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table]);
      expect(rows.map((r) => r.column_name).sort(), table).toEqual([...spec.columns].sort());
    }
  });

  it('protect every table with row-level security and give visitors read access to public content', async () => {
    const { rows: unprotected } = await db.query(`SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity`);
    expect(unprotected).toEqual([]);
    const { rows } = await db.query<{ tablename: string }>(`SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public' AND cmd = 'SELECT' AND 'anon' = ANY(roles)`);
    expect(rows.map((r) => r.tablename).sort()).toEqual(['homepage_slides', 'properties', 'property_tours', 'site_settings', 'team_members', 'testimonials']);
  });

  it('create the private media bucket', async () => {
    const { rows } = await db.query(`SELECT id, public, file_size_limit FROM storage.buckets`);
    expect(rows).toEqual([{ id: 'property-media', public: false, file_size_limit: 52428800 }]);
  });

  it('can re-apply the catch-up migration on a database that already has everything', async () => {
    const catchUp = files.find((f) => f.includes('mirror_schema_catch_up'))!;
    await expect(db.exec(readFileSync(resolve(MIGRATIONS, catchUp), 'utf8'))).resolves.toBeDefined();
  });
});
