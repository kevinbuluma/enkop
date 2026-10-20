// Column specs shared by the D1 master and the Lovable Cloud mirror. Row objects use the Supabase
// shapes (arrays/objects/booleans); D1 stores JSON columns as TEXT and booleans as 0/1.

export const TABLES = {
  properties: {
    pk: 'id',
    columns: ['id', 'slug', 'title', 'neighborhood', 'city', 'property_type', 'listing_type', 'price', 'currency', 'bedrooms', 'bathrooms', 'area_sqm', 'parking', 'description', 'amenities', 'image_key', 'status', 'featured', 'is_sample', 'image_paths', 'external_links', 'map_query', 'created_at', 'updated_at'],
    json: ['amenities', 'image_paths', 'external_links'],
    bool: ['featured', 'is_sample'],
  },
  enquiries: {
    pk: 'id',
    columns: ['id', 'property_id', 'name', 'email', 'phone', 'message', 'preferred_date', 'preferred_contact', 'interest', 'status', 'created_at', 'updated_at'],
    json: [],
    bool: [],
  },
  homepage_slides: {
    pk: 'id',
    columns: ['id', 'position', 'label', 'video_path', 'image_path', 'active', 'created_at', 'updated_at'],
    json: [],
    bool: ['active'],
  },
  property_tours: {
    pk: 'id',
    columns: ['id', 'property_id', 'created_by', 'photo_paths', 'direction', 'job_id', 'status', 'progress', 'video_path', 'error', 'created_at', 'updated_at'],
    json: ['photo_paths'],
    bool: [],
  },
  team_members: {
    pk: 'id',
    columns: ['id', 'name', 'role', 'bio', 'photo_path', 'position', 'active', 'created_at', 'updated_at'],
    json: [],
    bool: ['active'],
  },
  testimonials: {
    pk: 'id',
    columns: ['id', 'quote', 'author', 'context', 'approved', 'position', 'created_at', 'updated_at'],
    json: [],
    bool: ['approved'],
  },
  site_settings: {
    pk: 'key',
    columns: ['key', 'value', 'updated_at'],
    json: ['value'],
    bool: [],
  },
} as const satisfies Record<string, { pk: string; columns: readonly string[]; json: readonly string[]; bool: readonly string[] }>;

export type MirrorTable = keyof typeof TABLES;
export type Row = Record<string, unknown>;

export const MIRROR_TABLES = Object.keys(TABLES) as MirrorTable[];
export const isMirrorTable = (t: unknown): t is MirrorTable => typeof t === 'string' && Object.prototype.hasOwnProperty.call(TABLES, t);

const has = (list: readonly string[], c: string) => list.includes(c);

/** D1 row -> Supabase-shaped row. */
export function decodeRow(table: MirrorTable, row: Row): Row {
  const spec = TABLES[table];
  const out: Row = { ...row };
  for (const c of spec.json) if (typeof out[c] === 'string') out[c] = JSON.parse(out[c] as string);
  for (const c of spec.bool) if (out[c] !== undefined && out[c] !== null) out[c] = out[c] === 1 || out[c] === true;
  return out;
}

/** Supabase-shaped value -> D1 bind value for a column. */
export function encodeValue(table: MirrorTable, column: string, value: unknown): unknown {
  const spec = TABLES[table];
  if (value === undefined) return null;
  if (has(spec.json, column)) return JSON.stringify(value ?? (column === 'external_links' || column === 'value' ? {} : []));
  if (has(spec.bool, column)) return value ? 1 : 0;
  return value;
}

/** SQL expression that renders one row of `table` as a Supabase-shaped JSON object. */
export function rowJsonSql(table: MirrorTable): string {
  const spec = TABLES[table];
  const parts = spec.columns.map((c) => {
    if (has(spec.json, c)) return `'${c}', json(${c})`;
    if (has(spec.bool, c)) return `'${c}', json(CASE WHEN ${c} THEN 'true' ELSE 'false' END)`;
    return `'${c}', ${c}`;
  });
  return `json_object(${parts.join(', ')})`;
}
