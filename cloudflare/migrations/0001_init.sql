-- ENKOP master schema (Cloudflare D1). Mirrors the Lovable Cloud tables column for column so rows
-- can be copied either way: uuid/timestamptz/date -> TEXT, text[]/jsonb -> JSON TEXT, boolean -> 0/1.
-- Keep in step with supabase/migrations: a column added there must be added here (and vice versa).

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Nairobi',
  property_type TEXT NOT NULL,
  listing_type TEXT NOT NULL DEFAULT 'Sale',
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  bedrooms INTEGER NOT NULL DEFAULT 0,
  bathrooms INTEGER NOT NULL DEFAULT 0,
  area_sqm INTEGER NOT NULL DEFAULT 0,
  parking INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  amenities TEXT NOT NULL DEFAULT '[]',
  image_key TEXT NOT NULL DEFAULT 'residence-1',
  status TEXT NOT NULL DEFAULT 'draft',
  featured INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  image_paths TEXT NOT NULL DEFAULT '[]',
  external_links TEXT NOT NULL DEFAULT '{}',
  map_query TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX properties_status ON properties (status, featured, created_at);

CREATE TABLE enquiries (
  id TEXT PRIMARY KEY,
  property_id TEXT REFERENCES properties (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  preferred_date TEXT,
  preferred_contact TEXT NOT NULL DEFAULT 'Email',
  interest TEXT NOT NULL DEFAULT 'General enquiry',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX enquiries_created ON enquiries (created_at);

CREATE TABLE homepage_slides (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  video_path TEXT,
  image_path TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE property_tours (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  photo_paths TEXT NOT NULL DEFAULT '[]',
  direction TEXT NOT NULL DEFAULT '',
  job_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  video_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE team_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  photo_path TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE testimonials (
  id TEXT PRIMARY KEY,
  quote TEXT NOT NULL,
  author TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Master-only tables (not mirrored to Lovable) --------------------------------------------------

-- Replaces Supabase auth.users + user_roles. id keeps the Supabase user id so created_by values match.
CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER,
  setup_token_hash TEXT,
  setup_expires_at TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sessions_admin ON sessions (admin_id);

-- Stored files (bytes live in R2 or KV under the same path).
CREATE TABLE media (
  path TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Changes waiting to be pushed to the Lovable mirror. Written in the same batch as the change.
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('upsert', 'delete', 'media_put', 'media_delete', 'notify')),
  table_name TEXT,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  done_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX outbox_pending ON outbox (done_at, next_attempt_at);
