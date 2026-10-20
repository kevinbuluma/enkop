// Turns a Lovable Cloud export into D1 INSERT statements for the ENKOP master.
//
// Export (Lovable SQL editor or MCP), saved as JSON [{ "t": table, "r": row }, ...]:
//   select 'properties' as t, to_jsonb(x) as r from public.properties x union all ... (one line per table)
//
// Usage: node cloudflare/scripts/import-lovable-export.mjs export.json > import.sql
//        npx wrangler d1 execute enkop-db -c cloudflare/wrangler.jsonc --remote --file import.sql
// Rows are upserted (existing rows are overwritten). Imported rows are not queued for the mirror,
// because they came from it.
import { readFileSync } from 'node:fs';

const SPEC = {
  properties: { json: ['amenities', 'image_paths', 'external_links'], bool: ['featured', 'is_sample'] },
  enquiries: { json: [], bool: [] },
  homepage_slides: { json: [], bool: ['active'] },
  property_tours: { json: ['photo_paths'], bool: [] },
  team_members: { json: [], bool: ['active'] },
  testimonials: { json: [], bool: ['approved'] },
  site_settings: { json: ['value'], bool: [] },
};
// Parents before children so foreign keys hold.
const ORDER = ['properties', 'property_tours', 'enquiries', 'homepage_slides', 'team_members', 'testimonials', 'site_settings'];

const toIso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toISOString() : v);

function literal(table, col, value) {
  const spec = SPEC[table];
  if (spec.json.includes(col)) return quote(JSON.stringify(value ?? (col === 'value' || col === 'external_links' ? {} : [])));
  if (spec.bool.includes(col)) return value ? '1' : '0';
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return quote(String(toIso(value)));
}
const quote = (s) => `'${s.replace(/'/g, "''")}'`;

const file = process.argv[2];
if (!file) { console.error('usage: import-lovable-export.mjs <export.json>'); process.exit(1); }
const rows = JSON.parse(readFileSync(file, 'utf8'));
const out = [];
for (const table of ORDER) {
  for (const { r } of rows.filter((x) => x.t === table)) {
    const cols = Object.keys(r);
    out.push(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => literal(table, c, r[c])).join(', ')});`);
  }
}
const unknown = [...new Set(rows.map((x) => x.t).filter((t) => !(t in SPEC)))];
if (unknown.length) console.error(`skipped unknown tables: ${unknown.join(', ')}`);
process.stdout.write(out.join('\n') + '\n');
console.error(`${out.length} rows`);
