import { createFileRoute } from '@tanstack/react-router';

const BASE = 'https://enkop.lovable.app';

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data } = await sb.from('properties').select('slug,updated_at').eq('status', 'published');
        const pages = ['', '/properties', '/about', '/services', '/insights', '/contact'].map(p => `<url><loc>${BASE}${p}</loc></url>`);
        const props = (data ?? []).map(r => `<url><loc>${BASE}/properties/${r.slug}</loc>${r.updated_at ? `<lastmod>${new Date(r.updated_at).toISOString()}</lastmod>` : ''}</url>`);
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages, ...props].join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' } });
      },
    },
  },
});
