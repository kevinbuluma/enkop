// Column specs shared by the master (your Supabase Postgres) and the Lovable Cloud mirror, which have
// identical tables (master-db/migrations and supabase/migrations). Rows use the Supabase shapes:
// `array` columns are text[] and `json` columns are jsonb.

export const TABLES = {
  properties: {
    pk: 'id',
    columns: ['id', 'slug', 'title', 'neighborhood', 'city', 'property_type', 'listing_type', 'price', 'currency', 'bedrooms', 'bathrooms', 'area_sqm', 'parking', 'description', 'amenities', 'image_key', 'status', 'featured', 'is_sample', 'image_paths', 'external_links', 'map_query', 'created_at', 'updated_at'],
    array: ['amenities', 'image_paths'],
    json: ['external_links'],
  },
  enquiries: {
    pk: 'id',
    columns: ['id', 'property_id', 'name', 'email', 'phone', 'message', 'preferred_date', 'preferred_contact', 'interest', 'status', 'created_at', 'updated_at'],
    array: [],
    json: [],
  },
  homepage_slides: {
    pk: 'id',
    columns: ['id', 'position', 'label', 'video_path', 'image_path', 'active', 'created_at', 'updated_at'],
    array: [],
    json: [],
  },
  property_tours: {
    pk: 'id',
    columns: ['id', 'property_id', 'created_by', 'photo_paths', 'direction', 'job_id', 'status', 'progress', 'video_path', 'error', 'created_at', 'updated_at'],
    array: ['photo_paths'],
    json: [],
  },
  team_members: {
    pk: 'id',
    columns: ['id', 'name', 'role', 'bio', 'photo_path', 'position', 'active', 'created_at', 'updated_at'],
    array: [],
    json: [],
  },
  testimonials: {
    pk: 'id',
    columns: ['id', 'quote', 'author', 'context', 'approved', 'position', 'created_at', 'updated_at'],
    array: [],
    json: [],
  },
  site_settings: {
    pk: 'key',
    columns: ['key', 'value', 'updated_at'],
    array: [],
    json: ['value'],
  },
} as const satisfies Record<string, { pk: string; columns: readonly string[]; array: readonly string[]; json: readonly string[] }>;

export type MirrorTable = keyof typeof TABLES;
export type Row = Record<string, unknown>;

export const MIRROR_TABLES = Object.keys(TABLES) as MirrorTable[];
export const isMirrorTable = (t: unknown): t is MirrorTable => typeof t === 'string' && Object.prototype.hasOwnProperty.call(TABLES, t);

const has = (list: readonly string[], c: string) => list.includes(c);

/**
 * Supabase-shaped value -> bind parameter. jsonb values are sent as JSON text (the driver would turn a
 * JS array into a Postgres array); text[] values stay JS arrays.
 */
export function encodeValue(table: MirrorTable, column: string, value: unknown): unknown {
  const spec = TABLES[table];
  if (value === undefined) return null;
  if (has(spec.json, column)) return JSON.stringify(value ?? {});
  if (has(spec.array, column)) return value ?? [];
  return value;
}
