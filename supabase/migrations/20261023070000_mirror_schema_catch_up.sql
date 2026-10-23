-- Catch-up for objects that exist on the live Lovable Cloud database but were created outside this
-- folder. Every statement is idempotent, so it changes nothing where they already exist, and a
-- database rebuilt from these migrations matches the live mirror and the master's content tables
-- (src/server/backend/tables.ts; checked by src/test/mirror-migrations.test.ts).

-- Listing gallery photos, links elsewhere and map location.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS external_links jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS map_query text;

CREATE TABLE IF NOT EXISTS public.team_members (
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

CREATE TABLE IF NOT EXISTS public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote text NOT NULL,
  author text NOT NULL,
  context text NOT NULL DEFAULT '',
  approved boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.team_members, public.testimonials, public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.team_members, public.testimonials TO authenticated;
GRANT INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.team_members, public.testimonials, public.site_settings TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Visitors see active team members, approved testimonials and site settings; admins manage them.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN SELECT * FROM (VALUES
    ('team_members', 'active team visible', 'FOR SELECT TO anon, authenticated USING (active OR private.has_role(auth.uid(), ''admin''))'),
    ('team_members', 'admins insert team', 'FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), ''admin''))'),
    ('team_members', 'admins update team', 'FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), ''admin'')) WITH CHECK (private.has_role(auth.uid(), ''admin''))'),
    ('team_members', 'admins delete team', 'FOR DELETE TO authenticated USING (private.has_role(auth.uid(), ''admin''))'),
    ('testimonials', 'approved testimonials visible', 'FOR SELECT TO anon, authenticated USING (approved OR private.has_role(auth.uid(), ''admin''))'),
    ('testimonials', 'admins insert testimonials', 'FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), ''admin''))'),
    ('testimonials', 'admins update testimonials', 'FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), ''admin'')) WITH CHECK (private.has_role(auth.uid(), ''admin''))'),
    ('testimonials', 'admins delete testimonials', 'FOR DELETE TO authenticated USING (private.has_role(auth.uid(), ''admin''))'),
    ('site_settings', 'settings readable', 'FOR SELECT TO anon, authenticated USING (true)'),
    ('site_settings', 'admins insert settings', 'FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), ''admin''))'),
    ('site_settings', 'admins update settings', 'FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), ''admin'')) WITH CHECK (private.has_role(auth.uid(), ''admin''))')
  ) AS t(tbl, name, body)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p.tbl AND policyname = p.name) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I %s', p.name, p.tbl, p.body);
    END IF;
  END LOOP;
END $$;

-- Private bucket for listing photos, tour videos, homepage scenes and team portraits (50 MB files).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('property-media', 'property-media', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Every 5 minutes, ask the ENKOP master to push queued changes here and pull fallback enquiries back
-- (keyless and throttled on the master). Skipped where Supabase's pg_cron/pg_net are unavailable.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enkop-master-drain') THEN
      PERFORM cron.schedule('enkop-master-drain', '*/5 * * * *', $job$
        select net.http_post(url := 'https://enkop.kevinbuluma9-7ff.workers.dev/api/public/enkop-master/drain', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb)
      $job$);
    END IF;
  END IF;
END $$;
