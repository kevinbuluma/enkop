CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE, role public.app_role NOT NULL DEFAULT 'user');
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE TABLE public.properties (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, title text NOT NULL, neighborhood text NOT NULL, city text NOT NULL DEFAULT 'Nairobi', property_type text NOT NULL, listing_type text NOT NULL DEFAULT 'Sale', price numeric NOT NULL, currency text NOT NULL DEFAULT 'KES', bedrooms int NOT NULL DEFAULT 0, bathrooms int NOT NULL DEFAULT 0, area_sqm int NOT NULL DEFAULT 0, parking int NOT NULL DEFAULT 0, description text NOT NULL DEFAULT '', amenities text[] NOT NULL DEFAULT '{}', image_key text NOT NULL DEFAULT 'residence-1', status text NOT NULL DEFAULT 'draft', featured boolean NOT NULL DEFAULT false, is_sample boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.properties TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "published properties visible" ON public.properties FOR SELECT TO anon, authenticated USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins create properties" ON public.properties FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update properties" ON public.properties FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete properties" ON public.properties FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.enquiries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL, name text NOT NULL, email text NOT NULL, phone text NOT NULL DEFAULT '', message text NOT NULL, preferred_date date, preferred_contact text NOT NULL DEFAULT 'Email', interest text NOT NULL DEFAULT 'General enquiry', status text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, UPDATE, DELETE ON public.enquiries TO authenticated;
GRANT ALL ON public.enquiries TO service_role;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read enquiries" ON public.enquiries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update enquiries" ON public.enquiries FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete enquiries" ON public.enquiries FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER enquiries_updated_at BEFORE UPDATE ON public.enquiries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.properties (slug,title,neighborhood,property_type,listing_type,price,bedrooms,bathrooms,area_sqm,parking,description,amenities,image_key,status,featured,is_sample) VALUES
('the-ridge-residence','The Ridge Residence','Karen','Villa','Sale',85000000,5,5,520,4,'A considered retreat where open living spaces meet the quiet beauty of a landscaped garden. This is an illustrative residence while ENKOP curates its live collection.',ARRAY['Private garden','Outdoor terrace','Study','Staff quarters'],'residence-1','published',true,true),
('the-atelier','The Atelier','Westlands','Apartment','Sale',28500000,3,3,210,2,'An architectural apartment designed around light, texture and the rhythm of city living. This is an illustrative residence while ENKOP curates its live collection.',ARRAY['Balcony','Concierge','Secure parking','City views'],'residence-2','published',true,true),
('the-courtyard-house','The Courtyard House','Runda','Villa','Rent',450000,4,4,410,3,'A generous contemporary home framed by greenery and a calm central courtyard. This is an illustrative residence while ENKOP curates its live collection.',ARRAY['Courtyard','Garden','Family room','Covered parking'],'residence-3','published',false,true);