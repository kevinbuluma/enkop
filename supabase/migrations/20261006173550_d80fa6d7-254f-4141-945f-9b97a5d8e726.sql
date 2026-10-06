CREATE TABLE public.property_tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
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
ALTER TABLE public.property_tours ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_tours TO authenticated;
GRANT ALL ON public.property_tours TO service_role;
CREATE POLICY "admins manage tours" ON public.property_tours FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins read property media" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'property-media' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins upload property media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'property-media' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update property media" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'property-media' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete property media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'property-media' AND private.has_role(auth.uid(), 'admin'));