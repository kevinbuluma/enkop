import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = new URL(request.url).origin;
        const { getBackend } = await import('@/server/backend');
        const data = (await (await getBackend()).publishedProperties().catch(() => [])) as { slug: string; updated_at?: string }[];
        const pages = ['', '/properties', '/about', '/services', '/insights', '/contact'].map(p => `<url><loc>${base}${p}</loc></url>`);
        const props = data.map(r => `<url><loc>${base}/properties/${r.slug}</loc>${r.updated_at ? `<lastmod>${new Date(r.updated_at).toISOString()}</lastmod>` : ''}</url>`);
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages, ...props].join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' } });
      },
    },
  },
});
