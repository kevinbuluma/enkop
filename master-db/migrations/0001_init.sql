-- ENKOP master database (your own Supabase project). Applied with master-db/scripts/sql.mjs, never by
-- Lovable: content tables match Lovable Cloud's column for column so changes replay there unchanged.
-- Row level security is on with no policies, so the Supabase API keys (anon/authenticated) see nothing;
-- the master Worker connects as the table owner through Hyperdrive.

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Content tables (mirrored to Lovable Cloud) -----------------------------------------------------

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  neighborhood text NOT NULL,
  city text NOT NULL DEFAULT 'Nairobi',
  property_type text NOT NULL,
  listing_type text NOT NULL DEFAULT 'Sale',
  price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'KES',
  bedrooms int NOT NULL DEFAULT 0,
  bathrooms int NOT NULL DEFAULT 0,
  area_sqm int NOT NULL DEFAULT 0,
  parking int NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  amenities text[] NOT NULL DEFAULT '{}',
  image_key text NOT NULL DEFAULT 'residence-1',
  status text NOT NULL DEFAULT 'draft',
  featured boolean NOT NULL DEFAULT false,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  image_paths text[] NOT NULL DEFAULT '{}',
  external_links jsonb NOT NULL DEFAULT '{}',
  map_query text
);

CREATE TABLE public.enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties (id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  message text NOT NULL,
  preferred_date date,
  preferred_contact text NOT NULL DEFAULT 'Email',
  interest text NOT NULL DEFAULT 'General enquiry',
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enquiries_created ON public.enquiries (created_at DESC);

CREATE TABLE public.homepage_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position int NOT NULL DEFAULT 0,
  label text NOT NULL DEFAULT '',
  video_path text,
  image_path text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.property_tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  photo_paths text[] NOT NULL DEFAULT '{}',
  direction text NOT NULL DEFAULT '',
  job_id text,
  status text NOT NULL DEFAULT 'queued',
  progress int NOT NULL DEFAULT 0,
  video_path text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  photo_path text,
  position int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote text NOT NULL,
  author text NOT NULL,
  context text NOT NULL DEFAULT '',
  approved boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Master-only tables (never mirrored) ------------------------------------------------------------

-- Emails are stored lower-case. id keeps the original Supabase user id so tours.created_by matches.
CREATE TABLE public.admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text,
  password_salt text,
  password_iterations int,
  setup_token_hash text,
  setup_expires_at timestamptz,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sessions (
  token_hash text PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES public.admins (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_admin ON public.sessions (admin_id);

-- Index of files in the property-media Storage bucket.
CREATE TABLE public.media (
  path text PRIMARY KEY,
  content_type text NOT NULL,
  size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Changes waiting to be pushed to the Lovable mirror. Content rows are queued by enkop_outbox() in
-- the same transaction as the change; media and alerts are queued by the master's code.
CREATE TABLE public.outbox (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('upsert', 'delete', 'media_put', 'media_delete', 'notify')),
  table_name text,
  payload text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending ON public.outbox (next_attempt_at) WHERE done_at IS NULL;

-- Small key/value state (sync cursors, throttles).
CREATE TABLE public.meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Outbox trigger ---------------------------------------------------------------------------------

-- TG_ARGV[0] is the table's primary key column. Rows copied from the mirror set
-- enkop.skip_outbox = 'on' for their transaction so they are not sent straight back.
CREATE OR REPLACE FUNCTION public.enkop_outbox() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('enkop.skip_outbox', true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.outbox (kind, table_name, payload)
    VALUES ('delete', TG_TABLE_NAME, jsonb_build_object(TG_ARGV[0], to_jsonb(OLD) -> TG_ARGV[0])::text);
  ELSE
    INSERT INTO public.outbox (kind, table_name, payload) VALUES ('upsert', TG_TABLE_NAME, to_jsonb(NEW)::text);
  END IF;
  RETURN NULL;
END $$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('properties', 'id'), ('enquiries', 'id'), ('homepage_slides', 'id'), ('property_tours', 'id'),
    ('team_members', 'id'), ('testimonials', 'id'), ('site_settings', 'key')) AS v (name, pk)
  LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enkop_outbox(%L)', t.name || '_outbox', t.name, t.pk);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t.name || '_updated_at', t.name);
  END LOOP;
END $$;

-- Lock everything down to the owner connection ---------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties', 'enquiries', 'homepage_slides', 'property_tours', 'team_members', 'testimonials', 'site_settings', 'admins', 'sessions', 'media', 'outbox', 'meta']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
