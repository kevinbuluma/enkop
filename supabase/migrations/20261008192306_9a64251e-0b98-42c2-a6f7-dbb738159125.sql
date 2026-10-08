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
GRANT SELECT ON public.homepage_slides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_slides TO authenticated;
GRANT ALL ON public.homepage_slides TO service_role;
ALTER TABLE public.homepage_slides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active slides visible" ON public.homepage_slides FOR SELECT TO anon, authenticated USING (active OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins insert slides" ON public.homepage_slides FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update slides" ON public.homepage_slides FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete slides" ON public.homepage_slides FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER homepage_slides_updated_at BEFORE UPDATE ON public.homepage_slides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();