// One-time copy of the legacy Cloudflare D1 master into your Supabase master database.
//   node cloudflare/scripts/d1-to-postgres.mjs
// Rows are inserted with enkop.skip_outbox on (Lovable Cloud already has them) and ON CONFLICT DO
// NOTHING, so re-running is harmless. D1 itself is only read. Prints row counts on both sides.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sql } from '../../master-db/scripts/lib.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Parents before children so foreign keys hold. Sessions and the outbox are not copied.
const TABLES = {
  properties: { json: ['amenities', 'image_paths', 'external_links'], bool: ['featured', 'is_sample'] },
  homepage_slides: { json: [], bool: ['active'] },
  team_members: { json: [], bool: ['active'] },
  testimonials: { json: [], bool: ['approved'] },
  site_settings: { json: ['value'], bool: [] },
  admins: { json: [], bool: [] },
  property_tours: { json: ['photo_paths'], bool: [] },
  enquiries: { json: [], bool: [] },
  media: { json: [], bool: [] },
};

function d1(query) {
  const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', 'enkop-db', '--remote', '-c', 'cloudflare/wrangler.jsonc', '--json', '--command', `"${query}"`], {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

function decode(table, row) {
  const spec = TABLES[table];
  const out = { ...row };
  for (const c of spec.json) if (typeof out[c] === 'string') out[c] = JSON.parse(out[c]);
  for (const c of spec.bool) if (out[c] !== null && out[c] !== undefined) out[c] = out[c] === 1 || out[c] === true;
  if (table === 'admins' && typeof out.email === 'string') out.email = out.email.trim().toLowerCase();
  return out;
}

const counts = {};
let script = `begin;\nselect set_config('enkop.skip_outbox', 'on', true);\n`;
for (const table of Object.keys(TABLES)) {
  const rows = d1(`SELECT * FROM ${table}`).map((r) => decode(table, r));
  counts[table] = { d1: rows.length };
  if (!rows.length) continue;
  const json = JSON.stringify(rows);
  if (json.includes('$enkop$')) throw new Error(`${table} contains the quoting tag`);
  script += `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, $enkop$${json}$enkop$::jsonb) on conflict do nothing;\n`;
}
script += 'commit;';
await sql(script);

for (const table of Object.keys(TABLES)) {
  const [{ n }] = await sql(`select count(*)::int as n from public.${table}`);
  counts[table].supabase = n;
}
const [{ n: queued }] = await sql(`select count(*)::int as n from public.outbox`);
console.table(counts);
console.log(`outbox rows created by the copy: ${queued} (expected 0)`);
if (Object.values(counts).some((c) => c.supabase < c.d1)) process.exit(1);
