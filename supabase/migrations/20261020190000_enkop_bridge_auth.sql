-- SHA-256 of the shared secret the ENKOP master uses to call /api/public/enkop-bridge.
-- Readable only with the service role (RLS on, no policies). The project secret ENKOP_BRIDGE_SECRET,
-- when set, takes precedence over this row.
CREATE TABLE IF NOT EXISTS public.enkop_bridge_auth (
  id integer PRIMARY KEY CHECK (id = 1),
  secret_sha256 text NOT NULL CHECK (secret_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.enkop_bridge_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enkop_bridge_auth FROM anon, authenticated;
